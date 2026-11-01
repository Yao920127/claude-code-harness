# Agent Note: Schedule 刪除任務行並限制投遞歷史

Status: implemented

[English](2026-09-22-schedule-hard-delete-and-bounded-history.md) | 中文

## Problem

Schedule domain 是後端每次變更都會重寫的單個整 unit JSON 文件，因此任務行中保留的每個位元組都會隨每次寫入增長。已儲存的傳送記錄沒有上限：每次確認都會向陣列追加，而被刪除的任務會保留其行與記錄，以便已開啟的詳情仍能讀取。於是文件大小隨任務的投遞次數變化，刪除還引入了一個所有讀取方都必須跳過的狀態。

## Decision

刪除是硬刪除。`ScheduleService.delete` 透過 `tasks.delete` 移除儲存行，因此任務停止排程、離開 `list` 與 `catalog`，`history` 對相同的 `(sessionId, id)` 返回 `schedule_not_found`；該行已儲存的投遞記錄隨行一併移除。任務 schema 沒有 `deleted` 欄位，也沒有任何介面提供回收站或讀取已刪除任務記錄的能力。

投遞歷史受外掛 `Config` 限制：`deliveryHistoryDays`（預設 30，1–3650）與 `deliveryHistoryRecords`（預設 200，1–10000）。`appendDelivery` 在唯一的寫入路徑上同時應用這兩個上限。它保留 `deliveredAt` 不早於「本次追加回執的 `deliveredAt` 減去設定的天數視窗」的記錄，在其中保留最新的 `deliveryHistoryRecords` 條，並始終保留本次追加的最近一次回執；發生裁剪時設定 `earlierRecordsUnavailable` 和 `earlierRecordsPruned`，後續追加會保留這兩個標誌。後者在儲存行中可選，用於確認實際刪除；僅有舊格式的不可用標誌不表示發生過裁剪。歷史回應攜帶目前保留上限，用戶端僅在載入完最後一頁且歷史非空、確認裁剪時顯示清理提示。

[Host-owned scheduled messages](2026-09-16-host-schedule-storage.zh.md) 筆記保留其餘決策：唯一的權威版本 1 任務 domain、只為活動任務恢復定時器、透過 Session controller 投遞到冷工作階段、目錄與詳情介面，以及歷史解碼器與主機解碼器的劃分。其狀態詞彙為 `active` 或 `inactive`；`inactive` 是唯一的非活動名稱，用戶端篩選行為全部、活動和未執行。該筆記保持活動狀態：這是一次部分取代，因此它既未歸檔也未凍結，仍是上述內容的歸屬筆記，而它記錄的刪除與保留決策由本筆記取代。

## Alternatives considered

**保留帶 `deleted` 標誌的任務行。** 該標誌的存在是為了讓 `history` 在刪除後仍能回答。刪除後沒有任何程式碼讀取這些記錄，而該行把每個提示文字快照都留在儲存文件中，還必須手工把它排除在 `list`、`catalog` 和定時器之外。移除該行讓刪除只有一種含義。

**只按條數設上限。** 僅有條數上限時，投遞稀疏的任務會保留任意久遠的回執，投遞密集時又會丟棄近期的一批迴執。天數視窗限制陳舊程度，條數上限限制文件大小。

**以任務而非每條回執為視窗起點。** 把視窗錨定在任務的建立時間或已提交目標上，會丟棄舊任務剛寫入的回執。從本次追加回執的 `deliveredAt` 向前計算，使視窗錨定在所要保留的資料上。

**保留無上限的歷史，由運維清理。** 該 domain 每次寫入都發布整個 unit 文件，因此無上限的歷史會讓儲存文件的大小隨投遞次數增長。保留上限是儲存佈局所要求的約束，而不是保留策略偏好。

## Consequences

刪除不再提供恢復能力：已刪除任務的已儲存投遞無法再讀回，仍需要完整歷史的必須在刪除前讀取。設定的保留策略也會丟棄任務曾經擁有的回執；保留的標誌記錄視窗發生過裁剪，而不是假裝歷史完整。

換取的是：持久任務集合只有一種刪除語義，儲存文件大小由設定而非投遞次數決定，且 `inactive` 是唯一的非活動生命週期名稱。當某個部署需要更長的投遞歷史時，應提高外掛 `Config` 中的上限。
