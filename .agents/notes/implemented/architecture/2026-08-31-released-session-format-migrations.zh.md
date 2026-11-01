# Agent Note: 已釋出 Session 格式透過有狀態流式 Stage 遷移

Status: implemented

[English](2026-08-31-released-session-format-migrations.md) | 中文

## 問題

Session 格式 v0 已隨 alpha 版本釋出，因此結構化 writer 變更不能再把已有 JSONL 當作可丟棄的預釋出狀態。第一版 whole-artifact migration 讓這些日誌在語義上可遷移，但它的資料模型會讓一份 116 MB 真實 Session 在返回 handle 前耗盡 16 GB Node 程序。

### Whole-artifact 效能問題

- Zstandard 輸入包含 317,540 個 frame，每個 frame 都單獨執行一次非同步解壓。實作先保留全部 plaintext frame，再在 JSON 解析前統一拼接，因此建立了同等數量的 Promise、執行緒池與 native Decode 排程。
- Physical Decode 會在同一請求的重疊階段物化完整 plaintext Buffer、完整字串、全部 JSONL row、展開後的 source events、遷移後的 target events、編碼後的 target rows、拼接後的目標字串與目標 physical Buffer。
- 每個 codec 與 migration edge 都會呼叫 `snapshotSessionFormatJson()` 或 `snapshotSessionFormatArtifact()`，在相鄰遷移前後遞迴複製並 deep freeze 完整 header、row、payload 與 event array。
- 已釋出的 packed Assistant chunk 會先展開成約 914 萬個 v0/v1 邏輯事件，再由 v1-to-v2 摺疊成 72,784 個 current events。Whole-artifact API 要求兩種表示和 old-to-new seq map 同時存活。
- Encode 會在記憶體中建構完整 JSONL 與壓縮輸出。成功路徑隨後 Decode staged target、Decode committed target，並由 persistence 再 Decode 一次以建立業務物件；它還會完整重讀 source 以比較 fingerprint。
- 逐 frame `await` 沒有形成有意義的有界排程。遷移前的高效能 reader 會複用一個同步 decoder，只由外層迴圈約每 500 ms yield 一次，從而避免數十萬次非同步切換。

### 既有介面使單點最佳化無法組合

`SessionFormatCodec` 以完整陣列 Decode 與 Encode；每條相鄰 `SessionFormatMigration` 接收並返回完整 `SessionFormatArtifact`；compiled chain 只能把已經物化的 artifact 交給下一條 edge。因此即使 physical decoder 單點變快，下游仍會重新建立 source-row array、expanded-event array、逐 edge snapshot 與 target-row array。

Migration 實際有狀態，但 API 把它們表現為一次性函式。v0-to-v1 需要跟蹤 message 與 retry identity；v1-to-v2 需要暫存一個尚未結算的 Assistant attempt、被它阻塞的後續事件，並維護 old-to-new seq 引用。把這些狀態隱藏在 closure 或 push/finish helper object 中，會讓執行結構與靜態宣告分離，也讓 production、Worker verify、fixture 與 replay 使用不同入口。

## 決策

Session format 包採用有狀態同步 Stage API。靜態 migration declaration 描述一條相鄰版本邊，併為每次 artifact restore 建立新的 stage。Stage 擁有該 artifact 的可變狀態；不同 Session 之間絕不共享 stage instance。

### Stage 與 Context 協定

```text
interface SessionFormatMigrationContext {
  emitEvent(event: SessionFormatEvent): void
  emitRun(run: SessionFormatEventRun): void
}

interface SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  transformEvent(
    event: SessionFormatEvent,
    context: SessionFormatMigrationContext,
  ): void
  transformRun(
    run: SessionFormatEventRun,
    context: SessionFormatMigrationContext,
  ): void
  finish(context: SessionFormatMigrationContext): number
}
```

`SessionFormatMigrationContext.emitEvent()` 與 `emitRun()` 都是同步操作。Producer 會宣告其發出單個事件還是緊湊 run，因此熱路徑不會根據已解析檔案物件的屬性推斷類別。排程歸 caller 所有，context 在每次呼叫時傳入，而不是把 callback 注入 stage constructor。一個輸入可以輸出零個、一個或多個值，不需要分配臨時返回陣列，也不需要 stage 內部保留輸出佇列。

`SessionFormatMigration` 繼續作為 immutable declaration，宣告版本號、header migration、target-header validation 與 `createStage()`。`CompiledSessionFormatChain` 只驗證一次唯一、無缺口的 edge 序列，按 source-to-target 順序建立每次 artifact 獨佔的 stage，再按反方向用 context 連線它們。`finish()` 按 source-to-target 順序關閉 stage，使每一級都能在下游關閉前發出尾部資料。

```text
JSONL record
  → released physical row decoder
  → v0-to-v1 stage
  → v1-to-v2 stage
  → v2-to-v3 stage
  → v3-to-v4 stage
  → current event collector
```

Chain 中不存在 `flatMap`、spread expansion、中間 event array 或 scheduler。只有在每個 migration stage 都已獲得直接消費 compact run 的機會後，最終 event collector 才會展開它。

### 相鄰版本所有權

[V3 到 V4 規範](../../../../packages/session/session-format-v3-to-v4/README.zh.md#v3-to-v4-specification)規定父目錄補全：它推進 header 版本，保留已接納的事件與繼承切點，並根據子 Session 證據追加缺失的自身目錄記錄。它複用 V2→V3 中凍結的 V3 codec。按 generation 驗證 delivery 可防止歷史確認僅因 header 變化而獲得目前水位含義；更早的 migration edge 保留各自的來源准入策略。

[V2 到 V3 投遞保護](../../../../packages/session/session-format-v2-to-v3/README.zh.md#delivery-guards)防止源代中被忽略的標記僅因頭部變化就成為有效上傳水位。Python 釋出冒煙測試獨立於跨代 golden 比較，按原始碼中的 `SESSION_FORMAT_VERSION` 檢查生成日誌，因此檔名與 header 自洽不能掩蓋過期 writer。

[V2 到 V3 README](../../../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)是該遷移邊轉換、保留與拒絕規則的單一規範真源；單列的[原生准入章節](../../../../packages/session/session-format-v2-to-v3/README.zh.md#native-v3-admission)避免將僅目前版本支援的能力誤認為歷史轉換。已釋出 V2 codec 仍歸 V1→V2 所有，並被複用而非複製。[系統提示詞](2026-09-02-system-prompt-as-surface-node.zh.md)、[PTC](../feature/2026-06-15-ptc.zh.md)和[規範信封](2026-09-06-v3-canonical-session-envelopes.zh.md)記錄保留各自獨立依據，而非重複轉換規範。[格式版本實操手冊](../../../../docs/cookbook/adding-a-session-format-version.zh.md)負責包接線、目前消費方、快照後繼代際與驗證命令。

歷史內容准入歸入邊所有，而非原生 V3 擴充功能驗證。在不瞭解欄位的情況下保留未知塊，不能證明遷移保留了其含義。因此，[源審計](../../../../packages/session/session-format-v2-to-v3/README.zh.md#source-audit)在明確歸其所有的內容位置（包括未完成的流）使用同一歷史種類集合。它檢查已接納的內容而不改寫，並且不解釋歸其他所有者所有的不透明 JSON。收緊原生准入或修改凍結的前代驗證器，會改變獨立承諾，而非證明轉換安全。

預設更名覆蓋建立頭部和每條選擇事件，因為最新選擇決定恢復時的預設，而更早的選擇決定歷史 fork 的預設。只改寫最後一條選擇會丟失這種區別。已釋出的 `code` 標識表示舊內建預設；遷移不依賴已安裝的預設列表，因此相同位元組在每臺主機上產生相同結果。原生 V3 的自定義標識仍可使用，無需全域執行時別名。

源繼承數量在 EOF 前可能未知：V2 從種子標記推導它，而 V1→V2 可以改變事件數量。遷移鏈將這種缺失傳遞給下一個 Stage，而不偽造數量。[V2 到 V3 繼承規則](../../../../packages/session/session-format-v2-to-v3/README.zh.md#sequence-references)支援此情況；需要 header 提供數量的舊 Stage 仍在數量缺失時拒絕。這使有種子的多跳恢復無需保留中間產物陣列。

[版本與釋出狀態參考](../../../../docs/session-format-status.zh.md)擁有已釋出格式記錄，並指明程式碼中的寫入器真源。已釋出格式保留其語義；遷移期間已提交代際的位元組保持不變。對已釋出目標格式的破壞性變更必須按[版本規則](2026-08-10-session-log-version-mechanism.zh.md)新增下一條相鄰遷移邊。傳入轉換器修復影響之後的歷史轉換，不影響已有目標格式檔案；[cookbook](../../../../docs/cookbook/adding-a-session-format-version.zh.md)擁有相容性評審和 alpha 支援政策。普通事件新增遵循該規則的必需事件拒絕機制，而非自動分配版本。整合測試使用隔離、可丟棄的 home 和未變更的歷史輸入。

[已提交語料清單](../../../../packages/test-support/llm-replay/tests/session-format-corpus-inventory.ts) 按源路徑、代際與精確拒絕原因標識有意不支援的歷史轉換。保留這些產物不能迫使遷移改變時序，也不能允許統一跳過：每個清單中的產物仍必須丟擲型別化遷移拒絕，未列入的產物必須還原。原生目前代際 fixture 不經過入邊，因此不能被歸為不支援。沒有版本 header 的測試框架協定範例保持為獨立的顯式類別。語料測試在還原成功和拒絕後都檢查源位元組；它不透過改寫歷史證據來滿足目前 reader。

### Physical codec 與 packed run

每個 released codec 會用顯式 `strict` 或 `recoverable` 策略建立 row decoder。Decoder 每次透過不同的 context 方法驗證並 emit 一個 event 或 codec-owned `SessionFormatEventRun`。v0-to-v1 與 v1-to-v2 都實作 `transformEvent()` 和 `transformRun()`，因此 packed Assistant chunk 可以直接到達 folding edge，無需先變成數百萬個普通事件。

v0-to-v1 除了有限的 released-v0 歸一化外，會保留邏輯 header、seq、引用、時間戳與 payload。它轉換已移除的 `steering/message` 與 `compact/*` 事件名稱，接受出現在對應 `step/end` 之後的已釋出 `llm/retry`，按 turn／step／provider／policy chain 為缺失的 `llm/retry.retryId` 確定性補值，併為省略 id 的舊 compaction group 確定性補充同一個 `compactionId`。v1-to-v2 負責 attempt folding 與引用重寫，並且只 emit 已結算的 v2 event。它會把舊的 goal 來源 user message 拆成 `goal/change` 與原本的模型可見 message。它還會為一種有限的已釋出 restart 插入 interrupted `turn/end`：一個沒有 open step 的 open turn 後出現非空 `next-turn` inbox splice，隨後直接開始編號連續的下一輪。

V3-to-V4 邊對直接寫成 V3 的日誌應用同樣的有限 restart 修復。將修復保留在遷入邊，可以維持[原生 V4 生命週期驗證](2026-09-17-native-v4-read-validation.zh.md)；若在那裡接受重複 start，新日誌也會允許生產者損壞。插入事件要求重對映本地引用與繼承截點，而捕捉代際保留原座標。[格式規範](../../../../packages/session/session-format-v3-to-v4/README.zh.md#sequence-references)負責定義具體證據和欄位。

Catalog 為 production、Worker、fixture 與 replay 暴露同一個 `createRestore()`。Recovery policy 與最終 validation policy 在 restore 建立時一次確定。Historical production 使用 recoverable source parsing 與 transformed-current validation；這種策略會在遷移後驗證已釋出 current 結果，而已經是 current 的輸入只接受 codec 驗證。Worker 與 fixture verification 使用 strict parsing 與已安裝 current 格式的完整 restoration。Migration stage 或 transformed-current validation 的拒絕會保持為 `SessionFormatUnsupportedMigrationError`；物理解碼失敗仍是 corruption。Test support 只保留 fixture 自身需要的 token 和 envelope materialization。

### JSONL 串聯

JSONL provider 只掃描一次 frame boundary，複用一個 Zstandard decoder，增量解析完整 JSONL record，並把 row 直接送入 catalog restore。外層迴圈按有界 cadence yield；不存在逐 frame `await`、完整 plaintext 或 source-row array。

Current encode 以單條 record 為單位。Provider 在主執行緒每個 slice 序列化約 1 MiB plaintext，透過一個會傳播 source error 的 Zstandard context 流式壓縮，以 4 MiB batch 寫入同目錄排他建立的臨時檔案，並在 publication 前 sync。程序級 scheduler 最多允許兩個完整 verification Worker 並行，並把釋放的 permit 直接交給最早的 waiter。

釋出的 `lib/worker.cjs` 將 JavaScript workspace 依賴一起打包，使每個新 verifier 無需解析並編譯它們的執行時模組圖。Worker 只透過普通 request/result 訊息通訊，與 host 不共享 service 或 class identity，因此可以這樣處理。Host build 應用現有 TypeScript 與 Typert 轉換；Client pass 跳過這個 Node-only package，不會用未經轉換的原始碼覆蓋 worker。Native add-on 保持 external。Verification、scheduler admission、termination 與 durable publication 仍在 writable open 返回前完成。Built-worker 冒煙測試把 package manifest 與 worker 複製到隔離的臨時 package，移除環境中的模組搜尋路徑，接受有效 generation，並拒絕錯誤的 event count。

[瀏覽器 preview 打包器](../../../../packages/experimental/webworker-packer/README.zh.md)在 Node 中為隨包 Session 資料準備目前代際後繼，並使用同一根目錄中直屬子 Session 的 descriptor 作為父目錄證據。瀏覽器 host 未實作 `node:worker_threads`，因此打包階段的準備同時保留不可變 fixture 代際與執行時 JSONL 的 Worker 驗證要求。

Preparation 會把 cancellation 傳給 source read，並在現有的約 500 ms Decode yield 邊界觀察它。`publish()` 一旦開始，encode、Worker verification 與 publication 不接收 caller cancellation，並執行到終態；write open 會在之後再次檢查 caller signal。已經發布的 generation 絕不會復原。

Stage pipeline 終止於一份 prepared current artifact。[歷史 Session 只讀遷移準備](2026-09-05-read-only-session-migration-preparation.zh.md)定義 read open 如何立即消費該 artifact，以及 write open 如何在返回 append 權限前完成 encode、verification 與 publication。

批次 V4 遷移命令在有界任務佇列中共享一個 JSONL persistence Context，保留 backend 的雙 Worker 驗證上限，以及複用近期已解碼日誌的快取。子 Session 並行釋出可能改變父 Session 選中的子代際；普通修訂檢查會拒絕這次嘗試。命令只把這種源變化錯誤延後到初始佇列清空後序列重試一次，重新收集證據，不放寬釋出檢查，也不重試無關失敗。

### Durable format 與 publication 規則

規範檔名編碼 physical format generation：v0 使用 `session.jsonl[.zstd]`，正 generation 使用 `session.vN.jsonl[.zstd]`。Migration 不會移動、覆蓋或刪除任何 committed generation，並且只寫最終 current target；中間版本只存在於 stage state。

POSIX publication 使用 hard-link creation 加目錄 sync；Windows 使用 no-overwrite、write-through 的 `MoveFileExW`。已有 target 只有在其已驗證 migration prefix 等於 staged bytes 時才會被接受；任何 append tail 都屬於 current-generation reader，而不是 migration winner verification。

既有 write handle 繼續使用程序內 claim 與核心支援的跨程序 `SessionWriteLease`。僅 header 的 `stat` 與 `list` 可以轉換受支援的歷史 header，但不開啟 body，也不釋出 generation。Projection-cache record 會把 fold 繫結到 Session header 的 format version，使 cache row 不能繞過改變 event 基數的 migration。

## 問題與方案對照

| Whole-artifact 問題 | 實作機制 | 結果 |
|---|---|---|
| 每個 Zstandard frame 單獨非同步 Decode | 一個可複用 decoder；外層 500 ms 排程 cadence | 刪除 317,540 次非同步切換 |
| 完整 plaintext、string 與 row array | 增量 JSONL parser 與 row decoder | 只保留一條跨 chunk 殘行 |
| 每條 edge 之間都形成完整 event array | Context 直連的有狀態 stage | 不保留中間版本 event array |
| Packed chunk 在 folding 前完整展開 | `SessionFormatEventRun` 與 `transformRun()` | 無需物化 914 萬 source events |
| 每條 edge 都 whole-artifact snapshot/deep freeze | Stage-owned 獨佔值與最終 validation | 刪除重複遞迴複製與凍結 |
| One-shot migration function 隱藏狀態 | Immutable declaration 建立每次 artifact 獨佔的 stage class | 狀態 ownership 與並行關係顯式化 |
| Bulk current encode 建構完整 string/Buffer | 單條 record encoder、1 MiB input slice、4 MiB write batch | 限制分配與主執行緒 slice |
| 主執行緒重複執行完整 verification | 最多兩個 complete-generation Worker | Verification CPU 不佔用主執行緒 |
| Production 與 fixture 使用不同 migration API | Catalog `createRestore()` 加顯式 policy | 只保留一套 decoder/chain 實作 |

### 父目錄前置事實

本段的執行時子工作階段錯誤處理部分由[逐工作階段目錄準備](../bug-fix/2026-09-19-session-local-subagent-migration.zh.md)取代：開啟父工作階段仍透過讀取直屬子工作階段補齊目錄，但不可讀子工作階段不再阻斷健康父歷史。V3→V4 使用保留的直屬子 Session header 和自身 descriptor 補齊父 Session 的子代理發現記錄。儲存將緊湊的 descriptor 證據提供給 catalog 組裝處，由其繫結到 V3→V4 stage 工廠；Stage 等待父 Session 的最終繼承截點確定後，才驗證目錄 payload 並匯出可獲得的自身發現事實。巢狀的 seed 標記丟棄繼承目錄候選，不解釋其 payload。已有目錄記錄允許 descriptor 不可用，包括在首次 step 之前失敗的子 Session。Descriptor v1 表示 continuable 模式；v2/v3 顯式記錄模式。可獲得且明確的發現欄位必須與父目錄一致；新增完整記錄要求一個受支援的 descriptor。Descriptor 缺失、版本不受支援或存在多個時，保留日誌與未知模式成員關係，不編造發現欄位，理由見[不完整子目錄證據](../bug-fix/2026-09-19-v3-incomplete-child-catalog-evidence.zh.md)。JSONL 在準備、複用和釋出時重新檢查關聯成員與來源修訂。不可讀或不支援的 header 不參與發現；讀取已識別子工作階段失敗時，其 header 身份保留為未知模式成員關係。來源變化使準備快取失效；只讀開啟自動重試一次，寫開啟則拒絕釋出。診斷保留出錯子日誌的路徑，並區分不支援的遷移證據與畸形子資料。收集器將子解碼和 descriptor 失敗報告為帶子路徑的警告；取消與來源一致性檢查仍中止準備。僅支援 V0–V3 的目錄避免遞迴遷移子 Session。目前 V4 讀取跳過該掃描，但會執行與嚴格恢復相同的自身目錄欄位、唯一性及目前投遞迴屬檢查。見[格式規範](../../../../packages/session/session-format-v3-to-v4/README.zh.md)。

原始父子遷移測試保留 24 個歷史建立時間衝突作為拒絕證據。獨立的記憶體對照只對齊子建立時間，證明恢復保留事件，包括已釋出但沒有 descriptor 的子 Session。Headless/ACP 與 SDK 快照介面卡在規範化之前驗證即時父子時鐘，並在重新整理時保持兩者相等；已提交的前代檔案保持不變。

歷史格式的公開修訂號組合父日誌物理修訂號與每個所選規範路徑及其檔案系統修訂號的指紋。僅父日誌權杖無法標識子日誌提供的目錄變化；全庫指紋讓 `stat`/`list` 保持只讀中繼資料，也納入不可讀或不支援的成員，無需新增持久化索引。無關變化也會使歷史快取失效，取得權杖需要掃描根目錄。目前格式權杖仍只取決於自身檔案。準備快取保留父日誌物理修訂號，並獨立驗證子成員集合與修訂。

通用格式介面只傳遞正在恢復的 artifact。每個父 Session 的 catalog 組裝將 V3→V4 宣告替換為捕捉已收集子 Session 證據的閉包，並複用生成的 codec、遷移與驗證清單。每次父 Session 準備只編譯一條短遷移鏈，每次恢復擁有獨立的 stage 狀態。在組裝處繫結證據，使通用恢復選項和 stage 輸入不必攜帶子 Session 證據，同時保留儲存對發現與來源重驗的所有權。靜態 header 和原生目前格式讀取不需要子 Session 證據；未繫結的歷史正文恢復會拒絕，不會假定子 Session 集合為空。

<a id="catalog-scan-measurements"></a>
### 目錄掃描測量

包內[診斷腳本](../../../../packages/session/session-persistence-jsonl/tests/catalog-migration.perf.ts)測量一個原始 V3 父日誌、四個各有 1,000 條事件的直屬子日誌，以及 0/100/1,000 個只有 header 的無關 V3 Session。每個樣本在新程序中建立獨立臨時日誌庫與 Cordis 上下文，按 stat → 冷讀 → 快取讀取 → 寫入釋出 → 目前格式熱讀順序執行，最後釋放上下文並刪除檔案。腳本在普通 Node 下使用已建置的工作區匯出；建立夾具不計入測量區間。這些結果是夾具建立後的檔案系統快取熱態觀察，不代表磁碟冷讀延遲，也不是效能門禁。

以下為 macOS arm64、Node v26.0.0 下各規模的全部三個樣本，單位為毫秒。只讀開啟不釋出後繼：即使解碼結果已快取，成員掃描仍與日誌庫規模成正比。1,000 個無關日誌時，中位數分別為 stat 84.14 ms、冷讀 237.97 ms、快取讀取 110.98 ms、釋出 268.46 ms，以及同程序目前格式讀取 0.41 ms。這些測量記錄成本，不證明效能提升，也不設跨主機閾值。

| 無關 Session | 歷史 stat | 冷讀 | 快取讀取 | 釋出 | 目前格式熱讀 |
|---:|---:|---:|---:|---:|---:|
| 0 | 5.17 | 19.00 | 1.36 | 42.88 | 0.47 |
| 0 | 3.30 | 14.87 | 1.45 | 35.75 | 0.41 |
| 0 | 3.18 | 16.71 | 1.50 | 34.51 | 0.47 |
| 100 | 29.44 | 77.48 | 17.01 | 60.66 | 0.43 |
| 100 | 12.42 | 42.71 | 13.69 | 60.19 | 0.43 |
| 100 | 11.19 | 41.06 | 12.61 | 57.18 | 0.39 |
| 1000 | 84.14 | 237.97 | 109.86 | 284.96 | 0.48 |
| 1000 | 99.41 | 259.88 | 123.50 | 268.46 | 0.41 |
| 1000 | 75.40 | 236.64 | 110.98 | 247.69 | 0.39 |

在儲存庫根目錄建置執行時後執行：

```sh
pnpm run build:lib:host
cd packages/session/session-persistence-jsonl
node --input-type=module -e 'import { build } from "tsdown"; await build({ config: false, entry: ["tests/catalog-migration.perf.ts"], outDir: ".artifacts/perf", tsconfig: false, dts: false, deps: { neverBundle: [/^@deepseek-ai\//], onlyBundle: false } })'
node .artifacts/perf/catalog-migration.perf.mjs
```

## 驗證

遷移規範要求分別提供轉換、保留與拒絕的證據。直接遷移邊和原生 V3 測試不能證明有種子的多跳釋出：前代 assistant 流摺疊會在 V3 插入系統事件前改變源座標。因此，經過真實目錄與 JSONL 提供者的測試需要原始及壓縮的 V0/V1 輸入、對映後的引用和繼承切點、釋出/重新開啟等價性、前代位元組不變，以及不產生中間代。覆蓋率百分比本身不能證明這些跨階段關係；組合斷言必須比較結果歷史與拒絕效果。

內容准入證據必須覆蓋規範列出的每個位置、巢狀結果、未完成的起始記錄和已知種類的畸形塊，並驗證診斷使用源座標。成功遷移必須保留已接納的內容與不透明值。經真實持久化路徑拒絕時，必須保持源不變且不釋出後繼代。原生 V3 測試必須獨立證明兩種目錄驗證策略均保留擴充功能准入；歷史拒絕不能證明原生輸入也被拒絕。

### Benchmark 輸入與口徑

Benchmark 使用 Node v24.18.0 和一份 116,228,655-byte 的 v0 Zstandard 日誌，其中包含 317,540 個 frame 與 454,151 個 physical row。老 reader 會恢復 9,143,111 個展開後的 v0 event；migration 會生成 72,784 個 current v2 event，artifact SHA-256 為 `fa16ff9472ca350595a3112c20a3db79655bc2673973469987ecaf2a57ebd17c`。

所有樣本均透過 plain Node 執行 build artifact，每個樣本使用獨立程序，V8 heap limit 為 16 GB。“Retained heap”表示 restored Session 仍存活時強制 GC 後的 heap。除無法得到 handle 的 whole-artifact 失敗外，下表使用三次執行中位數。

### Physical Decode

| 資料路徑 | Decode 耗時 | 峰值 RSS | 排程 |
|---|---:|---:|---|
| Migration 前的高效能 reader | 1.553s | 916MB | 一個 decoder；外層 yield 2–3 次 |
| Whole-artifact migration | 7.527s | 7,219MB | 317,540 次 async decoder 呼叫 |
| Streaming Stage 路徑 | 1.467s | 908MB | 一個 decoder；外層 yield 2 次 |

### 歷史檔案首次冷開啟

| 版本 | Session restore 完成 | CPU 時間 | 峰值 RSS | Retained heap | Restore event 數 | 結果 |
|---|---:|---:|---:|---:|---:|---|
| Migration 前的高效能 v0 reader | 4.594s | 6.048s | 2.720GB | 2.016GB | 9,143,111 | 讀取 v0，不遷移 |
| Whole-artifact migration | >72.8s | — | Decode 階段已 ≥7.219GB | — | — | 返回 handle 前 OOM |
| Streaming Stage migration + 序列 publication | 6.241s | 8.493s | 2.107GB | 477MB | 72,784 | 釋出並開啟 v2 |

老 reader 的一次性 wall time 更低，因為它不做格式轉換和 durable publication；同時它會常駐 914 萬 event 的表示。Stage 路徑只多支付一次 encode 與 verification，隨後保留摺疊後的 v2 state。

### Current-format 冷開啟

| 版本讀取自己的 current format | Session restore 完成 | 峰值 RSS | Retained heap |
|---|---:|---:|---:|
| 老 reader 讀取 v0 | 4.594s | 2.720GB | 2.016GB |
| Whole-artifact 時代 reader 讀取 v2 | 1.273s | 1.107GB | 476MB |
| Streaming Stage reader 讀取 v2 | 1.284s | 1.109GB | 476MB |

Current-v2 快路徑保持效能等價。架構改造不會讓 current data 進入 historical stage。

### Streaming 序列 migration 分段

下表記錄該 Stage 決策測量的序列 open 流程。目前 preparation-first 排程及其測量由[歷史 Session 只讀遷移準備](2026-09-05-read-only-session-migration-preparation.zh.md)記錄。

| 階段 | 中位耗時 |
|---|---:|
| Source Decode + migration | 2.784s |
| Encode + write + sync | 0.956s |
| staged 檔案完整 Worker verify | 1.415s |
| Source recheck + no-overwrite publication | 0.106s |
| committed-prefix verify + header reopen | 0.046s |
| Generation ensure-current 總計 | 5.318s |
| Persistence 觀察到的最終 current Decode | 0.620s |
| Session restore | 0.594s |
| 端到端 Session restore 完成 | 6.241s |

Generation 分段與端到端資料來自不同 instrumented run，因此四捨五入後的各行不要求精確相加。

Format、catalog、edge、JSONL、fixture、replay 與 built-Worker 測試覆蓋兩種編碼、packed run、僅 header 分類、torn tail、migration refusal、確定性 legacy normalization、source change、target collision、write lease 與 Worker failure。

## 後果

最終 current-event array 仍然不可消除，因為 Session restore 與 Agent 執行需要完整歷史。Stage 架構刪除完整 source 與中間 target array，但不承諾記憶體與分頁視窗大小成正比。

解碼後的單條 `assistant/chunk` 會接受 envelope 驗證與最終 target 驗證，但其完整凍結 v1 source payload 成員驗證仍處於延期狀態，因為這項逐事件檢查會顯著影響已釋出日誌的 Decode 與 migration 耗時。Packed Assistant run 仍接受嚴格解碼。只有效能證據表明不會破壞該遷移路徑的已測表現時，才能恢復單條 chunk 驗證。

Read-only access 會在 durable publication 前消費 Stage 結果；write open 則複用同一結果，並在 append 前等待 publication。Persistence 排程仍與 format pipeline 相互獨立。

低 generation 為 operator 檢查而保留。Retention 不承諾 downgrade compatibility、automatic fallback，也不保證舊 runtime 能安全理解新 generation。

## 考慮過的替代方案

- **只最佳化 Zstandard Decode**——可以恢復 physical Decode 速度，但 source rows、expanded events、snapshot、intermediate artifact 與 bulk encode 仍會留在記憶體中。
- **同步 Generator stage**——每個 yield 都會保留執行幀與 batch。真實日誌測量使 migration 更慢，並讓 migrate-complete RSS 從約 1.0 GB 增長到約 1.2 GB。
- **每個 stage 返回陣列**——只是給舊的 allocation、遍歷與 flattening cost 換了名字。
- **Stage 內部輸出佇列**——增加 drain、EOF 與 error ownership，同時仍會保留中間值。
- **透過 constructor 注入 emit callback**——迫使 chain 反向建置或引入 partially connected lifecycle。操作時傳 context 可以讓 stage construction 不依賴下游 wiring。
- **全域複用有狀態 codec instance**——會讓不同 Session 的 pending attempt、mapping 與 counter 相互汙染。
- **持久化每個中間格式版本**——產生沒有 runtime consumer 的 durable state；只需要精確 source 與最終 current generation。
- **讓 mounted plugin 註冊 migration**——使歷史可讀性依賴部署。Static catalog 必須在 feature plugin 掛載前恢復已釋出格式。
