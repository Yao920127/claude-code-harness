# Agent Note: Claude Code 與 Codex subagent 後端

Status: implemented

[English](2026-08-04-claude-code-and-codex-subagent-backends.md) | 中文

## 問題

命名的 [`ctx.subagents`](2026-06-21-subagent-capability-seam.zh.md) 註冊表讓父 agent（智慧代理）無需瞭解子 agent 的執行方式即可委派工作，但 harness 需要通往真實 Codex 與 Claude Code 產品的第一方路徑。每條路徑都必須向產品交付一項自包含任務，讓它在父工作階段的工作區中執行，返回最終回答或明確的失敗或取消結果，並且不留下任何受管的產品程序。

產品整合不得成為任務文字、cwd、取消、結果結算或程序樹的第二責任方。因此，所需證據要區分三個事實：無金鑰真實產品測試證明官方整合、原生身份驗證形態、確定性答案與資源清理；Loader 組合測試證明公開包和文件所示的工具設定無需啟動產品即可載入；帶金鑰 e2e 證明生產提供者與真實產品能夠從真實 DeepSeek 服務取得唯一答案。直接發起模型 HTTP 請求或使用產品替身無法取代上述任一產品執行層級；手工掛載外掛無法取代 Loader 層級。

## 決策

harness 交付兩個同級的一次性提供者包，其預設註冊名稱分別為 `codex` 與 `claude-code`。本說明負責它們的產品協定、結果對映和程序生命週期；[命名實例決策](../../archived/feature/2026-08-18-product-subagent-named-instances.md)負責 Profile 選擇的提供者身份、可選實例模型與靜態工具繫結；[生產安裝排除決策](../../archived/simplification/2026-08-12-production-dsh-excludes-product-subagent-providers.md)負責各自獨立的可選 Bundle 與 host plane（主機平面）放置；[tool-subagent README](../../../../packages/subagent/tool-subagent/README.zh.md) 負責模型可見的排程選擇；[非互動權限決策](2026-08-15-product-subagent-noninteractive-permissions.zh.md)負責各產品提供者的 Profile 模式選擇與安全權限決定；[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責粗粒度產品行動類別。兩個包都接受多個命名實例。載入任一提供者都不會啟動產品程序，而且每個工具只接受獨立文字任務；產品與實例選擇仍屬於部署設定。

這兩個提供者都報告 `inheritsParentContext: false`，不宣告任何可選的啟動能力，並傳遞父工作階段 cwd，但不會複製父級對話。文件所示的工具使用 `backgroundMode: 'one-shot'` 與 `maxDepth: 'provider-managed'`：消費方預設在前臺收集結果，也可把同一次執行放入通用 Job 執行時，而遞迴策略仍由程序外產品負責。每次呼叫都會建立一個全新的產品程序和一次不可續接的產品對話。`ctx.subagents` 負責具名請求解析與成對生命週期事件；`dsh-tool-subagent` 負責模型可見的排程以及前臺與 Job 適應；`ctx.jobs` 和 `dsh-tool-jobs` 負責 Job id、狀態、輸出、控制、通知與父級 owner 取消；各產品提供者負責原生結果對映，`dsh-subprocess` 則負責憑證清洗、程序樹終止以及整棵程序樹的退出觀測。

```text
configured tool -> dsh-tool-subagent -> ctx.subagents -> product provider -> product process
  foreground <- final product outcome
  background -> ctx.jobs / dsh-tool-jobs -> Job id / state / notice / controls
  both -> provider disposal -> dsh-subprocess -> whole-tree exit
```

### 歸屬與生命週期

| 層級 | 責任方 | 職責 | 可觀察結果 |
| --- | --- | --- | --- |
| 委派生命週期 | `ctx.subagents` | 解析具名提供者請求，併為已釋出的 `SubagentRun` 配對生命週期事件 | 不受支援的上下文或格式錯誤的輸入會在釋出執行前報錯；啟動與終態事件保持成對 |
| 排程與適應 | `dsh-tool-subagent` | 解釋 `run_in_background`，選擇前臺收集或 one-shot Job 登記，並對映共享停止原因 | 前臺返回產品結果；後臺在登記完成後返回 Job id |
| Job 狀態與控制 | `ctx.jobs` 與 `dsh-tool-jobs` | 負責 Job 狀態、輸出、取消、owner 清理、完成通知與面向模型的控制工具 | 準確父級可以收集、列出或停止後臺工作，並收到完成通知 |
| 原生執行與清理 | 產品提供者與 `dsh-subprocess` | 產生一個原生結果、關閉產品協定、請求盡力而為的原生取消，並證明程序樹退出 | 前臺返回與 Job 結算都會等待冪等資源釋放和整棵程序樹退出 |

## Codex 提供者

`@deepseek-ai/dsh-subagent-codex` 註冊由 Profile 選擇、預設值為 `codex` 的提供者名稱，解析鎖定的 `@openai/codex@0.153.4` 包所宣告的 `codex` bin，並使用目前 Node 可執行檔案加 `app-server --stdio` 啟動該 wrapper。Wrapper 會選擇私有原生平臺載荷；提供者既不解析也不退回主機 `codex`。其公開設定包含非空的 `providerName`、可選的非空 `model`、顯式的 `env` 覆蓋項、須為正有限值且不得大於儲存庫共享 `MAX_TIMER_DELAY_MS` 的 `disposeGraceMs`，以及預設使用 `never` 的三值原生 `permissionMode`。每個命名實例會為自己的執行保留這些已解析值。顯式模型會原樣傳給每個臨時 `thread/start`；省略時仍以 Codex 原生設定為權威。安裝、登入、`CODEX_HOME`、模型發現或 fallback、基礎 URL 和產品工作階段設定仍由 Codex 原生機制或部署環境負責；所選模式只擁有非互動權限決策中描述的執行緒 approval／reviewer／sandbox 欄位。

釋出前，提供者會驗證非空的純文字任務，在父級工作區中啟動受管的 app-server，完成 `initialize` → `initialized` 握手，把可選模型與已解析模式對映為官方 `thread/start` 欄位，並建立一個 `ephemeral: true` 執行緒。固定 app-server argv 不包含模型、模式或任務文字。已釋出的執行只擁有一次 `turn/start`；其執行緒 ID 與輪次 ID 保持私有，絕不會持久化到父工作階段。

`turn/completed` 是權威的遠端終止事實。以最後一條帶有 `phase: "final_answer"` 的 `agentMessage` 為準，且選中的訊息必須包含非空白文字。若產品沒有發出明確的最終階段，則以最後一條 `phase: null` 的訊息作為相容性退回，該訊息也必須包含非空白文字；過程說明絕不會取代上述任一答案。[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責 Codex 行動類別、HTTP status、生命週期階段、程序結果與終止原因保持。本地取消仍是 `aborted` 且不附帶失敗診斷。

對於命令與檔案審批，無人值守的協定連線會從請求給出的決策選項中選擇一項不予批准的決策，並優先選擇 `cancel`；若請求沒有決策選項列表，則退回到 `decline`。它不授予該輪次請求的任何權限，不向使用者輸入請求提供任何答案，並拒絕 MCP elicitation。它會記錄這些請求、被拒絕的命令／檔案 item 與結構化 `sandboxError` 終態的安全類別。產品 stderr 會原樣轉發給 Host，但既不會被分類，也不會複製進診斷。若請求在無人值守模式下沒有合法回應，或是未知伺服器請求，此次執行就會失敗，而不會等待本提供者沒有提供的使用者介面。

若啟動在釋出前失敗，提供者會關閉協定連線、終止已取得的程序樹、等待其退出、移除 stderr observer，然後用固定操作階段拒絕 `start()`。對已釋出的執行執行資源釋放時，提供者會盡力中斷已知輪次、關閉協定連線、結束標準輸入、呼叫共享的逐級終止機制，等待整棵程序樹退出，並移除 observer。獨立清理失敗會報告 `teardown`；啟動與復原同時失敗時，聚合的頂層訊息會保留兩條安全階段說明，而底層 cause 仍只在內部可見。

Codex 0.153.4 使用 Responses 協定，而 DeepSeek 的公開 OpenAI 相容端點使用 Chat Completions。因此，帶金鑰 Codex e2e 會採用一個僅限迴環、僅供測試內部使用的橋接層來處理一次不使用工具的隨機數請求：真實 Codex 將 Responses 傳送到橋接層，橋接層把收到的 Bearer 憑證與提取出的任務轉發到固定的 DeepSeek 官方端點，再將真實文字包裝進最小化的 Responses SSE（Server-Sent Events）生命週期。該橋接層既不是生產代理，也不能作為 Codex 原生連線 DeepSeek Chat Completions 的證據。

## Claude Code 提供者

`@deepseek-ai/dsh-subagent-claude-code` 註冊由 Profile 選擇、預設值為 `claude-code` 的提供者名稱，並呼叫 `@anthropic-ai/claude-agent-sdk@0.3.263`。提供者會省略 `pathToClaudeCodeExecutable`，因此 SDK 會從自己的 optional dependency 閉包中，按作業系統、CPU 與 Linux libc 選擇攜帶 Claude Code 2.1.263 的匹配平臺包。提供者既不會解析也不會退回主機 `claude`；省略 optional dependency、不受支援的平臺，以及缺失或損壞的平臺載荷，都會在第一次委派的 SDK 啟動邊界失敗。提供者使用官方 `query()` 入口點，並把 SDK 的 `spawnClaudeCodeProcess` 給出的原生 `claude` 或 `claude.exe` 命令、參數、cwd、環境和轉發的訊號交給 `dsh-subprocess`；其私有 `SpawnedProcess` 介面卡只公開 SDK 所需的流、事件、終止和退出事實。

公開設定包含非空的 `providerName`、可選的非空 `model`、顯式的 `env` 覆蓋項、須為正有限值且不得大於儲存庫共享 `MAX_TIMER_DELAY_MS` 的 `disposeGraceMs`，以及預設使用 `dontAsk` 的五值原生 `permissionMode`。每個命名實例會為自己的執行保留這些已解析值。顯式模型會原樣傳入 `Options.model`；省略時不設定該欄位，由原生設定選擇模型。每次執行都會建立自己的 `AbortController`，設定 `persistSession: false`、停用 `AskUserQuestion`，並把已解析模式傳給 SDK；只有 `bypassPermissions` 會取得 SDK 的顯式危險確認。提供者故意省略 `settingSources`，因此 SDK 會相對於父工作階段 cwd 讀取主機常規的使用者、專案和本地 Claude 設定。它既不複製也不過濾這些設定，也不會建立或修改登入狀態。其餘權限提示會被拒絕，MCP elicitation 會被拒絕，阻塞對話會快速失敗，而不會等待本提供者不負責的使用者介面。

只有在 SDK `Query` 與受管的活動 CLI 控制代碼都已存在後，提供者才會發布執行。它會消費完整的 SDK 流；只有 `result` 訊息具有 `subtype: "success"`、`is_error: false` 和非空白 `result`，且迭代器隨後正常結束時，執行才會完成。[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責所有非成功行動類別、階段、程序結果，以及它們與參與失敗的權限決定之間的順序。本地取消會勝出併成為 `aborted`，且不附帶這兩類診斷事實。

啟動復原和已釋出執行的資源釋放都會關閉 SDK query、中止該次執行的控制器、呼叫共享的程序樹終止機制，並等待整棵程序樹退出。`Query.close()` 表達優雅的協定關閉意圖，但不能取代子程序責任方的退出證明。未釋出失敗只公開固定的 `query-start` 事實；已釋出程序失敗可以分別公開結束代碼與訊號；獨立清理拒絕則公開 `teardown`。原始 SDK、Host 與清理錯誤只保留在內部 cause 鏈和日誌中，不進入診斷。

帶金鑰 Claude Code e2e 直接使用官方 DeepSeek Claude Code 約定：僅在執行時提供的 DeepSeek 金鑰會對映為 `ANTHROPIC_AUTH_TOKEN`，固定的官方基礎 URL 會追加 `/anthropic`，主模型與 subagent 模型變數會選擇文件所示的 DeepSeek 模型。該測試會啟動生產提供者與真實 SDK 和 CLI，要求一個隨機數作為完整答案，不會把任何憑證持久化到設定中，並等待所有受管控制代碼退出。

## 分發與證據

每個產品都負責覆蓋所有分支的包測試、一項必跑的無金鑰真實產品測試、一項 Loader 組合 e2e 和一項帶金鑰 DeepSeek e2e。無金鑰產品層級使用被測的確切官方發行版、非空的偽產品金鑰、隔離的臨時工作區與產品主目錄，以及能返回固定答案的迴環模型。產品請求缺失、身份驗證錯誤、任務文字被改動、答案不完全一致、真實產品被跳過或受管控制代碼仍存活，都會使這項必跑測試失敗。Codex Loader fixture 會公開兩個命名 Codex 實例與工具；Claude Code Loader fixture 會公開預設 Codex 工具以及兩個命名 Claude Code 實例與工具。兩個 fixture 都包含通用 Job 控制工具，而且不會啟動任何產品程序。帶金鑰層級會使用僅在執行時提供的金鑰啟動同一生產提供者與真實產品，要求從固定的 DeepSeek 官方服務取得唯一隨機數，並再次證明完全停穩；僅當本地操作者未提供金鑰時才會自行跳過，而受信任的 CI 會預檢該 secret。

Codex 證據會鎖定 `@openai/codex@0.153.4`、`codex-cli 0.153.4` 與六個平臺 alias。生成 schema 會證明可選的 `ThreadStartParams.model`；真實產品測試會觀測省略模型繼承、兩個顯式實例模型、包內 wrapper argv、確切的 Bearer 金鑰、原始任務、逐位元組完全一致的最終回答、原生權限模式、測試擁有臨時儲存中的顯式危險繞過寫入，以及 wrapper／原生整棵程序樹退出。獨立 wrapper fixture 會證明載荷缺失時不退回主機命令，命名實例會保留彼此獨立的模型、環境與模式，生產環境也不會從 `PATH` 解析主機 `codex`。[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責失敗、程序結果與最終呈現證據。

帶金鑰 Codex e2e 會註冊生產提供者，啟動同樣的真實 app-server，並透過上述測試專用橋接層請求一個隨機數。該測試固定外部端點與模型，不儲存任何憑證或請求載荷，要求上游恰好完成一次回應，將去除首尾空白後的產品答案與該隨機數逐位元組比較，並等待所有受管控制代碼退出。

Claude Code 證據會鎖定 Agent SDK 0.3.263、Claude Code 2.1.263 與八個 SDK 平臺包。真實產品測試會讓 SDK 選擇已安裝載荷，斷言共享子程序 argv 以該包的原生 CLI 開頭，並觀測省略模型繼承、兩個顯式實例模型、確切的 `x-api-key`、原始任務、逐位元組完全一致的最終回答、原生權限模式、測試擁有範圍內的拒絕寫入與 bypass 寫入，以及整棵程序樹退出。包測試還會證明生產執行從不解析主機 `PATH`、省略可執行檔案覆蓋，並直接轉發 SDK 所選的 Windows `claude.exe` 而不經過 batch shim。這項證據證明鎖定的官方 SDK/CLI 整合，而不證明與獨立安裝的 Claude 版本相容；[最小診斷決策](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md)負責失敗與程序結果證據。Loader 覆蓋會透過各自的可選 Bundle patch 解析兩個產品，且不會啟動任一產品。

帶金鑰 Claude Code e2e 僅在提供者的記憶體環境中對映金鑰與固定的官方端點，把模型變數設為文件所示的 `deepseek-v4-pro[1m]` 與 `deepseek-v4-flash`，並實際經過生產提供者、官方 SDK 與真實 CLI。它將去除首尾空白後的結果與一個隨機數比較，並證明整棵程序樹退出，且測試不會直接呼叫 Messages API。

專案所有者的分發授權範圍限定為官方 `@anthropic-ai/claude-agent-sdk` 身份，以及每個 SDK 版本透過 `optionalDependencies` 宣告的官方 Claude Code CLI 與平臺載荷。[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 會推導並披露目前載荷集合，但不會將其宣告條款重新歸類為寬鬆條款。版本、許可證欄位和載荷集合發生變化時，仍須經過常規的依賴、鎖檔案、相容性、條款和宣告評審；無關的非寬鬆執行時包繼續以預設拒絕方式失敗。

## 曾考慮的替代方案

**直接模型 HTTP、`codex exec` 或手寫的 Claude CLI 協定。** 這些路徑會繞過產品的官方可擴充功能整合介面，無法證明原生設定、工具、審批、結果語義或資源清理。每個提供者都改用相應的官方產品整合。

**共享產品程序輔助包。** 現有 subagent 與子程序 seam 已負責圍繞任務、結果、環境和程序樹的全部共享職責。新輔助包無法刪除任一私有產品介面卡，只會造成責任重複，因此每個介面卡都會直接呼叫現有 seam。

**面向模型的產品選擇器。** 產品可用性、實例設定和身份驗證屬於部署事實。由 Profile 繫結的工具使各自的 schema 與提供者繫結保持明確，也避免在通用服務中新增動態選擇狀態。

**以產品替身作為強制證據。** 替身可以窮盡覆蓋私有協定分支，但無法證明包匯出、官方發行版、身份驗證或真實程序行為。強制證據會驅動每個官方產品連線回環模型 fixture。

**由外掛管理登入、產品主目錄、模型發現或 fallback、設定、沙箱規則或細粒度權限策略。** 這些選擇會在每個產品的原生設定之外建立另一套權威來源，並將一次性提供者擴張為帳戶管理功能。官方產品支援時，提供者可以傳入一個不透明的 Profile 模型覆蓋，但不會發現、驗證、解釋別名或在模型間 fallback。任一提供者都不會映像產品規則或增加人工互動通道。

**續接、進度、產品原生後臺狀態和共享父級上下文。** 提供者載荷仍是一項自包含任務的一個最終回答。通用 Job 層可以額外提供 id、狀態、通知、收集與取消結果，但產品工作階段、恢復、後續互動、中間訊息、父級 transcript（文字記錄）傳遞、結構化輸出和提供者專屬後臺狀態都需要獨立的使用者約定，目前實作不會預先建置這些功能。

## 後果

使用者透過由 Profile 設定、並由官方產品整合支援的一次性工具進行委派。顯式 Profile 安裝與 host plane 提供者放置由[生產安裝排除決策](../../archived/simplification/2026-08-12-production-dsh-excludes-product-subagent-providers.md)負責；命名實例身份與工具繫結由[命名實例決策](../../archived/feature/2026-08-18-product-subagent-named-instances.md)負責；按 Preset 暴露工具以及預設前臺且可選通用 Job 的排程方式由 [tool-subagent README](../../../../packages/subagent/tool-subagent/README.zh.md) 負責。本說明規定的提供者生命週期會保留原生設定與行為，而共享服務繼續獨佔作業結算與程序樹完全停穩的責任。

每次委派都要承擔新建產品程序和獨立模型上下文的開銷。成功的產品載荷仍只有最終 assistant 文字；失敗的產品執行可以另行公開共享安全診斷，其中包含由提供者擁有的權限事實與安全產品失敗類別。後臺排程還會額外公開通用 Job id、狀態、完成通知以及收集或取消結果。兩個產品都使用 Bundle 鎖定的平臺 CLI，並保留原生帳戶與工作區設定以及所選提供者權限模式；受支援的可選實例模型只覆蓋該次執行的原生模型選擇。帶金鑰 e2e 執行還會消耗外部 API 配額，並依賴 DeepSeek 官方端點；對協定、失敗、取消與審批的確定性覆蓋仍由無金鑰層級承擔。提供者不會恢復工作階段、以流式方式傳送進度、接受新的人工互動、復原工具或檔案副作用，也不會施加按實際經過時間觸發的超時。

相容性由包級單元測試覆蓋率、無金鑰真實產品迴環測試、帶金鑰 DeepSeek 隨機數測試、公開 Loader 組合、已建置包與 NodeNext 消費方檢查、生成的文件與宣告以及儲存庫 CI 矩陣共同鎖定。更改受支援的產品基線或 DeepSeek 端點／模型基線時必須重新整理這些事實；生產環境不會另行執行執行時版本探測。
