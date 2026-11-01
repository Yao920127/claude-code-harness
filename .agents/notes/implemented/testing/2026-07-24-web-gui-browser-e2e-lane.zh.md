# Agent Note: Web GUI 的無金鑰瀏覽器 e2e 車道

Status: implemented

[English](2026-07-24-web-gui-browser-e2e-lane.md) | 中文

## 問題

Web GUI 以一條真實組裝鏈交付——chromium 頁面 → client 外掛 bundle → HTTP 單次 RPC + 兩條 SSE（Server-Sent Events）流 → `toFetchHandler`/apiproxy → host 端的 agent loop（智慧代理迴圈）、工具與 JSONL 持久化——卻沒有任何測試無金鑰且確定性地檢驗這條鏈。[GUI 測試體系](../process/2026-07-20-gui-testing-system.zh.md)覆蓋第 1 層（Node 中的協定同構）、第 2 層（物件層狀態機）與第 3 層冒煙測試，但原有無金鑰冒煙驅動的是獨立 Client fixture——沒有 host、沒有 wire、沒有 agent loop——而全鏈結冒煙需要 `DEEPSEEK_API_KEY` 和真實模型，因此不確定、在無金鑰 CI 中自行跳過。[docs/testing.md](../../../../docs/testing.zh.md) 的快照哲學——帶金鑰錄製一次、永久無金鑰回放、格式變動時重新整理——已覆蓋 ACP（Agent Client Protocol）、headless `stream-json` 與 TUI 三個 transcript（文字記錄）表面；web 表面是唯一沒有這層保障的組裝形態。而缺口恰恰是兩起已實證 GUI P0 藏身之處：獨立 fixture 短路掉的 wire 承載鏈。

## 決策

`pnpm run test:web` 攜帶 `apps/web/tests/` 下的無金鑰、確定性瀏覽器 e2e 車道：錄製的工作階段日誌 fixture 經 `@deepseek-ai/dsh-llm-replay` 對真實程序內 web 組合回放；使用者可見狀態使用規範化的 aria 預期輸出，持久化的世界狀態則使用程序內斷言。Chromium 執行整個車道；[模型與推理強度選擇情境](../../../../apps/web/tests/declared-reasoning.e2e.ts) 還在 WebKit 中執行，以覆蓋原生滑鼠焦點行為。配套的產品約定包括 `dsh-llm-replay` 的節奏控制、消費檢查與已驗證的索引式覆寫 patch；跨包的 `dsh-llm` 失敗透過自有資料屬性保留經驗證的提供者資訊；已交付的 web 組合掛載 `llm-retry`，以處理瞬態模型失敗。

### Scaffold：`apps/web/tests/scaffold.ts`

一個普通的共享 fixture 模組（[測試政策認可的形態](../../../../docs/testing.zh.md)），不是包：值得門禁把守的邏輯——回放推導、工作階段解析、日誌脫敏、持久化——都在已受門禁的包 `dsh-llm-replay`、`dsh-session-snapshot`、`dsh-session-persistence-jsonl` 中；剩下的只是啟動接線和瀏覽器膠水，而驅動 chromium 的原始碼在無瀏覽器的覆蓋率 runner 上無法誠實保持逐檔案 100% 覆蓋率。

`launchWebScaffold()` 透過 vendored Loader 的 include 機制，從交付的 `apps/cli/config/base.cordis.yml` 與 `apps/cli/config/web.cordis.yml` 啟動真實 web 組合——與 `AppCLIEntry` 為 `dsh web` 驅動的是同一棵樹、同一套機制。差異全部經 include patch 覆蓋在這棵樹上，即 ACP `cordis.snapshot.yml` 模式的程序內表達：臨時 `persistenceRoot`；每個主機級 `skill-filesystem` 根目錄（`dshHome`、`agentsHome` 和 `bundledSkillDir`）都釘在臨時工作區下並停用監聽，因為環境 skill（技能）目錄是模型可見輸入；停用 `agent-instructions`（錄製的 fixture 不得嵌入本儲存庫的 AGENTS.md）；停用 `session-title-llm`（其發後不管的標題呼叫會與迴圈爭搶工作階段的回放遊標）；webserver 行釘到埠 0，並使用已建置的 dist；無金鑰模式下停用 `llm-deepseek`。patch 的 id 一旦不再匹配任何行，boot 掃描會大聲失敗而不是漂移。boot 在臨時工作區 `chdir` 下執行，使 api-gateway 的 `process.cwd()` 工作階段預設值、工具 cwd 與 fixture 一致；`dsh web` bin 自身的膠水（argv、profile json、AppCLIEntry）仍由 `smoke-real.e2e.ts` 中的無金鑰 CLI（命令列介面）冒煙把守。初始化復原和正常關閉都會先對 Cordis 樹執行 dispose（資源釋放），再刪除 scaffold 持有的兩個臨時根目錄；每項清理都會獨立嘗試，並會報告清理失敗而不掩蓋初始化失敗。

無金鑰的模型替換 = 停用介面卡行的 patch 加 `installLlmReplay` 在停穩的根 ctx 上以提供者目錄（providers-catalog）模式填充空的介面卡註冊表——絕不用 catch-all：介面卡行被停用後不存在任何介面卡，catch-all 會讓 `resolveModelInfo` 無路由可走，`compaction-basic` 的步後壓力檢查將步步告警，而不是被可證明地閒置（釋出的 128k `contextWindow` 使該路徑對小 fixture 保持閒置）。選擇直接安裝而非插入回放外掛行是刻意的：直接安裝返回收尾消費檢查所需的 `ReplayHandle`。沒有 fixture 的情境讓註冊表保持空置，任何意外的流式呼叫都會以 NO_ADAPTER 大聲失敗。

`seedSession()` 透過真實持久化 API 播種冷工作階段——一次性 `Context` 掛載 `SessionStore` + `JsonlSessionPersistence` 到 host 的根上下文，`create()` + `append()`，一次 `utimes` 回呼保證側欄順序確定（`semantic-checkpoint.snapshot.ts` 先例）——絕不裸寫檔案，因此播種器對桶雜湊、檔名編碼、壓縮一無所知，host 的 zstd 預設值也無需任何啟動開關。種子在播種時即驗證（可解析、以 `turn/end` 結尾——未閉合的最終輪次會被恢復（resume）的崩潰修復改寫）。

### 確定性規則

回放模式下瀏覽器斷言的屏障棧，按序：（1）host 側 `await agent.whenIdle()` 加超時，以程序內 `turn/end` 為錨——空閒翻轉發生在持久化寫入磁碟之後，一次等待同時覆蓋輪次完成與永續性；（2）瀏覽器安定輪詢（流式輸出節點已解除安裝、最終文字可見）。錄製模式下，日誌採收在 `whenIdle()` 之後、scaffold 釋放之前進行，此時執行中的工作階段仍然可用。單獨監聽程序內 `turn/end` 是錯誤屏障（它先於 SSE 幀到達瀏覽器、先於 fsync 觸發）；禁止輪詢持久化檔案來充當輪次完成或永續性屏障（NFS 上慢，且被 `whenIdle` 取代），但工具控制的臨時就緒標記可以僅作為該完成屏障之前的互動門控進行輪詢；`networkidle` 被徹底禁止（SSE 流保持開啟時它永不解析）。導航斷言會在頁面載入前同時監聽 `session.list` 和 `workspace.list` 的初始回應，隨後等待播種資料投影到 DOM；僅憑 shell 已掛載不能判定就緒，因為較晚完成的 bootstrap 可能替換受控狀態。

佈局斷言先等待字型載入、框架過渡完成及 Conversation 寬度釋出，再讀取尺寸；觸發合成 resize 後，還需等待其排程的 React 更新，才能測量透過 portal 掛載的面板。目錄樹的子目錄和根目錄讀取使用相同的 Remote 等待預算。工作區過載情境在開啟另一個路徑編輯器前，等待 Session 選擇恢復及輸入框獲得焦點，因為遲到的聚焦會取消路徑草稿。回應式檔案標籤情境將實測通道寬度放在容器查詢檔位內部，併為平臺字型度量保留明確餘量。

不做單次瞬態 DOM 斷言：從 replay yield 到 React commit 的每一跳都可能合併 chunk，取樣 `[data-streaming]` 天然就是競態。流式增量性透過有序 `agent/assistant-stream` follow path 斷言，最終持久 `assistant/message` 或 `assistant/attempt` 則嵌入 replay 使用的精確 stream。`dsh-llm-replay` 的可選 `paceMs`（預設預設 = burst）只是讓瀏覽器觀察到真正增量 SSE 的真實感旋鈕；正確性絕不依賴它，且 pace wait 期間 abort 會即時取消。

分頁驅動會等待互動式載入行退出 pending 狀態，並在滾動前記錄請求前的行數。因此，即時提交的常駐頁仍然可觀測，不會變成一次滾動手勢不會重複觸發的請求基線。

每個情境都會因任何 pageerror 或用戶端的連線丟失/間隙修復控制檯警告而失敗：否則重連機制加歷史重同步會把一條死掉的 SSE 通路自愈掉，套件反而認證了壞 wire。Scaffold 的 `close()` 呼叫 `ReplayHandle.assertConsumed()` 收尾檢查（每個已錄腳本都被繫結、每個遊標都耗盡），把靜默的少放與錯綁變成清晰診斷。車道不設 vitest 重試；每個檔案中的每種引擎各啟動一個瀏覽器、每情境一個新 context、每情境一個 host；視口固定；互動選擇器錨定 role、`data-*` 屬性和可見文字，而 frame 與工作階段區採集則使用既有的 CSS 模組區域性類名錨點。常規情境開啟 `en-US` 瀏覽器，使在地化的 role 定位器和預期輸出統一採用明確指定的語言；斷言中文文案的情境則開啟 `zh-CN` 瀏覽器，因為 Host settings 文件沒有顯式偏好時，用戶端的暫定 locale 由 `navigator` 推導（[由瀏覽器推導初始 locale](../../archived/feature/2026-07-31-browser-derived-initial-locale.md)）。`settings-chrome.e2e.ts` 還額外覆蓋雙向切換、全新英文瀏覽器預設態，以及共享同一 DSH home 的不同埠之間的偏好持久化。

### 預期輸出

具有穩定所屬區域的情境會為每個不同的使用者可見狀態提交一份規範化的 `ariaSnapshot()`；跨區域的 workspace 管理狀態則使用語義 DOM 斷言與權威 host 狀態檢查。UUID、cwd、workspace basename 與時長等易變內容會歸一為穩定 token；採集過程持續輪詢，直到連續兩次規範化讀取結果相同。Role 與文字錨點繼續充當可評審預期輸出周圍的語義防線，並直接覆蓋跨區域狀態。擁有錄製 Session 的情境預設將規範化後的重新持久化根 generation 與選定的最高 parent fixture 比較（v0 為 `session.jsonl`，正 generation 為 `session.vN.jsonl`）；借用或派生 fixture 的情境顯式關閉該比較。世界狀態斷言仍使用權威 host 狀態或獨立、完整的 `workspace.expected/`，因為 transcript 匹配不能證明外部效果。`refresh` 是 ARIA 預期輸出的唯一 writer；replay 模式下缺少預期輸出時，測試會連同重新生成命令一起失敗。

型別檢查平面切分是結構性的：host scaffold、其支援模組，以及每個啟動或檢查 host 組合的 web spec 都會從註冊在 client 側的 `apps/web` 工程中排除，並逐檔案納入 `tsconfig.host.json`。一個程式不能同時持有 Cordis `Context` 合併的兩側。

### 模式與 fixture

`DSH_SNAPSHOT` 選擇 replay（預設，無金鑰）、record（帶金鑰）或 refresh（無金鑰）。發起提示的 spec 將所有模式共用的驅動步驟與僅供 replay/refresh 使用的斷言分開；record 模式驅動真實輸入框，採收記憶體中的工作階段 header 與事件，脫敏請求頭，並 token 化當次執行的工作階段、cwd 與 RPC 標識。隨後一次無金鑰 refresh 重新生成 ARIA 預期輸出。每條提示詞都會與 fixture 中錄製的 `user/message` 核對；每個情境目錄都採用封閉清單，其中每個 JSONL 都是脫敏不動點。語料 manifest 為每個 Web 組合/header 類分配且僅分配一個 pin，並只在該 pin 的 sidecar 中保留提示詞與工具 schema 正文。

### 覆蓋約定

該車道覆蓋三類行為。即時輪次情境釘住普通工具執行、取消、不可重試失敗、瞬態重試、常駐提問與輪次中途 steering（中途引導）；同步依賴持久事件、`whenIdle()` 或顯式回放標記，而不使用延時。冷歷史情境透過真實持久化 API 播種，在不呼叫模型的情況下覆蓋歷史渲染、側欄搜尋、Trajectory 與 waterfall（瀑布式事件）檢視及工具詳情。瀏覽器生命週期情境覆蓋首次傳送時物化工作區、重新載入恢復、佈局重置、主題與語言偏好，以及工作區的建立、重新命名和檢視操作。每類情境都斷言瀏覽器表面和權威的 host 狀態；意外的模型呼叫或未耗盡的 fixture 會使拆卸失敗。必需車道還包含一份合成的 88 輪 Chat 滾動約定，其中混合了換行 Markdown、圍欄程式碼以及成對的 bash 呼叫/結果。真實 wheel、輸入框、工具、tab、工作階段與 viewport 互動會在並行歷史前插加帶節奏流式輸出、貼底/離底流式輸出、工具 disclosure 離屏迴圈、擴充功能歷史後的檢視/工作階段重新掛載、寬度重排、貼底後立即重新掛載、輸入框尺寸變化以及 textarea wheel 鏈情境中，斷言一個已穩定的具名行相對 transcript scrollport 的頂部位置和到真實底部的距離；真實鍵盤翻頁與觸控式慣性滑動模擬額外釘住不依賴 wheel 的貼底跟隨所有權（[讀者滾動歸因筆記](../../archived/bug-fix/2026-08-06-reader-scroll-attribution-observed-top-ledger.md)）；它刻意不釘 DOM 基數或絕對 `scrollTop`，因此同一約定可以驗收虛擬化實作。另一份基於同一 fixture 的互動約定釘住異構行順序、相鄰工具 disclosure 的獨立狀態、使用者訊息剪貼簿內容的精確值、以輪次為邊界的訊息 fork、源工作階段/子工作階段隔離，以及子工作階段中的一次真實追問輪次；wheel 輸入只用於導航到語義目標，不承載幾何預期。一份簡短的即時歷史約定從空白工作區開始，連續驅動輸入框輪次，其中包括真實的 bash 呼叫/結果輪次和一段帶節奏的長篇最終回應；它釘住單一工作階段身份、每輪事件的精確歸屬、瀏覽器回顯唯一性與輸入框恢復，不設定時間閾值。

### CI 立場

根據[瀏覽器快照 CI 決策](2026-07-30-web-browser-snapshot-ci-gate.zh.md)，該車道是 Linux 拉取請求必需的只比較門禁。`node 24 / snapshots and artifacts` 消費方任務在[消費方獨立建置](../../archived/process/2026-07-30-independent-ci-consumer-build.md)中負責唯一一次 Linux 建置，安裝鎖檔案選定的 Chromium 和 WebKit，恢復以作業系統和鎖檔案為鍵的快取，並用 `DSH_SNAPSHOT=replay` 執行該車道。這是有意的平面切分：host 與 spec 使用 [tsx 原始碼啟動約定](../architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md)，瀏覽器則消費 `apps/web/dist` 和包的 `lib/client.js` 產物，因此門禁依賴 `built-package-invariants` 提供這些用戶端產物。自託管的預設分支 Linux 序列熱備執行同一門禁；不存在託管 Linux 序列生產者生成供 PR 消費的瀏覽器快取，持久化自託管池則不需要託管側快取。CI 從不錄製或重新整理預期輸出。情境仍面向 POSIX，並繼續置於 Windows 和 macOS 矩陣之外。

高基數效能診斷使用單獨按需啟用的 `apps/web/tests/**/*.perf.ts` 清單，並且只由 `vitest.web.perf.config.ts` 選中。`complex-history.perf.ts` 的隔離案例複用真實 scaffold：工作區案例播種 1,000 個緊湊工作階段以及一份包含 500 次工具呼叫的 500 輪次歷史，在 Chat 中窮盡並重新掛載該歷史，並報告 Chromium 主執行緒、DOM、監聽器、堆記憶體、分頁、搜尋和 Trajectory 測量結果。兩個續聊案例播種同一份長曆史，但比較預設的 24 輪次 Chat 視窗與展開全部 500 輪次的狀態，然後各自透過真實輸入框、agent loop、SSE wire、工具和持久化繼續進行 8 個相同輪次；其中兩輪執行真實 `bash` 呼叫並斷言其持久化結果，最後一輪則填入一條包含 8,232 個字元的混合語言提示詞，並回放 120 個帶節奏的文字增量。一個單獨的 soak 案例從空白工作階段開始，透過真實輸入框連續驅動 100 輪，每第 10 輪執行一次 `bash` 呼叫併產生結果，每 10 輪強制執行一次 GC，並報告每 10 輪的延遲視窗及保留的瀏覽器狀態。隨後它透過受信任的瀏覽器點選提交第 101 個純文字輪次，並使用瀏覽器時鐘分別測量傳送到 transcript DOM 和傳送到繪製後的延遲，排除輸入框的草稿映像，並與完整輪次完成時間分開。逐輪診斷涵蓋輸入框填入、點選到使用者訊息回顯、點選到首個分片、完成、瀏覽器變更、持久化分片和工具事件；合成回放模型擁有足夠的上下文容量，可使 fixture 基數保持穩定，而不會因壓縮（compaction）消耗腳本化呼叫。結構性斷言釘住預期的負載、流和工具形狀，但時間仍不設閾值，因為機器速度不屬於正確性約定。必需的 `vitest.web.config.ts` 清單仍僅限 `*.e2e.ts` 和 `*.snapshot.ts`，因此 `test:web:built` 及其 CI 門禁都不會收集效能案例。

## 業界先例

調研了 AI（人工智慧）聊天/agent web UI 與 mock 層（LibreChat、vercel/ai-chatbot + AI SDK、lobe-chat、open-webui、OpenHands、Chainlit、continue、cline、langfuse、gradio/streamlit；Playwright HAR/route、MSW、Polly/nock、WireMock、aimock）。自有後端的應用的主流成熟架構是：真實後端約定後放一個程序內偽造/回放模型，下游全部真實（LibreChat 的 `LIBRECHAT_TEST_RUN_HOOK` 偽模型；ai-chatbot 的 `MockLanguageModelV3` + `simulateReadableStream`；continue 的腳本化 mock 提供者類）——這正是 `dsh-llm-replay` 已然所是。瀏覽器層 SSE 攔截無法檢驗增量渲染（`route.fulfill` 一次性交付整個回應體；playwright#33564），且伺服器端 SSE 棧完全失測，因此各專案只把它用於邊緣案例。分片節奏作為 fixture 參數反覆出現（LibreChat 預設 10ms 附慢速檔；ai-chatbot 500ms）；CI 裡的真實模型會腐爛（open-webui 的套件長出 120 秒超時，先被停用後被刪除）；工作階段在持久化層以受控時間戳播種（LibreChat 直插回呼時間的 Mongo 文件；langfuse 播種其資料庫）。沒有任何被調研專案為 UI 測試把錄製的 agent 事件日誌經真實後端回放——最接近的是提供者層錄製 fixture（aimock）與前端層 socket 歷史發射（OpenHands MSW）——因此工作階段日誌即 fixture 的設計沿著本儲存庫「模型可見 ⟺ 已記錄」不變式所指的方向比業界先例多走了一步。

## 曾考慮的替代方案

**瀏覽器網路層 SSE 攔截（`page.route`）。** 已否決：`route.fulfill` 無法流式輸出，增量 token 渲染無從檢驗，且伺服器端 SSE/背壓/關閉路徑——兩起已實證 P0 的藏身處——完全失測。

**`DEEPSEEK_BASE_URL` 處的 mock HTTP 提供者。** 作為本車道機制已否決（僅保留給既有的工作區探針冒煙）：fixture 會變成手寫的 OpenAI SSE 位元組腳本，一種與儲存庫其餘部分錄制回放的工作階段日誌格式漸行漸遠的第二 fixture 格式；介面卡的真實 HTTP 路徑歸帶金鑰 e2e 管。

**保留或擴充功能 `?fixture` 用戶端。** 已否決：僅用戶端的組裝測試注入 `RemoteMock`，依賴 Host 行為的測試則執行真實 scaffold。生產 query 開關會保留第二套應用後端，而且 Client API 以下仍然按建構失測。

**用佔位 `DEEPSEEK_API_KEY` + 回放攔截替代停用介面卡行。** 儘管零組合改動且樹內有兩處先例仍被否決：它用謊言滿足 `llm-deepseek` 的快速失敗金鑰檢查，還留下一個掛載卻被攔截的死介面卡；停用行（ACP overlay 的同款做法）是誠實的無金鑰，並在最早可解析點快速失敗。

**`packages/test-support/web-snapshot` 包 + `defineWebSnapshotSuite` 工廠。** 已否決：驅動 chromium 的原始碼在無瀏覽器的覆蓋率 runner 上無法誠實保持逐檔案 100%，且除受門禁的包已匯出的輔助工具與本地 scaffold 外，這些情境專用互動尚未形成穩定的無瀏覽器約定。出現第二個 web 形態消費方，或被證實重複的生命週期程式碼確立該約定後，再重新考慮。

**單獨維護第二份規範化 Session 日誌預期輸出。** 不予採用：把選定的錄製 generation 再複製成另一個檔案會使 refresh 成本翻倍，卻不會增加獨立 oracle。語料改為將規範化持久化結果與驅動 replay 的同一份最高 generation parent fixture 比較，同時以 host 狀態和完整 workspace 斷言保留獨立的世界驗證義務。

**以 `DSH_SNAPSHOT` 回放分支拉起 `dsh web` bin。** 已否決：它需要在交付的 CLI 中增加測試專用回放分支和環境變數管道。程序內 scaffold 已載入同一份 `apps/cli/config/base.cordis.yml` 與 `apps/cli/config/web.cordis.yml`；只剩 argv、profile JSON 和 `AppCLIEntry` 膠水不在其覆蓋範圍內，而這些路徑已由無金鑰 CLI 冒煙覆蓋。

**為可測試性改 wire 協定。** 已否決：約定已有第一等的無金鑰程序內路徑（`InProcessApiClient(toFetchHandler(api))`），逐事件不合批的 SSE 恰是回放在瀏覽器中可觀測的原因，測試一條不再交付的 wire 會顛倒該層的存在意義。

**以真實模型瀏覽器測試充當無金鑰車道。** 已否決：按建構即不確定；被調研的前車之鑑（open-webui）長出無界超時後被刪除。帶金鑰的真實 host 冒煙仍是真實模型側的補充。

**在必需的瀏覽器門禁中執行高基數效能案例。** 已否決：其 fixture 設定和完整歷史渲染會增加數十秒耗時，而壁鐘時間和記憶體值隨 host 不同而變化，無法提供穩定的正確性閾值。必需車道保留確定性行為斷言；貢獻者在調查或更改大列表和長曆史渲染時執行該診斷案例。

**用戶端 `data-dsh-busy` 安定訊號。** 暫緩：host 側 `whenIdle` 屏障配合穩定 DOM 輪詢，足以覆蓋目前情境。第一次安定輪詢抖動，或必要狀態在 DOM 中不可觀察時，再重新考慮。

## 測試

`pnpm run test:web` 建置並無金鑰執行該車道；`test:web:built` 基於現有建置產物執行。`pnpm run test:web:perf` 建置並執行手動效能清單；`test:web:perf:built` 複用現有產物。`DSH_SNAPSHOT=record pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/<spec>` 對真實模型錄制一個發起提示的情境，`DSH_SNAPSHOT=refresh pnpm run test:web` 則無金鑰重寫 aria 預期輸出。CI 顯式選擇回放模式。live-interactions AUTH 情境會把不可重試的終態失敗釘為 Chat 內聯狀態，其中攜帶適合展示的訊息與錯誤碼，並驗證提供者回顯的憑證片段不會出現在 Chat 或 Trajectory 中；該情境同時覆蓋輸入框恢復與 `turn/end` 錯誤。scaffold 環境隔離情境會在全部 3 個環境 skill 根目錄中分別填入不同條目，並要求這些條目都不得進入組裝後的目錄。`dsh-llm-replay` 單元覆蓋率釘住節奏控制、取消、消費診斷、sidecar 驗證、按索引替換與唯一的追加位置。

## 暫緩

- **恢復後追問情境**：真實 wire 上的歷史/即時縫合路徑；當該程式碼變更或迴歸時作為獨立情境補充。
- **輸入框 steering 手勢**：輸入在執行期間鎖定（只能停止或等待），因此 steering 情境從頁面走 wire 做 steer；`TODO(web-steer-composer)` 待產品長出真實的輸入框手勢後，把驅動步驟升級為該手勢。
- **拖拽工作階段重排**：`workspace.insertSessionBefore` 尚無瀏覽器情境；它需要在同一個工作區裡物化兩個工作階段，併合成 HTML5 拖拽事件。當該表面變更或迴歸時再補充。無行為的工作階段 Rename/Fork/Delete 和工作區 Delete 選單行待獲得行為後再補充情境。
- **長曆史 Chat 到 Trajectory 的 Inspect**：兩個檢視共用 Session 分頁，而所選 Trajectory 記錄由一個派生的表格索引定位；隨著較早頁面前插，該索引可能移動。短歷史 Inspect 仍有覆蓋；在選中項具有穩定的語義身份之前，長曆史互動約定不包含這項交接。

## 後果

Web 表面獲得了錄製一次/永久回放的層級：真實 chromium → SSE → apiproxy → 迴圈 → 工具 → 持久化的鏈結以約 10-30 秒無金鑰執行，重複執行結果確定，fixture 由車道自身持有並可重錄。接受的成本：每次有意的工作階段 UI 變更都以一次無金鑰 `DSH_SNAPSHOT=refresh` 收尾（預期輸出變動是受評審的 diff，錨斷言保住語義綠色）；aria 格式歸 Playwright 所有——儲存庫唯一不受自己控制的提交快照格式——因此 playwright 版本升級必須是刻意的升級加重新整理提交（依賴在 `apps/web/package.json` 中浮動為 `^1.49.0`；若變動傷人則改為精確鎖定）；回放的首次呼叫順序繫結把每個情境限制為至多一個發起提示的工作階段，消費斷言是絆線；`compaction-basic` 與工作階段共享回放遊標，僅在目錄中釋出的 128k 上下文視窗下保持閒置；必需的消費方任務承擔 Chromium 與 WebKit 供給及瀏覽器車道的成本，使改動組裝後 UI 的 PR（Pull Request）持有相應的預期輸出 diff。按需啟用的效能車道保留可重複、無閾值的診斷工作負載，其測量需要人工解讀。獨立的必需[前端效能基準](2026-09-06-frontend-performance-budgets.zh.md)在隔離的基準 CI job 中執行經校準的預算；它們不向手動清單新增閾值。
