# Agent Note: 規範的 V3 Session 事件信封

Status: implemented

[English](2026-09-06-v3-canonical-session-envelopes.md) | 中文

## 問題

一個 Session 事件會經過記憶體、持久化與瀏覽器協定讀取器。如果其型別允許缺少位置宣告或攜帶無關 surface 中繼資料，讀取器就可能靜默遺漏訊息，或對哪些欄位影響重建產生分歧。替換端點的多種拼寫與空請求頭可選欄位，也使不同儲存記錄能夠描述同一請求。相互矛盾的工具失敗中繼資料會讓模型歷史與診斷報告不同結果。

## 決策

Session 格式 V3 使用一種規範事件信封。每個 `system/message`、`user/message`、`assistant/message` 與 `tool/result` 都要求 `surfaceOp`。已知僅日誌事件僅允許 `type`、`seq`、`time`、`data` 與可選的 `ignorable: true`；其 TypeScript 變體將兩個 surface 中繼資料欄位宣告為可選 `never`。原生未知或已退役的可忽略信封（包括其中繼資料）保持不透明。assistant 訊息嵌入精確提供者 stream，且只有此類訊息禁止 `sourceEventSeqs`。system、user 與 tool 訊息可以引用非空、唯一的較早來源序號集合。

`SurfaceOp` 恰好為 `'append'` 或 `{ op: 'replace', startSeq, endSeq }`，端點使用 `SessionSeq`，不接受別名或額外來鍵。兩個端點都早於替換事件，並按目前 surface 順序而非數值序號順序標識閉區間。Session 接納還驗證目前成員關係、端點順序、完整引用覆蓋與僅修改內容的單節點工具結果替換。`shadowedRange.start/end` 等壓縮（compaction）載荷欄位與摺疊結果欄位保留各自名稱；這不是對載荷進行遞迴重新命名。

目前接納拒絕任何 `request/header.header.system` 以及恰好為空的 `tools: []` 或 `adapterDefaults: {}`。系統提示詞屬於 `system/message`；`request/header` 仍是請求非歷史狀態的快照。寫入方省略兩個空可選欄位。僅含空白的系統內容、`config.stop: []`、巢狀 header/source/data 擴充功能與巢狀工具 schema 值保持原樣。帶有 `data.error` 的 `tool/result` 要求 `message.isError === true`；失敗結果不必攜帶錯誤身份。目前讀取與遷移均不會根據矛盾中繼資料推斷錯誤結果。

### 驗證所有權

[核心 Session](../../../../packages/core/session/src/surface.ts)負責事件本地的位置、請求頭空欄位與工具錯誤規則，其 surface 管理器負責需要事件日誌的關係。seed、append 與恢復會在接納事件前應用這些規則。它們不會為外掛自有載荷建立通用 schema，也不會提前展開嵌入式提供者 stream。

通用 Gateway 用戶端返回未經驗證的原始輸出。因此，現有 [SessionEventStream](../../../../packages/api/session-controller/src/client/transport.ts) 會在釋出前檢查 follow 快照、即時持久條目與歷史頁。其私有[協定事件檢查器](../../../../packages/api/session-controller/src/client/session-wire-event.ts)驗證精確信封，並將事件本地規則委託給可在瀏覽器中使用的核心驗證器。它不新增通用 Gateway schema，也不驗證無關外掛載荷。surface 成員關係與來源是否存在仍由 Host 負責，因為瀏覽器視窗可能未包含較早事件。

### 已釋出 V2 到 V3 的轉換

[V2 到 V3 規範](../../../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)負責完整歷史轉換、[規範化規則](../../../../packages/session/session-format-v2-to-v3/README.zh.md#canonical-envelopes)及[原生准入與恢復](../../../../packages/session/session-format-v2-to-v3/README.zh.md#native-v3-admission)。將這些規則集中在一起，可以避免把保持事件數量的規範化步驟誤認為恆等遷移。凍結的關係驗證使用私有檢視而非執行時別名；原始 V3 產物仍具權威性。

## 曾考慮的替代方案

**將缺失的位置預設為 append。** 這會憑空新增儲存記錄中不存在的模型歷史決策，並接納無效 V2 產物。要求位置宣告，使所有讀取器必須依據同一證據。

**目前讀取器接受兩種替換拼寫。** 這會保留兩種持久表示，並使驗證取決於接收記錄的讀取器。只有相鄰遷移邊解釋已釋出的鍵；目前讀取器只接受 V3 鍵。

**規範化所有空值或修復工具結果。** 空 stop 列表、空白與外掛載荷可能有意義。刪除它們或根據診斷設定 `isError` 會改變已記錄事實。遷移邊只執行具名且保持語義的轉換，並拒絕矛盾。

**複製歷史驗證器或直接向其傳入 V3 事件。** 複製會重複關係語義；直接複用則會接受舊信封拼寫，並誤解系統節點與修復身份。嚴格的 V3 驗證加組合後的私有檢視，可以在不擴大目前接納範圍的前提下複用凍結關係。

## 後果

型別化事件、持久化與瀏覽器歷史對必填位置和事件本地失敗語義保持一致。畸形記錄在投影前失敗，而不會從模型歷史中消失。遷移放棄對矛盾記錄的盡力恢復；[已釋出格式的釋出策略](2026-08-31-released-session-format-migrations.zh.md)保證保留的源代次不被修改。

本決策部分取代[工作階段 surface](2026-06-18-session-surface.zh.md)與[可重建請求](2026-07-05-reconstructable-requests.zh.md)說明中的信封表示細節。它們繼續負責有序投影與已記錄請求的所有權。[系統提示詞 surface 節點決策](2026-09-02-system-prompt-as-surface-node.zh.md)保留提示所有權、受保護頭節點語義與遷移依據。[V2 嵌入式 stream 決策](2026-09-01-v2-embedded-assistant-streams.zh.md)繼續負責嘗試結算、精確 stream 證據與改變事件數量的遷移；V3 保留這些決策。

## 驗證

[核心接納測試](../../../../packages/core/session/tests/canonical-envelopes.spec.ts)固定無效 seed/append/restore 記錄、型別化 surface 變體、可選失敗身份與拒絕後派生狀態不變。[瀏覽器傳輸測試](../../../../packages/api/session-controller/tests/transport.client.spec.ts)檢驗釋出前的嚴格 follow/page 接納。[遷移測試](../../../../packages/session/session-format-v2-to-v3/tests/canonical-envelopes.spec.ts)覆蓋轉換與恢復；凍結的相鄰遷移邊測試保留歷史語義。必需覆蓋還包括編解碼器接納、空白與空 stop 列表保留、不透明載荷保留，以及按合法 surface 順序排列但數值遞減的替換端點。
