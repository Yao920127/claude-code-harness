---
description: "面向無金鑰 profile 測試的工作階段日誌快照支援：manifest（中繼資料清單）、身份脫敏、規範化、workspace 檢查與協定介面卡。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-snapshot

[English](README.md) | 中文

## 概述

`dsh-session-snapshot` 提供無金鑰已記錄工作階段測試（`pnpm run test:snapshot`）背後的共享支援：封閉 manifest、型別化身份脫敏、規範化、workspace 比較、fixture（測試前置資料）保護，以及 headless、SDK、ACP（Agent Client Protocol）與 Web owner 使用的協定介面卡。ACP 介面卡以真實子程序啟動被測 profile，驅動確定性輸入腳本，並註冊完整的錄製、回放與重新整理套件。每個情境都提交足夠證據來證明模型可見輸出與檔案系統效果，不依賴 agent（智慧代理）自述。包入口會匯入 vitest，因此只能在 vitest 執行中使用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包把隨附 profile 情境變成無金鑰快照套件：寫一張情境表和一個 fixture 目錄，呼叫一次匹配的介面卡，工具包就負責啟動或組合 profile、驅動情境、比較規範化輸出並守護已提交的 fixture。

### 編寫快照套件

消費方 `*.snapshot.ts` 就是情境表加一次工廠呼叫。`AgentUnderTest` 提供絕對 `binScript`、可選 `libBinScript`、`configPath` 與 `tsconfigPath` 路徑，因為子程序 cwd 位於儲存庫之外：

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineAcpSnapshotSuite,
  type Scenario,
  type SnapshotSuiteOptions,
} from '@deepseek-ai/dsh-session-snapshot'

function snapshotMode(value: string | undefined): SnapshotSuiteOptions['mode'] {
  switch (value) {
    case undefined:
    case '':
    case 'replay': return 'replay'
    case 'record': return 'record'
    case 'refresh': return 'refresh'
    default: throw new Error(`unknown DSH_SNAPSHOT mode: ${value}`)
  }
}

const SCENARIOS: Scenario[] = [
  { name: 'text-turn', hasModelTurn: true, recorded: true, pinsHeader: true },
]

defineAcpSnapshotSuite({
  agent: { // absolute paths, resolved from the suite's own location
    binScript: fileURLToPath(new URL('../../../apps/cli/src/bin.ts', import.meta.url)),
    configPath: fileURLToPath(new URL('../cordis.yml', import.meta.url)),
    profile: 'acp',
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  },
  snapshotsDir: join(dirname(fileURLToPath(import.meta.url)), 'snapshots'),
  scenarios: SCENARIOS, // exactly one entry per header class sets pinsHeader
  mode: snapshotMode(process.env.DSH_SNAPSHOT),
})
```

每個已記錄 Session 目錄攜帶封閉的 `snapshot.yml` manifest，以及規範 parent 與連續 child 角色。parent 檔名是 `session[.vN].jsonl`；child 是 `session.<ordinal>[.vN].jsonl`；v0 省略 `.v0`，正版本使用小寫 `.vN`，且每個檔名與其 header 一致。一個角色可以保留舊 generation，但 harness 會選擇數值最高的一項。擁有 fixture 的 manifest 可以宣告 `sessionFormat.version` 與一個或多個封閉 `coverage` 名稱，把該歷史 generation 保留為顯式遷移 fixture。未宣告時，record 與 refresh 寫入目前 generation；replay 也按[語料策略](../../../snapshots/AGENTS.md)接受保留的 V3 基線。manifest 還會指名情境、隨附 profile、組合／header 類別、錄製來源，以及已完成 Session 無法重建的 replay、平臺、權限、環境、workspace 或輸入事實。儲存保護檢查每個選定 parent 與 child 角色的工具結果和可移植路徑。提示詞／schema 擦除、訊息身份及提示詞先於請求的順序檢查適用於目前 generation；保留的前代維持其歷史表示。介面卡註冊預期輸出、Session 日誌與可選 `workspace.expected/` 比較；保護會拒絕遺留目錄、缺失角色、非規範名稱、絕對路徑、格式錯誤的 manifest 與平臺專用分隔符。

`normalizeSessionSnapshot` 在規範化路徑並擦除系統提示文字與工具 schema 後，會保留完整 Session header 與事件 payload，但從已提交 fixture 中省略頂層 `seq`/`time` envelope；它還會規範化嵌入式 stream clock 與歷史 packed-row 的 `seq0`/`time0` envelope 與 catalog child 建立時鐘。事件順序與來源事件引用的順序保持不變。錄製與重新整理會將頂層 `sourceEventSeqs` 以展開陣列的形式寫入 fixture。Replay 只在記憶體中合成頂層 envelope，而執行時持久化仍寫入完整日誌。多 Session 比較會先透過嚴格的建置期靜態 Session 格式目錄驗證預期日誌與收集日誌，再進行身份脫敏與規範化；來原始檔名不能改變格式驗證。保留的歷史 replay 輸入不是原生目前格式 writer 輸出的比較基準：結構遷移保留請求含義，但可以產生不同的事件佈局。歸一化保留意外的 request-header 欄位（包括 `system`），使迴歸保持可見。無版本的協定介面卡單元測試 fixture 不屬於已釋出 Session 格式語料。[目前寫入器格式](../../../docs/session-format-status.zh.md)的 fixture 每個事件佔一行；保留的 v0/v1 fixture 可以使用規範 packed row。[臨時儲存庫遷移器](../../../scripts/migrate-packed-session-fixtures.ts)（`pnpm run migrate:packed-session-fixtures`）會改寫更舊的歷史佈局，由其[移除提案](../../../.agents/notes/proposed/process/2026-07-26-remove-packed-session-fixture-migrator.zh.md)負責刪除該遷移器。

spill 情境透過真實本地提供者儲存到私有臨時根目錄。fixture 介面卡提供固定長度的邏輯定位符，並僅將本次執行已儲存的定位符對映回實際檔案以供檢索，在不寫入共享邏輯路徑的情況下保留預覽預算。已知的快照 spill 路徑會規範化為穩定的定位符 token，包括 JSON 省略通知中帶引號、使用 JSON 轉義 Windows 分隔符的路徑。重新整理提取會保留匹配路徑的序列化寫法，以便進行字面替換。規範化只改變定位符：儲存位元組數與省略計數仍作為比較證據。

保留歷史輸入的情境保持規範 Session 檔案不變，並繼續選擇它們進行回放；固定歷史版本的目錄中沒有更新的規範同角色檔案。其精確的規範化原生 writer 輸出單獨記錄在父工作階段的 `writer.expected.jsonl` 和子工作階段的 `writer.<ordinal>.expected.jsonl` 中；這些是輸出比較基準，而非 replay 代際。輸出比較基準可以保留較舊的受支援代際：比較透過嚴格 catalog 恢復它們，而收集的日誌必須使用目前檢出版本的 writer。新 writer 輸出的 golden 比較選擇 `nativeWriterOutput`，僅在嚴格恢復後，將版本限定為各輸入原始 writer 代際的 delivery 標記轉換為 token。其他 delivery 代際與 captured-source 欄位保持數值；原始檔與已遷移產物的比較預設保留精確代際。record 與 refresh 從不儲存這些比較 token。保留歷史輸入的 SDK 情境使用 `notifications.current.expected.jsonl` 記錄目前協定輸出。比較既不將目前事件反向投影為歷史格式，也不剝除結構差異。獨立遷移測試驗證正式轉換，而不把原生 writer 佈局當作其預期事件序列。

Headless/ACP 與 SDK 介面卡在規範化之前，將原始目錄中的子建立時間與採集到的子 header 比較。重新整理會在每條匹配的目錄記錄中保留選定的子 header 時間，包括繼承副本，防止保留的 header 時鐘與新寫入的目錄時鐘分歧。已提交的歷史不一致資料保持不變，作為遷移拒絕證據；將其時鐘規範化不能證明遷移成功。

### 錄製、回放與重新整理

`pnpm run test:snapshot:record` 呼叫線上 LLM（大語言模型），並在規範具名版本檔案下寫入收集到的目前 generation。record 與 refresh 絕不重新命名或刪除已完成的 generation，即使後續執行不再產生某個 child 角色也一樣；受審閱的源樹整理只有在同角色存在已驗證的目前替代檔案後才移除前代。顯式宣告 `sessionFormat` 的情境在錄製模式下保持只讀。`pnpm run test:snapshot:refresh` 保持無金鑰，執行選定的最高 replay 輸入，並寫入 stdout、各 pin 自有的提示詞與工具 schema 伴隨檔案，以及新鮮目前 generation 的可比較 Session 輸出；保留歷史輸入的情境寫入單獨的 writer 輸出比較基準，而非規範目前格式 replay 代際。每個組合 owner 把 replay patch 放在 live patch 旁；頂層 `snapshots/` 擁有 Session 驅動情境，其他預期輸出留在其 package owner 旁。[`dsh-llm-replay`](../llm-replay/README.zh.md) 提供透過 `DSH_SNAPSHOT_*` 環境值選擇的已記錄流。

### 固定請求 header 與系統提示

每個 pin 預設擁有其生成的 `system-prompt.expected.md` 或 `tool-schemas.expected.json` 伴隨檔案；當完整的對應序列相同時，`systemPromptSource` 與 `toolSchemasSource` 指定另一個 pin 作為來源，因此每個不同版本只提交一次。系統提示是 surface 節點 0，作為 `system/message` 事件記錄在該步驟第一個 `request/header` 之前；每個 fixture 把其文字塊儲存為 `"text":"{{system}}"`，提示詞伴隨檔案保留完整文字。該 pin 的 `request/header` 事件儲存 `"tools":"{{tools}}"`，同時保留設定與原因，結構化 schema 伴隨檔案保留完整目錄。包含 developer 訊息的日誌會在各 header 中保留有序工具名，而不使用 token，以便繼續驗證歷史工具新增引用。自身作用域組合出不同請求的 child Session 按 fixture 索引以 `pinsChildToolSchemas` 與 `pinsChildSystemPrompts` 單獨宣告。執行中改變請求 header 的情境宣告 `expectedHeaderChanges`；執行中提示詞發生變化的情境——替換節點 0，或在 `in-history` 路由上追加到已快取歷史之後——宣告 `expectedPromptChanges`，每次變化在提示詞伴隨檔案中增加一個 `<!-- system/message change N -->` 小節。manifest 中對應欄位為 `header.changes` 與 `header.promptChanges`。

### 平臺與組合變體

需要非 Windows 主機的情境宣告 `posixOnly`，在 Windows 上跳過執行測試，但 fixture 保護仍在所有平臺覆蓋其已提交檔案；組合需要可用 `pwsh` 的情境宣告 `pwshOnly`。當臨時目錄授權自身待測時，`workspaceParent` 將生成子級 cwd 移出平臺臨時區域；情境簽入的 `workspace/` 會先複製到該子級，隨後 `prepareWorkspace` 在 agent 啟動前針對生成 cwd 執行。預設生成的 workspace 在工作階段 fixture 中儲存為 `{{cwd}}`，使平臺臨時根目錄與隨機 basename 不影響錄製。headless manifest 在測試 Session workspace 授權本身時使用 `workspace.parent: outside-temp`。介面卡在父目錄可寫且位於系統臨時授權之外時，於平臺臨時根目錄旁分配目錄，否則使用 home，並拒絕已被自動臨時寫授權覆蓋的生成 cwd。

### 可能出什麼問題

- **子工作階段輪次等待失敗**——即使首次日誌收集就超過期限，`waitForSubagentTurnEnd` 也會指出子工作階段、目標輪次與等待期限，並透過錯誤的 cause 保留底層失敗。
- **fixture 保護拒絕已提交檔案**——遺留情境目錄、缺失檔案、一個 header 類別包含多個 pin、重複的伴隨檔案內容、未擦除的提示文字或工具 schema、沒有前置 `system/message` 的 `request/header`，以及格式錯誤的 pin header 都會在比較執行前使套件失敗。
- **工作階段收集需要原始 JSONL mode**——快照設定使用 JSONL 後端的 `compression: 'none'`；壓縮 JSONL 沒有快照收集路徑。
- **建置 mode 需要目前產物**——選擇 `DSH_EXAMPLE_MODE=lib` 前先執行 `pnpm run build`；源 mode 仍是零建置路徑。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具包的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

共享核心擁有 manifest、generation 限定角色選擇、workspace 設定／比較、型別化身份對映、normalizer 與 fixture 不變式。ACP 介面卡增加四個可組合層：launcher、情境 harness、normalizer 與 suite factory。`launchAcpTestAgent` 在 tsx 下啟動原始碼 profile，或在普通 Node 下啟動已建置 `lib` profile，透過原始位元組 stdout tee 連線 SDK client，收集 Session update 與 stderr，預設拒絕未處理的權限請求，並負責關閉。`runScenario` 驅動 ACP JSON-RPC stdio，並收集每個 Session 目錄中數值最高的持久原始 JSONL generation。純 normalizer 把 cwd 路徑與型別化身份變為穩定 token，將時間歸零、展開物理來源區間，並擦除系統提示詞文字與工具 schema bulk。`defineAcpSnapshotSuite` 註冊比較、generation 限定 fixture 回寫與即時一致性保護。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/launcher.ts`](src/launcher.ts) | 子程序/用戶端啟動器與關閉所有權 |
| [`src/harness.ts`](src/harness.ts) | 腳本化情境驅動與工作階段日誌收集 |
| [`src/manifest.ts`](src/manifest.ts) | 封閉 `snapshot.yml` schema、收集與歸屬規則 |
| [`src/session-files.ts`](src/session-files.ts) | 規範 parent/child generation grammar、header 一致性與最高角色選擇 |
| [`src/identity.ts`](src/identity.ts) | 跨父子日誌的型別化首次出現身份 token 化 |
| [`src/normalize.ts`](src/normalize.ts) | 純規範化器與擦除輔助 |
| [`src/workspace.ts`](src/workspace.ts) | 情境 workspace 設定與完整預期狀態比較 |
| [`src/suite.ts`](src/suite.ts) | 情境表套件工廠、fixture 保護、錄製/重新整理回寫 |
| [`src/index.ts`](src/index.ts) | 再匯出四個層的包入口 |
| — | 不釋出執行時不變式伴生入口；該測試支援包不擁有任何生產事件流或可變資料；消費它的測試套件會檢驗該工具包。 |

### 資料流

情境在啟動器下執行 agent，透過 harness 向它喂入輸入腳本，並捕捉 stdout 與持久化日誌。規範化器把捕捉內容規範化——id 轉為首次出現序列、生成 cwd 轉為 `{{cwd}}`、`system/message` 文字轉為 `{{system}}`、header 工具 schema 轉為 `{{tools}}`——使已錄製與本次執行可以結構化比較。隨後工廠把規範化 stdout 與重新持久化日誌同已提交 fixture 比較，或在錄製/重新整理模式下回寫它們；其保護在任何比較結果被採信之前就拒絕畸形或漂移的 fixture。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從快照工具包逐步進入模型 fixture 來源、啟動機制與要求該層級存在的策略。

- [llm-replay](../llm-replay/README.zh.md)——回放模式消費的無金鑰模型 fixture 來源。
- [loader-smoke](../loader-smoke/README.zh.md)——啟動器所依賴的模式感知子程序啟動機制。
- [測試策略](../../../docs/testing.zh.md)——無金鑰快照層、其適用時機與 fixture 歸屬規則。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支援包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該測試專用支援會記錄、規範化並比較 profile 工作階段，不會改變 agent 組裝的模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該工具包特別小心。它們是目前包約束，不是任務積壓。

- **工作階段收集需要原始 JSONL mode**——`runScenario` 收集持久化 `.jsonl` 日誌，因此快照設定使用 JSONL 後端的 `compression: 'none'`；壓縮 JSONL 沒有快照收集路徑。
- **建置 mode 需要目前產物**——選擇 `DSH_EXAMPLE_MODE=lib` 前先執行 `pnpm run build`；源 mode 仍是零建置路徑。
- **ACP 繼續覆蓋協定行為**——刺激來自 ACP 用戶端的取消與權限往返留在該介面卡；組裝式一次性行為與持久控制行為使用 headless 與 SDK 介面卡。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
