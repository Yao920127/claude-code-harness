# Agent Note: 推理（reasoning）分片的逐幀累計釋出與瀏覽器壓力驗證

Status: implemented

[English](2026-08-03-opt-in-reasoning-chunk-browser-stress.md) | 中文

## 問題

長 reasoning stream 會在一個持久 settlement 前連續產生大量程序本地 `assistant/live-chunk` update。每個 update 都必須保持有序並摺疊進 Assistant Definition，以保留即時完整性；settlement 則嵌入精確 stream 供 replay。React 只需要看到目前累計結果，不需要觀察同一瀏覽器幀內每個中間態。

非同步流的每次 `yield` 都可能形成新的微任務邊界，因此僅靠微任務合批的 `Notifier.markDirty()` 會退化為每個分片重建一次 `ConversationSnapshot`、通知一次 `useSyncExternalStore` 並執行一次 React render。即使即時 Think 行保持摺疊，100,000 個推理分片仍會讓協調、提交和佈局工作壓住主執行緒。效能邊界必須位於工作階段接收與 React 釋出之間；測試必須保留每個原始事件，並區分單批渲染成本與無限累積的 transport backlog。

## 決策

Session Controller 把每個 Client-only live chunk 追加到 event source，Conversation 會立即把它摺疊進每個匹配 Definition State。Chat 與 Trajectory Definition 為可見 `block-start`、`text-delta`、`reasoning-delta`、`tool-call-delta` 與 `block-end` chunk 請求 `animation-frame` publication；第一項變化排程一次 `requestAnimationFrame`，後續 chunk 繼續更新 State，frame callback 再從最新 State materialize 一個累計 snapshot。`usage` 與 `finish` 不請求 publication。持久 `assistant/message` 或 `assistant/attempt` settlement 會立即釋出，並在歷史 replay 中復現同一最終 stream。

`BoundConversation` 為每個 Session 擁有一個 pending frame。普通結構 event 與持久 settlement 請求 immediate publication，flush 最新 assembled State，並讓之後的 frame callback 因沒有 dirty Context 而不產生影響。沒有 `requestAnimationFrame` 的環境會立即釋出。Settlement 可以跳過一個尚未顯示的中間 partial，但釋出的最終 content 與持久嵌入式 stream 保持完整。

即時 Think 行對累計文字的橫向跟尾屬於純視覺對齊，不需要在每次 React 提交中同步讀取佈局。元件內排程器將連續請求合併為每三幀一次，從最新 DOM 讀取 `scrollWidth` 和 `clientWidth` 並將 `scrollLeft` 直接更新到最新位置；固定的視覺節奏讓摘要變化可讀，又不會積壓瀏覽器平滑滾動動畫。該節流只作用於 Think 的橫向摘要，不延遲 Chat 正文滾動、歷史 prepend 錨定或使用者觸發的 `scrollIntoView`。

`pnpm run test:web:stress` 保留為無金鑰、需顯式啟用的瀏覽器效能證據。測試持有的模型 adapter 透過真實 Host、Gateway、WebSocket、Session 歸併和即時 Think 行發出 100,000 個 `reasoning-delta` chunk。每批 128 個 chunk 會等待一次瀏覽器 timer 輪次後再發下一批，因此 50 毫秒心跳與預先排程的 DOM 事件按 250 毫秒預算測量一個有界接收／渲染區間，而不是累積的 socket backlog。結尾標記證明所有 chunk 都已到達 UI。`DSH_WEB_STRESS_HEADFUL=1` 允許開發者在可見瀏覽器中使用 Performance 面板分析同一情境。該壓力車道是手動效能診斷與修復驗收的證據，不是預設 CI 門禁，也不替代確定性的排程單元測試。

聚焦測試固定 `Notifier` 的逐幀合併、結構事件搶佔、失效回呼和無 rAF 退回，並在 `Session` 層證明一幀只發布一次最新累計文字且定稿不會被舊幀回呼重複通知。按需啟用的瀏覽器案例持有 adapter 節奏、精確事件數和結尾標記交付，不把 100,000 分片工作負載帶入預設測試套件。

## 曾考慮的替代方案

**在 React 內對快照使用 transition、deferred value 或元件節流。** 不予採納：工作階段源仍會逐分片通知 `useSyncExternalStore`，React render 在元件決定延後展示之前已經發生，且多個消費同一快照的元件需要重複實作策略。Think 摘要的視覺跟尾節流位於快照發布之後，只減少同步佈局頻率，不承擔資料釋出策略。

**在 Definition fold 前丟棄或抽樣 live chunk。** 不予採納：即時累計 State 會與持久嵌入式 stream 分歧，並可能省略可見中間內容。緊湊持久儲存與逐 frame 合併 React publication 解決的是不同成本。

**只使用微任務合批。** 不予採納：連續非同步 `yield` 會在相鄰分片間排空微任務佇列，使微任務合批近似退化為每個分片通知一次。

**按動畫幀控制測試生產方節奏。** 不予採納：生產方會在渲染變慢時同步減速，使頁面獲得真實網路流不存在的隱式背壓，並掩蓋主執行緒飢餓。

**不等待確認就把原有瀏覽器本地速率發入 WebSocket。** 不予採納：transport 工作的排隊速度會超過模型可能達到的產出速度，使結果變成 socket backlog 測量。瀏覽器 timer 確認限制每批工作量，同時 heartbeat 仍能發現一批資料使頁面飢餓。

**真實外部模型或錄製的 HTTP 位元組流。** 不予採納：外部模型不具確定性，HTTP 錄製還會增加第二種 fixture 格式，卻不會改進目標斷言。測試持有的 adapter 讓每個 chunk 經過真實 Host 與瀏覽器 transport，同時控制工作負載。

## 後果

流式 `ConversationSnapshot` 的釋出頻率受瀏覽器繪製頻率約束，React 每幀至多處理一個包含全部已接收文字的累計 partial；結構事件仍可更快釋出。接收、排序、日誌記錄、字串拼接和累積器更新仍按原始分片執行，因此該決策降低的是快照重建與 React 工作，不把原始流解析成本偽裝成已解決。

摺疊 Think 摘要的橫向佈局讀寫最多每三幀執行一次，並直接追上該時刻的最新位置；React 仍按累計快照正常提交，定稿時摘要恢復到首行。該區域性視覺策略不會改變正文滾動和使用者互動的即時性。

瀏覽器壓力車道繼續提供真實組裝應用與載體上的回應性訊號和可見 profiling 入口，但硬體與排程差異使其只適合作為顯式效能證據。確定性的 focused tests 負責守住釋出次數、累計內容與搶佔順序，預設測試車道保持快速。
