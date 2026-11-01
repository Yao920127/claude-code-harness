---
description: "面向使用者與維護者的工作區指令上下文說明，用於啟用、設定預算或排查 AGENTS.md/CLAUDE.md 的載入與重新整理。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-instructions

[English](README.md) | 中文

## 概述

`dsh-agent-instructions` 向 agent（智慧代理）提供來自使用者全域檔案和專案級檔案的工作區指引；這些檔案均與 `AGENTS.md` 相容。它為第一次請求載入適用的指令鏈。它不會持續監視外部編輯：成功的檔案系統操作會發現新適用的巢狀檔案，並讓後續變更或移除可見；恢復工作階段也會對帳基線。`dsh-base` 預設啟用此行為，profile 可以停用。位元組預算限制注入的上下文：較寬泛的檔案先被省略，最具體的檔案最後被截斷，空指令鏈不新增任何內容。

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

當 agent 需要依據工作區自身的指令檔案工作時，掛載此外掛。`dsh-base` 已包含它並給予 65,536 位元組預算，因此基於 base 的 profile 僅在需要其他 `maxBytes` 時替換該設定行；沒有檔案系統提供者的樹載入不到任何內容，直到提供者出現。

### agent 獲得的內容

第一次請求包含一條持久基線訊息：先是使用者全域 `$DSH_HOME/AGENTS.md`，再按從寬泛到具體的順序包含專案指令鏈——從專案根目錄到工作階段工作目錄的每個目錄中所有現有候選檔案。去除首尾空白後內容一致的同級檔案只渲染一次，因此複製了 `AGENTS.md` 的 `CLAUDE.md` 不會被重複載入。當成功的 `read`、`write` 或 `edit` 呼叫到達更深的目錄後，下一次請求會包含新適用的指令檔案；已改變的檔案會替換其內容，消失或成為較早候選檔案重複項的檔案會產生移除通知。

### 設定

預設設定適合典型檢出：`.git` 標記專案根目錄，`AGENTS.md` 與 `CLAUDE.md` 是基礎候選，`AGENTS.local.md` 與 `CLAUDE.local.md` 是疊加的本地 overlay。只有 `maxBytes` 必填——它限制完整渲染後的基線，讓每個部署顯式選擇自己的提示詞預算。

只有確認專案根標記不存在時，專案根發現才會繼續上溯。權限或 I/O 失敗會停止發現，並丟擲主機或檔案系統提供者的原始錯誤，而不會選擇祖先專案。[根標記中繼資料決策](../../../.agents/notes/implemented/bug-fix/2026-09-03-root-marker-metadata-failures.zh.md)說明發現為何必須失敗，而不能替換為其他根目錄。

```yaml
- name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
```

受支援的欄位一覽：

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxBytes` | 必填 | 完整渲染基線訊息的上限，單位為位元組 |
| `maxSourceBytes` | `1048576` | 渲染前單個源指令檔案的上限 |
| `projectRootMarkers` | `['.git']` | 標記專案根目錄的目錄名 |
| `instructionFileCandidates` | `['AGENTS.md', 'CLAUDE.md']` | 每個專案目錄中載入的基礎檔名 |
| `localInstructionFileCandidates` | `['AGENTS.local.md', 'CLAUDE.local.md']` | 在基礎檔案之後載入的本地 overlay 檔名 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 存放使用者全域 `AGENTS.md` 的目錄 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-instructions)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 觀察預算

渲染會優先保留最具體的檔案：先丟棄完整的較寬泛檔案，再截斷最具體的檔案，並行出可見的 `Workspace instruction budget ...` 通知，指名被省略與被截斷的路徑。渲染後的位元組數絕不超過 `maxBytes`。超出預算的寬泛檔案會被忽略；重新整理期間它被視為暫時不可用，而非被移除。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋外掛背後的設計決策；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

該外掛建立在一個原則上：工作區指令是持久的對話內容，按 agent 與工作階段分別歸屬。基線訊息與重新整理訊息都是普通的帶來源 `user/message` 事件，因此與其他歷史一樣可回放、可壓縮（compaction）、可恢復，模型可見狀態總能從工作階段日誌重建。外掛擁有完整的 `<system-reminder>` 框架，每條注入訊息都原樣到達模型。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：pre-step 監聽器、`tools/result` touch 跟蹤、inbox 組合 |
| [`src/config.ts`](src/config.ts) | `Config` schema、預算解析、基線標識 |
| [`src/files.ts`](src/files.ts) | 候選發現、專案根搜尋、有界流式讀取 |
| [`src/render.ts`](src/render.ts) | 指令渲染、預算截斷、變更記錄 |
| [`src/state.ts`](src/state.ts) | 持久訊息來源、版本／digest 快取、對帳 |
| [`src/digest.ts`](src/digest.ts) | SHA-1 內容標識與每目錄重複鍵 |
| — | 不釋出執行時不變式伴生入口；回放會容忍未知或格式錯誤的 workspace source，私有 pending/cache 狀態轉換由針對性流水線測試覆蓋。 |

### 主要流程

在工作階段第一次符合條件的 `agent/pre-step`，外掛組合基線並把它折入進入步驟的批次、緊隨已領取的訊息之後。成功的第一方 `read`、`write`、`edit` 呼叫貢獻的 touch 會沿父級執行 token 逐層上浮；當外層步驟進入持久歷史後，一次投影會把可見工作階段狀態與 inbox 對帳，並排入新增、替換或移除。路徑與 digest 都未變的內容絕不重複注入。發現跟隨結構化檔案系統活動，而非 shell 導航，因為每次本地 shell 呼叫都啟動新程序，解析任意 shell 語法不是可靠的檔案系統 seam。

### 不變式

每條注入訊息都攜帶帶型別的來源及其變更列表；完整基線還攜帶從規範化發現、優先順序、專案根與預算設定派生的標識，匹配的持久訊息會確認已排隊的基線。模型可見文字不含隱藏狀態標記，指令內容或模型可見中繼資料中的字面 `</system-reminder>` 文字都會被轉義，因此儲存庫控制的文字無法關閉外掛控制的框架。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從指令檔案格式逐步進入設計決策與窮盡式設定。

- [文件標準](../../../docs/AGENTS.md)——`AGENTS.md` 指令檔案包含什麼、如何維護。
- [工作區上下文決策記錄](../../../.agents/notes/archived/feature/2026-06-24-workspace-context.md)——按 agent／工作階段隔離與生命週期理由。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-instructions)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a> <a id="prompt-shape"></a>
## 模型體驗

### 基線上下文

#### 模型看到的內容

第一次請求的派生歷史中包含一條持久 user 角色訊息，其中按從寬泛到具體的順序包含有界使用者全域指令與專案指令鏈。可見基線相容時，恢復會複用該訊息。

##### 基線指令範本

```markdown
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md

<user-global-instructions>

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Token 影響

渲染後基線只追加一次，並保留在派生歷史中直到壓縮。`maxBytes` 限制完整訊息，較寬泛檔案在最具體檔案截斷之前被省略，空指令鏈不產生 token。

#### KV Cache 影響

僅追加，位於現有可複用字首之後。可見基線標識相容時，恢復會保持複用；不相容的標識會追加一條完整替代基線，因此發現、優先順序、專案根或預算變更只會從該歷史位置起影響複用。

### 新發現的 scope 上下文

#### 模型看到的內容

成功的第一方檔案系統呼叫到達更深目錄後，下一次請求會包含一條保留的帶來源 `user/message`，其中包含新適用的指令檔案。

##### 附加指令範本

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Token 影響

每個已發現 scope 都會新增有界歷史 token，直到壓縮。可見工作階段狀態與版本／digest 比較會抑制未更改內容，PTC mode 將同一訊息延遲至外層 `run_code` 結果及其所屬持久步驟之後。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 已改變或移除的指令上下文

#### 模型看到的內容

已改變的檔案會產生 `Updated instructions from: <path>` 加替換內容。消失或成為同一目錄中較早候選檔案重複項的候選檔案會產生下方移除通知。

##### 移除通知

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

The previously loaded instructions from this file no longer apply.
</system-reminder>
```

#### Token 影響

每項已確認變更或移除都是一條受 `maxBytes` 限制的保留歷史訊息。提供者失敗不新增訊息，預算省略的更新仍可在後續檔案系統 touch 中處理。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明指令載入何時不合適或需要運維注意。它們是目前包約束，不是任務積壓。

- **發現跟隨結構化 fs 工具，而非 shell 導航**：更改目錄的 `bash` 命令不會觸發巢狀指令發現，因為 shell 語法與每次呼叫的 shell 狀態不是可靠的檔案系統 seam。
- **重新整理由 touch 驅動**：沒有 watcher；外部編輯會在下一次成功的第一方 `read`、`write` 或 `edit` 時、恢復對帳可見基線時，或進入步驟的 pre-step 恢復被遮蔽基線時可見。
- **候選語義有意保持簡單**：不解釋小寫名稱、`.claude/rules/` 與 `@path` import；專案 scope 預設載入 `AGENTS.local.md`／`CLAUDE.local.md` overlay，但使用者全域 `$DSH_HOME` scope 沒有本地 overlay，其他自定義名稱需要顯式候選設定。
- **每目錄去重基於內容**：同級候選只有在去除首尾空白後位元組完全一致時才摺疊。`CLAUDE.md` 若 symlink 到同級 `AGENTS.md`，會解析為相同內容並像任何重複項一樣摺疊；從 `AGENTS.md` 漂移的獨立副本則會與它一起完整載入。
- **Symlink 指令檔案會跨越信任邊界跟隨**：最終元件是 symlink 的候選檔案會被解析並載入其目標，因此克隆儲存庫可以將樹外檔案內容呈現為較低優先順序的工作區指引（它絕不覆蓋 system、developer 或使用者直接下達的指令）。載入不受信任儲存庫時，請用檔案系統策略門禁或 OS 沙箱限制 `ctx.fs`。
- **指令內容受限但不會被摘要**：超出預算的寬泛檔案會被省略，最具體檔案可能被截斷；該外掛絕不請求模型壓縮指令文字。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
