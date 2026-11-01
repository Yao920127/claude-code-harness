# Agent Note: 歷史 Session 在寫入釋出前提供只讀遷移結果

Status: implemented

[English](2026-09-05-read-only-session-migration-preparation.md) | 中文

## 問題

有狀態 Stage pipeline 已經把歷史 Decode 與 migration 恢復到有界、高效能的資料流，但序列 persistence open 仍會在返回任一種 handle 前執行 encode、sync、Worker verification、publication 與 committed reopen。只讀 consumer 因此需要額外等待約 2.2 秒不需要的工作，而且僅為展示歷史就會修改儲存。

### 序列 readable 的額外代價

- 歷史分頁、projection preparation、export 與 `session.follow` 的 opening snapshot 只需要已經驗證的 current logical artifact。
- Historical read open 仍會建立並 sync 臨時 v2 generation、啟動完整 verification Worker、複查 source、釋出 v2 並重新開啟 target。
- Migration 在 encode 前已經得到完整 current artifact，但序列 API 只返回 committed physical snapshot。Persistence 必須再次 Decode current bytes 才能重建相同邏輯事件。
- `session.follow` 必須等 publication 完成後才能發出 opening snapshot，而 Agent resume 才是第一個真正要求 append 權限的操作。
- Read-only storage 無法提供邏輯上有效的歷史 Session，因為 read open 強制釋出 generation。

### 直接拆分會破壞 lifecycle 保證

- Verify 前返回 write handle 會讓 append 寫入 unpublished temporary file，併為已接納事件引入第二種 durability state。
- 每次 read 後自動啟動 publication，需要 backend 負責 task failure、shutdown、cleanup，以及後續 writer 加入一個自己沒有請求的任務。
- Shared preparation 不能繼承第一個 caller 的 AbortSignal；一個 reader 取消不能終止其他 waiter 仍依賴的工作。
- Read handle 必須先提供 prepared memory，並在其他 caller 釋出後切換到 current file 與其 append tail。
- Reader 已經觀察一個 prepared artifact 後，source drift 不能悄悄重跑 migration 並替換成另一份邏輯歷史。

## 決策

JSONL backend 將 logical preparation 與 durable publication 分開。Read open 只等待 preparation；write open 複用 matching preparation，並在返回 writable handle 前等待 publication。

### Prepared generation API

```text
interface PreparedJsonlMigration {
  readonly sourceIdentity: JsonlPhysicalIdentity
  readonly artifact: SessionFormatArtifact
  publish(): Promise<JsonlPhysicalIdentity>
}
```

`prepareJsonlMigration()` 讀取一個穩定 historical revision，只執行一次完整 Stage chain，並在不 encode、不寫檔案的情況下返回 current artifact。`publish()` 是冪等操作：並行與後續呼叫共享同一個終態 Promise（包括拒絕結果），不會對同一 prepared artifact 重複 encode。

`publish()` 把 current records 流式寫入同目錄排他建立的 temporary file，執行 sync，等待 bounded Worker verifier，比較 preparation 捕捉的 source identity，再透過 no-overwrite 操作釋出 canonical path。成功 publisher 複用 prepared logical artifact，不重新 Decode 自己的 target。競爭失敗者只驗證 winner 以精確 staged migration prefix 開頭；append tail validation 仍屬於 current reader。

Publication 呼叫後會執行到 settlement，不會被 write caller 中途取消。Write open 會在 publication 前後檢查 caller signal，因此取消可能在後繼已經提交後拒絕 open，但不會洩漏 write lease。Source identity 變化會丟擲 `JsonlGenerationSourceChangedError`、刪除臨時檔案，並且不會重複 Decode 或 migration。

### Preparation ownership 與取消

Persistence backend 按 Session id、selected source path 與 stat-derived revision 儲存一個 in-flight entry：

```text
interface MigrationPreparation {
  sourcePath: string
  sourceRevision: SessionPersistenceRevision
  controller: AbortController
  promise: Promise<PreparedStoredLog>
  settled: boolean
  waiters: number
}
```

新的 read/write open 只有在 source path 與 revision 仍匹配時才加入已有 entry。`waitWithAbort()` 讓每個 caller 的 AbortSignal 與 shared Promise 競爭，但不會把 caller signal 傳給共享工作。只有最後一個 waiter 在 preparation 仍執行時離開，backend-owned controller 才會 abort。取消測試暫停物理讀取，並在取消一個 caller 前觀察到兩個已註冊的 waiter；僅讓出一次事件迴圈不能證明非同步路徑與 revision 查詢後的加入已經完成。

完成結果進入既有 bounded `coldLogMemo`。`StoredLog` 判別欄位把已釋出 current state 與 `PreparedStoredLog` 分開，後者的 `publication` 欄位把 current logical events 與匹配的 publication operation 繫結，使 query 後緊接的 Agent resume 複用同一次 Decode 與 migration。In-flight map 只擁有執行中的工作，不是第二個 completed-result cache。

`SessionHandle.read()` 會報告 event value 是 detached 還是 shared-frozen。JSONL backend 在 memo 化前只對每個已解碼 event graph 深度凍結一次，並在該處建構 `shared-frozen` 結果；後續讀取和 slice 即使為空也會保留生產者建立的狀態。`readColdSessionLog()` 將這些 event 與本地獨佔的 interrupted-turn closer 組合，並透過 `SessionObservationReader` 繼續傳遞 `eventState`；`Session.fromRestore()` 只總和檢查碼接管 seed，不再複製或凍結。普通 create 與 fork seed 繼續使用 defensive snapshot 路徑。

Read-only restoration 會驗證 Session runtime 直接依賴的 event 與 settlement 欄位，但不會展開每一段嵌入式 Assistant stream。Publication Worker 繼續執行完整 stream replay，並在提交 migrated successor 前驗證 content、usage 與 replay state 一致性。已有目前格式檔案信任其 writer；需要展開 compact stream 的 consumer 會在讀取時驗證 record。

### Read handle 切換

Current generation 不存在時，read open 會採用在 `state.primed` 中儲存 prepared events 的 handle。後續每次 `read()` 都重新解析 current path：

```text
if current generation is absent:
  return slice of primed events
else:
  clear primed events
  read current generation and enforce non-shrinking history
```

因此，一個已有 historical Session 也可能讓 `resolveCurrentLog()` 返回 `undefined`：它回答的是 current canonical file 是否存在，而不是 Session 是否可讀。公開 `stat` 與 `list` 繼續發現 historical header。

### Write-open publication

Write open 先取得程序內 claim 與核心支援的跨程序 lease，再重新解析 selected generation。如果它仍是 historical，就取得或複用 prepared `StoredLog` 並等待 `publish()`。之後才返回以 prepared events 為 primed state 的 write handle。

```text
write open
  → claim process-local ownership
  → acquire SessionWriteLease
  → re-resolve generation
  → join or create preparation
  → encode + sync temp
  → Worker verify
  → source identity check
  → no-overwrite publish
  → return writable handle
```

Handle 返回前，外部 caller 無法 append。因此 `append`、`flush` 與 `close` 保持普通 current-generation 行為，不需要“publishing”分支。Service `flush()` 繼續只 flush 已經 adopt 的 writer；它不會把 read-only preparation 轉成 write。

### Follow 與 Agent promotion

`session.follow` 透過 read path 開啟歷史、恢復 Session 與 projections、發出 opening snapshot，然後啟動 Agent promotion。Agent resume 使用 write open，因此會在 Agent 接收新一輪對話前等待 publication。歷史可見與寫入就緒成為兩個明確時間點，同時不引入 unpublished append state。

## 問題與方案對照

| 序列流程問題 | 實作機制 | 保證 |
|---|---|---|
| Read-only caller 等待 encode 與 verify | Read open 返回 prepared events | 首屏只等待 Decode + migration |
| 並行 historical open 重複工作 | Session/source-revision keyed single-flight | 每個 selected revision 只遷移一次 |
| 第一個 caller 擁有共享取消 | Caller-local `waitWithAbort()` + backend controller | 單個取消不終止其他 waiter |
| Query 與 resume 之間丟失 preparation | Bounded memo 中的 `PreparedStoredLog.publication` | Write open 複用相同 artifact |
| Read handle 沒有 current path | Primed in-memory read | Publication 前 historical data 可讀 |
| Read handle 需要觀察後續 append | 重新 resolve，並從 primed data 切到 current file | Publication 後已有 handle 收斂 |
| Verify 前 append 不安全 | Write open 返回前完成 publication | 返回 writer 立即具備普通 durability |
| 自動後臺 publication 無 owner | 只有 write open 呼叫 `publish()` | Read-only access 不產生 orphan write task |
| Reader 已看到 artifact 後 source 改變 | Publication 失敗且不重跑 migration | 已暴露邏輯歷史不被靜默替換 |

## 驗證

Benchmark 使用 Stage 決策中的同一份 116,228,655-byte v0 Zstandard Session。第一張表比較 migration 工作涉及的全部實作；後續排程明細則保持 #3585 與 preparation-first 使用同一條 Codec/Stage chain，僅改變 persistence 排程。

### 使用者首次開啟歷史資料

| 實作 | Session restore | CPU | Peak RSS | Retained heap | 結果 |
|---|---:|---:|---:|---:|---|
| 原高效能 v0 reader | 4.594s | 6.048s | 2.720GB | 2.016GB | 不遷移，讀取約 914 萬個 v0 event |
| Master whole-artifact v0-to-v2 migration | >72.8s | — | Decode 階段達到至少 7.219GB | — | 返回 handle 前 OOM |
| #3585 streaming migration + 序列 publication | 6.241s | 8.493s | 2.107GB | 477MB | 生成並行布包含 72,784 個 event 的 v2 Session |
| #3586 preparation-first 排程 | 2.954s | — | 1.026GB | 463MB | 生成相同 v2 Session，並把 publication 延遲到 write open |

Preparation-first restore 比 #3585 快 53%，也比原高效能 reader 快 36%，同時仍然完成 artifact 到 v2 的 migration。

### 排程觀測點

| 使用者觀測點 | 序列 publication | Preparation-first | 變化 |
|---|---:|---:|---:|
| Read open + Session restore | 6.241s | 2.954s | -53% |
| `session.follow` opening snapshot | 7.587s | 2.912s | -62% |
| Agent 得到 writable Session | 6.246s | 5.161s | -17% |
| 已是 current v2 的再次開啟 | 1.284s | 0.964s | -25% |
| Follow opening-snapshot peak RSS | 2.353GB | 1.059GB | -55% |

Preparation 中約 2.61 秒用於 Decode 與 migration。延後的 publication 約為 2.56 秒：encode/write/sync 0.83 秒、嚴格 Worker verification 1.72 秒、source check 與 atomic publication 約 0.005 秒。Read-only 請求完全不執行這段 publication。

Prepared artifact 與 Session restore 的 peak RSS 約為 1.03 GB。Preparation 與 Worker verification 同時存在時峰值約 2.19 GB，因為 parent 保留 logical artifact，而 Worker 獨立驗證 physical generation。

測試覆蓋 shared-waiter cancellation、all-waiter cancellation、memo handoff、read-handle switching、source drift、winner collision、publication idempotence、write-open ordering、Worker failure 與 plain-Node bundled Worker entry。

## 後果

Read-only body access 不釋出 generation。第一個 writer 會在 append 前支付一次 publication。已設定的 JSONL root 仍必須可讀且結構有效，但 historical body migration 本身不要求寫 successor。

Bounded memo 會保留一份 migrated event array，用於連線 read 與 write open。這是有意的取捨：不保留該 artifact 就必須重複 Decode 與 migration，或者無法提前提供 read。

Publication failure 會拒絕 Agent resume 和其他 write open，但不會使已經從 unchanged historical source 交付的 read result 失效。Source drift 對該 write attempt 是 terminal failure，不會觸發 hidden state 重算。

Backend 仍存在一個更廣泛的既有 lifecycle 缺口：dispose 不擁有每個尚未返回 handle 的 `create()` 或 `open()` operation。本決策不會向 `flush()` 增加 migration-specific tracking，也不解決通用 pending-operation 問題。

## 考慮過的替代方案

- **每個 open 都保持序列 publication**——physical state 最簡單，但讓 read-only 首屏多等待約 2.2 秒並要求儲存可寫。
- **Read 後自動後臺 publish**——需要 backend task ownership、shutdown quiescence、error reporting，以及 writer 加入一個沒有 caller 請求的任務。
- **Verify 前返回 writer**——要求 append 寫入 unpublished stage，併為已接納事件增加一種 durability 與 failure state。
- **每個 caller 獨立 preparation**——重複最重的 Decode 與 migration，並在 list/follow/resume 並行時放大峰值記憶體。
- **讓第一個 caller signal 取消共享工作**——使後續 caller 依賴無關的 cancellation timing。
- **Source drift 後重跑 migration**——可能替換已經展示給 reader 的歷史，也會讓一次邏輯 operation 重複處理同一大檔案。
- **Read handle 永遠停留在 primed memory**——無法觀察後續 append，並偏離普通 persistence refresh 行為。
