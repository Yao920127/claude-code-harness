---
description: "Web GUI 的 plan 模式狀態徽章：顯示 plan 模式已開啟並可將其關閉的 composer 控制元件；供 plan 模式的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plan

[English](README.md) | 中文

## 概述

計劃模式讓你在實施前審閱計劃。透過 `/plan` 進入，透過編輯器中的狀態按鈕退出。提交的計劃自動在右側邊欄開啟供審閱；批准、拒絕或關閉審批後，仍可透過已完成回合末尾的產物卡片檢視。重新開啟同一計劃會聚焦已有標籤頁，重新整理瀏覽器後會從工作階段歷史恢復正文。

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

與 `ui-conversation` 及 `dsh-plan-mode` 一起掛載本外掛；plan 模式啟用時，徽章隨即佔據 composer 的 plan 座位（存取模式控制元件右側）。經 `/plan` 命令路徑進入 plan 模式——從 composer 的 `+` Command 選單選擇「計劃」，或鍵入 `/plan`——再用徽章將其關閉。

### 徽章顯示什麼

當有效目標為 plan 模式時，該座位渲染藍色「計劃」狀態按鈕——標籤前是計劃圖示，按鈕可用且被懸停或鍵盤聚焦時換成圓形 ×——點選執行 `/plan off`。否則座位保持為空：未組合 plan-mode 的主機，或尚無工作階段的 Draft，都不顯示任何內容。plan 模式為有效目標期間，composer 文字框的 placeholder 切換為 plan 任務提示——「describe your task to generate plan」——除非所屬 surface 提供自己的 placeholder。

### 檢視已提交的計劃

回合結束後，每次提交的計劃都會顯示在該回合末尾的產物區域，並採用檔案產物卡片的樣式，包含 Markdown 圖示、標題和“開啟”操作。在目前瀏覽器工作階段中，每份待審計劃自動開啟一次；關閉後，重新掛載審批元件不會再次展開，新提交會開啟其對應計劃。歷史卡片僅在點選後開啟。透過卡片或審批條帶上的“檢視全文”連結可閱讀完整 Markdown。計劃標籤頁顯示純文字檔案圖示。不同提交保留獨立標籤頁；是否開始實施仍由審批按鈕決定。

沒有已記錄呼叫標識的審批也會自動開啟。完整正文只儲存在標籤頁的導航記憶體中，待處理審批卡片可以重新開啟它。重新整理頁面會丟失該正文；失效的預覽會提示使用者返回待處理審批。在嵌入式子對話中開啟計劃時，預覽使用目前可見的側欄，讀取文件仍保留子工作階段地址。

### 失敗

准入失敗（`matched: false`、業務錯誤、傳輸故障）以內聯錯誤呈現，徽章保持顯示直至投影確認退出。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

徽章佔據 conversation 宣告的 `conversation.input.plan` 單實例座位；node 半部是空 apply（roster 行）。讀取經 standard-kit 的 `useProjection` 走通用投影對：有效目標是 `pending ? !active : active`——摺疊的主機值而非用戶端樂觀態，因此到達的幀無論哪個方向都會糾正徽章。座位注入面攜帶一個動詞 `exitPlanMode`，經 `ctx.remote.commands.execute` 執行 `/plan off`，並把准入失敗對映為一行內聯錯誤。placeholder 與提示文案位於 ui-conversation 的 `conversation` locale 名稱空間，與已認領 `/plan` 命令的提示逐字共用。

計劃卡片透過 Conversation Definition 從原生 `tool/call` 或 PTC dispatch 參數派生，並使用每次呼叫已解析的回合位置。它們與檔案產物一起貢獻到可追加的 `conversation.chat.turnTail` 列表。計劃資源地址標識呼叫及完整的普通工作階段地址或子工作階段直接父級地址；provider 讀取已有工作階段歷史及較早分頁，不把正文存入側邊欄佈局。提問外掛擁有審批操作插槽，並提供請求鍵、完整正文和可選的呼叫標識。自動開啟透過繫結的 hook 讀取 `ctx.sidebarRight.mounted`，在座位出現在螢幕上後才執行：全域面板開啟期間到達的審批，會在返回時與座位在同一次提交裡先掛載、早於座位完成繫結。[決策記錄](../../../.agents/notes/implemented/feature/2026-09-17-persistent-plan-cards.zh.md)說明審批與文件為何保持獨立生命週期。 子代理計劃地址也保留未知模式，以便歷史讀取解析子 descriptor。

框架繫結的 `usePlans(turn)` 只提供該回合的已提交計劃資料。Chat 隨節點更新維護成員索引，並在讀取時排列該集合；卡片渲染不掃描整段對話，也不訂閱其他回合或節點型別。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 plan surface 不夠用時閱讀以下頁面。它們從徽章進入 plan 模式領域與 composer 外殼。

- [dsh-plan-mode](../../plan/plan-mode/README.zh.md)——擁有 plan 模式、`/plan` 命令、投影與 policy 段。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告 composer 的 `conversation.input.plan` 座位與 placeholder locale 鍵。
- [工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode)——模型退出 plan 模式所用的 `exit_plan_mode` 工具 schema。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 chip 派發的 `/plan off` 命令列：`dsh-plan-mode` 擁有該命令列驅動的模型可見 policy 段、退出工具 schema 與已記錄狀態。

#### KV Cache 影響

進入或離開 plan mode 會改變活躍的 `plan:policy` 系統提示詞段，因此改變請求字首；chip 本身不新增任何提示詞內容。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前 plan 徽章。它們是目前包約束，不是 plan 模式對比或任務積壓。

- **Plan 模式是引導而非執行沙箱**——需要強制只讀規劃的部署必須組合獨立的沙箱與審批策略。
- **徽章屬於預設 composer**——待處理的涉及整個 composer 的互動（如 plan 評審）會臨時取代 InputBar 及其徽章。
- **未啟用時無 plan 控制元件**——入口使用共享 Command source；有能力但模式未啟用的工作階段在工具行不顯示 plan 入口。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。plan state 與 boundary 的所有權由 dsh-plan-mode 審計；本包的 control 是一種 slot effect，其宣告、註冊與清理由本包執行。
