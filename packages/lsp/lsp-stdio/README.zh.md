---
description: "ctx.lsp 的 stdio 語言伺服器提供者：設定好的伺服器命令、副檔名對映與有邊界的臨時開啟查詢，供組合原生代碼導航的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp-stdio

[English](README.md) | 中文

## 概述

使用 `dsh-lsp-stdio` 可讓 agent（智慧代理）從顯式設定的本地語言伺服器獲得定義、引用、實作與懸停資訊。它把副檔名對映為語言識別符號，按需為每個工作區啟動一臺伺服器，並在每次查詢時重新讀取檔案，不在查詢之間保留文件狀態。語言伺服器程序與原始檔讀取共享已掛載的檔案系統和子程序環境。本包不安裝伺服器，也不提供沙箱；部署方必須提供命令、對映和所需的隔離措施。同一伺服器與工作區的查詢序列執行，不同工作區可並行執行。

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

當部署擁有本地語言伺服器——例如 `typescript-language-server`——並希望 harness 透過它們導航程式碼時，掛載此提供者。它需要位於同一執行世界的檔案系統與子程序提供者，以及 `dsh-lsp` seam；若要向模型開放，還需要 `dsh-tool-lsp`。

### 最小設定

`servers` 記錄把每個穩定的提供者 id 對映到一條伺服器命令。提供者會在清理 credential 後於載入時解析每個可執行檔案，因此一個壞設定項會阻止所有提供者註冊；程序在第一次匹配查詢時惰性啟動。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
  config:
    servers:
      typescript:
        command: typescript-language-server
        args: ['--stdio']
        extensionToLanguage:
          '.ts': typescript
- name: '@deepseek-ai/dsh-tool-lsp'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `command` | 必填 | 要 spawn 的可執行檔案——絕對路徑，或在載入時從子程序 PATH 解析；不使用 shell 啟動 |
| `extensionToLanguage` | 必填 | 小寫、以點開頭的副檔名 → LSP language id（例如 `{ '.ts': 'typescript' }`） |
| `args` | `[]` | 傳給可執行檔案的參數 |
| `env` | `{}` | 合併到已清理 credential 的環境之上的額外 env；匹配 `KEY`／`PASSWORD`／`SECRET`／`TOKEN` 的變數以及所有 `DSH_*` 名稱不會被轉發 |
| `initializationOptions` | `null` | 轉發給伺服器的靜態 `initialize` 選項 |
| `configuration` | `null` | 每個 `workspace/configuration` 設定項的靜態答案 |
| `maxMessageBytes` | `16000000` | 從伺服器接受的單條 framed 訊息最大大小 |
| `maxStderrBytes` | `1000000` | 為診斷保留的 stderr 尾部最大大小 |
| `maxDocumentBytes` | `4000000` | 該主機可開啟的原始檔大小上限 |
| `shutdownTimeoutMs` | `5000` | 升級前用於優雅 `shutdown`／`exit` 的預算 |
| `killGraceMs` | `2000` | 請求取消及 SIGTERM→SIGKILL 升級的寬限期 |

`servers` 必須至少包含一個設定項，每個 id 都必須非空；定時器預算必須是 Node 定時器範圍內的正整數，位元組上限必須為正。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-lsp-stdio)是每個受支援欄位的窮盡式真源。

### 查詢做什麼

首次查詢某個工作區時，提供者會為該工作區啟動一個伺服器程序並放入池中。每次查詢透過 `ctx.fs` 讀取目前原始檔，在伺服器中開啟它（`textDocument/didOpen`），執行所請求的操作，然後關閉——因此伺服器始終看到目前文字，呼叫之間不會殘留任何文件狀態。同一伺服器與工作區的查詢一次只執行一個；不同工作區並行執行。如果池化程序在只讀查詢之前或期間發生故障，提供者會在新程序上重試該查詢一次。

### 可觀察的成功與失敗

成功的導航返回規範化位置，懸停返回規範化文字或無可懸停提示；空結果是成功的無結果回應。當伺服器不支援該操作或臨時開啟／關閉同步（`LSP_UNSUPPORTED_OPERATION`）、原始檔缺失、非普通檔案、非 UTF-8、過大或位於規範工作區之外（在伺服器啟動前被拒絕），或伺服器返回格式錯誤的載荷（`LSP_MALFORMED_RESPONSE`）時，查詢會失敗。被強制殺死的 harness 會讓伺服器繼續執行直到自行退出——優雅關閉只發生在服務釋放時。

### 安全邊界

本提供者信任所設定的伺服器，不提供任何沙箱隔離；伺服器獲得的是已掛載執行世界的檔案系統與程序權限。它會在伺服器啟動前拒絕缺失、非普通檔案、非 UTF-8、過大或規範化後位於工作區之外的查詢源。結果位置可以指向工作區外部，但外部路徑永遠不能成為查詢源。為同一執行世界掛載檔案系統與子程序提供者——分裂世界組合無效。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **通用主機，不是目錄。** 部署顯式設定命令與對映；預設應放在 `cordis.yml` overlay 中，而不是本包內。
- **相容性優先的臨時開啟。** 每次查詢都執行 `didOpen`（版本 1、完整文字）→ 請求 → `didClose`，因此伺服器始終看到目前位元組，第一版不需要 `didChange`、內容 cache 或文件 LRU。
- **先讀後啟動。** 原始檔在工作區佇列內先完成解析、包含關係檢查與位元組限制，然後才建立任何程序，因此排隊查詢只會在輪到自身時讀取目前位元組，無效原始檔也不會留下空閒的池化程序。
- **每個規範工作區一個池化程序。** 實例按 `(server id, canonical workspace target)` 進行 single-flight；傳輸故障會在等待釋放完成後於新程序上重試一次該只讀查詢。
- **逐工作區序列化。** 每個工作區一條可中止佇列，序列執行源讀取／開啟／查詢／關閉生命週期；不同工作區並行執行，無法停止伺服器的取消只會終止該實例。
- **有邊界的釋放。** 優雅 `shutdown`／`exit` 會升級到 subprocess 提供者的 managed-range 終止流程；是否完全停穩由等待整個 range 確認，而非由終止請求自身的結果確認。
- **執行世界配對。** 伺服器透過 `ctx.subprocess` 啟動，`processId: null`（另一臺機器或 PID namespace 不得監視 harness）；原始檔透過 `ctx.fs` 讀取；不發出 `fs/observed` 事件——只有 LSP 結果對模型可見。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：config schema、可執行檔案解析、提供者註冊、程序池 |
| [`src/host.ts`](src/host.ts) | 透過 `ctx.fs` 完成工作區規範化與有邊界的源讀取 |
| [`src/instance.ts`](src/instance.ts) | 單個伺服器程序：initialize 握手、序列化臨時開啟查詢、有邊界的釋放 |
| [`src/connection.ts`](src/connection.ts) | JSON-RPC 端點：id 關聯、出站請求、入站伺服器請求、stderr 上限 |
| [`src/framing.ts`](src/framing.ts) | `Content-Length` 分幀與有邊界的解碼器 |
| [`src/protocol.ts`](src/protocol.ts) | 協定型別子集：能力、位置、懸停、文字文件同步 |
| [`src/translate.ts`](src/translate.ts) | 能力檢查、UTF-16 協商、`Location`／`LocationLink`／hover 規範化 |
| [`src/abort.ts`](src/abort.ts) | 融合呼叫方與釋放訊號的取消輔助 |
| — | 不釋出執行時不變式伴生入口；程序池與佇列是私有狀態，本提供者也不釋出獨立的生命週期事件流或可列舉快照。 |

### 協定行為

初始化會宣告 UTF-16 位置、工作區資料夾與設定、markdown／plaintext hover，以及定義與實作使用的 link 支援，且不進行動態註冊；伺服器返回的能力具有最終決定權。伺服器省略 `positionEncoding` 時預設為 `utf-16`；其他任何值都會使查詢失敗。用戶端透過靜態設定回答 `workspace/configuration`，接受生命週期記帳請求，並拒絕 `workspace/applyEdit`——它絕不應用編輯或執行命令。導航直接對映 `Location`，並從 `LocationLink` 的 `targetUri` + `targetSelectionRange` 對映；hover 規範化接受 `MarkupContent` 與 `MarkedString` 形狀，保留字串值，把帶 language tag 的值渲染為圍欄程式碼，並用一個空行連線陣列。缺失結果、格式錯誤的範圍或位置，以及格式錯誤的 hover 編碼，都會以結構化 `LSP_MALFORMED_RESPONSE` 錯誤失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享的導航模型逐步進入 seam 與工具。

- [LSP 導航子系統](../../../docs/subsystems/lsp.zh.md)——操作、座標、請求與結果，以及 `LspError` code。
- [dsh-lsp](../lsp/README.zh.md)——本提供者註冊到的 seam。
- [dsh-tool-lsp](../tool-lsp/README.zh.md)——基於該 seam 的面向模型工具。
- [lsp 組地圖](../README.zh.md)——三個包的家族及其相關文件。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-lsp` 間接影響；該工具呈現此提供者的規範化結果，本主機自身不貢獻提示詞或 schema。

#### KV Cache 影響

不會直接失效；請求字首變更由 `dsh-tool-lsp` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供者何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **不提供隔離策略**——本包信任所設定的伺服器，不對其程序實施沙箱；受限部署必須提供適當的程序與檔案系統提供者，或使用同一執行世界的沙箱包裝層。
- **臨時開啟相容性下限**——同步能力省略開啟／關閉（或宣告 `None`）的伺服器不受支援，即使關閉文件查詢能夠工作；固定的 TypeScript e2e 只建立一項相容性下限，不代表跨語言承諾。
- **逐伺服器與逐工作區序列化延遲**——共享同一個伺服器與工作區的並行 agent 會在一個程序後排隊；長生命週期工作區程序會佔用記憶體直到釋放。
- **被強制殺死的 harness 會遺留語言伺服器**——`initialize.processId: null` 取消了伺服器側的用戶端 PID 監視，因此伺服器只能由服務的優雅釋放清理；被 SIGKILL 的 harness 會讓它們繼續執行，直到自行退出。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
