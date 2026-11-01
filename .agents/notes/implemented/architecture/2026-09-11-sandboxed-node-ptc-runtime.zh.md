# Agent Note: PTC 的沙箱 Node 執行

Status: implemented

[English](2026-09-11-sandboxed-node-ptc-runtime.md) | 中文

## 問題

Node worker 隔離 JavaScript 狀態，但不應用呼叫 Session 的 OS 沙箱策略。模型程式碼可以直接匯入檔案系統與子程序 API，繞過工具策略路徑，即使巢狀 `tools.*` 呼叫受到正確檢查。終止 worker 也不能證明其子程序已停止。

[PTC 基礎](../feature/2026-06-15-ptc.zh.md)繼續負責註冊表呈現、生成繫結、分派日誌和一次性結算。本決策取代其中基於 worker 的執行、信任與預算實作，同時保留消費方規則。

## 決策

`dsh-ptc-runtime-node` 在一個全新 Node 程序中執行每個程式。Host 解析執行選擇，透過與 Bash 相同的 `ctx.sandbox` 提供者約束啟動，並將程序生命週期交給 `ctx.subprocess`。子程序以直接 Node API、空模型環境和 Host 提供的非同步繫結求值可擦除 TypeScript。本提供者不保留 worker 或持久核心。

Host 在子程序啟動時保留 `ELECTRON_RUN_AS_NODE`；bootstrap 在求值前將其從原生環境中刪除，模型可見的 `process.env` 仍為空。巢狀啟動 Electron 需要自行顯式選擇 Node 模式。桌面端使用 Electron 作為 Node 可執行檔案；刪除此選擇變數會啟動 Electron 應用路徑，而不是 PTC bootstrap。更改沙箱權限無法修復這一啟動模式不匹配。macOS 桌面端迴歸測試使用真實 Electron 驗證繫結寫入、直接工作區寫入以及受限策略對工作區外寫入的拒絕。該測試需要已安裝的 Electron 二進位制檔案；普通執行時測試無需此依賴即可覆蓋環境過濾。

### 已解析輸入與策略

`PtcRuntime.resolve(request)` 驗證支援的選項並補全 `PtcRunSpec`；`run(spec)` 不引入預設值。PTC 傳入呼叫 Session 的 cwd 與已解析常設策略。直接執行時呼叫方透過同一解析器取得部署預設值。檔案系統與子程序提供者共享一個執行世界，bootstrap 路徑透過檔案系統的顯式主機檔案對映或設定的預安裝 bootstrap 傳遞。

檔案模式、觀察到的拒絕與強制完整性透過 `PtcRunResult.sandbox` 獨立於程式結果傳遞。所需沙箱後端無法啟動時，受限執行失敗。完整存取是顯式策略模式。程式成功不證明完整強制能力，`process` 描述符與額外控制管道也不宣告多租戶隔離。

私有 Python 提供者保留現有執行實作與設定的經過時間截止。其解析器接受 cwd，但拒絕顯式檔案策略或單次 timeout 覆蓋；能力描述符不會靜默授予不受支援的保護。

### 控制與生命週期

子程序所有者提供專用的繼承式二進位制控制通道，與程式 stdout/stderr 及 launcher 生命週期 IPC 分開。Host 限制幀、排隊寫入、待處理呼叫和未完成參數位元組，然後在分派前驗證呼叫身份與繫結允許列表。模型程式碼可以寫入該通道，因此其中位元組仍不可信。

程式完成、超時、取消與協定失敗都透過受管程序所有者關閉執行。選擇結果後停止執行計時器；清理隨後等待直接結果與受管範圍停穩。PTC 橋接在外層工具結果結算前，另行取消並排空巢狀工具分派。拒絕或傳輸失敗絕不自動重放可能已經產生副作用的程式。

### 資源限制

預設經過時間截止為 120 秒，預設上限為 600 秒。可信服務消費方可以請求 `timeoutMs: null` 來停用該定時器；[工作流沙箱複用](2026-09-13-workflow-ptc-sandbox-reuse.zh.md)負責這種由呼叫方控制的生命週期。省略 timeout 或使用數值的請求（包括面向模型的 `run_code`）保留數值預設值與上限。啟用的截止包括執行時準備以及巢狀工具或審批等待。V8 老生代記憶體、序列化外層輸出與控制通訊具有獨立設定的上限。堆限制不包含原生分配和後代記憶體，經過時間也不是程序樹 CPU 預算。

## 考慮過的替代方案

**保留 worker 並增加工具檢查。** 工具檢查不能攔截直接 Node 匯入，也不能建立 OS 約束。在受限監督程序中保留 worker 可以保留 worker 計量，但會增加一層執行生命週期，仍不能提供程序樹 CPU 限制。

**使用同程序 JavaScript realm。** 語言級 realm 不強制直接 Node API 所需的檔案系統與程序策略。所需保護是 OS 約束與 Host 擁有的程序生命週期。

**複製 Codex Code Mode 的執行模型。** [Codex Code Mode](https://github.com/openai/codex/blob/02a8f038b87ad34d4a1dc5058eda26972ed7aa6c/codex-rs/code-mode-protocol/src/description.rs) 提供全新原始 JavaScript isolate 與 Host 工具回呼，yield/wait 觀察與執行生命週期分開。移除 Node API 或增加可恢復單元會改變 PTC 的程式設計與日誌模型。保留的設計在 OS 策略下提供直接 Node 存取，並返回一次性結果。

**把 worker active time 當作 CPU 限制。** 事件迴圈佔用率計量單個 worker 的活躍經過時間，不是 Node 及其後代消耗的 CPU。程序提供者使用 Host 擁有的經過時間截止，不作更強宣告。

## 後果

每次 `run_code` 都承擔 Node 程序啟動與 OS 沙箱準備成本。較長的巢狀工具和審批消耗與直接程式工作相同的經過時間預算。清理可能讓呼叫方在截止後繼續等待。更強的後代約束仍取決於所選子程序後端；其 fallback 限制保持可見，不會被執行時標籤提升。

`run_code` 要求程式及其描述。服務呼叫方可以解析支援的執行選擇；面向模型的 timeout 與審批控制由獨立消費方負責。每個巢狀工具仍經過正常策略與日誌路徑。

<a id="deferred-timeout-design"></a>
## 延後評估 timeout 設計

經過時間預設值是可以重新評估的部署選擇。後續設計必須將回應及時性與終止分開：向模型交出輸出本身不會停止程式；增加可等待單元會引入所有權、取消、部分輸出日誌、輪次結束和恢復義務。

開放問題包括審批等待是否消耗程式預算、順序執行的長任務工具如何組合、是否需要獨立的總生命週期後備，以及哪些程序樹 CPU/RSS 上限可以一致強制執行。持久核心還需要在 Session 日誌中表示保留狀態。這些問題不會靜默暫停或延長已釋出的經過時間計時器。
