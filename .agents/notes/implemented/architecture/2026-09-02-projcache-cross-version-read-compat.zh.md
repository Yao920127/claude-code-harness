# Agent Note: 投影快取前代恢復與 Session 格式繫結（session_projcache v3-v6 → v7）

Status: implemented

[English](2026-09-02-projcache-cross-version-read-compat.md) | 中文

## 問題

`session_projcache` 儲存域演進過多代磁碟結構。升級後的 DSH_HOME 暴露了三類風險：

- **v3 單檔案 home 升級後啟動硬失敗**：per-record 佈局的 legacy bootstrap 遷移舊單檔案時不檢查其 `unit.version`，把舊記錄原樣打上目前版本戳寫入新樹；domain 層開域時逐條 zod 驗證，舊記錄缺新增必填欄位 → `invalid-record` → 整個域拒開 → 外掛樹載入失敗。且 bootstrap 先寫盤後驗證，**首次啟動即把壞文件永久寫入新樹**（"投毒"）——此後每次啟動新樹非空、連 legacy 路徑都不再走，home 持續不可用。
- **v4 per-record home 升級後列表丟標題**：v4 文件被版本戳檢查靜默丟棄（per-record 契約），SessionList 是零 I/O 純快取讀，miss 後整行不帶投影；標題要等每個工作階段被逐個重新開啟後才恢復。
- **Session 格式遞增可能複用按舊事件語義摺疊的結果**：版本 3 至 6 不記錄 Session 格式代。若把缺失代視為目前代，快取行就能繞過有界歷史規範化或改變基數的遷移。

快取域自身的契約是"過期或不可讀的快取只付出更長的尾部重放，絕不給出錯值、絕不拒載"——硬失敗與整體丟棄都違背該契約的前半句或產品預期。

## 磁碟結構代際

| domain version | 攜帶釋出 | 佈局 | 磁碟形態 | identity 欄位 | 行欄位 |
|---|---|---|---|---|---|
| 3 | 0.1.1-rc.2 | single | 單檔案 `storages/session_projcache.json`（`{unit:{name,version}, global, tables}`） | `createdAt`, `cwd?` | `ver`, `seq`, `val` |
| 4 | 0.1.2-alpha.3 | per-record | 每工作階段一份 `storages/session_projcache/sessions/<sessionId>.json`（`{version, record}`） | `createdAt`, `cwd?` | 同上 |
| 5 | 0.1.2-alpha.4 | per-record | 同 v4 | + `isSeeded`（v5 首發必填；現為 optional）、`inheritedEventCount`（同前） | 同上（`seq` 數值語義與 v4 相同，僅型別加 brand） |
| 6 | v1 之前的 mainline | per-record | 同 v5 | 同 v5 | 同上 |
| 7 | 目前版本 | per-record | 同 v5 | + `formatVersion`；目前寫入也要求兩個 lineage 欄位 | 同上 |

v4→v5 的唯一實質差異是 identity 新增兩個 lineage 欄位；v6 只改變寫入版本戳。這些前代的行內 `ver/seq/val` 表示一致，`seq` 的數值含義未變（[2026-08-31 seq/offset brands note](../../archived/architecture/2026-08-31-session-sequence-and-log-offset-brands.md) 明確 on-disk 數值不變）。v3→v4 是佈局遷移，記錄內容結構一致。v7 把 Session 格式代加入快取 identity，因為無法從 domain 版本戳推導行語義。

另有一種衍生形態：跑過一次 v5 版本的 v3 home（投毒態）——新樹裡存在**版本戳為 5 但內容是 v3 記錄**（缺 lineage 欄位）的文件。

## 決策

宣告式讀相容——讀容忍 owner 背書過的舊版本，寫恆戳目前版本：

1. **`DomainSpec.compatibleVersions`（新增，可選）**：域 owner 宣告"這些舊版本的存量記錄在目前記錄 schema 下也可讀"（典型手段：新增欄位標 optional）。`defineDomain` 驗證各項為小於目前 version 的非負整數；`descriptorOf` 直接傳遞到後端 `KvUnitDescriptor`。
2. **json 後端 per-record 讀**：接受"目前版本 ∪ compatibleVersions"內的版本戳，集合外照舊視為 foreign 丟棄；**寫路徑永遠戳目前版本**（讀到舊記錄後的下一次 checkpoint 自然把它推進到目前版本）。single 佈局維持 exact-version 不變。
3. **legacy bootstrap 版本把關（bug 修復本體）**：舊單檔案的 `unit.version` 必須落在接受集合內才遷移，否則視為空 unit 留在原地——為 owner 未背書的記錄打目前版本戳，會把"可丟棄的過期快取"變成 domain 層的 schema 硬失敗。
4. **projcache 域宣告 `version: 7, compatibleVersions: [3, 4, 5, 6]`**；儲存 schema 中的格式與 lineage identity 欄位均為 optional，使 owner 背書的前代記錄可以開啟。目前寫入始終包含這三個欄位。
5. **identity 匹配比結構准入更嚴格**：缺失 `formatVersion` 的記錄絕不匹配目前 Session，因此前代行不能播種投影，而會從權威日誌重新摺疊。格式匹配後，`identityMatches` 才把缺失 lineage 歸一化為 unseeded（`?? false` / `?? 0`）：對 unseeded 工作階段精確，對 seeded 期望則匹配失敗。v5 投毒 home 因而可以安全啟動，但其未繫結行不會作為目前值暴露。
6. **schema 驗證後備：`invalidRecords: 'backup-and-skip'`（僅本域宣告）**。讀相容之外仍然解析失敗的存量記錄不再讓整個域拒開：domain 層呼叫後端的 `KvUnit.backupRecord`（json per-record 實作＝把文件改名為 `<key>.json.bak.<YYYYMMDDHHmm>`，位元組留檔、不再被讀取），用 `logger.error` 列印具體失敗資訊（域名、表、鍵、移動去向、zod 失敗原因），隨後當該記錄不存在繼續啟動；下一次冷讀會重建並重寫該工作階段的快取。**該策略是域級顯式宣告，預設仍為 fail-loud**——其他業務域的存量資料驗證失敗照舊整域拒載；後端沒有 `backupRecord` 能力（single 佈局、行儲存）時也退回 fail-loud。命名沿革：quarantine → backup-and-skip（使用者裁決：詞要同時含"備份"與"跳過"兩義，且與 `.bak` 字尾同源；skip-backup 因 CLI `--skip-X` 慣例存在"不備份"反讀而棄用）。對本域而言，該策略取代了 [2026-07-28 儲存恢復提案](../../proposed/architecture/2026-07-28-storage-root-and-derived-medium-recovery.zh.md)中 reset/destroy 的恢復途徑；該提案對權威介質與整介質損壞仍然有效。

7. **predecessor title 是列表 hint，而不是 fold shortcut**：Session list 啟動保持 metadata/cache-only，絕不開啟冷 log body。log header 是權威來源；生命週期匹配的 checkpoint 是 durable prefix witness，可以落後但不能領先日誌。因此 `cachedPredecessorTitle` 只公開仍透過目前 title unit `stateVersion` 與 schema 的 predecessor `title` row。兩條相鄰 Session format edge 都保留 title 文字。該 hint 的 `asOfSeq` 是儲存 title row 自己的水位；因為改變日誌事件數量的遷移會重新對映該座標，Session list 把該 block 標為 `kind: 'cached'`，用戶端不會拿它與建連 Session 的 seq 比較（[只讀面按 lifecycle 身份匹配與 cached 行](2026-09-19-projection-cache-listing-identity-and-cached-rows.zh.md)）。其他 predecessor row 繼續隱藏，`hydratePrepared`/`coldSnapshot` 仍要求嚴格格式 identity，因為即使物理儲存一致，normalizer 仍可能改變 `blank` 或 `lastPromptAt` 等值。

### v3-v6 → v7 處置

版本 3 至 6 仍可結構化讀取，因為它們的記錄與行表示是目前 schema 的有效輸入。其 identity 缺少 `formatVersion`，因此有意不能作為目前摺疊捷徑。unseeded 且生命週期匹配的記錄仍可向零 I/O 列表提供版本相容的 title，但不能提供任何權威 seed。冷讀或即時檢查點會從遷移後的 Session 日誌重建值，並寫入帶完整格式與 lineage identity 的 v7 記錄。啟動時不執行 eager 值遷移；schema 驗證失敗的已接受記錄執行 `backup-and-skip`。

### 升級矩陣

| home 形態 | 修復後行為 |
|---|---|
| v3 單檔案（未投毒） | bootstrap 遷移（3 ∈ 接受集）→ 啟動成功；相容 title 在列表可見，未繫結摺疊等待冷重建 |
| v3 + 投毒新樹 | optional 欄位讓新樹文件可解析 → 啟動恢復；相容 title 在列表可見，未繫結摺疊等待冷重建 |
| v4/v5/v6 per-record | 文件結構化讀入 → 缺格式代而拒絕 fold shortcut；相容 title 在列表可見；目前檢查點重寫 v7 |
| identity 匹配的 v7 目前記錄 | 正常服務快取值 |
| 格式匹配但缺 lineage 的記錄 | unseeded 呼叫方可以使用；seeded 呼叫方拒絕並回落冷摺疊 |

## 備選方案

- **在儲存層拒絕前代版本戳**：對投影安全，但會阻止受保護的 legacy bootstrap，也無法保留結構完好的記錄直到權威重摺疊替換它。結構准入加語義 identity 拒絕既讓啟動可恢復，也不服務未經證明的值。
- **在所有用途中把缺失格式代視為目前代**：可以保留快取值，但讓遷移前摺疊繞過 Session 格式邊。不採用，因為 v0→v1 含有界歷史規範化，後續邊還可能改變事件基數。title-only 列表 hint 更窄：它不播種 fold，而且 title 文字在已安裝 edge 之間保持不變。
- **schema `.default()` 填預設**：行為與 optional+讀點歸一化等價，但把"缺失=unseeded"的解釋固化進 durable schema 的輸出型別；拍板為 optional——schema 如實描述介質上所有被接受的形態，解釋權在消費點（2026-09-02 使用者裁決）。
- **域版本退回到 4**：改動很小，但破壞版本單調性、依賴"bootstrap 不查版本"這個 bug 本身、且投毒態與正常 v5 home 的快取全被丟棄。

## 影響

- 部署方若把本域路由到 sqlite 後端，得不到任何容忍能力：sqlite 既未實作 `compatibleVersions` 也沒有 `backupRecord`，行為退化為原有的嚴格版本語義（整 unit 版本不匹配仍 `version-mismatch` 拒開；不放鬆、不出錯值）。shipped 組合固定路由 json，此風險僅存在於部署設定層面。
- optional 格式欄位允許前代記錄透過結構驗證，但缺失格式始終無法透過目前 identity 匹配。只有格式匹配後才歸一化 optional lineage；seeded 呼叫方仍拒絕缺 lineage 的記錄。逐行 `ver` 守衛繼續篩查每個實際服務的值。
- `backupRecord` 對同一鍵的同一分鐘內重複備份會覆蓋前一份（新位元組勝出）；不同分鐘、不同鍵永不衝突。

## 測試

- `storage-json` 單測：compat 版本戳讀入/集合外丟棄/寫恆目前版本；legacy bootstrap 僅在版本被接受時遷移（含遷移後文件戳目前版本斷言）；`backupRecord` 移檔/讀缺席/重寫/封閉守衛。
- `storage-domain` 單測：`compatibleVersions`/`invalidRecords` 宣告驗證；後端無 `backupRecord` 時 backup-and-skip 退回 fail-loud。
- `session-projection-cache` 單測：格式匹配且缺 lineage 的記錄只服務 unseeded Session；缺格式代的前代記錄不能播種 fold，但只能提供其相容 title hint。
- **歸檔 fixtures 獨立恢復測試**（`tests/fixtures.spec.ts` + `tests/fixtures/`）：真實發布物產出的四份介質存檔——`v3-single-unit.json`（0.1.1-rc.2 整域單檔案）、`v4-session-doc.json`（0.1.2-alpha.3）、`v5-session-doc.json`（0.1.2-alpha.4）、`v5-lineageless-doc.json`（無守衛 bootstrap 的投毒形態，由 v3 記錄合成）——逐一走真實儲存棧開域、只服務其相容 predecessor title、絕不服務其未繫結摺疊，隨後由即時寫入替換成帶完整 identity 與新值的 v7 記錄。同一套件還證明 schema 失敗記錄的 backup-and-skip：啟動不失敗、`.bak` 寫入磁碟、診斷點名失敗，且鄰近前代記錄仍可重寫。

未來 bump 流程：只有目前儲存 schema 能解析舊 domain 版本時，才把它加入 `compatibleVersions`，再由 owner reader 判斷其語義 identity 是否充分。Session 格式變化絕不繼承缺失的格式代。包 README 要求每次 bump 都隨附歸檔 fixture 與測試，證明結構准入、語義使用或拒絕，以及目前重寫。
