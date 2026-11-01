# Agent Note：複用崩潰修復的精確事件工作階段分叉

Status: implemented

[English](2026-08-18-arbitrary-seq-session-fork.md) | 中文

## Problem

分支可能需要工具結果到來之前的歷史，包括父工作階段已經完成後的歷史位置。將 fork 限制到已完成輪次會阻止這種選擇。複用崩潰恢復的結果文案則會錯誤暗示父工作階段已中斷。

## Decision

`SessionStore.fork` 精確接受任意已有的整數事件 seq，並擁有源工作階段歸屬、子工作階段標識和切點驗證。`dsh-session/fork` 唯一匯出的 `buildForkSeed` 複製含切點的字首，插入子工作階段的繼承 `session/end-seed` 標記，再關閉開放尾部。Host 從同一份不可變觀察中選點和建置。省略 `atSeq` 表示最近已完成輪次及其獨立尾部，在下一輪次或排隊使用者輸入前停止。顯式 seq 永不移動。

Fork 與崩潰恢復共用相同的工具配對演算法。只有開放步驟會在 `step/end` 前補缺失的錯誤結果；開放輪次隨後補 `turn/end`。已關閉的步驟和輪次保持原樣，包括缺少結果的歷史失敗。內部 cause 選擇 `forked` 或 `interrupted`、確定性的結果 ID 及模型可見文案。Fork 文案描述缺少的繼承記錄，並提醒父工作階段可能已在切點後執行呼叫。重試建議區分只讀或冪等操作與有副作用的操作。

繼承標記位於合成結束事件之前。`inheritedEventCount` 只統計複製的父事件；標記與結束事件屬於子工作階段，在 agent 釋出前持久化。建構函式僅在給定切點指向最後一個繼承標記時接受這種完整 seed。巢狀 fork 在複製字首中保留祖先標記。`firstLiveSeq` 仍是完整建構輸入的長度，與持久繼承計數不同。

V4 接受未啟動的 fork 結果，不修改已釋出的 V0–V3 驗證器。其 codec 和關係驗證器為這一經過驗證的變體提供內部規範 interrupted-result 檢視，再返回原始 fork ID 和訊息。V3-to-V4 遷移保留已有事件。`forked` 輪次結束原因與已定稿的 V4 頭版本變更一起記錄相容性確認。

本決策取代[僅按已結束輪次擷取的 Controller 策略](../../archived/bug-fix/2026-09-11-session-controller-fork-turn-cut.md)。顯式切點精確保留所選事件；省略切點時保留已完成的獨立操作，包括手動壓縮的替換事件，直到 core 所屬的新輪次或排隊輸入事件開始。外掛繼續負責自己的括號關係；Controller 不對外掛事件分類。

## Alternatives considered

**將切點移到已完成步驟。** 這會改變顯式歷史選擇，丟失所需上下文。精確切點加已記錄的結束事件保留該上下文。

**建置請求時修復。** 模型可見結果必須進入日誌，因此 seed 在模型請求之前記錄它們。

**修復已關閉步驟中的呼叫。** 這些失敗原本屬於父工作階段；這會將 fork 擴充功能為新的歷史修復策略，偏離崩潰恢復行為。

**公開依賴 Store 的 fork 包裝函式。** Store 的建立規則留在 Store；純 seed helper 只需要事件型別和內部結束函式，避免增加公開入口或搬遷 Store 檔案。

## Consequences

Fork 關閉所選開放尾部，不修復更早的畸形歷史。外掛擁有其未配對括號：不會合成 `compaction/end`。繼承標記讓 compaction 識別繼承而來的陳舊 start。父子序號在切點後分離。 新 fork 的 `firstLifecycleSeq` 從子工作階段自有標記開始，因此 telemetry 包含合成結果與結束事件。恢復的 Session 從已儲存字首之後開始目前生命週期；僅憑持久化 fork 切點無法識別新的採集內容。聊天操作保留已完成輪次選擇；更細的事件選擇屬於後端功能，不增加 side chat。

## Testing

Session 和 repair 測試覆蓋精確切點、兩種錯誤分類、已關閉失敗步驟、空歷史、外掛括號和 surface 替換。Agent-loop 迴歸驗證實際的下一次模型請求、結果保留、輪次編號及不重複執行工具。Host 測試覆蓋即時與冷源工作階段、精確拒絕和排隊輸入隔離。V4 測試往返原始 fork 結果資料、拒絕畸形結果並驗證巢狀 fork。無需金鑰的 `fork-mid-turn` 瀏覽器情境透過 HTTP 對冷錄製進行 fork，再透過輸入框繼續執行，並在預期輸出中展示分支文案。
