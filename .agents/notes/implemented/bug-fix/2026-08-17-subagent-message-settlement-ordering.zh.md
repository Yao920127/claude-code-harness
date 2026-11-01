# Agent Note: Child Agent 訊息先於其結算通知

Status: implemented

[English](2026-08-17-subagent-message-settlement-ordering.md) | 中文

## 問題

可繼續 child 可以傳送選中內容，之後還會產生一條由管理器編寫且無條件投遞的結算通知。如果這兩條訊息進入領取優先順序不同的佇列，較晚的結算通知可能先於較早的 child 訊息到達 parent 模型。一個輪次的第一個 step 會先領取完整 `next-step` 批次，再領取一條 `next-turn` 訊息，因此混用 FIFO 後續輪次傳送與 next-step 結算會顛倒因果順序。Issue #2600記錄了該缺陷。

child 指令要求在發現會改變 parent 下一步動作時傳送該發現。把這條訊息推遲到後續輪次既違背其排程含義，也會把具有因果順序的訊息拆到領取優先順序不同的佇列。

## 決策

每條模型編寫的相鄰 Agent 訊息都透過 `SubagentRuntime.sendMessage()` 使用固定 Steer 投遞。執行中的 parent 在最近安全 step 邊界讀取 child 訊息，空閒 parent 則啟動一個輪次。模型沒有靜默或 next-turn 投遞選項。

繼續執行管理器會在投遞到駐留可繼續 parent 的訊息周圍保留 `sendWaking()`，並透過 parent 的私有 `SubagentInbox` 執行同步傳送。包裝層會在安裝 closing promise 前接受傳送，並在安裝後拒絕傳送；被接受的嘗試會在返回前更新 Activation 的 wake generation。因此，接收方 Activation 不會越過一條已接受的喚醒傳送完成結算。

### 不同 parent 狀態下的順序

執行中的 parent 在同一條 `next-step` FIFO 中接收已接受的 child 訊息與該 child 隨後的結算通知。如果 parent 在結算到達前變為空閒，它已經領取 child 訊息；結算隨後可以開啟後續輪次，而不會顛倒觀察順序。

parent 處於 maintenance 時，child 訊息佔用 `next-step` 並鎖存一次喚醒，而結算可能因 maintenance 報告空閒狀態而佔用 `next-turn`。初始領取仍會先取 next-step 輸入，再取排隊輪次。取消後提交的喚醒輸入遵循核心 Agent 的取消收斂，而不會繞過它。

### 驗證

控制工具測試套件讓 parent 保持在活躍模型請求中，提交 child 訊息、結算 child，並驗證 sender 身份、Steer 准入、FIFO 批處理與結算後保留。繼續執行覆蓋固定駐留可繼續 parent 的喚醒准入記帳，並讓 runtime 所有的結算來源與 `agent-message` 保持不同。

無金鑰可繼續 subagent 快照使用隨附的固定投遞。其 child 可見工具 schema 與 parent 相同，且已接受的 child 訊息先於之後的結算通知，無需排程 overlay。

## 考慮過的替代方案

**提供靜默投遞。** 空閒 parent 停駐後可能永遠不讀取靜默訊息。它還會讓等價的模型編寫訊息具有不同存活語義，並重新引入依賴部署的順序。

**提供 next-turn 投遞。** 較晚的 next-step 結算通知仍可能越過它。保持訊息先於結算需要跨佇列順序屏障，而目前沒有模型操作對後續輪次隔離的需求強到足以承擔該機制。

**把結算通知移到 `next-turn`。** 結算批處理使用 next-step 佇列，使多個 child 同時結束只消耗 parent 的一個 step，而不是每個 child 一個輪次。移動結算會為了保留不必要的訊息排程模式而增加延遲與模型工作。

## 後果

- child 訊息可以延長開放的 parent 輪次。它絕不會中斷活躍模型請求或工具執行；agent loop 只在 step 邊界接納它。
- 一起被接受的訊息共享一個 next-step 批次，保持 FIFO 順序並限制輪次放大。
- 模型呼叫方不能選擇投遞模式，因此順序與喚醒行為不會隨部署或呼叫而變化。
- child 到 parent 的傳送仍要求直接 parent 保持線上；服務不提供持久 parent mailbox。
