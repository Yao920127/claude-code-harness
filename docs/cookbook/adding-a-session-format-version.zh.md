# 實操手冊：新增 Session 日誌格式版本

[English](adding-a-session-format-version.md) | 中文

## 概述

本教學介紹如何新增下一個結構性 Session 日誌版本，同時不改寫已釋出資料。閱讀[版本與釋出狀態真源](../session-format-status.zh.md)，確定工作區寫入器與最新已釋出格式。令 N 表示經核實的已釋出格式，N+1 表示目標版本；名稱與中繼資料中的這些預留位置須替換為數字。開始前，請準備可用的貢獻者工作區，並閱讀[包檢查清單](adding-a-package.zh.md)、[格式庫](../../packages/session/session-format/README.zh.md)和[已釋出格式決策](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)。

## 目錄

- [1. 選擇版本與釋出基線](#choose-the-version)
- [2. 新增恆等遷移邊](#add-an-identity-edge)
- [3. 實作每份產物獨佔的 Stage 與驗證](#stages-and-validation)
- [4. 更新目前版本消費方](#current-version-consumers)
- [5. 建立快照後繼代際](#snapshot-successors)
- [6. 驗證整合結果](#validate)
- [開發者 V4 日誌集試遷移](#v4-corpus-trial)
- [開發備註](#dev-note)

<a id="choose-the-version"></a>
## 1. 選擇版本與釋出基線

當 header、事件信封、核心事件語義或表面重建發生結構性變更時，提升格式版本。向後相容的變更可以透過新的確認記錄保留目前版本；遵循[版本規則](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)與[型別變更規則](../persistence-changes/README.zh.md#compatibility-rules)。區分 Session 格式整數與包釋出版本、SQLite schema 版本、投影單元版本及協定包裝層版本。

規劃下一次破壞性變更時，N 取[版本／狀態](../session-format-status.zh.md)中的已接受或已釋出版本。因此，即使尚未記錄 V4 釋出，已接受 V4 之後的破壞性變更也需要 V5；相容新增不需要這一步。

為 N+1 使用共享的 `release/*` 整合基線。基線變更新增寫入器、codec、catalog 接線、恆等遷移與驗證。從該基線建立各個獨立子分支，並將其 PR（Pull Request）的目標設為釋出分支，而非另一個獨立子分支。每個子分支在同一個相鄰遷移包內新增自身的結構變換、驗證器、消費方和測試。不要只為表示評審順序而分配額外版本。透過 PR 將評審後的子分支合入釋出分支，並在釋出前驗證組合結果。遵守釋出分支的強制推送與刪除保護；不要強制同步該分支。

已釋出 codec 和已接受的目標格式含義保持穩定。N+1 釋出後，N→N+1 轉換器仍可修復或增加歷史情境支援；只要輸出仍相容 N+1，就不必提高版本。轉換器修復隻影響之後的轉換，不會重新處理已有 N+1 後繼檔案。記錄對原先已接納對映的修改，以及已有輸出如何繼續得到支援。不相容地改變既定目標表示或解釋語義需要下一版本。

N+1 尚處於開放整合階段時，應使用可丟棄、相互隔離的 Harness home。中間版本產生的 N+1 檔案已標為目標寫入器版本，因此後續對 N→N+1 的修改不會再次遷移該檔案。請在全新測試 home 中從未變更的歷史輸入重新執行；絕不透過改寫已提交代際或複用真實使用者 home 來修復這個問題。

變更寫入器之前，使用[歸檔命令](../persistence-changes/historical-formats/README.zh.md#maintenance)保留其完整持久化 schema，再在 `docs/persistence-changes/historical-formats/vN.*` 下新增雙語格式參考。保留所有更早的記錄。格式覆蓋檢查要求低於新寫入器的每個整數版本都有獨立文件；目前生成的目錄只覆蓋新寫入器。

<a id="add-an-identity-edge"></a>
## 2. 新增恆等遷移邊

按照包檢查清單為 N→N+1 建立庫，而非掛載外掛。恆等正文轉換僅是最初的接線骨架。[V2 到 V3 規範](../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)是明確轉換與保留規則的固定範例，而不是可繼續擴充功能或視為恆等轉換的遷移邊。

在 manifest（中繼資料清單）中宣告 `dsh.sessionFormatMigration`，包含數值 `from: N` 和 `to: N+1`、匯出路徑，以及匯出的遷移、源 codec、目標 codec、目標 header 驗證器和目標恢復器。複用前一條遷移邊所屬包匯出的源 codec，並依賴該包；不要複製或重新定義已釋出 codec。從新包匯出目標 codec 和驗證器。將遷移邊加入 catalog 的直接依賴，並新增工作區的 TypeScript 路徑與專案引用。

在新增新遷移邊宣告的同時，將[核心 Session 型別](../../packages/core/session/src/types.ts)中的 `SESSION_FORMAT_VERSION` 設為 N+1，然後生成 catalog。下面的命令只生成已宣告的遷移鏈；它不會實作新版本：

```sh
pnpm run gen-session-format-catalog
```

[生成器](../../scripts/gen-session-format-catalog.ts)要求從零到寫入器版本的每一步恰好有一個相鄰遷移包，目錄與包名匹配、相鄰 codec 匯出匹配，並宣告所需依賴。它拒絕缺口、重複或多餘的遷移邊、未知中繼資料成員，以及未透過對等依賴（peer dependency）加開發依賴共享 Session 的 catalog。請修復宣告，而非手改 `generated.ts`。Catalog 在建置時靜態確定；外掛掛載不得決定歷史資料是否可讀。

<a id="stages-and-validation"></a>
## 3. 實作每份產物獨佔的 Stage 與驗證

使用 [Stage 介面](../../packages/session/session-format/src/types.ts)，不要使用整份產物的陣列到陣列遷移器。不可變的 `SessionFormatMigration` 宣告提供 `migrateHeader`、`validateTargetHeader` 和 `createStage`。每次呼叫 `createStage` 都為一份源產物建立獨立狀態。計數器、待處理事件和引用對映歸該狀態所有；不同 Session 之間絕不共享可變 Stage。

實作 `transformEvent(event, context)`、`transformRun(run, context)` 和 `finish(context)`。透過 `context.emitEvent` 或 `context.emitRun` 同步輸出；一次呼叫可以產生零個、一個或多個輸出。讓 Stage 直接消費 codec 所有的緊湊 run，或者迭代 `run.expand()`，而不物化中間陣列。呼叫方負責排程，遷移鏈先結束上游 Stage，再結束下游 Stage。

繼承截點是邏輯事件數量，不是物理行數。只有在 EOF 前已知時才公開 `headerInheritedEventCount`；`finish` 返回精確的目標截點。前一條改變事件數量的遷移邊可能使該數量在建構時不可知。必要時從已驗證的種子標記推導它，並測試從每個受支援歷史代際到 N+1 的有種子多跳恢復，而非僅測試直接 N 輸入。絕不以零替代未知截點。

顯式定義新遷移邊的事件准入與變換規則。[V2 到 V3 源審計](../../packages/session/session-format-v2-to-v3/README.zh.md#source-audit)和 [Alpha V0→V1 規則](../../.agents/notes/implemented/architecture/2026-08-31-alpha-historical-unknown-event-refusal.zh.md)分別負責對應已釋出遷移邊的策略，而非新遷移邊的策略。不要將任一策略推廣到所有遷移邊。結構或事件位置變化時，必須分類源事件、載荷成員與引用，並顯式判斷不透明資料能否保持有效。[同版本保留](../../.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.zh.md)本身不能證明結構變換安全。驗證目標語義，併為每個新增可接受案例提供一個被拒絕的反例；絕不放寬舊遷移邊來掩蓋不受支援的轉換。

以原生 writer 輸出作為轉換對照：用相同錄製的 LLM 訊息、工具輸出和其他輸入回放舊 writer 與目標 writer。任何格式歸一化 helper 執行前，比較遷移後的舊輸出與目標原始輸出，只遮蔽已說明的易變欄位。V4 的普通工具結果變為包含普通內容塊的平鋪 tool-role 訊息。舊型別理論上允許某種結構，本身不足以支援新增核心內容型別。

Alpha 轉換器可以明確拒絕尚無已實作、有證據對映的歷史情境，包括原本有效的日誌。原始檔保持不變，且不釋出部分 successor。擴充功能支援時優先使用真實語料和可復現 writer；只讀檢查使用者語料，並建立脫敏迴歸 fixture。

在遷移邊 README 中只記錄目標格式所需的識別符號與欄位對映，並逐項說明原因。不要僅因可擴充功能就給直接 source kind 或普通 metadata 新增名稱空間。保留不透明巢狀資料。Alpha 轉換器可以拒絕在目標格式中會獲得新語義的意外源欄位，而不是為其虛構解釋。

參照 [V2 到 V3 規範](../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)，將新遷移邊的 README 維護為唯一完整的轉換與接納目錄。列舉每個被轉換的 header、事件、訊息槽和載荷欄位，精確重新命名或衝突規則，保留的 id、座標、引用與繼承截點，外部前置證據，拒絕與不透明資料策略，以及不支援或延後的行為。將歷史源轉換與原生目標接納分開，說明每項檢查由哪個 codec、restorer、已安裝驗證器和恢復策略執行。記錄刻意窄於宣告 schema 的驗證範圍。程式碼變更必須同時更新此目錄；生成的 schema 庫存或 PR 描述不能替代它。

透過 `sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })` 驗證嚴格恢復，按順序傳入各行並呼叫 `finish()`。這會執行物理解碼、完整遷移鏈與已安裝目前 Session 驗證。生產環境的 recoverable/transformed 策略不能替代 fixture（測試前置資料）和釋出驗證所需的嚴格驗證。保留已記錄的歷史驗證例外，不要宣稱源驗證比遷移邊實際執行的更嚴格。

<a id="current-version-consumers"></a>
## 4. 更新目前版本消費方

追蹤每個目前版本消費方，包括 Session 建立與恢復、JSONL 檔名選擇與釋出、catalog 的目前編碼器與恢復器、投影快取的代際身份、回放與快照歸一化、[物理 fixture 佈局驗證](../../scripts/session-fixture-layout.ts)，以及 TypeScript/Python SDK 錄製。當值表示目前版本時使用寫入器常數；在已釋出 codec 和歷史 fixture 中保留字面歷史版本。透過各自所有者更新目前文件與生成參考。

不要自動提升無關版本。請求包裝層的 `sessionFormatVersion` 標識嵌入的 Session 代際；外層 schema 版本有自己的含義。投影單元狀態版本同樣不能替代快取的 Session 代際身份。

驗證讀取與寫入兩條路徑。僅 header 的列表操作不得讀取正文或釋出。歷史讀取開啟可以直接返回遷移後的記憶體產物而不寫入；寫入開啟必須先驗證並行布唯一的最終目前後繼代際，再允許追加。源路徑、位元組與 inode 保持不變。所選代際高於目前版本或無效時，不得退回到前代。[準備階段決策](../../.agents/notes/implemented/architecture/2026-09-05-read-only-session-migration-preparation.zh.md)負責釋出時序。

<a id="snapshot-successors"></a>
## 5. 建立快照後繼代際

閱讀[快照所有權](../../snapshots/AGENTS.md)和[快照庫](../../packages/test-support/session-snapshot/README.zh.md)。[語料策略](../../scripts/session-snapshot-corpus-policy.ts)保留其宣告的 baseline 作為回放輸入，讓升級實際經過相鄰遷移鏈；提高 writer 版本不要求 refresh 該語料。需要目前代際後繼時，選擇擁有資料的情境，保留每份歷史檔案，並使用目標版本的規範父子檔名。絕不將前代重新命名為目標檔名，或僅修改其 header。

如果回放輸入不變，在所有者上執行無金鑰 refresh，再執行不寫回的 replay。以下 SDK 命令使用 `text-turn` 和工作區的寫入器版本。先實作並接入 N+1，才能用它們生成該版本；功能變更應選擇實際受影響的所有者：

```sh
pnpm run test:snapshot:refresh snapshots/sdk/sdk.snapshot.ts -t text-turn
pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts -t text-turn
```

一起審查新代際、請求伴隨檔案與協定輸出。驗證每個前代的位元組保持相同，且父子角色連續。選擇規則採用數值最高的代際，因此應將共享引用更新為所有者選中的父代際。不要把 packed 佈局遷移器當作版本升級器。如果模型 transcript（文字記錄）必須變化，由情境所有者按照[測試策略](../testing.zh.md)使用所需提供者金鑰進行即時錄製。

透過 `snapshot.yml` 的 `sessionFormat.version` 與受支援的 `coverage` 名稱顯式保留早於 baseline 的案例；record 和 refresh 不改動已 pin 的 Session fixture。更新[語料策略](../../scripts/session-snapshot-corpus-policy.ts)以採用目前代際，同時保留聚焦的直接遷移邊、多跳、packed row、重試/失敗及交付 profile 覆蓋。檢查語料和兩個 SDK 投影；不要僅為消除驗證失敗而批次 refresh 無關情境。

<a id="validate"></a>
## 6. 驗證整合結果

從儲存庫根目錄執行。以下命令檢查 catalog 宣告、Stage 組合、已釋出的 V2→V3 遷移邊與代際選擇。它們是基線檢查；需為新遷移邊新增聚焦覆蓋：

```sh
pnpm run verify-session-format-catalog
pnpm exec vitest run scripts/gen-session-format-catalog.spec.ts packages/session/session-format/tests packages/session/session-format-v2-to-v3/tests packages/session/session-format-catalog/tests
pnpm run test:snapshot scripts/session-snapshot-corpus.corpus.ts
```

實作新遷移邊後，將其實際測試路徑加入聚焦的 Vitest 命令。根據實際 diff 新增受影響的 JSONL、回放、投影與 SDK 測試；釋出 Worker 路徑變化時還需建置產物冒煙測試。要求嚴格遷移成功、骨架保持恆等、拒絕格式錯誤與未知必需事件、重複恢復確定、並行 Stage 狀態獨立、有種子的多跳截點正確、前代不變且無退回。報告確切命令與失敗，不要推斷整個測試套件的結果。

更新[所屬 Agent Note](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)，而非新增重複決策記錄。釋出前保持[釋出記錄](../session-format-status.zh.md#updating-the-record)不變；釋出後，使用已核實的釋出證據更新它。審計相關活躍記錄的取代關係；保留獨立理由，並保持歸檔記錄凍結。一起更新雙語正文，透過儲存庫工具重新記錄每個變更的配對，然後執行文件檢查：

```sh
pnpm run verify-translation-pairing --write docs/cookbook/adding-a-session-format-version.md
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

<a id="v4-corpus-trial"></a>
### 開發者 V4 日誌集試遷移

在已安裝依賴、寫入器為 V4 的貢獻者工作區中使用這個一次性[遷移腳本](../../scripts/migrate-sessions-to-v4.ts)。開始前停止使用目標根目錄的 DSH 程序，避免寫入鎖及變化中的子日誌阻止遷移。在儲存庫根目錄執行：

```sh
pnpm run migrate:sessions-to-v4
```

預設根目錄是 `~/.dsh/sessions`。可用 `--sessions-dir /path/to/sessions-copy` 指定其他日誌集，或用 `--help` 檢視用法。預設並行數取可用 CPU 數且最多為 16；`--jobs N` 接受任意正安全整數，專家使用者可指定更大的值，`--jobs 1` 則序列執行。有界佇列只同時開啟指定數量的 Session，不隨日誌集大小增加。每個歷史 Session 都透過正常的加鎖、總和檢查碼釋出流程，在未修改的原始檔旁建立 V4 後繼。已有 V4 Session 僅以只讀方式開啟；重複執行不會重新轉換它們。腳本不發起模型請求，也不改變轉換或拒絕規則。

終端逐個報告 Session 選中的檔案、版本、進度、結果和耗時。單個錯誤不會阻止後續 Session。最終摘要列出全部失敗項及系統臨時目錄中的完整診斷日誌；存在任何失敗時返回非零退出狀態。同時列印 JSON，並把相同報告儲存為 `migration.log` 旁的 `summary.json`：包含按源版本和結果統計的數量、失敗原因分組、逐項診斷、執行時資訊和兩份報告路徑。已知診斷提取事件型別、非預期欄位、是否涉及子日誌及序號；未知錯誤保留訊息，不推斷原因。報告遷移問題時，請附上這些報告。本次轉換成功的 Session 與執行前已為 V4 的 Session 分開統計。

並行轉換時，子 Session 釋出 V4 可能使父 Session 使用的子日誌證據失效。只有這種源變化錯誤會在全部首次任務結束後序列重試一次；損壞、不支援的格式和已持有的寫入鎖會立即報告。完成行保留原始輸入編號，並單獨顯示已完成數量，使亂序結果仍易於閱讀。

<a id="final-v3-vocabulary"></a>
### 釋出 V4 前確認最終 V3 事件詞彙

當已釋出格式仍為 V3、整合寫入方為 V4 時，master 仍可能新增有效的 V3 事件型別。每次整合 master 後及首次釋出 V4 前，都要把遷移所有的 `RELEASED_V3_EVENT_TYPES` 與該次重新整理使用的最新 V3 寫入方提交比較。在已於本地核驗的 `origin/master` 仍寫入 V3 時，記錄其完整、不可變的提交 id：

```sh
V3_SOURCE_REF="$(git rev-parse --verify 'origin/master^{commit}')"
pnpm run verify-v3-event-vocabulary --source-ref "$V3_SOURCE_REF"
```

驗證器只讀取該本地提交，並要求事件名完全一致。它拒絕遺漏的 V3 名稱、額外複製的名稱，以及不寫入 V3 的源提交。尤其不能把 V4 專有的 `developer/message` 放入凍結的 V3 集合。逐項核對 V3 payload、必要轉換、目標接納及消費方；只新增名稱不能證明遷移完整。接受新源事件前要補上相應遷移回歸。

此命令不會 fetch，也不能證明遠端新鮮度。釋出操作者必須確認所選提交是此次整合包含的最新 V3 寫入方；陳舊的遠端跟蹤 ref 或舊 pin 的透過結果均不足。把核驗過的 id 記入釋出驗證。如果 master 已寫入 V4，應複用已記錄的最終 V3 提交，而不再解析目前 master。V4 釋出後，V3 詞彙仍繫結該歷史原始碼；後續 V4 事件新增不更新它。常規靜態 CI 不依賴可變的 master ref。

<a id="dev-note"></a>
## 開發備註

無。
