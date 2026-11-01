/** Authored language pairs for generated persistence reference prose. */

/** Language of a generated persistence reference. */
export type PersistenceCatalogLocale = 'en' | 'zh'

const english = {
  title: 'Session Persistence Event Catalog',
  intro: 'Every repository-declared durable Session event appears here with its source declaration and resolved types. The catalog covers the logical and physical headers, event envelopes, and every plugin declaration merge. See [Session](subsystems/session.md) for replay and [persistence](subsystems/persistence.md) for storage.',
  generation: 'Run `pnpm run gen-persistence-catalog` to regenerate both catalog languages, their pairing record, the known-event module, and the machine schema inventory. `pnpm run verify-persistence-catalog` checks all generated files. Declaration fences preserve source JSDoc and type references; resolved definitions expose their transitive structure.',
  envelopeIntro: 'The envelope carries `type`, `seq`, `time`, `data`, optional `ignorable`, and conditional `surfaceOp` / `sourceEventSeqs`. A **surface** event produces model history; a **log-only** event does not. The inventory covers this repository; external plugin types require their own declarations and are outside this catalog.',
  envelope: 'Event envelope', events: 'Events', sources: 'Sources: ', source: 'Source: ', types: 'Types: ',
  fingerprints: 'Persistence type fingerprints',
  fingerprintsIntro: 'The [machine inventory](persistence-schema.json) contains every reachable normalized type and its SHA-256 digest. Root digests include referenced types. Comments, source locations, alias names, erased brands, readonly markers, and harmless field, union, or intersection reordering do not affect these fingerprints. Tuple order, property names, value types, and optionality do. Catalog text and source locations can still produce a diff when digests stay unchanged.',
  historyIntro: 'The [format references](persistence-changes/historical-formats/README.md) cover every historical Session format. The [change records](persistence-changes/README.md) acknowledge exact transitions using snapshots kept in this tree. Follow the [review workflow](cookbook/reviewing-persistence-type-changes.md) to classify a change and record it. These checks cover declared type structure; opaque payload contents and behavior without type changes are outside their scope.',
  rootColumns: '| Root | Kind | SHA-256 | Resolved type |',
  definitions: 'Resolved persistence types',
  definitionsIntro: 'Each definition appears once. References preserve sharing and recursion; the digest beside a definition includes its complete reachable structure. Source names and locations identify its declarations but are excluded from its digest.',
  propertyColumns: '| Property | Presence | Type |', positionColumns: '| Position | Presence | Type |',
  optional: 'optional', required: 'required', rest: 'rest', index: 'index signature',
  emptyObject: 'Object with no declared properties.', arrayPrefix: 'Array of ', arraySuffix: '.',
  oneOf: 'One of:', opaque: ' (opaque)', opaqueExplanation: ": the declaration does not expose the stored value's internal fields.",
  sourceCompatibility: 'Source compatibility: ', attributionAdditions: 'Attribution-only additions: ',
  sourceColumns: '| kind | Form property | Other required fields | Full definition |',
  notDeclared: 'not declared', none: 'none',
}

const chinese: Record<keyof typeof english, string> = {
  title: '工作階段持久化事件目錄',
  intro: '本目錄列出儲存庫宣告的每個持久化 Session 事件及其原始碼宣告和解析型別，覆蓋邏輯與物理 header、事件信封以及各外掛的宣告合併。回放規則參見 [Session](subsystems/session.zh.md)，儲存規則參見[持久化](subsystems/persistence.zh.md)。',
  generation: '執行 `pnpm run gen-persistence-catalog` 可重新生成目錄的兩種語言、配對記錄、已知事件模組和機器 schema 目錄。`pnpm run verify-persistence-catalog` 檢查所有生成檔案。宣告圍欄保留原始碼 JSDoc 和型別引用；解析後的定義展開其傳遞引用結構。',
  envelopeIntro: '信封包含 `type`、`seq`、`time`、`data`、可選的 `ignorable` 以及條件欄位 `surfaceOp` / `sourceEventSeqs`。**surface** 事件產生模型歷史，**log-only** 事件不產生模型歷史。目錄覆蓋本儲存庫；外部外掛型別需要獨立宣告，不屬於本目錄。',
  envelope: '事件信封', events: '事件', sources: '來源：', source: '來源：', types: '型別：',
  fingerprints: '持久化型別指紋',
  fingerprintsIntro: '[機器可讀目錄](persistence-schema.json)包含所有可達的規範化型別及其 SHA-256 摘要。根型別的摘要涵蓋引用型別。註解、原始碼位置、別名、擦除的品牌標記、readonly 標記以及無語義變化的欄位、聯合型別或交叉型別重排不影響摘要；元組順序、屬性名稱、值型別和可選性會影響摘要。摘要不變時，目錄文字和原始碼位置仍可能產生 diff。',
  historyIntro: '[格式參考](persistence-changes/historical-formats/README.zh.md)覆蓋每個歷史 Session 格式。[變更記錄](persistence-changes/README.zh.md)透過儲存在本原始碼樹中的快照確認精確的型別轉換。按照[評審流程](cookbook/reviewing-persistence-type-changes.zh.md)分類並記錄變更。這些檢查覆蓋已宣告的型別結構；不透明載荷的內部內容和未改變型別的行為變更不在檢查範圍內。',
  rootColumns: '| 根型別 | 類別 | SHA-256 | 已解析型別 |',
  definitions: '已解析的持久化型別',
  definitionsIntro: '每個型別定義僅列出一次。引用保留共享和遞迴關係；定義旁的摘要涵蓋其完整可達結構。原始碼名稱和位置標識宣告來源，但不參與摘要計算。',
  propertyColumns: '| 屬性 | 存在性 | 型別 |', positionColumns: '| 位置 | 存在性 | 型別 |',
  optional: '可選', required: '必需', rest: '剩餘項', index: '索引簽名',
  emptyObject: '無已宣告屬性的物件。', arrayPrefix: '', arraySuffix: ' 的陣列。',
  oneOf: '以下型別之一：', opaque: '（不透明）', opaqueExplanation: '：此宣告未暴露儲存值的內部欄位。',
  sourceCompatibility: '訊息源相容策略：', attributionAdditions: '僅表示歸屬的新增 kind：',
  sourceColumns: '| kind | form 屬性 | 其他必需欄位 | 完整定義 |',
  notDeclared: '未宣告', none: '無',
}

/** Complete translated prose; adding an English key requires its Chinese counterpart. */
export const persistenceCatalogText = { en: english, zh: chinese }
