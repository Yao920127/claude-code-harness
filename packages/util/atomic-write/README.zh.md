---
description: "原子檔案替換與跨程序寫鎖，供絕不允許在磁碟上留下不完整、被符號連結劫持或權限過寬內容的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-atomic-write

[English](README.md) | 中文

## 概述

使用 `dsh-atomic-write` 替換檔案時，不會暴露部分內容，也不會跟隨臨時路徑上的符號連結。它的寫鎖會跨程序序列化讀-修改-寫入迴圈，因此並行寫入方不會用陳舊狀態相互覆蓋。每次替換都會在全新 inode 上使用呼叫方選擇的權限位，從而安全地收窄現有檔案的權限。這個零依賴庫只接受字串；它不提供 `cordis.yml` 外掛，也不保證崩潰永續性，因為它不呼叫 `fsync`。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當檔案型儲存必須替換一份已渲染好的字串、且絕不允許暴露部分寫入、符號連結劫持或權限過寬狀態時，使用 `writeFileAtomic`；當多個程序對同一檔案執行讀-修改-寫入迴圈時，使用 `withFileLock`。最小路徑是一次呼叫，傳入最終內容與替換 inode 的權限位。

### 原子寫入檔案

```ts
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const text: string
await writeFileAtomic('/home/u/.dsh/cordis.patch.yml', text, { mode: 0o600 })
```

父目錄會按需建立，讀取方只會觀察到舊內容或完整的新內容。在 Windows 上，報告為 `EACCES`、`EBUSY` 或 `EPERM` 的瞬時替換干擾會在有界時間內重試；任何剩餘失敗都會移除臨時檔案，並保持目標檔案不變。

### 協調寫入方

對於單靠原子提交無法保證安全的讀-渲染-提交迴圈，請在操作期間持有寫鎖：

```text
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const render: (previous: string) => string
declare const readCurrent: () => Promise<string>

await withFileLock('/home/u/.dsh/cordis.patch.yml', async () => {
  const previous = await readCurrent()
  await writeFileAtomic('/home/u/.dsh/cordis.patch.yml', render(previous), { mode: 0o600 })
})
```

只有寫入方會競爭——讀取方從不取鎖——競爭者按指數退避，超時後報錯，而不是無限阻塞。競爭者等待多久由每次呼叫經 `waitMs` 宣告：預設值只按純檔案工作量級選定，因此持鎖方迴圈若包含一次網路往返——例如重新整理過期 token 的憑證變更——就應宣告更長的值，否則該檔案的其他寫入方在這段時間內都會失敗。退避節奏保持固定。只有當鎖記錄的程序已不存在時，競爭者才會移除已有鎖；單憑檔案存續時間絕不會移除鎖。

### 需要規劃的失敗

Windows 在無法觀察到鎖時會對 `EPERM` 重試一次，因為持鎖方可能在獨佔建立與存在性檢查之間釋放鎖。再次出現無法確認鎖存在的 `EPERM` 時，會重新丟擲錯誤且不執行操作。

鎖的父目錄必須已經存在，因此 `withFileLock` 會在執行操作之前拒絕無效的父目錄層級。持鎖程序退出時會把鎖檔案留在原地，下一個寫入方會接管它。鎖記錄為空或不完整，或其 PID 已被存活程序複用時，鎖不會被接管；後續寫入方超時失敗，操作者只有在確認沒有寫入方仍持有該鎖後才會移除它。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包遵循一項職責分離：原子提交負責交換，寫鎖負責跨程序排序。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `writeFileAtomic` 與 `withFileLock`，即本包的全部介面 |
| — | 不釋出執行時不變式伴生入口；這個純檔案系統原語不維護事件流或可變執行時資料；其替換約定由單元測試覆蓋。 |

### 寫入路徑

`writeFileAtomic` 先以獨佔建立（`wx`）開啟一個隨機字尾的同級檔案並寫入內容，然後 rename 到目標上。獨佔開啟拒絕跟隨預先埋在可猜測臨時路徑上的符號連結；同目錄兄弟檔案保證 rename 落在同一檔案系統上；rename 替換的是目標位置的符號連結本身，絕不寫穿到該連結指向的檔案。Windows 重試會保留同一份完整的兄弟檔案，並採用有界指數退避，因此協作式寫鎖之外的軟體瞬時佔用目標時，不會讓安全替換立即失敗；已歸檔的[重試決策記錄](../../../.agents/notes/archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md)記錄了最初的理由與被拒絕的替代方案。

`withFileLock` 以 `wx` 建立 `<filename>.lock` 同級檔案。`EEXIST` 直接表示競爭；只有一次新的 `lstat` 確認鎖路徑存在時，`EPERM` 才表示競爭，從而相容 Windows 的獨佔建立行為，又不掩蓋無關的權限故障。鎖以 `<pid>\n` 記錄建立者的 PID，由持有者在 `finally` 中移除。競爭者讀到的記錄若經訊號探測報告該 PID 不存在（`ESRCH`），就以 `wx` 建立 `<filename>.lock.takeover-<記錄雜湊>` 認領檔案，重新讀取鎖並再次探測其 PID，僅當鎖仍是同一條記錄且該 PID 仍不存在時才移除它，隨後移除認領檔案並立即重試。以其他使用者身份存在的持有者（`EPERM`）和指向競爭者自身程序的記錄會繼續等待。讀到同一條記錄的競爭者爭用同一個認領檔案，第二次探測會排除複用了已退出 PID 的持有者，因此接管絕不會移除另一個競爭者在已退出持有者之後獲得的鎖。接管只能證明記錄中的程序已退出；啟動了其他寫入者的操作要為後繼者留下找到它們的途徑，[Plugin Manager](../../boot/plugin-manager/README.zh.md) 對其 pnpm 執行就是這樣做的。競爭按指數退避，在每次呼叫宣告的 `waitMs` 期限（預設兩秒）過後失敗；[接管決策記錄](../../../.agents/notes/implemented/bug-fix/2026-09-24-exited-holder-lock-takeover.zh.md)負責說明理由。

### 交換為何安全

- **全新 inode，呼叫方宣告的權限位**——臨時檔案帶著 `mode` 走完 rename，因此收窄權限過寬的檔案沒有 chmod 競態。`mode` 為必填，讓權限決策始終可見於每個呼叫點。
- **讀取方從不競爭**——rename 提交是原子的，讀取方無需加鎖。
- **競爭者只移除已退出持有者的鎖**——檔案存續時間無法區分已崩潰的所有者與暫停但仍存活的寫入方，但程序已不存在可以區分。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要了解使用本原語的儲存或它所屬的工具家族時，閱讀以下頁面。

- [使用者設定檔案儲存](../../boot/config-editor/README.zh.md)——每次寫入都透過本包替換的設定文件。
- [憑證儲存](../../credentials/credentials-local/README.zh.md)——本包加鎖並替換的憑證檔案。
- [util 組對映](../README.zh.md)——本包所屬的零依賴工具家族。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包是純檔案系統寫入原語，不註冊任何面向模型的內容。

#### KV Cache 影響

此處沒有任何內容進入請求字首，因此提供者快取複用不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不是合適的工具。它們是目前包約束，不是任務積壓。

- **原子但不保證持久**——不對檔案或其所在目錄做 `fsync`，因此崩潰後可能觀察到 rename 被退回。此處的檔案型儲存在啟動時重新讀取並重新發布，把永續性留作呼叫方的策略。
- **僅支援字串內容**——在有消費方需要之前，不提供 `Buffer` 或流式形態。
- **部分遺留鎖需要操作者恢復**——鎖記錄為空或不完整，或其 PID 已被存活程序複用時，鎖會留在原地；後續寫入方超時也不會刪除它。競爭者若在建立認領檔案與移除鎖之間結束，會同時留下 `<filename>.lock` 和 `<filename>.lock.takeover-<記錄雜湊>`，由操作者刪除兩者。
- **單一主機與單一 PID 名稱空間**——探測在競爭者所在主機上進行。多臺主機透過網路檔案系統共享、或多個容器共享同一卷時，寫入方可能把存活持有者視為已退出，接管其鎖並與之同時寫入。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

一種對檔案及其父目錄執行 `fsync`、並在 Windows 上保留僅屬主權限的永續性替換方案仍未實作（在原始碼中記錄為 `settings-atomic-durability`）。

</details>
