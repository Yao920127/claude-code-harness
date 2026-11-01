# Agent Note: 預設 Web 組合中的 Schedule

Status: implemented

[English](2026-09-24-web-default-schedule-composition.md) | 中文

## Problem

自動化任務頁面、Session 提醒目錄以及 `schedule_*` 工具此前只能透過 `--patch apps/cli/config/examples/schedule/cordis.yml` 進入某個 Web 部署：`packages/bundle/web-app/cordis.patch.yml` 裡的 `ui-schedule` 用戶端行帶 `disabled: true`，而主機行 `time-context` 與 `schedule` 只存在於那個 overlay 中。因此執行釋出版 `web` profile 的人既看不到自動化任務入口，也拿不到提醒工具；同時每個需要它們的消費者都要重複同樣的三行：儲存庫預覽映像自行維護了一份 overlay 列表，兩個 Web 測試套件各自硬編碼了 overlay 路徑。

## Decision

`packages/bundle/web-app/cordis.patch.yml` 在其主機行列表中插入 `time-context` 與 `schedule`，並讓 `ui-schedule` 保持啟用；`packages/bundle/web-app/package.json` 宣告這兩個包，這是 `verify-cordis-config` 對 bundle patch 中裸包名的要求。因此 `web` profile 會交付自動化任務頁面、Session 頁頭的提醒時鐘、空閒 Session 行的時鐘標記與懸停列表、右側欄任務頁籤，並在每個 live 根 Agent 上註冊 `schedule_create`、`schedule_list`、`schedule_update` 與 `schedule_delete`。

`apps/cli/config/examples/schedule/cordis.yml` 已刪除。`applyEntryPatches` 追加 `insert` 列表時不對 id 去重，保留該 overlay 會把 `time-context` 與 `schedule` 掛載兩次；原本引用它的兩個 Web 測試套件與預覽打包器現在只組合釋出版 profile。

`time-context` 隨 Schedule 一起釋出，因為提醒請求本身給出的是牆上時鐘目標。該外掛在每個符合條件的步驟追加一條持久 user 訊息，包含取樣瞬時、附加到目前開放請求的瀏覽器時區，以及自前一條模型可見訊息以來的經過時長。正是取樣瞬時讓模型能把「明天九點」這類請求落成帶偏移量的 `at` 值；該解釋邊界及其要求的顯式時區由 [Schedule 子系統](../../../../docs/subsystems/schedule.zh.md)負責。

主機服務、其儲存 domain 與用戶端半邊都沒有改動。本決策改變的是由哪個組合掛載它們，任務儲存、啟用、投遞與投遞記錄仍由[主機定時訊息決策](2026-09-16-host-schedule-storage.zh.md)負責。

## Recorded sessions

驅動 live 步驟的 Web 情境現在每步記錄一條 time-context 讀數，因此其已提交的 Session 夾具與頁頭 sidecar 都已重刷。一條讀數中的取樣瞬時、瀏覽器時區與經過時長是易變值，`apps/web/tests/scaffold.ts` 的 `normalizeWebSessionVolatiles` 會把它們替換為 `{{timeContextTimestamp}}`、`{{clientTimeZone}}` 和 `{{elapsed}}`。turn 與 step 序號以及"前一條事件"的基線保持可讀，因此夾具仍能顯示模型收到的內容。重刷會在已保留的上一代旁寫入目前 writer 代次（`session.v4.jsonl`），舊代次繼續作為已提交的回放基線保留。

## Alternatives considered

**保留 overlay，不做任何改動。** 釋出版介面會繼續與描述該自動化任務入口的產品文件相矛盾，而每個消費者都要各自保留那三行的副本。overlay 也無法滿足「預設 `dsh web` 程序不帶 flag 就暴露該頁面」這一要求。

**只發布 Schedule 兩行，不帶 `time-context`。** 模型將沒有自己的取樣瞬時，於是提醒請求中未明確限定時區的日期或時間要依賴另一個時鐘來源；overlay 當初正是為此把兩行配對。

**另建一個可選 bundle。** `OPTIONAL_BUNDLES` 面向的是使用者在外掛管理器裡主動開啟的 bundle，與 overlay 是同一種 opt-in 形態；本決策要的是預設 Web 介面自己擁有該頁面與這些工具。

## Consequences

- 每個 Web 工作階段的請求頭多出四個工具 schema，且每個符合條件的步驟追加一條持久 user 訊息。從不建立提醒的對話也要承擔這份 token 成本。
- 時鐘讀數對模型可見且持久，因此它與其他 user 訊息一樣參與回放、壓縮，並出現在匯出的 Session 日誌中。
- 想要恢復舊行為的部署，可在自己的 profile patch 層停用 `time-context`、`schedule` 與 `ui-schedule` 三行；能力本身沒有改動。
- 完整預設表的 `cordis_inspect_query` `listTools` 答案現在超過基礎組合 12,500 token 的內聯預算，因此 spill 策略改為保留該答案的首尾並給出 spill 路徑，而不是完整 JSON。
- 儲存庫預覽映像與兩個 Web 測試套件都不再傳 overlay 參數，一處組合改動即同時作用於所有介面。
