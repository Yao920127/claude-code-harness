# Agent Note: 首次使用預設 Workspace

Status: implemented

[English](2026-09-20-default-workspace.md) | 中文

## Problem

新安裝的應用要求使用者先選目錄才能傳送第一條訊息。去掉這一步前置操作時，必須保留 Session 的固定工作目錄，也不能把隱藏或已歸檔的歷史誤判為新安裝。

## Decision

啟動時等待完整的 Workspace 和 Session 基線。兩份列表均為空時，Client 請求 Host 準備預設 Workspace，隨後建立或複用並選中其空白 Session。Session 存在前不可輸入，之後使用常規 composer 流程。[Session scope 與供給通道](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.zh.md)負責 blank Session 複用與供給通道的理由。

[Workspace registry](../../../../packages/workspace/workspace/README.zh.md#first-use-workspace)負責資格判斷和目錄準備。所有 live Session、持久化 header 和已歸檔身份都計入判斷，包括側欄中不可見的條目。操作共用 registry 修改佇列，並在目錄準備後重新檢查 Session 歷史，因為 Session 可以獨立啟動。

Host 控制器解析 Documents 位置；註冊表接收不依賴 locale 的目錄解析器。解析器僅在允許建立時於變更佇列內執行，因此重複請求直接複用持久化的 Workspace，無需再次查詢作業系統目錄。持久化 Workspace id 獨立於名稱記錄初始化成功。改名、切換語言、重新啟動或刪除登記均不能再次初始化預設工作區。標記與登記一起提交，因此登記失敗可以重試。目錄內容仍遵循已有的[僅刪除中繼資料策略](2026-07-27-workspace-registration-deletion.zh.md)。

本決策中的首次使用資格與刪除後的生命週期已被[永久預設工作區](2026-09-26-permanent-default-workspace.zh.md)取代。本決策中與命名相關的部分已被取代：[語言中立的預設工作區命名](2026-09-23-language-neutral-default-workspace-naming.zh.md)固定目錄名與儲存標題，只在地化螢幕上的標籤。

不符合首次使用條件時不返回 Workspace，也不顯示失敗彈出視窗。準備失敗時提供現有資料夾選擇器；後續列表通知不會觸發啟動流程重試。成功的登記會在 Session 建立或提示詞傳送失敗後保留。選中預設或手動選擇的 Workspace 均不會提交訊息。

## Alternatives considered

- 僅在傳送時建立可以避免未使用的目錄，但需要獨立的本地草稿、向 Session 轉移草稿及首次提交協調邏輯。啟動時建立接受提前寫入檔案系統的副作用，始終使用普通 Session 輸入。
- 系統查詢不可用時退回到 `<home>/Documents`，會選擇未經確認的 Documents 位置；需要其他目錄的部署使用顯式 Host 覆蓋設定。
- 根據側欄可見行推斷首次使用，會忽略已歸檔、隱藏和無 cwd 的 Session。
- 將初始化目錄的路徑作為初始化標記，會允許改名、遷移或刪除後再次建立預設工作區。
- 在 Session 建立後更改 cwd，會改變其已記錄工具和附件的含義。

## Consequences

開啟新安裝的應用即可在使用者傳送訊息前建立目錄和空白 Session。目錄授權與準備失敗提示可能在啟動期間出現。Desktop 和遠端 Web 用戶端均由 Host 準備目錄，因此遠端使用者使用 Host 帳戶的 Documents 位置。Documents 查詢不可用時，採用與目錄建立失敗相同的資料夾選擇恢復路徑。

該功能保留[由引用持有的 Client Session 生命週期](../architecture/2026-09-15-client-session-references.zh.md)，無需修改 agent-loop 或 Session 事件。Registry 和用戶端測試覆蓋重試、隱藏曆史、並行及啟動取消；[瀏覽器情境](../../../../apps/web/tests/default-workspace.e2e.ts)透過隔離的 Documents 目錄和已錄製 Session 回放驗證完整裝配下的啟動、重新整理、首次傳送與選擇器路徑。
