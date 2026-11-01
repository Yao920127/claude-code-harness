---
description: "skill（技能）提供者註冊表，供選擇、設定或排查來自任意來源的 skill 如何被合併、解析與載入的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill

[English](README.md) | 中文

## 概述

使用本包可讓 agent（智慧代理）和使用者透過一個目錄存取從本地目錄、嵌入式外掛資料或遠端服務收集的可複用任務專項指令。它會以可預測的方式裁決重名項、驗證條目、在來源不可用時保留可用結果，並按需載入所選 skill 的完整指令。當組合需要多個來源或非檔案系統來源的 skill 時，請掛載本包；本包自身不含 skill 內容，因此本地發現需搭配 `dsh-skill-filesystem`，模型存取需搭配 `dsh-tool-skill`。

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

掛載外掛即可讓組合擁有一個統一的 skill 註冊表。skill 來源（提供者）和消費方（面向模型的目錄與 loader，或你自己的程式碼）都透過 `ctx.skills` 互動；註冊表合併任意提供者報告的一切內容，因此一次查詢就能看到所有來源的 skill。

### 何時選擇

當 agent 需要透過同一個介面從多個來源載入 skill，或 skill 來源並非本地檔案系統時，選擇 `dsh-skill`。當組合完全不需要載入 skill 時，請避免使用——外掛會增加一個服務以及每次查詢的發現成本。隨附的本地提供者（`dsh-skill-filesystem`）和麵向模型的消費方（`dsh-tool-skill`）是獨立包；部署需要本地 skill 和模型存取時，請一併掛載。

### 掛載與設定

像任何 Cordis 外掛一樣載入即可。唯一設定項限制記憶體中保留的已完成提供者目錄數量；其餘都是提供者行為。

```yaml
- name: '@deepseek-ai/dsh-skill'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `collectCacheMaxEntries` | `128` | 記憶體中保留的已完成 cwd/提供者目錄數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill)是每個受支援欄位的窮盡式真源。

### 註冊表提供什麼

- **合併後的單一目錄。** 消費方查詢工作區的目前目錄，即可收到來自所有提供者的全部勝出 skill 摘要，並按名稱排序——無需自行做提供者特有的排序或去重。
- **按需載入。** 按名稱查詢某個 skill，會從擁有勝出候選項的提供者返回完整指令正文；註冊表會重新驗證載入的定義，並拒絕在發現與載入之間名稱發生變化的陳舊選擇。
- **嵌入式 skill。** 外掛可用 `ctx.skills.register(...)` 註冊記憶體中的 skill；註冊表會補入預設呼叫策略與 `runtime` 提供者標籤。同層同名執行時註冊採用先到先得，並記錄警告。
- **提供者註冊。** 提供者用 `ctx.skills.registerProvider(...)` 貢獻目錄；註冊是同步的，返回的 disposer（資源釋放）會移除該提供者。`runtime` 是保留的提供者名稱。

每個 skill 上的呼叫策略決定哪些介面可以展示並載入它：`modelInvocable` 用於面向模型的工具與目錄，`userInvocable` 用於面向使用者的命令。註冊表保留全部四種組合，因此一次發現結果可以同時服務兩個介面，而不會混淆各自的目錄。

| 策略 | 模型 | 使用者 |
|---|---|---|
| `{ modelInvocable: true, userInvocable: true }` | 包含 | 包含 |
| `{ modelInvocable: true, userInvocable: false }` | 包含 | 排除 |
| `{ modelInvocable: false, userInvocable: true }` | 排除 | 包含 |
| `{ modelInvocable: false, userInvocable: false }` | 排除 | 排除 |

### 可觀察的成功與失敗

任意提供者報告的 skill 都會出現在合併目錄中，按其精確 kebab-case 名稱載入即可返回正文；無效名稱返回無結果而非拋錯。發現失敗的提供者會被記錄並跳過，觀測被標記為不完整，因此消費方保留其最後一份可用目錄；顯式的不完整觀測仍會貢獻其候選項。格式錯誤的候選項會快速失敗——註冊表在快取或返回任何內容之前，會先驗證名稱、描述、呼叫布林值與提供者歸屬。

Skill 摘要保留勝出提供者可選的指令檔案 `path`，供提供檔案預覽的發現消費者使用。列舉仍不讀取 skill 正文；面向模型的目錄繼續僅選擇其負責的路由欄位。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋註冊表如何合併、快取並失效提供者目錄；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包建立在一個分離之上：註冊表負責合併、勝出解析與驗證，提供者負責 skill 來自哪裡。提供者是借用的同程序物件，其 `list()` 返回候選項、`get()` 載入正文；註冊表除驗證語義欄位外，從不檢查 skill 內容。

註冊表採用主機 + 按 scope 的分層結構，即工具註冊表確立的形態：註冊落入呼叫方上下文 scope 對應的層——主機行與 repository 外掛落入全域層，由 agent preset 常駐組合掛載的外掛落入該 preset 的層。讀取時將全域層與觀察 scope 的鏈合併；最近層直接贏得重名，單層內重名則依次按 rank、提供者註冊順序與提供者本地順序裁決。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口、`SkillRegistry` 服務、候選項與定義驗證、共享的面向模型渲染 |
| — | 不釋出執行時不變式伴生入口；提供者／執行時 map 與帶 revision 的 cache 在註冊表內原子變更，且沒有獨立變更事件或快照可供交叉核對。 |

### 目錄收集

讀取（`list`/`snapshot`）會收集每一層的候選項：先是執行時 skill，再是各提供者的 `list()` 結果，註冊表會依次等待各提供者，並隔離失敗。候選項經驗證後在層內去重，跨層合併；摘要按名稱排序。完成的收集按 cwd、scope 鏈與 revision 快取，上限為 `collectCacheMaxEntries`；讀取中途提供者或執行時變更使 revision 遞增時，進行中的收集會重試一次，第二次變更則返回最新候選項並標記為不完整、不予快取。

### 載入與陳舊

`get()` 選擇勝出候選項，讓提供者載入與查詢的中止訊號競速，並在選擇或快取命中後重新檢查取消。返回的定義必須與所選候選項同名；名稱不符會使快取目錄失效，以便下一次快照重新發現該提供者的 skill。定義從不快取——每次載入都向提供者請求目前正文。

### 失效

註冊表沒有 TTL：只有提供者呼叫其註冊作用域內的 `invalidate()`，或發生執行時註冊或釋放時，才會清除已完成的目錄。每次失效都會遞增 revision、清空快取，並行出不帶過濾條件的 `skills/change` 事件；消費方用各自的查詢選項重新取得。`invalidate()` 僅當接收它的那條精確註冊仍處於活動狀態時才生效，因此延遲迴調無法干擾同名替代提供者。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享的 skill 詞彙逐步進入隨附提供者、面向模型的消費方與設計依據。

- [skill 子系統參考](../../../docs/subsystems/skills.zh.md)——註冊表、提供者約定與本地發現優先順序。
- [skill-filesystem 包](../skill-filesystem/README.zh.md)——從磁碟發現 skill 的隨附本地提供者。
- [tool-skill 包](../tool-skill/README.zh.md)——渲染工作階段目錄與 `skill` 工具的消費方。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill)——每個設定欄位及其源宣告。
- [skill 呼叫策略 Agent Note](../../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.zh.md)——模型與使用者呼叫控制的依據。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-skill` 間接影響模型；該包將提供者摘要渲染到持久的初始目錄或替換目錄訊息中，並將載入的指令正文渲染到已保留的工具結果中。

#### KV Cache 影響

不直接影響提示詞。指定的消費方負責持久初始目錄，以及失效後的僅追加式目錄替換。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **失效由提供者驅動**——註冊表沒有 TTL，無法推斷任意遠端來源是否已發生變化；每個可變提供者都必須保留其註冊作用域內的 `invalidate()` 能力，並由自身的觀測機制呼叫它。
- **提供者依次查詢**——一個緩慢的提供者會延遲其後註冊的所有提供者；取消會停止呼叫方的等待，但無法終止不回應取消的提供者持續執行的工作。
- **不保留不完整觀測**——被拒絕的提供者會被省略，顯式提供的候選項也僅在目前查詢中可用；註冊表既不負責最後一份可用目錄，也不負責逐提供者診斷。
- **重名項的裁決採用先到先得**——系統會記錄並隱藏層內較晚出現的低優先順序候選項，較近的層會靜默遮蔽較遠的層；沒有 API 可檢查全部被遮蔽的定義。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性——已交付的行為與限制以上文和程式碼為準。一個開放問題是：註冊表是否應保留最後一份可用目錄或逐提供者診斷，還是由消費方擁有該狀態；「不保留不完整觀測」限制記錄了目前答案。

</details>
