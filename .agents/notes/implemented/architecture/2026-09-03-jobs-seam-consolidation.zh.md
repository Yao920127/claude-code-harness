# Agent Note：後臺 job 的一個輸出環、一個投影、一條事件流

Status: implemented

[English](2026-09-03-jobs-seam-consolidation.md) | 中文

## 問題

job seam 是逐步堆出來的。生產者要把輸出宣告兩次——模型讀取的消耗式 `readOutput` 掛鉤，以及觀察者讀取的可選 `record: true` 環——註冊表也為同一個 job 保留了兩套詞彙（模型側的 `JobSnapshot`、工作階段控制流上的 `SessionJob`、觀測線路上的 `JobWireChunk`）。三個監聽器家族（`onJobDone`、`onJobsChanged`、`onOutput`）用不同的擁有者過濾投遞彼此重疊的事實，註冊表自己還跟蹤著只有模型側工具才解釋得了的 `reported` 位。合併後設計的評審把介面層稱作最薄弱的部分：讀者分不清 `read`、`readRecord`、`JobStart`、`RecordingJob` 與 `updateDetail` 裡哪些是約定、哪些是歷史遺留。

## 決策

- **每個 job 一個環。** `JobSpec` 取代 `JobStart`：spec 宣告可選的拉取式 `output` 源（`JobOutputSource`，子程序的 `readFrom` 家族），由註冊表按自己的節奏（`dsh-jobs-local` 的 `pumpPollMs`）泵送；每個生產者都收到一個 `JobHandle`，其 `append` 把塊推進同一個環。模型的消耗式讀取與每個觀察者的絕對偏移讀取服務同一批位元組；`readOutput` 與 `record` 判別欄位被移除。shell 生產者把它們的 `observed` 偏移讀取器交給註冊表，並把沙箱事實折進終態 `detail`；terminal 生產者透過一個計位元組的源適應其消耗式傳送讀取器；subagent 把回答作為 `JobOutcome.result` 返回，結算後的第一次讀取攜帶它一次。
- **兩個遊標，一份儲存。** `JobRegistry.read(id)` 是有狀態的模型遊標；`JobRegistry.readAt(id, from)` 是無狀態的觀察者讀取。模型讀取排除 `log` 塊（給觀察者的生產者敘述），並渲染 stdout，再接一段 `[stderr]`，與 shell 工具一貫的做法完全一致。
- **`updateProgress` 取代 `updateDetail`。** `JobView.progress` 是即時行，結算時清除；`JobView.detail` 是終態原因，合併了模型 `job_kill` 給出的原因。
- **一個投影。** `JobView`（用戶端安全葉子 `@deepseek-ai/dsh-jobs/view`）是模型工具、瀏覽器名冊與觀測幀共同消費的形狀；`owner` 是工作階段 id，從不是 `Agent`。
- **直接傳入呼叫方的操作。** `JobRegistry.list`、`get`、`read`、`readAt`、`kill` 與 `wait` 在每次呼叫時接收呼叫方工作階段。省略呼叫方時僅允許存取無主 job。輸出環與瀏覽器流不需要獨立的呼叫方操作物件。
- **一條事件流。** 帶 `{ owner }`、`{ owners: 'scope' }` 或 `{ owners: 'all' }` 過濾的 `events.subscribe(filter, listener)` 取代三個監聽器家族。`settled` 標出原因（`producer`、`kill`、`teardown`）；`output` 只攜帶 id 與新的 total。
- **播報臺帳移到 `dsh-tool-jobs`。** 註冊表不再跟蹤 `reported`。工具在等待開始時認領 job（超時或中止則撤回），在 `job_kill` 被接受時也認領；結算事件刪除條目，teardown 結算與無主 job 被跳過，投遞目標是結算時登記在擁有者工作階段下的 agent。
- **名冊離開工作階段控制流。** `dsh-api-job-controller` 在 `job.follow` 旁擁有 `job.list({ sessionId })`——每輪聚合過的生命週期提交之後發一次整集幀，從不按追加發——其用戶端安裝 `ctx.jobs`（`watchRows`、`observe`、一份快照）。`dsh-api-session-controller` 只承載佇列與投影；`ui-jobs` 在掛載期間關注其工作階段的名冊，行在 job 進行中或留有保留輸出時可展開。

`attachController` 與相對擁有者的 `servesOwner` 門保持原樣；沒有掛載控制器的生產者是否可以提供 `run_in_background`，因為這個缺口早於本次變更，暫不處理。

## 考慮過的替代方案

- **保留三個監聽器並共享一個擁有者過濾。** 它保住了堆出來的名字，卻保不住評審要的性質——一個地方就能學會註冊表宣佈什麼——而且 `onJobDone` 的精確擁有者投遞正是迫使註冊表在每個投影裡保留 `Agent` 的原因。
- **把 `reported`留在註冊表。** 只有工具知道哪些投遞到達了模型（等待的工具結果、kill 的確認）；註冊表只能近似，而這個近似正是評審列出的重複播報與漏播報 bug 的來源。
- **把名冊留在工作階段控制流上。** 省了一條 Remote 流，卻把工作階段控制器耦合到 job 註冊表，還映像了一個環的位元組數如今直接回答的 `record` 標誌（`output.total`）。
- **也把 `log` 塊交給模型。** 生產者敘述是給觀察者的；模型已經透過 `progress` 與終態 `detail` 收到同樣的事實。

## 後果

模型可見文字保持不變：狀態行、工具描述與 schema、播報措辭逐位元組相同，唯一新增的模型可見事實是 `killed` 狀態行現在攜帶的 kill 原因。需要流式輸出的生產者選擇拉取源或 `append`，從不格式化消耗式增量。Web 用戶端把每個進行中的 job 渲染為可展開，因此從不寫輸出的 job 顯示為空的執行中面板而非靜態行。`JobKindMap` 的合並行生在主機側，瀏覽器程式把 `JobView.kind` 視為它認識的 kind 集合，其餘當作不透明字串——名冊對它也只做這些。

合併 master 之後的評審跟進收緊了其中四條邊。job 的第一個事件永遠是 `registered`：通告先於泵，而泵的首輪 drain 同步執行且可能通告輸出。已結算的環在模型的首次終態讀取之前保留模型遊標尚未消費的全部位元組，因此在首次 `job_output` 之前結束的 job 不會丟失執行期上限保留的任何內容。`dsh-tool-jobs` 為每次等待呼叫儲存一條帶 `live` 標記的認領，呼叫方 abort 時在 abort 事件裡同步清掉該標記，因此註冊表的拒絕尚未傳回工具之前宣佈的結算仍會投遞通知；超時的等待只丟棄自己的認領，並行的另一個等待仍覆蓋該結算。瀏覽器把先於錨點發生的觀察失敗記錄為帶錯誤的檢視，面板顯示提示而不是留白。`@deepseek-ai/dsh-jobs/invariant` 伴生外掛驗證每個 job 的事件協定（先 `registered`、恰一次結算、最後 `removed`）以及每個通告的投影與註冊表自身讀取的一致性，這正是[伴生外掛規則](../simplification/2026-08-28-omit-unneeded-invariant-companions.zh.md)要求的交叉觀察；先前只針對單個檢視的欄位驗證已刪除。拉取源保留的 spill 檔案是 job 中繼資料（`JobView.output.spillPaths`，每次泵讀取都會上報，讀取不再點名時即撤回），不是逐塊中繼資料；模型讀取對生產者側缺口與環淘汰都渲染 shell 工具的丟失輸出提示並列出這些檔案，即使缺口塊本身已被淘汰——本次變更曾引入的 `before this read` 變體已刪除。觀察生成過程若在流中看到其 job 被移除（擁有者 teardown），以被移除 job 的終態投影收尾，而不是一次失敗的讀取。被拒絕的後臺 spawn 不產生任何程序輸出，因此 shell provider 現在把 `spawn failed: …` 提示作為 observed stderr 的整條流提供（消耗式讀取仍只折入一次），且 `ShellProcess.observed` 及其兩個讀取器改為必填：這類失敗之後模型的首次 `job_output` 讀到的正是 master 的消耗式讀取所渲染的內容。
