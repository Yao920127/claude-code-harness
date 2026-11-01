---
description: "面向使用者與維護者的按 harness home 劃分的匿名身份說明，用於追蹤遙測、回饋確認與 DeepSeek 提供者請求如何關聯記錄。"
kind: "package-library"
---

# @deepseek-ai/dsh-anonymous-user-id

[English](README.md) | 中文

## 概述

DeepSeek Harness 為每個 harness home 使用一個匿名識別符號，以關聯同一套安裝產生的遙測、回饋與 DeepSeek 請求，同時不識別使用者身份。該隨機 UUID 儲存在 `$DSH_HOME/.anonymous-user-id`（`$DSH_HOME` 預設為 `~/.dsh`）中，可跨重新啟動保留，並在你刪除檔案後重新生成。不同 harness home 使用不同的識別符號，且該值不包含機器或帳戶資料。內建功能會自動建立並附加該值；包消費方可以複用同一個值進行安裝範圍的關聯，但無法跨 home 關聯記錄。

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

當你希望本機安裝外發的記錄能被識別為來自同一個 harness home——遙測、回饋與 DeepSeek 請求都攜帶同一個共享 id——本包就是提供它的地方。無需安裝或設定任何東西：id 會自動出現，已隨附的回饋、遙測與 DeepSeek 功能已經在使用它。不要用它來識別使用者，也不要用它關聯不同 home 之間的記錄；它是匿名的且限定於單個 home。

### 該 id 能為你做什麼

你的安裝外發的三類內容攜帶同一個 id，因此記錄在它們之間可以相互對應：

- **工作階段遙測**——你的遙測匯出會以 `user.id` Resource 屬性攜帶該 id，採集器因此可以按安裝分組記錄。
- **回饋**——每條回饋確認都會標明記錄該回饋的匿名安裝。
- **DeepSeek 請求**——每次提供者請求都會攜帶 `x-deepseek-harness-user-id` 標頭，因此可以按安裝歸因用量。

### 檢視與重置 id

該 id 存放在 `$DSH_HOME/.anonymous-user-id`（`$DSH_HOME` 預設為 `~/.dsh`）中，是一個純 UUID 文字檔案。刪除該檔案即可在下次啟動時獲得全新 id；正在執行的程序在退出前會一直保留目前 id。不同 harness home 各自保留獨立 id，值中永遠不會包含任何機器或帳戶資訊。

### 在自己的包中使用

當你建置的功能需要共享該安裝的匿名 id 時，匯入一次並複用該值即可——遙測、回饋與 DeepSeek 已經在使用同一個 id，因此你的記錄能與它們相互對應：

```ts
import { getOrCreateAnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'

const userId = getOrCreateAnonymousUserId() // stable for the process lifetime
```

該值在程序內保持穩定，並與內建功能使用的值一致；只有當檔案被刪除、後續啟動生成替代值時才會改變。即使 home 目錄不可寫，該值在本次執行中依然可用，記錄因此不會中斷。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本包背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **隨機生成，絕不派生。** id 來自 `crypto.randomUUID()`；絕不從 hostname、網路地址、git remote 或任何其他可識別來源派生，因此匿名性是生成過程的屬性。
- **同步且記憶化。** 一個程序對每個解析後的檔案路徑只觸碰一次磁碟：讀寫都是同步的，結果按解析後的檔案路徑記憶化。
- **Best-effort 持久化。** 寫入失敗仍會為本次執行返回可用 id，遙測與回饋因此不會因 home 不可寫而阻塞。
- **庫而非外掛。** 沒有 Cordis 外掛入口或設定。不釋出不變式伴生入口，因為本包不擁有任何事件流或公開可變關係，無法在不產生建立 id 這一副作用的情況下比較。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 庫入口：`getOrCreateAnonymousUserId`、檔案持久化、按路徑記憶化 |
| — | 不釋出執行時不變式伴生入口；該 API 僅擁有一個私有記憶化值和一個 best-effort 檔案，不存在獨立事件流或公開可變關係可供伴生入口在不產生建立身份這一副作用的情況下比較。 |
| [`tests/anonymous-user-id.spec.ts`](tests/anonymous-user-id.spec.ts) | 測試覆蓋的行為：生成、持久化、損壞、並行、記憶化 |

### API

本包暴露一個函式，返回該安裝的匿名 id，並在首次使用時生成並持久化；確切的簽名、選項與預設值見 `src/index.ts`。

### 儲存約定

檔案是名為 `ANONYMOUS_USER_ID_FILE_NAME` 的裸 UUID 行，讀取時按 UUID 模式驗證。首個寫入方使用獨佔建立（`wx`）；並行落敗方重新讀取並採用勝出方的值。遇到損壞或不可讀的檔案時，系統會轉而生成新值並覆蓋該檔案。記憶化按解析後的檔案路徑為鍵，因此不同 home 永遠不會共享 id。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 identity 組對映逐步進入本包所依賴的 home 路徑解析，以及使用該 id 的功能。

- [identity 組對映](../README.zh.md)——兄弟包與組範圍。
- [dsh-home-paths](../../util/home-paths/README.zh.md)——負責 `$DSH_HOME` 與 `~/.dsh` 的解析。
- [dsh-session-telemetry-otel](../../session/session-telemetry-otel/README.zh.md)——將該 id 作為 OTel Resource `user.id` 上報。
- [dsh-command-feedback](../../feedback/command-feedback/README.zh.md)——將 id 嵌入回饋確認。
- [dsh-llm-deepseek](../../llm/llm-deepseek/README.zh.md)——在提供者請求中傳送 `x-deepseek-harness-user-id`。
- [工作階段遙測子系統](../../../docs/subsystems/session-telemetry.zh.md)——遙測 seam 及其後端約定。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該共享識別符號只會作為模型不可見的 HTTP 中繼資料傳送給 DeepSeek，且不註冊任何面向模型的內容。

#### KV Cache 影響

無；該傳輸標頭既不會改變 token，也不會改變模型可見字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 id 何時不合適或需要特別注意。它們是目前包約束，不是匿名性方案的通用對比，也不是任務積壓。

- **刪除後無法恢復**——檔案丟失後會按設計生成新的匿名身份；恢復需要穩定的派生材料，這會削弱匿名性。
- **Best-effort 並行**——如果讀取方恰好落在並行程序完成獨佔建立但尚未寫完的狹窄時間窗內，本次執行可能使用不同的記憶體 UUID；後續啟動會收斂到已持久化的值。
- **沒有跨 home 身份**——不同 `$DSH_HOME` 值之間無法關聯。
- **已設定的 DeepSeek 閘道會收到該 id**——`dsh-llm-deepseek` 會把穩定標頭髮送至解析後的 `baseURL`（包括部署覆蓋），且不受遙測共享模式影響。
- **刪除檔案不會重置目前程序**——記憶化會讓本次執行的 id 一直保留到下次啟動。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和包程式碼為準，結論一旦穩定就遷移到對應歸屬。

#### 開放：檔案格式演進

持久化約定是沒有任何版本標記的裸 UUID 行。在 id 旁邊增加第二個值，或用容器包裹該行，對現有檔案都沒有遷移方案；帶版本的行格式是讓此類變更安全的一種方式。

#### 開放：不變式觀測點

不釋出不變式伴生入口，因為任何關係都無法在不產生建立 id 這一副作用的情況下檢查。未來若有安全的觀測點，可以把重新讀取的持久化檔案與記憶化的 id 進行比較。

</details>
