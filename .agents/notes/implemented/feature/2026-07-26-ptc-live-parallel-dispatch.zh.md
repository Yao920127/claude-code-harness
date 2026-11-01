# Agent Note: PTC mode 的即時分發生命週期，以及複用原生約定的並行執行

Status: implemented

[English](2026-07-26-ptc-live-parallel-dispatch.md) | 中文

> 範圍：`tool/ptc-dispatch-start` 事件、Web chat 中每個子呼叫的執行狀態，以及橋接層排程器對原生並行約定的複用。建置在[主機側基礎](../../archived/feature/2026-07-26-ptc-dispatch-ui-foundation.md)與 [chat 子呼叫行](../../archived/feature/2026-07-26-ptc-chat-subcall-rows.md)之上；原生約定本身歸[並行工具呼叫 Agent Note](2026-07-10-parallel-tool-call-execution.zh.md) 所有。

## 問題

主機側基礎與 chat 子呼叫行交付之後仍留有兩個缺口。子呼叫行過去只在每次分發*結算*後才出現：某次分發執行期間，UI 對它毫無展示，於是一個慢的子呼叫看上去就像父呼叫卡住了。而橋接層過去把每一次繫結呼叫都序列化（「即使 `Promise.all` 也一次只執行一個」），這是工具尚未攜帶並行中繼資料時留下的佔位實作：如今 `isConcurrencySafe` 已經存在，agent loop（智慧代理迴圈）排程器早已在有界並行池中執行原生兄弟呼叫，而一個等待三個獨立讀取的 PTC mode 程式，付出的延遲卻是原生路徑的 3 倍。

## 決策

**一對生命週期事件，一份排程約定，與原生共用。**

- **事件對**：`tool/ptc-dispatch-start`（父/子 id、名稱、規範化參數）在排程器真正啟動某個呼叫時才追加，而非在提交時，因此因 run 結算而被放棄的排隊呼叫不會留下任何日誌。既有的 `tool/ptc-dispatch` 結算該事件對（`subCallId` 相同）；每個已啟動的呼叫恰好結算一次（中止也會作為 `isError` 結果經由流水線結算）。計時即這兩個事件的 `time` 欄位。兩個事件仍僅用於日誌；模型上下文不受影響。
- **橋接層排程器**：已提交的呼叫在啟動那一刻經 `registry.executionMode` 分類（與 loop 所用完全相同、故障時預設判為不安全的 `isConcurrencySafe` 約定），並嚴格按提交順序啟動。所有有序階段——start 事件追加、`prepare`（pre-execute/守衛）、隊首 `finalize`/`finish` 提交（post-execute + 上下文延遲提交 + settle 事件追加）——由單通道驅動器獨佔執行，因此有序策略階段彼此絕不重疊，只有 around-dispatch/工具體階段並行執行，與原生 loop 的時序完全一致（`fillPool` 先 await `startCall` 再 `commitReady`）。連續被分類為可並行的呼叫可以重疊執行，上限為 `maxParallelSubCalls`（`Config` 欄位，Loader schema 驗證之外直接建構時也重新驗證，預設值 10，即 loop 排程器自身的預設值；設為 `1` 即恢復序列分發）；獨佔呼叫則先排空池、獨自執行，且其屏障保持到自身提交（含 post-execute）完成為止，與原生獨佔分組一致。run 結算時會中止仍在執行的分發，並放棄已排隊未啟動的分發（繫結呼叫被拒絕，不產生事件），隨後排空到完全停穩——包括程式返回時已在途的提交——之後外層結果才結束該輪次。
- **用戶端側**：執行時的 `ToolCallTree` 把 start 事件存為 `RunningToolCall` 子級，並透過父級遞迴的 `subCalls` 投影出來（行元件從該形狀推匯出執行指示環，與原生執行中的呼叫處理完全一致）。其結算事件會原位替換私有索引中的條目，即使並行完成也保持啟動順序不變，並把 start 事件的 `time` 作為 `callTime`（時長來源）帶入。未觀察到對應 start 的結算事件（視窗切在事件對中間，或日誌錄製於 start 事件引入之前）會直接追加，因此舊日誌仍能照常渲染。
- **SDK 提示詞**：面向模型的「呼叫按順序執行」一句替換為真實約定（相互獨立的安全呼叫可以在 `Promise.all` 下重疊執行；相互依賴的工作以 `await` 順序銜接）；這是模型可見的變更，每一份 PTC mode 快照都已重新錄製。

## 曾考慮的替代方案

**不加限制的並行（讓 `Promise.all` 重疊一切）。** 否決：寫操作可能產生競態；原生排程器之所以存在，正是因為安全性宣告歸工具所有，而不歸呼叫方。原生與 PTC mode 使用同一套並行詞彙，是已敲定的要求。

**在提交時而非入池時發出 start 事件。** 否決：提交即發 start 會把排了隊卻從未執行的呼叫顯示成「執行中」，還得強行引入第三種「已放棄」終態事件才能使日誌自洽。入池才發 start 保住了*已啟動 ⇔ 恰好結算一次*這一不變式，且不需要第三種事件。

**直接複用 loop 排程器的實作。** 否決：loop 排程的是一個已完整解析的批次，並按模型順序提交結果；橋接層排程的則是一條開放式的提交流，其結果返回給程式，而不是進入 transcript（文字記錄）。因此兩者共享的只是*約定*（分類、池、屏障），而不是實作機制。

## 後果

程式不需要任何新的模型側 API，獨立讀取就獲得了原生級的延遲：`Promise.all` 直接變得更好用，提示詞指引也隨之修改。Web UI 即時顯示每個子呼叫的執行指示環：fixture（測試前置資料）發出成對的 start/settle 事件；jsdom 鎖定執行中形狀；執行時測試鎖定原位結算、亂序完成與 callTime 配對。trajectory/waterfall 的子呼叫 span 從這對事件取得如實的計時。spill 邊界劃定（[ptc-dispatch 日誌 spill](../../archived/feature/2026-07-26-ptc-dispatch-log-spill.md)）則以結算事件作為唯一的邊界點。
