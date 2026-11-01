# Agent Note: 開啟大型 Session 的必需 CI 效能 gate

Status: implemented

[English](2026-09-04-session-open-performance-gate.md) | 中文

## 問題

Session format v2 的推出改變了兩條成本隨模型輸出增長的路徑：JSONL backend 遷移並行布 released-v0 log，Client fold 每個已結算回覆中嵌入的緊湊 stream。兩條路徑都沒有可執行的效能檢查，因此首次開啟在 127,400 事件的合成 log 上從約 35 ms 增長到約 5 s（在 575,000 chunk 的真實 log 上從約 0.3 s 增長到 26 s，峰值 RSS 2.7 GB，並在 512 MB 堆限制下耗盡堆），Client fold 也隨流式 delta 數而不是緊湊記錄數線性增長，這些退化未被察覺地進入了 master。

只測 `SessionPersistence.open()` 不能穩定表達使用者或 Host 等待的結果。工作可以在 `open()`、`SessionHandle.read()`、Session restore 與 projection 之間移動，而首次歷史頁和冷 Agent 恢復還包含這些操作之上的獨立編排。操作結束時未經 GC 的一次 `heapUsed` 取樣也不能區分仍被 Session 持有的資料與可回收的遷移臨時物件。

## 決定

Linux pull request 執行必需的 `node 24 / benchmarks` job，執行 `pnpm run check:ci:bench` → `pnpm run test:bench`。私有 `@deepseek-ai/dsh-benchmarks` workspace 擁有 benchmark 專屬依賴。該命令先建置 workspace library 和 `benchmarks/.dsh-build/` 下的專用 worker，再呼叫 `vitest.bench.config.ts`。[標準託管執行器決策](2026-09-06-standard-hosted-benchmark-runner.zh.md)擁有執行器選擇及外層 job 超時。該 job 單獨執行 benchmark lane；Vitest 逐檔案執行，只負責準備輸入、啟動測量子程序、彙總結果和執行預算斷言。每條被計時的 Node CPU 路徑都以純 Node 執行編譯後的 JavaScript，並移除 `NODE_OPTIONS` 且不載入 TypeScript runtime；workspace 裸匯入因此從 `benchmarks/node_modules` 透過 package exports 解析到建置後的 `lib/` 入口。

必需效能 gate 位於頂層 `benchmarks/`，按被測使用者路徑而非 package 歸屬組織。Host 檔案使用 `*.bench.ts`，Client 面檔案使用 `*.bench.client.ts`，情境專屬 worker 與 fixture 留在對應 benchmark 旁且不帶 benchmark 字尾。包內 `.perf.ts` 檔案仍是非門禁診斷；`scripts/` 負責編排而不承載 benchmark case。

Session benchmark 使用固定參數合成 released-v0 輸入：200 輪，每輪 500 個 text delta 與 125 個 reasoning delta，共 127,400 個邏輯事件。輸入使用 Zstandard，並固定 logical rows 的分組與 frame 拆分，使每次執行處理相同的事件、位元組與 frame 分佈。每個合成 turn 先開始 step，再追加 user surface 輸入，使 V2-to-V3 migration 能預留受保護的 system head 而不重排歷史。fixture 直接建構 released-v0 physical rows，不依賴目前 runtime 的歷史 encoder；壓縮以及所有被測讀取和 migration 入口仍使用生產程式碼。輸入在計時前寫入每個樣本獨佔的臨時目錄；benchmark 不使用錄製的 Session。

每個 Session endpoint 都針對使用者生命週期中的兩個時點執行。`first-open` 最初只有 released V0 generation，包含 migration；只讀消費者不釋出後繼檔案，可寫 Agent resume 才會釋出。測試準備階段在計時外透過同一套生產 migration 生成一次 `post-upgrade-reopen`，再把未改動的 V0 前代和已釋出的目前 generation 後繼一起複製到每個樣本目錄。Reopen 樣本使用全新程序，因此測量使用者升級完成後的磁碟再次開啟，不包含 migration 或程序內 cache。

每個 access kind 與 endpoint 的樣本都在全新、已編譯的 Node 子程序中執行。模組載入、Host 服務初始化和 fixture 準備在測量開始前完成；測量程序不執行額外的預熱解析。正常堆模式執行五個獨立樣本，報告全部樣本及最小值、中位數和最大值，並以中位數執行各存取狀態獨立的固定預算。另一個子程序使用固定 128 MB old-space 上限執行同一路徑，只判斷能否完成；低堆限制引起的額外 GC 不進入正常時間基線。

該 lane 包含三個獨立的 Session 開啟 benchmark，並保留 Client fold benchmark：

| Benchmark | 被測路徑 | 時間指標 |
|---|---|---|
| 階段剖面 | 分別為 first open 與 post-upgrade reopen 執行真實 persistence open、handle read、Session restore 與 projection | `openMs`、`readMs`、`sessionRestoreMs`、`projectionMs` 各自使用固定預算；只讀 migration 歸入 first-open `openMs`；後繼編碼、verify 與 publish 屬於可寫 Agent resume |
| 首屏歷史 | 兩種 access kind 分別經 Host Session history controller 讀取到首個分頁 snapshot | First open 與 reopen 各有一個端到端預算；均包含 source stat、讀取、Session restore、projection、分頁與 snapshot 建構，first open 還包含 migration；兩者都不包含 Gateway 網路傳輸、Client fold 或瀏覽器 paint |
| Agent resume | 對兩種 access kind 分別呼叫 `ctx.agents.resume()`，直到 Agent 建立、setup、釋出與 loop 啟動完成 | First open 與 reopen 各有一個端到端預算；兩條路徑都不與首屏歷史序列，也不依賴它留下的 cache |
| Client fold | 大小兩個 v2 history window 經真實 `ConversationNodeAssembler` 與全部 Chat Definition fold | 大視窗的絕對時間與相對小視窗的縮放比各自使用固定預算 |

階段剖面顯式呼叫各層正式入口，不複製 decode、migration、restore 或 projection 演算法。首屏歷史和 Agent resume 分別以新的 first-open 與 reopen 根目錄執行真實上層入口，因此元件資料不冒充端到端結果，一個情境也不會給另一個情境預熱程序或 Session cache。四階段之和僅用於解釋成本；首屏與 Agent resume 的端到端時間各自由外層時鐘直接測量。

正常堆模式在 Host 初始化完成且 Session 尚未存取時執行固定的兩輪顯式 GC，記錄起點記憶體；操作計時結束後，在該情境要求的長期物件仍明確可達時再次執行同樣的 GC，再記錄終點記憶體。Agent resume 情境在終點保留 Agent、Session、完整 events 與正常服務 cache，它的 `heapUsed` 增量是常駐 Session 記憶體預算的主指標。每個情境同時報告 `external`、`arrayBuffers`、GC 後 RSS 和 `process.resourceUsage().maxRSS`；128 MB 模式繼續防止瞬時分配峰值被終點 GC 隱藏。顯式 GC 時間不計入操作時間。

一個不計時的小型 fixture 前置案例驗證目前 migration、訊息保留、V0 位元組不變及後繼再次開啟。Worker 失敗時保留 stderr 首尾各十行或致命堆錯誤，使準備階段拒絕與預算超限可區分。計時效能案例不重複功能測試的內容斷言，只要求目標呼叫完成併到達對應的可觀察終點。Client fold benchmark 繼續使用真實 `ConversationNodeAssembler` 與全部 Chat Definition，要求大視窗的絕對時間和相對小視窗的縮放比均低於固定預算。

預算按各測量終點分別校準。兩次 Node 24.19 x64 CI 執行的中位數最大相差 5.2%；其 CPU 密集型壁鐘時間是 Node 24.18 arm64 參考執行的 1.95–2.06 倍。除目前 generation `open` 和 first-open Agent resume 外，原始碼常數記錄參考機器上的預期耗時；`ciTimeBudget()` 將其乘以實測的 2 倍 CI 時間係數和 1.25 倍波動餘量。目前 generation `open` 使用標準執行器直接測得的 50 ms 預期值，僅乘以 1.25 倍餘量，向上取整得到 63 ms 預算。First-open Agent resume 使用經審查的 562 ms 託管上限。GC 後增量堆與 Client fold 縮放預算不屬於壁鐘時間，因此只使用 1.25 倍餘量。128 MB 完成性檢查仍是獨立的瞬時分配限制。由此得到的 first-open 時間上限、受限堆檢查與 Client fold 上限都會拒絕已知退化。參考固定為 PR #3533 的合併結果，只用於校準和評審預算；CI 不 checkout 或執行歷史儲存庫。預算是原始碼中的受評審常數，不由環境變數覆蓋。

## 校準證據

比較按使用者生命週期正交，而不是按產物表示正交。兩種實作的 first open 都接收完全相同的固定 V0 位元組。Reopen 時，每種實作都在全新程序中讀取自己認定的目前格式：棧前參考版本仍讀取 V0，V2 實作則讀取它已釋出的 V2 後繼。這裡有意比較同一使用者後續開啟的體驗，而不是讓兩個 codec 處理同一種資料結構。

同一臺 Node 24 參考機器上的五次樣本中位數構成正反例：

| Access kind | 實作 | 四階段總時間 | 首屏歷史 | Agent resume | Agent GC 後增量堆 | 128 MB old space |
|---|---|---:|---:|---:|---:|---|
| First open | 棧前參考版本 | 249.0 ms | 253.8 ms | 100.7 ms | 26.1 MB | 完成 |
| First open | 重複 snapshot 退化實作 | 4,197.5 ms | 4,284.8 ms | 4,197.9 ms | 4.4 MB | 堆耗盡 |
| Post-upgrade reopen | 棧前參考版本 | 251.1 ms | 253.8 ms | 100.7 ms | 26.1 MB | 完成 |
| Post-upgrade reopen | 重複 snapshot 退化實作 | 49.2 ms | 50.4 ms | 43.8 ms | 4.5 MB | 完成 |

棧前實作以 V0 作為目前格式，因此 first open 不改變磁碟表示；它的原生 V0 首屏歷史與 Agent resume 測量同時適用於兩個生命週期行。

PR #3640 的標準雙 CPU 執行 (run 34023970384, job 101461539961)使用 Node 24.20.0 x64 和 Ubuntu 映像 `20260831.293.1`。目前 generation `open` 的五次樣本為 49.2、47.4、49.1、48.6 和 48.1 ms：中位數 48.6 ms，最大值 49.2 ms。取整後的 50 ms CI 預期值給出 63 ms 上限，不重複乘以 2 倍機器係數。日誌標明兩個可用 CPU，但未記錄型號；它無法區分硬體變化與 Node 版本變化的影響。這是端點專屬的執行器校準，不是應用最佳化或參考機器新測量的證據。其他每項 benchmark 均透過既有預算。確定性正反例在歷史 30 ms 上限下拒絕實測中位數，在 63 ms 下接受它，拒絕合成的 75 ms reopen 中位數，並以未改變的 550 ms 上限拒絕合成的 4,000 ms 首次開啟耗時。這些正反例驗證預算執行，不代表測得新的退化。

一次冷 verifier 打包調整移除了執行時 workspace 模組載入，未改變這些預算或測量終點。在 macOS arm64、Node 24.18.0 上，verifier 打包前對同一份 127,400-event fixture 的首次 writable resume 耗時為 164.2、162.4、159.7、149.3、167.7 ms（中位數 162.4 ms）。透過 workspace build 打包 verifier 後為 119.8、120.9、121.9、122.3、121.8 ms（中位數 121.8 ms，降低 25%）。Retained heap 保持 5.4 MB；peak RSS 中位數從 144.9 變為 143.7 MB。Reopen 中位數為 27.5 和 27.1 ms，包含 128 MB completion check 的全部 16 項 Session 案例透過。CPU profile 將舊 verifier 的部分成本歸因於模組解析和編譯。隔離 package 的 built-worker 測試在舊 worker 上因無法解析 workspace import 而失敗，在打包後的 worker 上透過，同時驗證錯誤的 event count 會被拒絕。這些本地結果不能證明 Linux runner 耗時；這些案例使用 450 ms CI 上限。

託管執行 (run 34265057987, job 102192211510)包含已打包的 verifier，first-open Agent-resume 樣本為 454.2、454.8、455.4、457.8 和 459.8 ms：中位數 455.4 ms，超過 450 ms。程式碼等價的前一次執行 (run 34263062688, job 102185561214)報告 436.2 ms 中位數；兩個 head 之間只有請求歷史雙語 README 及其配對記錄不同。經審查的上限為 562 ms，即 `floor(450 × 1.25)`，增加 24.89%，比觀測到的 455.4 ms 中位數高 23.4%。五次新程序 M4 Pro / Node 24.19 樣本範圍為 150.07–158.22 ms，中位數為 152.57 ms。一次有界的主執行緒 profile 未發現明顯的小型最佳化；它不包含 verifier 執行緒 CPU，也不能證明託管耗時變化的原因。對照在 450 ms 下拒絕已記錄中位數，在 562 ms 下接受該值，並拒絕 600 ms。Verifier 打包最佳化、工作負載、其他時間預算、共享縮放和記憶體限制均保持不變。

校準後的原始碼預算如下：

| 測量項 | 參考機預期 | CI 預算 |
|---|---:|---:|
| First-open `open` | 220 ms | 550 ms |
| 目前 generation `open` | 12 ms（歷史參考值；CI 預期值：50 ms） | 63 ms |
| 完整 read | 8 ms | 20 ms |
| Session restore | 24 ms | 60 ms |
| Projection | 14 ms | 35 ms |
| First-open 首屏歷史 | 220 ms | 550 ms |
| 目前 generation 首屏歷史 | 48 ms | 120 ms |
| First-open Agent resume | 180 ms（歷史參考） | 562 ms |
| 目前 generation Agent resume | 40 ms | 100 ms |
| Agent GC 後增量堆 | 26.1 MB | 33 MB |
| Client fold 絕對時間 | 16 ms | 40 ms |
| Client fold delta 縮放比 | 2.5× | 3.125× |
| 受限 old space | — | 128 MB |

### 按索引遍歷持久化 JSON 陣列

JSONL backend 在 memo 化前凍結解碼後的 event graph。原生 decoder 與固定 migration catalog 產出無環 JSON graph，其中陣列只包含索引值。按數字索引遍歷陣列仍會凍結每個巢狀物件和陣列，同時避免列舉 compact stream 中 125,000 個文字條目和 124,600 個時間差值的字串鍵。物件遍歷繼續保留自有的 `__proto__` 和 `constructor` 資料。Admission、關係驗證、解碼與凍結都仍在被測 open 終點前完成；淺層 `Object.isFrozen()` 結果不會跳過後代遍歷。

在 Apple M4 Pro、Node 24.19.0 上，僅覆蓋 open 的 CPU profile 將約 4.2 ms 歸因於完整 event 凍結。獨立的全新程序 V4 執行得到以下結果；末列恢復並重新建置完全相同的原始遍歷，作為負對照：

| Reopen 測量項 | 原始遍歷 | 索引遍歷 | 恢復原始遍歷 |
|---|---|---|---|
| `open` 樣本（ms） | 22.2, 22.4, 22.8, 22.6, 22.9 | 17.7, 18.4, 17.4, 17.8, 17.6 | 21.7, 22.4, 22.2, 21.7, 21.6 |
| `open` 中位數（ms） | 22.6 | 17.7 | 21.7 |
| 首屏歷史中位數（ms） | 35.0 | 30.6 | 33.6 |
| Agent resume 中位數（ms） | 30.5 | 26.8 | 29.8 |
| Agent 保留堆（MB） | 4.5 | 4.5 | 4.5 |

每次執行的全部 17 個 Session 案例均透過，包括 128 MB 完成性檢查。原始實作在本機仍低於 63 ms；恢復原始遍歷展示了被移除的成本，而託管 benchmark 仍負責給出必須滿足的預算結果。工作負載、時間上限、記憶體上限、冷程序準備與測量終點保持不變。JSONL owner 測試覆蓋歷史 V3 和目前讀取中的巢狀不透明 JSON、修改拒絕及不可變 event 共享。這些測量確認了 reopen 改善，但沒有確認一致的 first-open 改善或託管執行器耗時。

## 考慮過的替代方案

**每次 CI checkout 歷史提交併做相對比較。** 拒絕：歷史 checkout 需要獨立安裝，舊版與目前版還可能把工作放在不同 API 階段，增加時間、依賴和介面漂移。固定 workload 與經正反例校準的靜態預算更容易復現和評審。

**只測從 V0 first open。** 拒絕：migration 是一次性升級成本，不能防止進入穩定目前 generation 後的後續開啟發生退化。兩種 access kind 需要獨立的測量與預算。

**只測四個元件階段。** 拒絕：元件測量便於定位，但會遺漏 source stat、編排、分頁和 snapshot 建構，也不能證明首屏路徑整體仍然可用且足夠快。

**只測首屏或 Agent resume 總時間。** 拒絕：端到端數字能保護結果，卻不能指出退化來自儲存、讀取、Session restore 還是 projection；四階段預算保留可操作的歸因。

**在生產實作內部新增細粒度計時樁。** 拒絕：這些樁會擴大生產介面並讓 benchmark 與實作細節耦合。測試只使用既有服務和物件邊界；無法由這些邊界解釋的成本保留在端到端結果中。

**從 TypeScript 原始碼執行被測 worker。** 拒絕：原始碼 loader 會改變模組解析與啟動行為，並使巢狀 worker 選擇僅適用於原始碼的啟動路徑。Vitest 仍可作為不計時的編排層；每個被計時的 worker 都像純 Node 消費方一樣執行建置產物。

**只用時間預算或只看 GC 後記憶體。** 拒絕：時間無法發現記憶體退化，終點存活記憶體也看不到遷移期間的瞬時爆發。正常堆的 GC 後增量與受限堆的完成性分別覆蓋兩類風險。

**用真實錄制語料做 benchmark。** 拒絕：語料 fixture 按策略保持小體量，錄製材料不得成為 benchmark 輸入，且其重新錄製會靜默移動 workload。

**把 benchmark 放進現有 gate 聚合中執行。** 拒絕：聚合在一個 runner 上並行執行各 gate，壁鐘測量會繼承鄰居的 CPU 負載。

**把每個跨包 gate 放在一個參與的產品 package 下。** 拒絕：Session 開啟跨越 persistence、migration、projection、Host history 與 Agent resume；任選一個參與方都會形成誤導性的歸屬和僅為 benchmark 增加的 package 依賴。儲存庫級目錄擁有整合使用者路徑，包內診斷仍留在對應實作旁。

**把 benchmark case 放在 `scripts/` 下。** 拒絕：scripts 擁有命令、生成器與編排，而 benchmark case 擁有帶型別的測試檔案、worker、fixture、預算和生命週期清理。未來的報告或校準命令可以消費 `benchmarks/`，不需要把 case 移入其中。

## 後果

每個 pull request 多付出一個必需 Linux job；該 job 的 Session 部分執行多個短生命週期子程序，以換取冷 cache、獨立 V8 heap、明確 GC 狀態和可歸因的失敗。儲存庫級 benchmark 目錄接受有意的跨包測試依賴，而不修改產品 package manifest。固定 Zstandard workload 同時覆蓋事件規模與 frame 拓撲；first-open 測量保護一次性升級體驗，reopen 測量防止後續開啟退化，四階段預算定位成本歸屬，首屏預算保護使用者可見等待，Agent resume 預算與 GC 後增量保護完整冷恢復及常駐記憶體，128 MB 模式保護瞬時分配上限。

Session 與 Node-fold 情境不測量網路傳輸、瀏覽器渲染或真實錄制 Session，也不是持續效能趨勢系統。[前端效能預算](2026-09-06-frontend-performance-budgets.zh.md)擁有瀏覽器工作流測量。Node 或 runner 變化需要用同一 workload 重新取樣並評審預算；修改業務實作時不得順帶放寬預算而不提供新的正反例資料。
