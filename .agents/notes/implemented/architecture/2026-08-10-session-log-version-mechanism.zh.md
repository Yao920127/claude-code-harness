# Agent Note: Session log 版本機制：單調整數、升級器鏈、逐事件可忽略標記

Status: implemented

[English](2026-08-10-session-log-version-mechanism.md) | 中文

## 問題

Session log 在釋出後必須能升級格式，而最先發布的執行時決定了此後一切的下限：第一個釋出版的讀取器缺少哪種拒絕和降級行為，使用者手裡已經裝上的副本就永遠補不上。釋出 issue #1901 的最低要求是老執行時讀到新 Session 格式時明確報不支援，而不是讀錯。改動前的讀取器在兩個方向上都做反了：`assertVersion` 對任何版本不匹配丟擲同一條不區分方向的訊息；JSONL 解碼器把不認識的事件型別原樣放行，重建時靜默跳過，恢復出一個內容殘缺的工作階段且沒有任何診斷。

## 決定

**一個單調遞增的整數，不分大小版本。**某一步能不能自動升級是那一步自己的屬性，由它的升級器存在與否表達，不該由兩級編號方案提前承諾；設計時很少能預知下一個變更算不算"大"。

**升不升版本由寫入方決定，與讀取方能力無關。**當且僅當老執行時無法在語義上完全正確地處理新日誌時才必須升版本。"解析不報錯"不是標準：靜默跳過影響重建的內容就是讀錯。只有結構性變更夠得上這條線：header 形狀、事件信封、核心事件語義、surface 機制（`SurfaceEventType` 集合、`SurfaceOp` 變體）。拿不準就升：近似恆等的升級器幾乎沒有成本，漏升一次會讓老讀取器靜默讀壞。

**讀取規則按方向區分。**版本相等：正常讀。比讀取器新：拒絕，說明方向（"由更新的 harness 寫入，請升級"），並給出原始日誌檔案的路徑，使用者仍能看到文字（`SessionFormatUnsupportedError`，與 `SessionPersistenceCorruptionError` 區分，因為資料沒有損壞）。比讀取器舊：每個事件正文操作先在記憶體中執行完整相鄰鏈，並保持源路徑、位元組與 inode 不變。讀控制代碼可以直接使用該 current 邏輯結果；寫 open 則在 append 前把最終 current generation 排他釋出到其規範版本檔名。僅 header 的列表保持不變更，並報告數值最高的規範 generation。catalog 生成與模組初始化會拒絕缺失的相鄰步驟，因此已釋出第一方 build 絕不會暴露不完整歷史鏈。保留的低 generation 不是自動 fallback，也不構成 downgrade compatibility 承諾。

**逐事件的 `ignorable` 標記吸收詞彙表增長，普通的新增事件永遠不用升版本。**事件詞彙表由掛載了哪些外掛決定，單個版本整數描述不了它。讀取器遇到不認識的事件型別時拒絕解讀日誌，除非該事件的信封帶 `ignorable: true`。預設為必需：忘寫標記的後果是把一個本可恢復的工作階段拒絕過頭（體驗問題），而預設可忽略會讓同樣的疏忽靜默恢復出殘缺工作階段（安全事故）。架構保證了這條規則成立：模型可見內容只經四種帶 `surfaceOp` 標記的 surface 事件加 `request/header`、`request/context` 摺疊進入重建，危險的未知事件恰好是那些不進 surface 但改變日誌其餘部分解讀方式的事件（`session/end-seed` 是現存例子）。

[已接受相容性檢查點](../../../../docs/session-format-status.zh.md#finalization-record)阻止已接受轉換複用原來的頭版本遞增來授權後續破壞性變更。向後相容的演進在相同 Session 版本上使用新的確認記錄；破壞性變更要求更高的寫入器版本。檢查點不改變未知事件協定。

### 寫入器與釋出真源

`SESSION_FORMAT_VERSION` 擁有工作區寫入器版本號；[釋出狀態參考](../../../../docs/session-format-status.zh.md)擁有唯一的雙語 `latestReleasedVersion` 與 `evidenceTag` 記錄。釋出狀態獨立於原始碼開發而變化，因此透過比較這兩個事實推導狀態，而不另行維護 `released` 布林值。一般文件連結到這些真源；固定版本約定與歷史證據保留明確版本號。

[文件標準檢查](../../../../scripts/doc-standard.spec.ts)在不存取網路的情況下，驗證記錄結構、雙語一致性、證據連結一致性及本地釋出版本與寫入器版本的大小關係。它證明內部一致性，而非釋出事實或記錄新鮮度。[釋出流程](../process/2026-08-10-npm-release-sequences.zh.md)要求釋出操作者在更高格式交付後核實釋出並更新記錄。這讓相容性評審不依賴憑證與 GitHub 可用性，同時明確人工維護新鮮度的義務。

## 影響

v0（0812 釋出）交付的內容：分方向的拒絕並帶原始日誌路徑；基於生成的已知詞彙清單（`KNOWN_SESSION_EVENT_TYPES`，由 `gen-persistence-catalog` 從所有 `SessionEventMap` 宣告合併生成，`verify-persistence-catalog` 保證新鮮）的未知事件守衛；`ignorable` 信封欄位被種子驗證、JSONL 和 BFF 線上 schema 接受。V1 新增靜態相鄰 catalog、恆等 v0-to-v1 遷移邊、僅 header descriptor、精確代際 JSONL 釋出與[已釋出 Session 格式](2026-08-31-released-session-format-migrations.zh.md)定義的目前專用恢復。[歷史 Session 只讀遷移準備](2026-09-05-read-only-session-migration-preparation.zh.md)負責記憶體恢復與寫入釋出之間的 JSONL 時序。V2 讓物理 codec 對普通事件詞彙與 payload 新增項保持中立：相鄰遷移邊凍結 released source 與 target 清單，同版本恢復則應用已安裝的 known-event set 與目前 payload 語義。第一方 writer 不透過 `Session.append` 設定 `ignorable`，而一個儲存庫外外掛仍依賴該欄位；同版本保留由[外部外掛保留決策](2026-08-30-retain-ignorable-external-session-events.zh.md)定義，更嚴格的歷史規則由 [alpha 遷移拒絕決策](2026-08-31-alpha-historical-unknown-event-refusal.zh.md)定義。未知型別守衛仍只在讀取側生效，因為 append 時的詞彙拒絕會中斷活躍 Session 的持久化。JSONL 會在目前 header 或事件解析前從最小原始 header 分類外來版本，因此結構完全不同的未來格式會報告升級方向而不是"損壞"。

## 曾考慮的替代方案

- **大小兩級版本號**：能否轉換這一位資訊屬於每一步的升級器，把它預先固化進編號形狀會做出錯誤承諾。
- **未知事件預設可忽略**：把忘寫標記的後果從可見的過度拒絕反轉成靜默損壞。
- **在僅 header 列表期間遷移**：讓便宜清單改變儲存，而且需要讀取事件正文才能計算 header 無法證明的事實。列表返回 descriptor，事件正文讀取負責釋出。
- **外掛執行時註冊已知事件型別**：不予採用，因為該方案會讓已知集依賴外掛組合，而且只註冊事件名稱，無法判定省略事件是否安全。持久化的 `ignorable` 標記把該分類保留在每條記錄中；[外部外掛保留決策](2026-08-30-retain-ignorable-external-session-events.zh.md)定義目前消費方約束。
- **重複釋出標記或執行時狀態服務**：為不控制 Session 執行的維護資訊增加另一個可變真源。寫入器常數與釋出記錄已經足夠。
- **依賴網路的文件門禁或釋出自動化**：網路查詢會把本地文件檢查耦合到憑證與 GitHub 可用性；記錄一致性不需要執行時服務或釋出工作流變更。核實釋出仍是釋出操作者的明確義務。
