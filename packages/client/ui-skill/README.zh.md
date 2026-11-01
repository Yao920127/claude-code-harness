---
description: "dsh Web 用戶端的 skill 引用與專屬 skill 工具行：/ 觸發的 skill source 與 skill 呼叫卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-skill

[English](README.md) | 中文

## 概述

`dsh-client-ui-skill` 讓使用者透過 `/` 建議選擇或直接鍵入 `/name` 來呼叫 skill（技能）。同一條字面命令可以從 Web 編輯器、TUI 和 ACP（Agent Client Protocol）一致地載入 skill；如果名稱與主機命令相同，它仍會解析為該命令。skill 呼叫在對話中顯示為可展開的 `Instructions` 卡片；即使已安裝的 skill 目錄發生變化，卡片落定後的內容仍保持穩定。

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

在編輯器中輸入 `/` 並從建議中選擇 skill，或直接鍵入 `/name`；發出的訊息攜帶字面文字，主機對選單 pick 與手動鍵入的 token 以同樣方式載入 skill。與主機命令同名的名稱仍解析為命令——裁決在用戶端把該行認領走，它根本不會成為提示詞。

### source 提供什麼

普通工作階段的候選來自 `skills/list` Remote；主機提供每一個使用者可呼叫的 skill，`modelInvocable: false` 的條目（即 `disable-model-invocation` skill，此路徑是其唯一入口）會以目前語言把僅限使用者標記作為描述字首帶上。結果經 `/` 選單共享的名字排序器（ui-primitives 的 `rankByName`）排名：查詢作為不區分大小寫的有序子序列匹配 skill 名，字首命中排最前，同分保持主機順序（[排名決策](../../../.agents/notes/archived/feature/2026-08-04-web-slash-command-fuzzy-discovery.md)）。`skills/list` 呼叫失敗時會被記錄並靜默丟棄該選單組——選單隻顯示 pending／ready 狀態。

### skill 工具行

`preparing` 階段只顯示技能圖示與標題，不顯示請求載入的技能名稱，也不能展開。`start` 和 `result` 階段使用下述記錄參數與輸出；準備階段不查詢已安裝目錄。

收起的行顯示 skill 圖示、`Skill` 標題與請求載入的 skill 名稱，並與普通工具行使用相同的 secondary 字號軸、行高、行高度和圖示縮放。所有生命週期狀態都保留普通 skill 圖示；執行中的呼叫帶有 transcript（文字記錄）的掃光效果，失敗時以錯誤首行替換名稱，中斷則保留明確狀態文字。已結算的行展開為一個尺寸受限的 `Instructions` 卡片，其中原樣呈現持久化的工具輸出；可用時還會提供標準軌跡的 `Inspect` 入口，展開卡片保留自身排版。該行的名稱、生命週期與正文只派生自 ui-tool 提供的凍結呼叫／結果切片，絕不讀取目前目錄，因此即使已安裝的 skill 或其描述發生變化，回放仍保持穩定。

滑鼠移入 `/name` 時，背景覆蓋整個引用。點選已知 skill 會在右側欄開啟提供者給出的 `SKILL.md` 路徑，同時保留文字的可編輯性。快取未就緒時，點選複用該 Session 的目錄請求，在完成後按點選時的 Session 地址開啟預覽。切換預設、重置連線和外掛釋放會取消待處理的預覽；後續點選重新取得目前目錄。沒有檔案路徑的 skill 仍可呼叫，但沒有檔案預覽。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

source 不實作任何裁決掛鉤，也沒有引用 codec：pick 落下字面文字，發出的提示詞中也是同一段字面文字，因此確定性在主機側（[slash 流水線筆記](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)）。

### 候選流程

目錄按普通工作階段快取，拉取走 single-flight；scope 建立時的 `warm` 掛鉤預熱該工作階段的快取項，轉發的 owner 事件 `agent-preset/selected` 丟棄該工作階段這一項（目錄屬於 preset，而空工作階段可能在預熱之後才切換），`connection/reset` 清空全部快取。由目錄定址的可繼續 subagent 在用戶端解析為沒有 skill 候選，因為現有 skill RPC 要求工作階段已掛載；檢視其持久化歷史不得啟用它。列表 RPC 使用外掛註冊時捕捉的根上下文連線；草稿 chip 視覺由 `lexicon` 掃描派生。

每次目錄拉取都要求用戶端已持有該工作階段，並等待首次歷史開啟成功後才傳送 `skills/list`。臨時的 `skillCatalog` 引用持續持有工作階段，直到拉取結束。未被持有的工作階段或開啟失敗會直接拒絕，不傳送 RPC；預設失效、連線重置和外掛釋放也會取消正在等待的歷史開啟。

### 註冊

`/client` 匯出介面只有外掛主體（`apply`／`inject`）；source 物件是註冊 effect 的內部實作。工具行把 `skill` wire 名稱註冊進 ui-tool 的 keyed `tool.call.toolview` slot。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋輸入機制、工具行主機與主機側 skill 工具。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——該 source 註冊進的行內建議機制。
- [ui-tool](../ui-tool/README.zh.md)——承載 `tool.call.toolview` slot 的工具呼叫展示層。
- [tool-skill](../../skill/tool-skill/README.zh.md)——擁有 pre-step 手勢邊界的主機側 `skill` 工具。
- [Web 輸入機器與 slash 流水線](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)——引用與命令如何共享輸入機器。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者顯式 skill 呼叫

#### 模型看到的內容

使用者訊息原樣到達模型，字面文字 `/name` 也包含在內。隨後主機的 pre-step 邊界（`dsh-tool-skill`）把規範的 `<skill_content>` 塊——與 `skill` 工具返回的 `renderSkillContent` 輸出相同——作為注入的指令上下文追加在該步驟各項注入的末尾，最貼近模型的回答。載入是確定性的：模型無需被要求呼叫 `skill` 工具就能收到完整正文，目錄也會告訴它不要重新載入已內聯注入的 skill。

#### Token 影響

一次呼叫會把渲染後的 skill 正文作為注入上下文加進該輪次——成本與模型經由工具載入該 skill 相同，只是無條件支付，而非由模型自行裁量。瀏覽選單和拉取候選不會增加任何模型 token。

#### KV Cache 影響

僅追加：注入的訊息落在可複用歷史字首之後。該包絕不改寫較早的請求 token。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義引用與工具行何時退回到通用行為；它們是目前包約束。

- **僅含工具結果的 history 頁使用通用行**：鍵控分派要求配對的工具呼叫位於執行時視窗內；分頁將工具呼叫留在視窗外時，工具結果沒有工具身份。這項用戶端呈現功能不會為了恢復該身份而擴充功能 history 協定約定。
- **文字是唯一依據**：引用是普通的草稿文字；手動鍵入的相同 token 就是同一個引用，主機手勢邊界評判的是發出的文字，而不是選單互動。chip 視覺由 lexicon 掃描派生；提示詞協定上沒有 occurrence 身份、位置跟蹤或結構化引用載荷。
- **預熱落定之前開啟的選單**：在那次擊鍵下不顯示 skill 候選；下一次擊鍵會重新輪詢已落定的快取。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。slash source、locale dictionary 與 keyed toolview 都是由註冊表持有的註冊項，其釋放行為已由 HMR（熱模組替換）安全規範證明；它們不發出 Cordis 事件或持有跨外掛可變狀態。
