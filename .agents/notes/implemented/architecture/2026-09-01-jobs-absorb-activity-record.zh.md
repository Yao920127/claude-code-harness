# Agent Note：job 註冊表吸收觀測 record；獨立的 activity seam 被移除

Status: implemented

Superseded：下文描述的 record 宣告（`JobStart.record`、`RecordingJob`、`readRecord`、`pumpJobOutput`）與拆分的線路（工作階段控制流上的 `SessionJob.record`、`ctx.jobOutput`）已收斂為一個輸出環與 `ctx.jobs` 上的直接操作——見 [jobs seam 收斂](2026-09-03-jobs-seam-consolidation.zh.md)。把獨立 activity seam 吸收進 `ctx.jobs` 的論證仍然成立。

[English](2026-09-01-jobs-absorb-activity-record.md) | 中文

## 問題

[activity 觀測 seam](../feature/2026-08-24-activity-observation-seam.zh.md) 把即時輸出流做成了 `ctx.jobs` 旁邊的第二個註冊表：生產者要把同一份工作登記兩次（job 管生命週期，activity 管觀測），手工保持兩個終態一致（`observeBackgroundActivity` 要等 `proc.done` 才對映 outcome，防止 pump 失敗把錯誤終態凍上去），透過 `ActivityCorrelation.jobId` 關聯兩行，並給每個觀測呼叫包上註冊表缺失的降級分支。Web 用戶端維護兩份名冊（session-control 的 `jobs` 幀與 activity control 流）並逐行做 join。合併前實測：八個配對呼叫點；生產者人口為——後臺 bash/pwsh（雙註冊表）、PTY 傳送與 subagent 委託（僅 jobs）、前臺 workflow（僅 activity）。

唯一沒有 job 的 activity 是前臺 workflow 映像。拆分帶來的其他一切——獨立觀察者、絕對偏移讀取、有界保留——都是 record 的性質，不是註冊表拆分的性質。

## 決策

`ctx.jobs` 擁有觀測 record；`packages/activity/`、`packages/api/activity-controller` 與 correlation 詞表被移除。

- **`JobStart.record?: true`** 宣告可觀測輸出 record。`run(job)` 現在收到 job 的生產者面——`record: true` 的 start 收到 `RecordingJob { id, append(text, {channel?, gapBefore?}), updateDetail(detail) }`，其餘收到普通的 `RunningJob { id, updateDetail(detail) }`——因此 id 在 starter 執行前簽發（starter 丟擲仍然不登記任何東西；序號被跳過）。starter 內暫存的寫入在登記提交時可見。`updateDetail` 對所有 job 可用，讓 `job_list` 也能看到即時進度行；未宣告 record 的 `append` 記日誌並丟棄。
- **沒有 `end`。** job 結算——生產者 outcome、kill 或 teardown——是 record 唯一的關閉：裁剪到結算保留量並行出最後一個 `onOutput` 訊號。雙結算配對（`ActivityHandle.end` 與 teardown 強結的 first-wins 對帳）被刪除，而非重新實作。
- **`readRecord(id, from, caller)`** 是非消耗多讀者檢視（絕對 UTF-8 偏移，低於保留視窗為 `lossy`），圍欄與其他 job 讀取一致；永不置 `reported`。模型面的 `readOutput` 遊標原樣保留——兩個投影服務不同讀者，刻意保持分離。
- **`jobs-local`** 吸收塊環（`retainBytes` 執行期 256 KiB，`settledRetainBytes` 結算後 16 KiB），`pumpJobOutput` 在 seam 旁替換 `pumpActivityOutput`。生產者把 pump 的末次排空折進 `hooks.done`，讓 record 在結算關閉前握有最後的位元組。
- **wire 按角色拆分。** `SessionJob.record`（恰在 record job 上存在）在工作階段控制流上標記行可觀測；`api-job-controller` 的 `job` 名稱空間上的 `job.follow({sessionId?, jobId, from?})` 流式傳送 anchor/output/status 幀，圍欄讀取者由請求的 session 解析。`api-activity-controller` 刪除；其名冊流是冗餘的（jobs 幀就是名冊），observe 機制位於 `api-job-controller`（`observe.ts`，用戶端 `ctx.jobOutput`），它在自己的 apply 裡解析所依賴的 Remote 面。
- **`ui-activity` 改回上游名字 `ui-jobs`**，渲染單一名冊：`jobsBySession` 行，恰在 `record` 存在時可展開。雙名冊 join 被刪除。
- **前臺 workflow 有意失去即時面板。** `tool-workflow` 的 activity 映像被移除；前臺 run 只透過已記錄的 run/member 生命週期事件呈現，逐行的 `workflow/phase` / `workflow/log` 敘述在 workflow 獲得 `run_in_background` 並登記 record job 之前沒有觀察者。jobs 保持純後臺註冊表——沒有 `foreground` 模式位、沒有模型不可見行、沒有無 run 行。

## 曾考慮的替代方案

- **`foreground: true` job 模式**以保留前臺 workflow 面板：它需要兩個耦合的執行點（出生即 reported 與 `job_list` 過濾），兩者一旦分叉就會雙投遞或向模型洩漏行，而它換來的只是一個可被 `run_in_background` 替代的邊緣特性。
- **用 record 服務模型讀取**（刪除 `readOutput`）：模型讀取是生產者格式化的（截斷與 spill 提示、sandbox 標記）且消耗型；record 是原始、帶 channel 標籤、非消耗的。統一二者要麼把生產者特有格式化搬進註冊表，要麼把噪聲混入觀察者流。
- **保留拆分但共享實作**（公共註冊表庫）：它消除重複骨架，但保留真正的成本——雙重登記、終態配對、correlation、第二條 wire 名冊與第二個包族。

[先前 seam note](../feature/2026-08-24-activity-observation-seam.zh.md) 反對用持久工作階段事件或 control 流承載即時輸出的論證仍然成立並原樣沿用：record 是程序本地觀測狀態，從不是工作階段事件，「模型可見 ⟺ 已記錄」不受影響。

## 評審修正

對已合併設計的評審確定了上文各節未言明的五點：

- **泵的等待資源恆定。** `pumpJobOutput` 對生產者的 `done` 只訂閱一次，同一時刻只保留一個待觸發的 timer；結算清掉 timer 並喚醒目前等待。此前每個輪詢輪次都對同一個 pending promise 賽跑，每輪留下一個 reaction 直到任務結束——預設節奏下跑一天的任務會累積上百萬個閉包。
- **用戶端解除安裝等待載體靜止。** `ctx.jobOutput` 的 effect disposer 是非同步的，await 每條開啟的 `RemoteStream.dispose()`：Cordis 會 await 非同步 disposer，而一個在舊 iterator 仍在關閉時就宣告解除安裝完成的 fiber，在 HMR 下可能與下一個外掛實例重疊。
- **名冊標記 record，不計位元組。** `SessionJob.record: true` 取代了 `outputTotal`：`append` 不提交名冊變更（只有生命週期提交觸發 `onJobsChanged`），映像的計數在輸出到達的瞬間就陳舊了；而為一個沒有任何行需要的數字按 append 廣播整份名冊被否決。即時偏移隨觀測流的 `opened` 錨幀到達。
- **record 是盡力而為的即時預覽。** 生產者按輪詢輪次複製 stdout 與 stderr，同一視窗內的寫入先 stdout 落實；pipe 捕捉無法還原真實交錯（只有 PTY 或 `2>&1` 可以），用戶端拼接 chunk 時也不區分 `channel`。`channel` 留在 wire 上，因為它正是讓這一限制可見、也是將來區分渲染 stderr 所需要的東西。
- **宣告決定生產者面的型別。** `JobStart` 是按 `record` 判別的聯合型別：`RecordingJobStart.run` 收到 `RecordingJob`，`PlainJobStart.run` 收到沒有 `append` 的 `RunningJob`，註冊表給普通 job 建構的面根本沒有這個方法——註冊表無處存放的輸出成為不可表達，而不是警告後丟棄。
- **Web e2e 的保活是 barrier 而非時鐘。** 後臺命令守在測試擁有的、位於 job cwd 的檔案上，由情境顯式 kill，因此 CI 卡頓不可能先把任務結算掉；每個情境是一個測試，絕不是共享 job id 的測試鏈。

## 後果

每個可觀測行都是可 kill 的 job；沒有生命週期的純觀測面需要新的歸屬（harness 診斷屬於 inspector 平面，不在這裡）。未來的遠端 job provider 必須同時實作生命週期與 record。record 的保留設定在 `jobs-local`；觀測 wire 的節奏設定（`observeFlushMs`、`observeMaxFrameBytes`）在 `api-job-controller`。
