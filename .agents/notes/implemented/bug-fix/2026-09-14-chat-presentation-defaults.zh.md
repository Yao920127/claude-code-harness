# Agent Note: 保持 Chat 展示與 Trajectory 檢視獨立

Status: implemented

[English](2026-09-14-chat-presentation-defaults.md) | 中文

## 問題

Trajectory 檢視適合直接展示完整的已記錄思考。將該預設行為應用到 Chat 會在思考期間展開即時對話，並在回答或工具呼叫到來時改變其高度。Trajectory 檢視改動還為 Chat 增加了歷史首 token 計時恢復，卻沒有獨立的 Chat 行為決策。

## 決策

[Chat](../../../../packages/client/ui-chat/README.zh.md#turn-process-folding) 的每個思考行初始都摺疊，後續輸出和結算保留使用者手動選擇的展開狀態。結算會移除觀測到的即時 chunk，並從持久事件重建 Chat 回覆節點，不從內嵌流恢復首 token 時間。因此，即時結算後和重新開啟歷史後，已完成輪次都不顯示 TTFT 和解碼速度。輪次級過程摺疊仍獨立維護。

[Trajectory 檢視](../feature/2026-09-09-ptc-trajectory-code-inspection.zh.md) 保留思考預設展開、已記錄計時、JSON 控制元件和 PTC 程式碼檢視器。[緊湊流讀取器](../architecture/2026-09-06-embedded-stream-record-readers.zh.md) 仍供 Trajectory 和其他消費方使用。這些決策部分取代了 Chat 展示增量，同時保留兩份記錄各自獨立的理由。

## 考慮過的替代方案

**保留 Chat 自動展開和歷史計時恢復。** 這些改變了所請求的 Trajectory 檢視工作之外的 Chat 行為。重新引入任一行為都需要獨立的 Chat 產品決策及相應驗證。

**撤回整個檢視改動。** 這會在撤回意外 Chat 改動的同時移除所請求的 Trajectory 行為。

## 影響

Chat 思考需要點選才能檢視全文。輪次總耗時和獨立投影的 Session Stats 仍可用。組裝器測試區分即時結算時移除臨時資料與重新開啟持久歷史；瀏覽器回放驗證過載前後的已完成輪次計時對話方塊。元件測試覆蓋流式與僅思考回覆的預設摺疊，以及回答和工具呼叫到來時的手動展開狀態。Trajectory 測試保留其獨立預設值和計時。
