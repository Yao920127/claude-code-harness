# Agent Note: 持久定時提醒

Status: implemented

[English](2026-08-05-durable-web-schedule.md) | 中文

[Host 擁有的定時訊息決策](../architecture/2026-09-16-host-schedule-storage.zh.md)擁有任務儲存、timer 啟用、投遞、傳送記錄和任務目錄。本記錄擁有在該決策之下仍然成立的兩個時間決策——顯式絕對時間邊界與有界固定速率計算——以及二者共有的佇列准入邊界。

## 問題

在對話中建立的提醒必須始終歸屬於確切的那個 Session，並且跨程序重新啟動存活。繁忙的 Agent（智慧代理）、長等待、牆鍾變化、cold Session 和持久化失敗使簡單 timeout 無法滿足要求。絕對日曆輸入與重複喚醒帶來兩個計時問題，而儲存與啟用方式的選擇並不能回答它們：當重複規則不儲存時區時，絕對時間意味著什麼；固定間隔在停機後如何追趕，而不重放每一個錯過的發生時點。

## 決策

### 顯式絕對時間邊界

自然語言解釋與 Schedule 解析被有意分開（[時區簡化](../simplification/2026-08-09-explicit-schedule-time-zone.zh.md)）。每條瀏覽器提示詞只在其對應的持久 user message 上攜帶由 Host 驗證過的 IANA 時區。Time-context 會告訴模型，把未明確限定時區的日期和時間解釋為該時區。Schedule 既不匯入該外掛，也不儲存 Session 時區：模型必須把其解釋結果轉換為帶偏移量的 RFC 3339 值，或帶顯式 `time_zone` 的本地物件。

Schedule 會驗證精確的日曆形狀、偏移量、時區名稱，以及嚴格位於未來、年份為四位數的時點。結構化本地時間落在夏令時缺口內會被拒絕；遇到重疊時選擇第一次出現的較早時點。一次性 `at` 或 `after` 記錄只儲存規範化的 UTC `scheduledAt`，不儲存輸入的偏移量、本地欄位或時區。`daily`、`weekly` 或 `cron` 記錄則儲存規範化後的本地規則及其顯式 `timeZone`（[時間選擇器](../../../../packages/schedule/schedule/README.zh.md)）。

### 有界固定速率語義

Every 是固定時長間隔，而不是日曆規則。其首個目標是建立時刻加上該間隔。作出到期決策時，整數除法選出不晚於所取樣牆鐘的最新序列點，以及其後的第一個序列點。選中的發生時點只呈現一次，記錄直接推進到未來目標，因此 cold Session 絕不會積累回放任務，延遲執行的模型工作也絕不會使該序列漂移。同一 Session 內到期的 Every、Daily、Weekly 和 Cron 記錄共用一條訊息，每條記錄只貢獻其最新一次發生時點（[儲存與投遞](../architecture/2026-09-16-host-schedule-storage.zh.md)）。

至少五分鐘的下限約束喚醒與模型請求頻率。系統不存在跨記錄的冷卻、門控、配額或保留的批次時間戳。如果下一個序列點會超出四位年份儲存範圍，dispatch 會終結該記錄。

### 佇列准入不是完成

dispatch 記錄的是佇列准入，而不是模型完成或使用者收到提醒。framing 建構或同步入隊失敗不會追加 dispatch。follow-up 獲得准入後、持久回執前發生崩潰，可能使提醒在恢復後重復；本設計不作 exactly-once 承諾。

## 已考慮的替代方案

**使用 `ctx.jobs`。** Task 擁有程序本地工作、結果和通知，而不是持久任務狀態和對話 follow-up。

**持久化 Session 時區並推斷本地 `at`。** 這會讓一個解釋預設值擴散到 Session core、Host create／fork、持久化格式、client 和不匹配恢復中。請求本地的模型指導與顯式工具邊界消除了這種耦合。

**在 `followup()` 前認領 dispatch，或增加 exactly-once fencing。** claim-first 會在入隊失敗時靜默丟失提醒。跨程序 exactly-once 需要 lease、outbox、acknowledgement 與下游冪等邊界，超出了本設計範圍。

**為固定間隔增加通用週期規則引擎。** 固定時長間隔只需要錨點運算。共享的週期抽象、全域准入門控和日曆求值器會擴大回放與執行時狀態，卻不能服務於固定速率行為。cron 選擇器是獨立的鐘表規則，擁有自己的 Host 所有方言與求值（[cron 輸入](../../../../docs/subsystems/schedule.zh.md#cron-wall-clock-input)）。

## 驗證

包測試以逐檔案 100% coverage 固定固定速率計算、建立錨點、只追趕最新一次、批次選擇、IANA 驗證、夏令時缺口與重疊以及時間邊界。屬性測試會在不同間隔與跳過跨度下比較 Every 計算與回放。

## 後果

- 無需持久 Session 時區狀態或從 Schedule 到 time-context 的依賴，絕對時間輸入仍然具有確定性。
- 固定間隔始終與其建立錨點對齊，每條逾期記錄只呈現一個發生時點，且不會積累回放任務。
- 投遞絕不會誇大型模型成功或 acknowledgement；佇列准入與持久回執之間發生崩潰可能使訊息重複。
