# Agent Note: Fire-and-forget webhook Session

Status: implemented

[English](2026-08-22-fire-and-forget-webhook-sessions.md) | 中文

## Problem

外部儲存庫事件需要啟動普通 DSH 工作，同時不能讓每個提供者介面卡都理解 Agent preset、Workspace 附加、標題、權限與回呼 teardown。GitHub pull request 變為 ready for review 是第一個用途：簽名事件可以建立一個評審 Session，使用者能在儲存庫 Workspace 下瀏覽它。

如果把它變成持久自動化引擎，就會在 Session 旁引入第二套生命週期：交付記錄、執行狀態、重試與去重策略、崩潰恢復，以及 HTTP 接受、提示詞接納、Agent idle 或模型輸出中究竟哪個表示完成。所請求能力不需要其中任何含義。

## Decision

`@deepseek-ai/dsh-webhook` 擁有隻有兩個操作的 Host runtime：規則透過 `register()` 註冊，已驗證身份的提供者介面卡呼叫 `dispatch()`。每個匹配回呼都作為任意受信任程式碼獨立執行，並返回 `null` 或一個基於 Workspace 的 Session 請求。dispatch 會在回呼結算前返回，而 effect disposer 只中止並排空自己擁有的呼叫。

runtime 不儲存提供者交付或執行記錄。它不重試、不去重、不恢復回呼工作、不觀察 Agent 狀態，也不收集結果。重複交付可能建立另一個 Session。`WebhookDeliveryId` 仍可供有意透過自有狀態實作冪等性的規則使用。

## Provider adapters

身份驗證屬於提供者介面卡。`@deepseek-ai/dsh-webhook-github` 會在注入的 WebServer 上註冊一條精確路由，限制未改動的 UTF-8 body，為每次請求解析金鑰引用，在解析前驗證 `X-Hub-Signature-256`，並把簽名無損 JSON 物件交給 runtime。`202` 只表示已驗證的記憶體分發；它先於規則匹配、外部呼叫和 Session 建立。

普通 Web 組合保持其 UI/API WebServer 獨立。GitHub 範例會把另一個 WebServer 及其介面卡掛載到只隔離 `webServer` 的 group 中，因此反向代理可以暴露 webhook 埠，而不暴露 `/api`、WebSocket 或前端檔案。

Patch 載入會把插入行中的相對外掛名錨定到 patch 檔案。因而同一個 `./github-ready-review-rule.mjs` 條目既可用於開發環境的 `--patch` overlay，也可用於永久 profile patch，而無需把規則改成軟體包。

## Session creation

規則結果會指定本地 Workspace 路徑、標題、文字提示詞、agent preset、permission preset，以及可選的明確提供者／模型路由與輸出上限。沒有明確路由時，runtime 會快照包含推理強度的完整即時預設選擇，直到首個請求記錄其持久 header。runtime 會在變更狀態前驗證 preset，解析或建立規範 Workspace，以該路徑作為 Session cwd 建立 Agent，在釋出前掛載 preset，並在接納提示詞前附加 Session。

初始 follow-up 是普通持久 user-role 訊息，並攜帶 webhook 提供者、來源、交付和規則來源資訊。它的 inbox 插入是 webhook 操作的最後邊界。之後的工作由普通 Session persistence 與 Agent 生命週期擁有；runtime 既不執行特殊 flush，也不等待輪次。

## Alternatives considered

**持久化交付與執行狀態。** 否決，因為 `pending`、`admitted`、`running` 與 `settled` 需要目前能力沒有消費方的重試、去重、崩潰和完成語義。

**在 Session 建立後再向 GitHub 確認。** 否決，因為任意規則可能呼叫外部系統並超過提供者 HTTP 時間窗；有效交付不應把傳輸可用性與後續規則工作耦合。

**在主 WebServer 上註冊路由。** 否決，因為操作者需要暴露 webhook 入口而不同時暴露瀏覽器 API。隔離的第二個實例會複用現有 HTTP 模組，而不會建立另一套伺服器實作。

**把規則限制為宣告式謂詞語言。** 否決，因為程式化規則明確需要任意外部呼叫。受信任 Cordis 外掛已經提供所需權限與生命週期。

**讓每個介面卡直接建立 Session。** 否決，因為 Workspace、preset、權限、標題、rollback 與來源資訊邏輯會散佈到各提供者包。

## Verification

包級測試固定獨立回呼執行、fire-and-forget HTTP 時序、取消與靜止態釋放、請求驗證、提示詞接納前的 Workspace 附加、rollback、GitHub HMAC 與 body 限制、憑證輪換和精確 Loader 組合。組裝 Web 範例會向隔離的第二監聽器傳送簽名 ready-for-review 交付，並記錄所得普通 Workspace 對話。

真實 API e2e 測試會透過帶 webhook overlay 與隔離監聽器的建置產物啟動 `dsh web` CLI（命令列介面），只合成帶簽名的入站 GitHub 交付，透過公開 Web API 觀察 Workspace 附加與持久來源資訊，並等待真實 DeepSeek 回應。測試不會用 test double 替換任何 DSH 服務、模型介面卡或提供者呼叫。

原始碼審計會保持執行記錄、重試 timer、去重 map、完成事件與 Agent 狀態監聽器不存在。

## Consequences

- 提供者介面卡保持小而且只含提供者邏輯，Session 建立只有一個 owner。
- 使用者在 Web Workspace 下獲得普通帶標題 Session，而不是第二套自動化 UI。
- HTTP 成功刻意不說明下游匹配或 Agent 成功。
- 崩潰與重複交付保持簡單的程序生命週期內語義；需要持久自動化的部署必須增加單獨設計的子系統，而不是重新解釋此 runtime。
