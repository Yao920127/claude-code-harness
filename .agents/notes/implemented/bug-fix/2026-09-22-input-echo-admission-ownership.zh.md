# Agent Note: 輸入回顯在入檔期間保持展示歸屬

Status: implemented

[English](2026-09-22-input-echo-admission-ownership.md) | 中文

## 問題

空閒時提交的輸入可能先顯示為 Chat 本地回顯，再變為 QueueDock 的 Inbox 行，最後才顯示為持久使用者訊息。Inbox 投影與工作階段歷史獨立到達：受理時回收回顯會在入檔前留下空檔，遲到的 Inbox 投影又可能重複顯示已經入檔的訊息。此外，turn/start 先於 user/message，因此空過程標題可能先出現在回顯前面，真實輸入到達時再與它交換位置。

這些轉換涉及展示歸屬，而非滾動或 composer 幾何。延遲不能判斷哪種表示已經成為權威，將所有回顯移到過程標題前又會把執行中的 steering 移到已有工作之前。

## 決策

- 提交保留本地傳送時選擇的 placement：空閒輸入留在 Chat，執行中的 steering 留在過程末尾，明確排隊的輸入留在 QueueDock。Inbox 受理不改變展示歸屬。
- Chat 在同一次渲染中按持久輸入的 rpcId 隱藏回顯，並排除匹配已入檔本地 Chat 提交的舊 next-step Inbox 行。QueueDock 只排除匹配本地 transcript 回顯的 Inbox 行；其他排隊訊息仍可見且可操作。
- Session 保留已入檔 transcript 或 steering 提交的本地排除身份，直到 Inbox 投影水位達到其領取序號。隨後，較高序號投影優先的規則阻止舊受理行在該身份回收後重新出現。領取跟蹤和取消共用已有逐提交 receipt，並覆蓋兩種 Inbox target；不新增 SessionSnapshot 欄位、Host 事件或持久格式。
- Chat 末尾為進行中且沒有真實輸入的過程控制行時，第一條 transcript 回顯顯示在控制行前，其他回顯留在末尾。最後輸入的輪次資訊複用現有 rpcId 掃描，不新增歷史遍歷，也不預測未來輪次序列。
- 待處理氣泡與持久節點容器共用一個 keyed React 列表。插入過程標題保留回顯氣泡的掛載身份。入檔後，由持久節點決定排序及普通 Group 切分。

[持久 Inbox 恢復決策](2026-08-17-durable-web-queue-recovery.zh.md)仍負責冷讀取、重建與投影傳輸。[通用檔案上傳決策](../feature/2026-08-26-generic-file-upload.zh.md)仍負責附件準備及草稿恢復；回收按附件順序返回各提交的持久引用，且只回呼一次。

## 考慮過的替代方案

**固定延遲 QueueDock 或回顯回收。** CPU 降速、傳輸批處理與投影到達順序都可能超過該間隔。時間不能證明入檔，也不能確認過期佇列狀態已經消失。

**只延長回顯生命週期，不調整其他讀取方。** Chat 側按 Inbox 去重仍會移除回顯，QueueDock 仍可能展示同一訊息。Session 生命週期、Chat 接管和 Dock 排除必須一致。

**user/message 到達後立即刪除排除身份。** 較晚的 Inbox 受理投影會復活 Dock 行或待處理 steering 行。領取水位提供必要的排序依據，不要求兩條流同時釋出。

**把全部待處理輸入移到最新 Turn 控制行前。** 執行中的 steering 屬於已有過程內容之後，多條普通提交也可能屬於不同輪次。只有第一條本地 transcript 回顯參與空控制行前的定位調整。

**新增 Host 關聯事件或用戶端 Turn 排程器。** 精確預測跨用戶端競爭和請求亂序會超出本地樂觀展示的範圍。持久入檔仍是權威；這些競爭情境中的樂觀排序有意保持近似。

## 驗證

| 證據 | 覆蓋行為 |
|---|---|
| [Session 提交](../../../../packages/api/session-controller/tests/session-pending-submissions.client.spec.ts) | 投影先到與歷史先到的接管、領取水位、開場/排隊/steering 身份交錯、附件回呼、取消、未入檔結束、重連基線及銷燬。 |
| [投影儲存](../../../../packages/api/session-controller/tests/projection-store.client.spec.ts) | 缺失或快取水位、單調序號保留及清理。 |
| [Chat 渲染](../../../../packages/client/ui-chat/tests/chat-view.client.spec.tsx) | 同幀 rpcId 替換、回顯穩定掛載、三種模式下標題先於輸入到達、steering 留在標題之後、歷史空輪次及六種本地與 Host 排列。 |
| [QueueDock](../../../../packages/client/ui-conversation/tests/queue-dock.client.spec.tsx) | 本地 transcript 排除、其他行及操作、三條訊息的全部六種受理順序及後續 FIFO 領取。 |
| [錄製 Web 回放](../../../../apps/web/tests/idle-submission-handoff.e2e.ts) | 真實 Web 裝配配合保留 FIFO 的投遞屏障：6× CPU 降速下的 Inbox/歷史兩種到達順序、明確的 turn/start 至 user/message 空檔，以及六種請求排列的完整三輪接管。 |
| [Steering Web 回放](../../../../apps/web/tests/steering.e2e.ts) | 本地快捷鍵 steering 的持久入檔先於 Inbox 領取投影到達時，仍只顯示一份。 |

單條輸入迴歸在修復前失敗：Inbox 受理將氣泡移入 Dock，單獨交付的 Turn 標題又會出現在回顯之前。修復後的路徑保留唯一的 Chat 表示，且縱向位置穩定。多輸入回放驗證持久順序及無重複、無殘留回顯，不斷言樂觀排列可以預測 Host 順序。

## 後果

- 沒有本地提交身份的 steering 仍按 Inbox 投影顯示；投影遲到時可能短暫與持久節點重複。本地去重不為其他用戶端的提交增加歷史掃描。
- 重連可撤銷已有接收回執的樂觀回顯，並展示新的權威基線。已領取但不在該基線中的輸入可能短暫無氣泡；重連不保證 DOM 連續性。
- 本地 running 更新前連續提交的訊息可能都留為 transcript 回顯。若本地按 A、B、C 提交，但 B 或 C 先入檔，持久接管會調整可見順序。即使 A 先入檔，其餘本地回顯也可能與 Host 佇列順序不同。
- 跨用戶端競爭和請求準備的先後差異可能改變實際開場輸入。用戶端不會僅因 Host 將輸入排在另一輪後面，就把已按空閒分類的回顯遷入 Dock。
- 這些改動消除普通線上路徑中表示切換帶來的抖動，不改變模型輸入、Inbox 排程、滾動跟隨規則或已釋出 Session 資料。瀏覽器屏障證明行為，不代表普遍的延遲或吞吐提升。
