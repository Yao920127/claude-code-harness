---
description: "Web 工作階段日誌 ZIP 匯出：Host 流式傳輸、認證下載路由、Session Header 操作與 /export 命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-export

[English](README.md) | 中文

## 概述

`dsh-session-log-export` 讓 Web 介面可以下載工作階段的完整歷史：Session Header 更多操作按鈕下的 `下載 Session 日誌` 選單項與 `/export` 斜槓命令都會把工作階段樹——工作階段本身、其子工作階段與附件——作為 ZIP 交給瀏覽器下載。本包擁有 Host 歸檔流、經過認證的 Fetch 路由以及瀏覽器控制元件和回饋。下載目標位置由瀏覽器選擇。設定與用法在前，隨後說明實作細節。

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

當 Web bundle 需要讓使用者匯出工作階段日誌時使用本包。它需要 Connection、命令註冊表、Session 查詢與持久化以及附件服務。掛載外掛，然後在 Session Header 的更多操作選單中選擇 `下載 Session 日誌` 或輸入 `/export`；瀏覽器會下載 `dsh-session-<id>.zip`。

掛載 `ui-message-feedback` 時，同一選單還提供“回饋”，開啟已有的 Session 回饋彈出視窗。開啟或關閉該彈出視窗不會匯出 Session 或提交回饋。回饋入口隨回饋外掛的可用狀態顯示；匯出功能保持獨立可用。

### 何時選擇

為需要帶可見下載彈出視窗的面向使用者的工作階段匯出的 Web 部署選擇它。需要程式化或 Host 側匯出時避免使用：本包產生的是瀏覽器下載，而非 Host 路徑寫入。日誌從持久化讀控制代碼序列化而來，因此任何已掛載後端都受支援。

### 組合

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Web bundle 將本包與 Connection、`dsh-commands`、`dsh-client-ui-commands` 和 `dsh-client-ui-conversation` 一起掛載。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `compressionLevel` | `6` | 每個 ZIP 條目的 DEFLATE 級別，範圍為 0 到 9。 |

### 命令約定

| 輸入 | 結果 |
|---|---|
| `/export` | 記錄使用者命令的生命週期；提交命令的瀏覽器下載文件相對的 `api/session.export?sessionId=<id>&includeDescendants=true`（Host 路由 `/api/session.export`） |
| `/export <path>` | 錯誤；瀏覽器下載透過瀏覽器的普通下載行為選擇目標位置 |

### 預期行為

彈出視窗報告三個階段：準備中、開始下載或失敗。關閉彈出視窗不會取消正在進行的下載，該操作隨後結束時彈出視窗也不會重新開啟。每個工作階段同時只允許一項下載，重複操作共用該任務。匯出包含即時工作階段的最新事件：Host 端點在讀取前會 flush 活動的根工作階段，因此斜槓命令觸發的 ZIP 會包含啟動下載的 `command/run` 與 `command/done` 事件對；非活動的持久化工作階段不需要 flush。每份邏輯日誌在歸檔中使用目前 generation 的規範檔名（v0 為 `session.jsonl`，其他版本為 `session.vN.jsonl`），每個子工作階段目錄下也遵循同一規則。圖片使用 `media/<attachmentId>.<ext>`，通用檔案使用 `files/<digest-prefix>/<digest>/<name>`。通用檔案以有界分塊讀取並壓縮，因此匯出大型上傳檔案時不會把它完整緩衝進記憶體。

附件收集讀取內建 Session 事件宣告的內容欄位與已完成的 assistant 流塊，包括扁平的 V4 tool 角色訊息。未知事件載荷與無關欄位在匯出日誌中保持不變，但不會觸發附件讀取。

### 失敗

當 ZIP 流式傳輸開始前的預檢失敗時——例如 Host 端點不可達或設定錯誤——彈出視窗顯示準備階段錯誤。瀏覽器接受 GET 後發生的子工作階段或附件讀取失敗由瀏覽器下載管理器報告，不透過彈出視窗報告。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本包如何接入匯出控制元件，並指出實作它的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計拆分

本包分為兩部分。Host 半包（[`src/index.ts`](src/index.ts)）註冊 `/export` 命令，並向 Connection 貢獻精確的 `GET`/`HEAD /api/session.export` Fetch 路由；[`src/archive.ts`](src/archive.ts) 建置有界 ZIP 流。瀏覽器半包（[`src/client/index.ts`](src/client/index.ts)）提供共享下載控制器和 UI，並觀察 `command/executed`，因此只有提交命令的瀏覽器會啟動下載。

Header 的更多操作入口使用公共緊湊 Button，點選區域為 28px 正方形，與右側欄展開控制元件共用圓角和 hover 底色。

### 下載流程

兩條入口都會先向文件相對的 `api/session.export?...` 發出 `HEAD` 預檢請求，然後把 GET 路由交給瀏覽器下載管理器，JavaScript 不緩衝 ZIP。一個控制器按工作階段持有一項進行中的下載，把並行操作摺疊進該任務，並在外掛釋放時取消預檢。彈出視窗狀態存放在按工作階段鍵控的快照儲存中，因此按鈕與命令按工作階段共享一個彈出視窗。

Host 路由是由該功能擁有的精確 Fetch 路由貢獻。Connection 應用 Host/Origin 與瀏覽器工作階段檢查並橋接流式 `Response`；本包擁有查詢驗證、活動工作階段 flush、基於控制代碼的日誌讀取與附件讀取、ZIP 生成和 HTTP 狀態語義。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 Web 控制元件逐步進入 Host 端點及相關的命令與工作階段介面。

- [dsh-client-connection](../../client/connection/README.zh.md)——Host 端點使用的認證 Fetch 路由載體。
- [命令子系統參考](../../../docs/subsystems/commands.zh.md)——`/export` 命令註冊的使用者命令註冊表。
- [dsh-client-ui-commands](../../client/ui-commands/README.zh.md)——渲染並確認 `/export` 的瀏覽器命令介面。
- [工作階段查詢包對映](../README.zh.md)——本包所屬的檢索包族。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者 `/export` 控制

#### 模型看到什麼

無。`/export` 留在使用者命令平面，ZIP 下載不會進入模型歷史。

#### Token 影響

為零。該命令不建立模型輪次。

#### KV Cache 影響

無。僅日誌命令生命週期與瀏覽器下載不會改變派生請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **瀏覽器下載，而非 Host 路徑寫入**——目標位置由瀏覽器選擇；不會返回 Host 路徑或原生資料夾操作。
- **預檢只報告流式傳輸前的失敗**——瀏覽器接受 GET 後發生的子工作階段或附件讀取失敗由瀏覽器下載管理器報告，不透過彈出視窗報告。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關頁面為準。

#### 未來：瀏覽器之外的匯出目標

下載刻意限定在瀏覽器範圍；Host 路徑或原生資料夾匯出需要新的端點約定，並決定 ZIP 的寫入磁碟位置。

</details>

**執行時不變式：** 不釋出伴生入口。Connection 與命令註冊表持有兩個註冊，每次匯出均讀取權威的 Session 服務。
