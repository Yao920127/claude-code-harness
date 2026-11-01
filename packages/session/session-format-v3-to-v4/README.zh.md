---
description: "完整的 V3 到 V4 Session 轉換與原生接納：工具角色結果、生產者來源、父目錄、引用重對映及拒絕規則。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v3-to-v4

[English](README.md) | 中文

## 概述

在不改寫已儲存代際的前提下，將受支援的已釋出 V3 Session 恢復為 V4。本頁完整說明遷移邊的轉換、保留、前置證據與拒絕規則，再單獨說明原生 V4 接納。轉換提升工具結果、重新命名訊息來源、補齊有明確證據的中斷回合，並追加缺失的父目錄事實。持久化層負責檔案讀取和後繼代際釋出；本庫負責轉換與目標規則。

## 目錄

- [使用本包](#use-this-package)
- [V3 到 V4 規範](#v3-to-v4-specification)
  - [Header 與物理分幀](#header-and-framing)
  - [工具結果表示](#tool-results)
  - [擴充功能資料](#extension-data)
  - [訊息來源轉換](#message-sources)
  - [父目錄前置證據](#parent-catalog)
  - [序號引用與繼承](#sequence-references)
  - [Delivery 代際](#delivery-guards)
  - [源審計與拒絕](#source-audit)
- [原生 V4 接納](#native-v4-admission)
  - [Header、訊息與表面中繼資料](#native-fields)
  - [生命週期與引用關係](#native-relationships)
  - [Developer 變更與延遲 schema](#developer-changes)
  - [Fork 生成的結果](#fork-results)
  - [驗證入口與恢復](#native-recovery)
- [理解實作](#understand-the-implementation)
- [進一步閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

透過 [catalog](../session-format-catalog/README.zh.md) 完成恢復。直接匯入用於 catalog 組裝和測試；本庫沒有 Cordis 掛載設定。[公開匯出](src/index.ts)提供相鄰遷移、已釋出的 V3 源 codec、V4 codec 和目標驗證器。源 codec 仍由 [V2 到 V3](../session-format-v2-to-v3/README.zh.md) 所有。

僅 header 遷移會驗證並推進中繼資料，不讀取正文或收集子 Session：

```text
const targetHeader = sessionFormatV3ToV4.migrateHeader(sourceHeader)
```

歷史正文恢復要求顯式的子級證據。沒有該繫結時，`sessionFormatV3ToV4.createStage()` 會拒絕；空陣列明確宣告沒有子級。持久化層必須收集完整的可用直屬子級集合，而隔離的 transcript 回放可以提供其刻意為空的集合。Catalog 存續期間，證據必須保持不變。

```text
const catalog = createSessionFormatCatalogWithChildren(childFacts)
const restore = catalog.createRestore(physicalHeader, {
  recovery: 'strict', validation: 'current',
})
for (const row of physicalRows) restore.decodeRow(row)
const artifact = restore.finish()
```

每次恢復都建立獨立的 Stage 狀態。緊湊 run 以迭代器展開，不物化中間事件陣列。部分輸出不代表成功：後續行或 `finish()` 仍可拒絕整份產物。[格式協定](../session-format/README.zh.md)負責排程和錯誤處理；[JSONL 持久化](../session-persistence-jsonl/README.zh.md)負責源讀取、準備以及經驗證的獨佔後繼釋出。

-----

<a id="v3-to-v4-specification"></a>
## V3 到 V4 規範

本邊只改變下列明確命名的表示，補齊有明確證據的中斷回合，並追加證據完整的缺失目錄事實。未知可忽略事件的型別獲得名稱空間；每個獲准源事件的 time、訊息身份以及這些轉換和下述座標重對映之外的欄位均保留。它不建立 system prompt、developer 事件、工具執行或替換訊息。更早的 V0–V2 輸入先經過各自現有遷移邊到達 V3；那些邊保留自身的轉換與拒絕策略。

<a id="header-and-framing"></a>
### Header 與物理分幀

| 輸入 | V4 結果 | 保留或拒絕 |
|---|---|---|
| 邏輯 V3 header | `version: 3` 變為 `4` | 先執行已釋出 V3 header 驗證；其他邏輯 header 欄位均不變。 |
| V3 物理行 | 已釋出 V3 源 codec 解碼事件與緊湊 run | 源分幀和源事件區間解碼仍歸前一個包所有。 |
| V4 物理行 | `releasedV4SessionFormatCodec` 複用已釋出 V2 分幀並執行原生 V4 接納 | 不把 V4 事件投影到 V3 語義驗證器。編碼和解碼不執行此入邊遷移。 |

本邊不重新命名 preset id、PTC dispatch 事件標籤、檔案附件或物理檔名。內嵌流中的內容擴充功能遵循下列規則，流順序和索引保持不變。

<a id="tool-results"></a>
### 工具結果表示

[liftToolResult](src/tool-role.ts) 轉換 `tool/result` 事件中源表示為 user 角色的訊息。它要求非空訊息 id、帶非空 call id 的 `{ kind: 'tool', callId }` 來源，以及恰好一個引用同一呼叫的 `tool-result` block。該 block 的 content 必須為陣列；可選 `isError` 必須為布林值。

| V3 欄位 | V4 欄位或處理 |
|---|---|
| `data.message.role: 'user'` | `role: 'tool'` |
| `data.message.content[0].toolCallId` | `data.message.toolCallId`，等於保留的 `source.callId` |
| `data.message.content[0].content` | 直接作為 `data.message.content`，包括空內容 |
| `data.message.content[0].isError` | 可選的 `data.message.isError` |
| Wrapper 的 `type: 'tool-result'` | 隨 wrapper 移除 |
| 訊息 `id`、`source` 和事件欄位 | 保留；不生成新的訊息或呼叫 id |

只有 wrapper 提供具有解釋語義的呼叫 id、content 和可選錯誤標誌。Wrapper 的其他欄位變為 `plugin:result:<原欄位名>`；外層訊息除 `id`、`role`、`source` 和 `content` 外的欄位變為 `plugin:message:<原欄位名>`。字尾保留完整原名稱，包括已有字首。不同 owner 與重名欄位分別保留值；`__proto__` 和 `constructor` 的自有資料保持完整。不新增 metadata 容器或新的內容型別。

格式錯誤的 canonical wrapper 引發格式錯誤。目前轉換器不支援巢狀結果，遇到時拒絕且不釋出 successor。轉換不會修復矛盾的 `data.error`；原生目標驗證要求它與 wrapper 的 `isError: true` 同時出現。後續可以擴充功能轉換器支援範圍，同時保持既定的原生 V4 表示。

<a id="extension-data"></a>
### 擴充功能資料

V3 未知內容標籤變為 `plugin:<original-type>`，其他欄位原樣保留且不作解釋。流起始塊的 `blockType` 使用相同標籤，其他欄位的原始鍵和值均保留。內容標籤的已有字首會再次新增，使不同舊名稱保持不同。不遍歷實參、回放狀態和外掛內容欄位。這些名稱不會載入或執行外掛。

請求工具定義保留自有欄位的原始名稱和值，包括普通擴充功能中繼資料。若定義擁有頂層 `deferLoading` 欄位，則拒絕 V3 遷移：該欄位僅在 V4 中定義，因此本遷移邊不為它賦予歷史含義。巢狀參數資料保持不變。原生 V4 對 `deferLoading: true` 的接納規則不變。

<a id="message-sources"></a>
### 訊息來源轉換

[訊息遍歷器](src/sources.ts) 只存取下列 payload 位置。它轉換舊外掛包裝，並保留直接來源 kind。

| 所屬事件 | 訊息位置 |
|---|---|
| `user/message` | `data` |
| `system/message`、`assistant/message`、`tool/result` | `data.message` |
| `agent/inbox/spliced` | 每個 `data.inserted[]` 成員 |
| `session/title-llm-request` | 每個 `data.messages[]` 成員 |
| `developer/message` | 僅由原生遍歷器處理；未知可忽略 V3 事件被名稱空間化，其 payload 不被存取 |

外掛來源要求字串 `plugin`，允許空字串。轉換移除該屬性、替換 `kind`，並保留其他所有自有 JSON 屬性。直接來源 kind 必須為非空字串。轉換不從訊息文字、工具參數、設定或目前檔案推斷缺失中繼資料。

| 精確的 V3 `plugin` | V4 `kind` |
|---|---|
| `compact` | `compact-checkpoint` |
| `tools-code-mode`、`tools-ptc` | `ptc-mode` |
| `dsh-compaction-basic` | `compact-basic` |
| system 角色訊息中的 `@deepseek-ai/dsh-system-prompt` | `system-prompt` |
| 其他角色中的 `@deepseek-ai/dsh-system-prompt` | `runtime-context` |
| 下文列出的同名第一方生產者 | 精確的 plugin 字串 |
| 其他任何外掛名 | `plugin:` 後接完整的原始名稱 |

同名生產者為 `agent-instructions`、`session-reference`、`team-message`、`goal`、`skill-invocation`、`skill-catalog`、`coordinator`、`subagent-report`、`subagent-settled`、`webhook`、`agent-message`、`model-selection`、`plan-mode`、`time-context`、`tmux-context`、`user-approval`、`repeat-tool-reminder`、`tool-cordis`、`cordis-host-runner`、`tool-goal`、`tool-jobs`、`hooks-codex`、`hooks-claude-code`、`schedule` 和 `dsh-session-title-llm`。

完整的外掛字串保留在 `plugin:` 之後：名為 `acme` 的外掛變為 `plugin:acme`。直接來源保留原 kind 和每個自有 JSON 欄位，包括未知或已有字首的 kind。

來源查詢不遞迴進行。捕捉的請求文字、assistant 回放狀態與流、工具參數／內容中繼資料、Team 載荷以及任意巢狀物件均保留，除非另有明確命名的規則適用。

<a id="parent-catalog"></a>
### 父目錄前置證據

`historicalChildCatalogSource()` 收集直屬 subagent 子 Session 的 id、建立時間、繼承截點之後自身的 `subagent/descriptor` 事件數量，以及首個 descriptor 載荷。子 Session 必須帶有 `origin: 'subagent'` 和直接父級。補充事實要求 `childId`、非負安全整數 `childCreatedAt` 與 `descriptorCount`，以及 `descriptor` 屬性；缺失的 descriptor 用 null 表示。可選 `sourcePath` 用於診斷。

| 可用證據 | 遷移決定 |
|---|---|
| 一個 version 1 descriptor | 要求字串 provider 與 label；匯出 `mode: 'continuable'`。 |
| 一個 version 2 或 3 descriptor | 要求字串 provider；按目錄規則使用其 mode 和可選 label。 |
| 沒有 descriptor，或 descriptor 版本不受支援 | 保留已有父目錄項；否則追加模式未知的目錄項。 |
| 多個自身 descriptor | 保留已有父目錄項，不比較 mode／label；否則追加模式未知的目錄項。 |
| 已有自身父目錄項 | 保留條目及其擴充功能；要求子建立時間一致，並在恰好一個受支援的自身 descriptor 可用時比較其 mode／label。 |
| 缺少自身父目錄項，且受支援證據完整 | 追加帶 child id、建立時間、mode 和可選 label 的 version-0 目錄事實。 |
| 缺少自身父目錄項，且證據不完整 | 追加 version-1 `subagent/catalog`，記錄 header 身份和未知模式，不編造標籤。 |

Catalog version 0 和 1 要求字串 `childId`、非負安全整數 `childCreatedAt`、`continuable` 或 `one-shot` mode（version 1 還接受 `unknown`），以及 continuable mode 下的字串 label；任何 mode 下存在的 label 都必須是字串。重複的自身 child id 被拒絕。沒有對應保留子日誌的已有條目仍保留在父日誌中。Descriptor 收集不恢復子級的舊 continuation composition，也不從工具參數恢復已刪除子級。未知模式條目保留 header 身份資訊，不宣告子 descriptor 受支援。

Stage 只把最終繼承截點之後的父目錄記錄作為候選。每個 inherited marker 都會丟棄更早的目錄候選，不解釋其載荷。缺失項追加在所有源事件之後，按建立時間、child id 排序，並使用連續的新序號。時間取最後一個源事件的 time；空日誌則取 header 建立時間。這些記錄既不進入模型表面，也不改變繼承計數。

儲存提供可識別的直屬子證據，並在準備、memo 複用與釋出時重新檢查成員集合和物理修訂。JSONL 提供者隔離不可讀子 header、子日誌解碼失敗和無效 descriptor 欄位，同時保留其他目錄項；準備父目錄時不會遷移子目錄。轉換器仍拒絕衝突的已提供事實和發生變化的父歷史。[JSONL 持久化](../session-persistence-jsonl/README.zh.md)擁有警告、來源檢查與子工作階段錯誤隔離。目前 V4 讀取不呼叫本轉換器，直接驗證原生目錄欄位、唯一性及投遞迴屬。

<a id="sequence-references"></a>
### 序號引用與繼承

當回合仍開啟但沒有開啟的 step，且下一個連續編號的 `turn/start` 緊跟非空的 `next-turn` 型別 `agent/inbox/spliced` 時，Stage 可補齊該回合。它緊挨新 start 之前插入原因是 `interrupted` 的 `turn/end`，時間戳取該 start。開放尾部仍保持開放。其他回合順序錯誤、未結算工具和進行中的 compaction 仍被目標驗證拒絕。原生 V4 不執行此修復。

插入後，後續信封重新連續編號，並重對映已審計的同日誌引用：`sourceEventSeqs`、替換端點 `startSeq/endSeq`、命令完成的 `sourceEventSeq`、標題的 `messageSeqs`、compaction 的 `shadowedRange` 與 `shadowedSeqs`，以及圖片 offload 目標的 `seq`。捕捉的 Session 引用、帶代際的 delivery 座標、turn／step 編號、stream 與圖片索引、id 和任意 JSON 保持原值。未知可忽略事件的載荷和表面中繼資料保持不透明，只重排其信封序號。沒有插入時，源事件座標不變；追加的目錄記錄只擴充功能字尾。

對於 seeded Session，最後一個攜帶 `inherited: true` 的 `session/end-seed` 確定繼承事件數量，且不計該 marker。目標計數包含該 marker 之前插入的事件。傳入的源截點必須與 V3 Stage 原始 marker 位置一致，包括先前 V0–V2 遷移已對其重對映的情況；缺少 tagged marker、unseeded Session 含 inherited marker、或截點超出事件範圍時拒絕。Unseeded Stage 在 EOF 前公開零；seeded Stage 到 `finish()` 才確定計數。Untagged marker 不定義 fork 繼承。

<a id="delivery-guards"></a>
### Delivery 代際

| Delivery 記錄 | 接納與保留 |
|---|---|
| 任何被解釋的 `session-log-deepseek/delivery-accepted` | 代際必須為非負安全整數；省略表示 V0。 |
| V3 源 marker 宣告 generation 4 | 拒絕：提升 header 不得啟用目標代際的 watermark。 |
| generation 3 的 V3 源 marker | 要求非空 Session id 和早於 marker 的非負安全整數 `throughSeq`；只有在繼承截點之前且帶 `parentSession` 時才允許其他 Session id。 |
| 其他源代際，包括高於 4 的值 | 原樣保留事件型別及 payload 座標；它們在 V4 中仍未啟用。 |
| generation 4 的原生 V4 marker | 以 V4 為目前代際，應用同樣的較早座標和 Session 歸屬檢查。 |
| 原生 V4 中的歷史 marker，包括 generation 3 | 保留記錄的座標與身份；它不是 V4 接納 watermark。 |

不改寫投遞 payload 或事件型別。未來的啟用檢查歸對應的更高版本遷移所有，本邊只檢查向 V4 的提升。標記的信封序號隨插入重對映；源代際歸屬仍按原 V3 序號和繼承截點驗證。

<a id="source-audit"></a>
### 源審計與拒絕

Stage 之前先執行 V3 物理解碼與 header 驗證。Stage 按上述規範檢查連續序號、源截點、canonical 工具結果 wrapper、命名的 plugin 來源、delivery 歸屬及傳入的目錄證據。它不執行完整的已釋出 V3 語義恢復器，也不複製 V2→V3 的事件／內容允許列表。完整恢復還會應用下述 V4 目標規則；物理解析、Stage 轉換與目標恢復是不同的檢查。

只轉換列明的訊息及欄位。無關事件及任意 JSON 不會因字串或數字匹配而獲得新含義。固定的 `RELEASED_V3_EVENT_TYPES` 集合獨立於目前 writer 區分源事件和擴充功能。Stage 在解釋載荷或查詢 V4 詞彙之前拒絕 V3 未知必需事件，包括 V4 已認識的名稱。未知可忽略事件名稱變為 `plugin:<original-name>`，載荷不變。不隱含通用源 schema 驗證或遞迴數字欄位推斷。

只有 canonical V3 `tool/result` wrapper 具有保留資訊的轉換。其他被解釋位置中的已退役 `tool-result` block 由目標接納拒絕，不作為無效 V4 block 保留。原生 V4 在 recoverable 字尾抑制前應用同樣的標籤拒絕。檢查只覆蓋以下位置：

| 所有者 | 檢查退役標籤的內容 |
|---|---|
| `user/message` | `data.content[]` |
| `system/message`、`developer/message`、`assistant/message`、`tool/result` | `data.message.content[]`；canonical 源 tool/result wrapper 在目標檢查前已提升 |
| `agent/inbox/spliced`、`session/title-llm-request` | 分別為 `data.inserted[].content[]` 與 `data.messages[].content[]` |
| `team/message/queued` | `data.message.content[]` |
| `compaction/summary`、`tool/ptc-dispatch` | 分別為 `data.summary[]`、可選 `data.rawOutput[]` 與 `data.content[]` |
| 內嵌 assistant 流 | `assistant/message.data.stream[]` 和 `assistant/attempt.data.stream[]` 中 `type: 'chunk'` 的條目：`block-end` 的 `chunk.block.type`，以及 `block-start` 的 `chunk.blockType` |

[退役語法檢查](src/retired-syntax.ts)只檢查直接 block 標籤，不遍歷任意後代。工具參數、回放狀態、JSON-schema parameters、巢狀中繼資料及未知 ignorable 事件載荷保持不透明。未知 ignorable developer 載荷推遲到讀取器詞彙表識別它時檢查；writer 即使給已知 developer 記錄標上 ignorable，也會驗證它。

直接 Stage 可對格式錯誤的資料丟擲 `SessionFormatError`，或在無法保留資訊地轉換時丟擲 `SessionFormatUnsupportedMigrationError`。Catalog 把 Stage 失敗包裝為不支援遷移；transformed 目標驗證失敗也使用該分類。Strict current 驗證直接報告目標失敗。物理損壞遵循所選 decoder 恢復策略。任何字首都不構成完成的恢復，拒絕也不授權修改源、釋出部分後繼或退回代際。

-----

<a id="native-v4-admission"></a>
## 原生 V4 接納

已經標記為 V4 的輸入從不執行 V3→V4。原生驗證保留記錄的事件並返回同一產物；它不合成目錄項、fork 結果、developer 變更或修復後的源欄位。以下目錄說明目前已接受 V4 規則，與歷史轉換分開。

<a id="native-fields"></a>
### Header、訊息與表面中繼資料

| 資料 | 原生規則 |
|---|---|
| 邏輯 header | 精確的必需欄位 `version`、`id`、`createdAt`、`isSeeded`、`delegationDepth`；可選欄位 `cwd`、`parentSession`、`origin`、`agentPreset`；無其他鍵。Version 為 4，id 為字串，建立時間／深度為非負安全整數，seeded 為布林值，存在的 cwd 為絕對路徑，可選 id 為字串，存在的 origin 為 `subagent`。 |
| 事件信封 | 必需欄位為 `type`、`seq`、`time` 和 JSON `data`；只允許可選的 `surfaceOp`、`sourceEventSeqs` 與 `ignorable`。序號為連續的非負安全整數，time 為安全整數，存在的 `ignorable` 必須恰好為 true。 |
| 表面訊息 | System、user、developer、assistant 和 tool/result 要求 placement，以及身份明確且角色匹配的訊息。普通訊息信封及角色專用來源接納由已安裝 Session 驗證負責。 |
| 替換與引用 | 端點按目前表面順序選擇包含兩端的區間；引用指向更早事件並覆蓋移除節點。受保護的首個 system head 只能由恰好覆蓋該 head 的單個 system 訊息替換。 |
| Request header | 拒絕已退役的 `header.system`（包括空值）及格式錯誤的 header／data 記錄；已安裝 Session 檢查目前 config、reason、adapter-default 標記，並要求省略空 `tools` / `adapterDefaults`。 |
| 工具結果 | 要求 tool 角色、非空訊息／呼叫 id、匹配的 `source.kind: 'tool'` 與 `source.callId`、直接陣列 content、不含已退役結果 wrapper，以及存在時為布林值的 `isError`。`data.error` 要求 `isError: true`。 |
| System 訊息 | 要求正 turn／step、非空 id、system 角色、陣列 content 和 system-prompt 來源。檢查已知 text／reasoning、tool-call 及 image 欄位；拒絕已退役 tool-result wrapper。額外 JSON 中繼資料及可透過合併擴充功能的 block kind 不會被全域刪除。 |
| 生產者歸屬 | 被解釋的訊息槽要求物件 source，以及非空且不是 `plugin` 的 kind。未知歸屬和自有 JSON 中繼資料保留；這不授予生產者執行時權限。 |

五種表面事件都要求 `surfaceOp`。存在的 `sourceEventSeqs` 必須是非空陣列，包含互異、更早、非負的安全整數序號；`assistant/message` 必須省略它。由於替換必須引用全部移除節點，assistant 事件自身不能替換表面區間。已知純日誌事件不能攜帶任一欄位。替換物件只能包含 `op: 'replace'`、`startSeq` 與 `endSeq`；舊端點名、混合寫法及額外來鍵均被拒絕。

Request-header config 要求非空 provider／model 字串；存在的 reasoning effort 為非空字串。`reason` 為 `initial`、`resume`、`change` 或 `series`，存在的 `startsSeries` 為 true。Adapter-default 標記只能使用 `reasoningEffort` 與 `maxTokens`，值均為 true，且對應 config 值必須存在。這些檢查不執行任意工具 JSON schema。

System image 接納要求非空 attachment id、PNG／JPEG／WebP／GIF MIME 型別之一、非負 bytes、正 width／height、可選字串 name，以及存在時為正的原始尺寸。原生儲存接納與具體模型提供者能否表示該內容是不同的問題。

目前通用接納不會按完整的生成 schema 驗證每個 user／tool／developer content block。它檢查訊息身份、角色、來源與陣列容器；代際專用驗證器只增加此處列出的檢查。因此，未知 block kind 和未檢查的欄位可能透過儲存接納，但仍被提供者拒絕。

<a id="native-relationships"></a>
### 生命週期與引用關係

| 所有者 | 必需關係 |
|---|---|
| `turn/start`、`turn/end`、`step/start`、`step/end` | Turn／step 編號有序，開放所有者匹配，turn／step 不重疊，結束邊界不遺留已宣告或已開始但未解決的工具呼叫。未完成尾部保持開放。 |
| `assistant/message`、`tool/call`、追加的 `tool/result` | 匹配開放 step；宣告的呼叫 id 唯一，開始保留 name／arguments，結果結算一個已宣告呼叫。開始之前的結果必須是精確獲准的 `TOOL_NOT_STARTED` 修復。工具結果的表面替換要求開放 turn，不重放原始呼叫生命週期。 |
| `system/message`、`developer/message`、`assistant/attempt` | 匹配開放 turn 與 step。Request header 和 context 要求開放 turn。 |
| `tool/ptc-dispatch-start`、`tool/ptc-dispatch` | 要求開放 turn、唯一 sub-call 開始與結算、穩定的 root／parent／name／arguments，以及屬於同一 root 的巢狀 parent。 |
| `llm/retry`、`llm/retry-started` | 匹配目前請求 provider 和 turn／step，每條策略鏈的嘗試連續、retry 身份穩定，每次 start 匹配一個先前已排程的嘗試。 |
| `session/title`、`session/title-llm-request` | 引用互異且更早的真人 `user/message` 事件。使用者指定標題沒有引用；其他標題具有引用。LLM 標題請求帶非空引用和一個來源為 `dsh-session-title-llm` 的 user 角色文字訊息。 |
| `command/run`、`command/done` | Run id 唯一；完成記錄對應先前 run。存在的完成 `sourceEventSeq` 引用更早的非 command 事件，並伴隨 success。 |
| `compaction/start`、`compaction/summary`、`compaction/end` | 匹配 compaction id、源 command 和活動 turn 上下文。Summary 區間引用精確的目前表面節點且排除 protected head；成功完成需要一個 summary。繼承的未完成 compaction 在 end-seed marker 處過期。 |
| `compaction/prune` | 其區間引用精確的目前表面節點且排除 protected head；它不要求存在 compaction 事務或其所有者欄位。 |
| Compact checkpoint 替換 | 其 `compact-checkpoint` 來源標識活動 compaction。 |
| 原生 `subagent/catalog` | 檢查繼承截點之後的自身 version-0/version-1 載荷欄位與 child id 唯一性。原生讀取既不收集子日誌，也不比較其物理事實；繼承項不建立自身成員關係。 |
| 繼承截點與 delivery | 應用上文的 marker、座標及代際歸屬規則。 |

這些檢查由 [relationships.ts](src/relationships.ts) 按代際擁有。完整的通用訊息／信封接納與外掛擁有的訊息投影還使用已安裝 Session；單獨的匯出 V4 恢復器不能替代完整 catalog 恢復。

<a id="developer-changes"></a>
### Developer 變更與延遲 schema

本邊不建立 developer 歷史。原生 `developer/message` 要求正 turn／step 座標、developer 角色、非空訊息 id、陣列 content，以及生產者擁有的來源中繼資料。每個 `tool-addition` 或 `tool-removal` block 都要求非空 `toolName`。新增塊拒絕任何自有內嵌 `tool` 欄位，包括其他情況下可作為可選 JSON 中繼資料的值。

含有新增塊的事件必須帶 `headerSeq`，為該事件內全部新增選擇一個更早且已知的 `request/header`。每個名稱必須在那裡恰好匹配一個帶字串 `description` 和物件 `parameters` 的定義。缺失、前向、錯誤型別、未知、歧義或不完整的繫結均被拒絕。沒有新增塊的事件必須省略 `headerSeq`；`sourceEventSeqs` 仍是獨立的派生／替換中繼資料。替換、fork、重新啟動和 compaction 保留記錄的繫結，不查詢目前 registry 或最新 header。

普通訊息、inbox／title 輸入、compaction summary／raw output 以及內嵌 assistant block-start／block-end 記錄中的工具變更塊均被拒絕。存在的 `request/header.header.tools[].deferLoading` 必須恰好為 true；它與是否存在 developer 新增事件無關。空 developer 節點保留表面位置，不產生模型訊息，也不能替換 protected system head。未知 ignorable developer 載荷推遲到讀取器知道該事件型別時驗證。

原生格式支援驗證並保留 developer 歷史。[LLM 執行時](../../llm/llm/README.zh.md) 按路由投影工具更新，並在不支援的路由上省略 developer 訊息；Chat 和 Trajectory 渲染工具變更通知。這些消費者使用已接受的表示，不新增格式。

<a id="fork-results"></a>
### Fork 生成的結果

Fork 種子建構歸核心 Session 所有，不屬於此遷移。原生 V4 接納它生成的 `TOOL_NOT_STARTED` 合成錯誤結果，其 id 為 `forked-tool-result-<callId>-<seq>`，角色為 tool，source／call id 匹配，帶 `isError: true`、`ToolNotStartedError` 和一個 text block。追加結果攜帶自身序號且沒有源引用；後續替換保留更早的字尾，並精確引用那個原始結果。分支專用文字保留，不歸一化為崩潰恢復措辭。

已經開始的 fork 呼叫使用 `TOOL_OUTCOME_UNKNOWN` 錯誤結果，並保留記錄的開始引用。它們遵循普通已開始呼叫的驗證；上文專用於 not-started 的身份規則不適用於它們。Fork 建構透過 `turn/end.reason.kind: 'forked'` 關閉開放尾部，保留先前已結束的 step 和 turn。

普通 interrupted not-started 修復保留 canonical 歷史整數字尾和精確的崩潰恢復文字。兩種形式都必須按生命週期規則結算一個已宣告呼叫。Stage 保留已有 fork／call／message id；它不從字串字首推斷祖先關係，也不執行工具。

<a id="native-recovery"></a>
### 驗證入口與恢復

| 入口 | 檢查與限制 |
|---|---|
| V4 codec 解碼 | 已釋出物理分幀加 V4 行接納。Required 前代 PTC 標籤、已退役 system header 和自身負責的錯誤原生欄位，在 recoverable 字尾抑制前被拒絕。 |
| V4 codec 編碼 | 同樣的原生行檢查；writer 仍驗證 ignorable developer 載荷。 |
| 原生 catalog，`validation: 'transformed'` | 只有 codec 檢查；因為沒有執行遷移，跳過產物恢復。這不是完整原生驗證。 |
| 歷史 catalog，`validation: 'transformed'` | 轉換後執行代際自有的 V4 恢復；跳過已安裝 Session 的通用驗證。 |
| Catalog，`validation: 'current'` | 代際自有 V4 檢查加已安裝目前 Session 的 header、信封、訊息、表面與投影驗證。Fixture 與釋出驗證使用 strict recovery。 |
| 原生 JSONL scanner | 在恢復前把已安裝詞彙表傳給行接納，並在暴露已接納字首前執行必需的 V4 關係檢查。 |

支援詞彙表的恢復器拒絕未知 required 事件。未知 ignorable 載荷不被解釋；required `tool/code-dispatch-start` / `tool/code-dispatch` 作為退役語法被拒絕，而 ignorable 前代事件保持不透明。沒有詞彙表時，物理解碼器推遲解釋 ignorable developer 載荷；知道 developer 事件的原生讀取器必須在接納 recoverable 字尾前驗證它們。只有被接納的 inherited marker 才能確定截點。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部機制 — 點選展開</summary>

遷移宣告建立相互獨立的流式 Stage。緊湊事件段透過迭代器展開，不生成中間事件陣列。V3 到 V4 Stage 在發出 V4 事件時重寫歷史訊息來源、提升歷史工具結果包裝，並插入有明確證據的中斷回合結束事件。它為每個源事件保留一個源到目標的序號對映項，用於本地引用重對映。V4 編解碼器只為物理頭部和源範圍分幀使用已釋出 V2 編解碼器，並直接驗證原生工具角色行；它不會呼叫已釋出 V3 驗證器或源轉換檢視。JSONL 掃描器在抑制可恢復行之前呼叫 `assertV4RowAdmission`，並在返回完整邏輯字首之前呼叫共用的強制關係驗證器。

目標恢復器驗證原生欄位和強制跨事件關係，然後返回原始產物。未知的可忽略事件保持不透明，未完成的繼承壓縮事務在 end-seed 標記處結束。本包不釋出執行時不變數伴隨外掛，因為這個純函式庫不擁有獨立維護的執行時觀測。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [格式版本與釋出狀態](../../../docs/session-format-status.zh.md) — 目前檢出寫入版本與已釋出格式的權威記錄。
- [新增 Session 格式版本](../../../docs/cookbook/adding-a-session-format-version.zh.md) — 相鄰遷移邊的整合與驗證。
- [JSONL 持久化](../session-persistence-jsonl/README.zh.md) — 不可變代際選擇與釋出。

-----

<a id="model-experience"></a>
## 模型體驗

### 歷史恢復

#### 模型看到什麼

歷史請求保留記錄的訊息與模型設定。[遷移 Stage](src/migration.ts)將 `tool/result` 載荷表示為工具角色訊息，不新增模型可見內容；目錄記錄不會直接進入模型訊息，後續子代理列舉可以發現歷史子 Session。

#### Token 影響

轉換不改變請求文字或承載 token 的資料。

#### KV Cache 影響

該遷移邊保留記錄的請求字首。提供者快取的可用性和淘汰策略不屬於本庫職責。

## 已知限制與待辦工作

<a id="known-limitations-and-deferred-work"></a>

- **歷史轉換器覆蓋範圍** — 未支援的源表示可能拒絕遷移，不釋出後繼檔案，也不修改原始檔。一方錄製不等於第三方擴充功能全集。V4 釋出後，只要輸出仍相容 V4，後續轉換器修復就可以增加支援。解釋流起始塊的額外欄位或處理未來投遞代際，應以具體格式變更為依據。
- **已接受 V4 轉換**——[檢查點](../../../docs/session-format-status.zh.md#finalization-record)保護已接受歷史。向後相容的新增可以透過新的確認記錄保留 V4；破壞性變更要求後繼版本。已寫入的 V4 檔案不會重跑此入邊，歷史輸入保持不變。
- **V5 前置讀取器**——V4 子日誌證據目前經過已安裝目錄。後續寫入器在改變該目錄前，須繫結固定代際的 V4 前置讀取。匯出的 V4 恢復器提供代際自有檢查；完整的通用訊息接納還使用已安裝的 Session 驗證。
- **歷史巢狀工具結果**——目前遷移拒絕包含另一個 tool-result wrapper 的結果。原始代際保持完整，且不釋出 V4 successor。後續轉換器可以支援有證據的源資料情境，而不改變既定 V4 格式；[遷移 cookbook](../../../docs/cookbook/adding-a-session-format-version.zh.md#stages-and-validation) 定義了這一區別。
- **歷史擴充功能消費者**——帶字首的訊息與結果欄位保留 JSON 資料，不啟用核心欄位。消費者必須明確理解這些欄位後才能解釋它們。
- **依賴保留的子日誌**——僅憑父日誌無法恢復未記錄的子 id、建立時間或 descriptor。刪除的子 Session 無法從工具參數恢復；已存在的父目錄記錄仍保留。
- **歷史模式未知**——沒有恰好一個受支援的自身 descriptor 時，缺失的父目錄項記錄未知模式。目前讀取不重寫該項；開啟子工作階段時解析可用的 descriptor 資訊，或報告該子工作階段的錯誤。
- **儲存範圍**——事實只覆蓋同一持久化根目錄內可識別的子 Session。跨根目錄匯入和損壞日誌修復不屬於此遷移。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
