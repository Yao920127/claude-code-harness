# Agent Note: Client 連線持續恢復

Status: implemented

[English](2026-09-05-continuous-client-recovery.md) | 中文

## 問題

generation source 可能一直掛起，既不報告就緒，也不報告載體失敗。僅告警會讓 Client 無限等待。有限次數的自動重試還會使頁面在 Host 從較長中斷恢復後繼續保持斷連，即使瀏覽器網路狀態從未變化。

## 決策

[`ConnectionController`](../../../../packages/client/connection/src/client/connection.ts) 同時擁有握手就緒期限和持續重試排程。預設情況下，握手在三秒後報告 Host 回應緩慢，在十五秒後中止。告警提供早期回饋，同時保留需要數秒才能就緒的 Host；硬期限限制每次嘗試的時長，並在取消 generation 時記錄超時。告警與取消時間相互獨立，因此縮短硬期限不需要同時修改兩個欄位；排定在握手結束之後的告警會被取消。取消會傳到 generation source，後者必須釋放資源並結束，下一 source 才能啟動。已取消 source 遲到的 ready 回呼不能建立 generation。

重試上限從 500ms 開始，經過 1s、2s、4s、8s 增長到 10s，保留現有 50–100% 抖動。達到最大上限後失敗仍繼續重試。把最大延遲與重試次數上限分開，與 [Socket.IO Client 選項](https://socket.io/docs/v4/client-options/#reconnectionattempts)的區分一致；DSH 保留自身的 Remote stream 協定和唯一排程器。Controller 每要求一次嘗試，Gateway 就替換一次物理 socket。仍在等待開啟的 WebSocket 候選，以及已開啟但未收到首個 ready 幀的 socket，都能透過此路徑恢復。

Host Connection 外掛驗證設定中的 `recovery`，透過 `webserver/index-inject` 把已解析且不含秘密的時序資料注入每個頁面。Client 在提供 Connection 之前驗證啟動輸入；直接傳給迴圈的選項可覆蓋這些值。定時器值必須是瀏覽器定時器範圍內的正整數，退避因子必須是至少為一的有限數。共享解析器顯式拒絕僅靠範圍比較無法排除的 `NaN`。一表示以固定上限持續重試。Host 時序設定的變更適用於隨後載入的頁面。

Settings 指示器把活動恢復標為**自動重連中**，並始終提供**立即重連**。本決策取代[Web 連線恢復控制](../../archived/feature/2026-08-28-web-connection-recovery-control.md)中的終態重試策略。該記錄仍擁有手動恢復、瀏覽器離線暫停、唯一排程器規則與指示器展示。只有新的 `$events` ready 幀才能建立連線狀態；各域的 stream 保留各自的 baseline 與 cursor 恢復方式。

## 考慮過的替代方案

**僅拒絕就緒等待。** Controller 仍會等待 source 結束才重試。硬期限必須同時取消 source，否則同一個掛起的工作仍會阻塞恢復。

**三秒後取消每次握手。** 這會把 Host 回應緩慢的回饋等同於失敗，反覆丟棄合法的較慢握手。分別設定告警與取消時間，可在有界時長內保留完成機會。

**有限序列結束後停止重試。** 沒有後續使用者或瀏覽器事件，頁面就無法發現 Host 已恢復。對間隔封頂可以限制流量，同時保留自動恢復。

**不等待取消清理就啟動另一個 source。** 重疊的 generation 可能保留 listener 並投遞過時事件。source 的取消契約要求它結束；放棄等待不能證明清理完成。

## 後果

長時間中斷期間保留唯一重試排程，並以有界頻率產生連線流量，直到恢復、顯式停止或瀏覽器離線暫停。永久無效的憑證仍需使用者處理；連線重試不會重新整理憑證，也不會重放一元修改操作。立即就緒仍會重置退避，瀏覽器離線仍決定暫停；穩定連線後的重置視窗和本地載體例外屬於獨立策略變更。

## 測試

Controller 測試覆蓋超過原終檔後的恢復、固定上限重試、慢就緒、期限取消、延遲清理、遲到 ready，以及握手期間手動重連或停止。Host 和 Client 測試覆蓋時序傳遞、無效輸入及注入銷燬。Gateway 測試使用真實 Controller 和事件 pump，配合可編排的 WebSocket，驗證兩個握手掛起階段、物理替換及唯一恢復 reset。錄製 Session 的 Web 生命週期情境覆蓋超過原停止點後的自動恢復、手動替換掛起握手，以及在地化恢復展示。
