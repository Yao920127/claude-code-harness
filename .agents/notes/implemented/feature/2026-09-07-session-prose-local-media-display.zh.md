# Agent Note: 工作階段正文本地媒體路徑透過同原始檔路由顯示

Status: implemented

[English](2026-09-07-session-prose-local-media-display.md) | 中文

## Problem

Assistant 正文可能透過檔案系統路徑引用圖片，但瀏覽器無法讀取 Host 檔案。僅允許絕對 HTTP(S) 目標的渲染器會把這些引用保留為靜態 alt 文字。Issue #3662 記錄了這一展示缺口。

## Decision

Session 正文中的本地媒體路徑透過同原始檔路由渲染。本記錄擁有渲染器詞表及其歸屬；[授權驗證檔案系統讀取](2026-09-08-file-display-through-filesystem.zh.md)擁有目前檔案服務策略，並取代下文的工作區與媒體限制。

`ui-primitives` 擁有 `MarkdownText` 上的 `MarkdownPathImages` 詞表。與 `fileMentions` 一樣，它只在訊息穩定後生效，使凍結的流式塊無法快取詞表處理函式。穩定渲染過程重寫遠端 URL 白名單之外的圖片目標，並只輸出絕對 `http(s)`、`blob` 或 `data` 結果。沒有詞表時，本地目標保留靜態 alt 文字。載入失敗會把圖片替換為作者提供的 alt 文字；alt 為空時顯示原始目標路徑；不同來源仍可重新載入。

`ui-chat` 透過 `AssistantMarkdown` 提供頁面穩定的 `localPathMediaUrl` 詞表。它把絕對 POSIX 路徑對映到相對 `document.baseURI` 解析的 `api/file?path=…`，因此請求始終停留在所服務文件來源的那個掛載之下。相對路徑、協定相對路徑、Windows 風格路徑，以及 Electron `file://` 等非 HTTP 頁面傳輸保持靜態退回。

`session-controller` 在 `SessionFileReferences` 旁擁有 `SessionMediaReferences` 貢獻。它透過 `connection.fetch` 註冊；該通道執行與 `/api` RPC 相同的瀏覽器授權驗證和信任檢查。固定同源端點讓同步渲染器獲得穩定 URL，無需非同步能力協商。

## Alternatives considered

**由 Typert gateway 或 workspace controller 擁有。** gateway 擁有 Remote RPC 分發，workspace controller 擁有註冊表生命週期。兩者都不擁有檔案位元組展示；Session Controller 是服務 Session 正文的消費方。

**先經 Session RPC 取得，再使用 blob/data URL。** 附件圖片可以非同步取得，但此 Markdown 詞表必須在記憶化渲染過程中同步解析目標。

**圖片專用端點。** 單一檔案路由即可服務圖片、音訊和影片，無需獨立 URL 詞表。目前實作返回有界完整檔案；Markdown 音影片播放器節點仍是獨立工作。

**路由中的位元組簽名驗證。** 面向模型的 `read_image` 工具擁有圖片准入檢查。展示回應透過 MIME 查詢描述內容，由瀏覽器解碼拒絕損壞載荷，避免重複實作簽名檢查器。

**僅限工作區與媒體的存取（已取代）。** 原策略把規範路徑限制在已註冊工作區根目錄內，並允許除 SVG 外的 image/video/audio MIME 類別。開啟前的普通檔案檢查拒絕管道與裝置；已開啟控制代碼的身份比較收窄替換競態。這些限制約束了授權驗證後的存取範圍，並避免每次請求的互動授權流程。它們也排除了臨時截圖與遠端檔案；後續記錄說明替代策略及不保留這些限制的理由。

## Consequences

用戶端詞表無法繞過 Host 授權驗證或檔案系統提供者。原受限路由區分了工作區外已存在路徑與缺失路徑，即使拒絕其位元組仍暴露存在性；後續策略則允許提供者可讀的普通檔案。

用戶端詞表仍不支援作者提供的 Windows 風格路徑。軌跡與工具卡片 Markdown 消費方不提供此詞表，音影片 Markdown 節點也不渲染播放器。這些屬於渲染器限制，與檔案路由可讀的 MIME 型別無關。

已歸檔的[模型可讀圖片路徑](../../archived/feature/2026-08-21-model-readable-image-paths.md)記錄擁有模型側行為；本記錄擁有使用者側展示，不取代它。

## Testing

渲染器測試覆蓋穩定與流式門禁、引用式圖片、協定複查、載入失敗退回和來源替換。聊天測試覆蓋詞表與元件連線。`apps/web/tests/markdown-images.e2e.ts` 瀏覽器情境使用已播種 Session 啟動交付的 Web 組合，檢查實際載入與退回文字。模型驅動的記錄 Session 往返仍獨立於此 UI 期望；後續記錄說明目前路由覆蓋。
