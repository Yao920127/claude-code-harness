---
description: "dsh Web 用戶端的 Client 工具展示外掛：完整呼叫樹的組合、按工具名稱鍵控的檢視 slot，以及內建原子工具卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-tool

[English](README.md) | 中文

## 概述

`dsh-client-ui-tool` 是 dsh Web 用戶端的 Client 工具展示外掛：它渲染對話中的每一次工具呼叫。`ui-conversation` 透過 `conversation.chat.node` 的匹配 key 分發每個已排序的 `tool-call` Conversation Node；本包渲染其中的 root 及其 PTC dispatch 子呼叫，並把每個原子呼叫透過 keyed slot `tool.call.toolview` 分發。沒有註冊的工具名稱使用通用卡片。業務 UI 包只註冊 wire 工具名稱和原子檢視——它們不配對工作階段事件、不重建 transcript（文字記錄），也不擁有 root/subcall 拓撲，因為執行時仍對 call/result 配對、生命週期與遞迴 `subCalls` 投影擁有最終決定權。

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

工具呼叫在對話中顯示為卡片：一個根呼叫樹帶其巢狀子呼叫，每個原子呼叫由所屬檢視渲染。所有生命週期狀態都保留工具的普通業務圖示；失敗與中斷仍透過凍結呼叫／結果狀態、無障礙狀態文字和失敗摘要明確表達。使用者可透過主機回呼開啟檔案或檢查呼叫。摺疊的 `web_fetch` 行把其 http(s) URL 顯示為連結，在新瀏覽器標籤頁中開啟。

共享工具行和 Bash 行的失敗、停止摘要在懸停時仍保留錯誤色和警告色；只有不處於這兩種狀態的摘要會在懸停時加深。

派發前，模型已給出名稱的呼叫顯示為不可展開的一行，使用工具自己的圖示與標題。通用行顯示為`工具呼叫 · <工具名>`。準備階段不提供完整參數、檔案連結、結果或依賴參數的互動。write/edit 的摘要顯示「正在準備內容 NKB」；N 為 `Math.ceil(raw.length / 1024)`，是原始參數字串長度的整數近似值，不是檔案位元組數。`tool/call` 才啟用既有呼叫展示；參數塊結束本身不代表開始執行。

### 註冊業務工具檢視

擁有該檢視的業務包將其 wire 工具名稱註冊進 `tool.call.toolview`：

```text
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({
    name: 'tool.call.toolview',
    key: '<wire tool name>',
  }, BusinessToolRow))
```

owner 載荷為 `ToolCallOwnerProps`：`callId`、`toolName`、`phase` 判別欄位及對應階段的凍結 `block`、可選 `cwd` 與 `home`、工作階段授權的 `loadImage` loader（供結果攜帶持久影象的檢視使用），以及普通的 `openFile`/`inspect` 回呼。PTC dispatch 塊保留事件的 `parentCallId`；根工作階段呼叫沒有該欄位，因此後代呼叫都走同一條按 key 分發路徑：已註冊檢視的呼叫（如 `read_image`）也會在巢狀處渲染對應卡片，未註冊的後代呼叫則保持通用壓平形式。路徑摘要先相對工作階段 cwd 縮短，再把剩餘的 POSIX Host home 寫成 `~`；`filePath` 與 Host 開啟仍使用作者給出的檔案系統路徑。註冊項會收到常規的工作階段 slot 執行時共享資料，但不會收到 React 節點或執行時服務。

### 內建檢視

每個註冊檢視都接收[工具 slot 型別](src/client/contract/slots.ts)宣告的顯式 `preparing`、`start` 和 `result` props。通用行在三個階段使用同一個 `ToolRow`。行模型統一選擇標題，並組合通用工具名字首與已有參數摘要，不按生命週期階段改變字首；專用標題不附帶英文名。準備階段的共享參數解析入口直接返回無呼叫，不解析部分 JSON。write/edit 將準備態和派發後階段拆成兩個元件，只有準備態元件呼叫 `useToolCallArgumentsPartial`，start 與 result 共用派發後元件。Bash、Skill、Cordis 等自定義 renderer 分別處理準備態，其依賴參數的元件接收 `StartedToolCallViewProps`。

本包擁有 generic fallback，以及 shell/pwsh、read、read_image、write/edit、執行中的 `str_replace_editor` `create`／`str_replace`、grep/glob、web、todo、question 與 PTC dispatch 的內建展示。結構化卡片直接從第一方原始 event 欄位派生；Host `presentCall` 與 `presentResult` 值不會進入 Client。執行中與已完成的前臺標準 `bash`/`pwsh` 和 `terminal_send` 呼叫，無論位於根還是 PTC dispatch 子呼叫中，都在透過相同的參數、結果和錯誤檢查後使用 terminal 卡片。持久 `bash`/`pwsh` 呼叫僅在執行中使用 terminal 卡片。以已識別的 spill 策略提示結尾的 shell 輸出，在 shell 行中使用可展開的 generic 輸出，在 Details 中使用 generic 輸出；位置被改變或被省略的退出標記無法證明成功。已完成的持久 shell 結果保持 generic 展示，因為 reset 與部分輸出診斷不一定描述單個程序的退出狀態；根呼叫的持久 shell 結果可展開，後臺啟動回執則保持摺疊。帶有 `AUTO_REVIEW_DENIED` 的原生或 PTC dispatch 失敗會在摺疊行顯示 Auto review 裁決，展開時顯示一行歸一化後的“未執行”原因；原因缺失或只有空白時使用在地化 fallback 文案。成功的問題行按穩定 id 配對呼叫中的問題與結果中的回答，展開後顯示可讀的問答行。已取消或已中斷的問題行顯示其裁決與原始問題，不虛構回答。不受支援、格式錯誤或含糊的輸入退回為壓平的工具輸入／結果文字。`ui-skill` 展示了業務包自行擁有的 `skill` 註冊項。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包實作一條分派規則：原子工具檢視按 wire 工具名稱鍵控、由所屬業務包註冊；本包只渲染樹與退回。

### 渲染約定

`ToolCallTree` 接收一個 Tool 節點、工作階段 `cwd` 和導航回呼。每個分支接收穩定的 block，並快取顯式階段 props，因此一個子呼叫變化不會重渲染未變化的兄弟分支。它透過 `tool.call.toolview` 按工具名分發。已派發的根呼叫保留遞迴 `subCalls`，準備階段沒有子呼叫。每個根呼叫和子呼叫包裝層都保留 `data-chat-anchor-key="call:<id>"` 與 `data-chat-call-id` DOM 約定，供分頁和選擇使用。Tool 節點在三個階段保持同一個 callId。

Tool 所有者屬性將 Chat 注入的穩定 `useDisclosure` 掛鉤傳給根呼叫及巢狀呼叫。工具行在擁有展開正文的位置呼叫它，中間 renderer 不訂閱。每次呼叫擁有獨立展開狀態，外層輪次收起時重置該狀態，不替換 React 身份；展示模式切換保留該狀態。


slot 注入的 `useToolCallArgumentsPartial` 掛鉤按需訂閱所屬 Step 的 `assistant-step` 來源，並選取目前 callId 的原始參數字首。來源或呼叫不存在時返回空字串。同一步驟中的其他呼叫可能觸發快照檢查，但選中的字串未變時不會重新整理使用方。不呼叫掛鉤的工具不新增訂閱，已派發的呼叫不再提供參數字首來源。

### 卡片


每張卡片都直接在呼叫樹中檢視；選中呼叫後不會再顯示第二個全高檢視。行 renderer 為 terminal、read、diff、search 和 web 卡片各複用同一個純 card model，image 卡片的相簿經由工具自有 `tool.call.images` slot 渲染。這些 model 驗證原始呼叫參數、結果內容、失敗狀態、持久 metadata、PTC dispatch 的 `parentCallId` 與工作階段路徑資訊。不受支援或格式錯誤的輸入使用壓平的工具結果文字。檔案路徑摘要經屬主的 `openFile` 開啟檔案，chat 檢視把它路由到右側 Sidebar 的文字預覽；`inspect` 開啟軌跡檢視；該檢視不可用時不提供此回呼，卡片隨之隱藏 Inspect。terminal、diff、read、search 與 web 卡片的上限與 fallback 規則仍由 [ui-primitives README](../ui-primitives/README.zh.md) 負責；image 卡片的 fallback 規則由本包內的 card model 自行承載。

Chat diff 卡片在摺疊前保留九行，足以容納檔案標題、一對刪除與新增行及兩側各三行上下文。工具行顯示原語提供的精確或粗粒度替換統計；展開卡片包含差異正文，不顯示底部統計。

Auto 拒絕優先於按工具名選擇的專門檢視。其通用行保留呼叫身份、省略原始參數，並且只在顯示時歸一化儲存的理由：去除首尾空白，把行分隔符摺疊為空格，結果為空時使用在地化通用理由。Session 與 SDK 錯誤詳情保留原始理由。

記錄結果的工具詳情覆蓋目標和排程任務工具、Cordis 檢查、workflow 與 Ralph 報告、Session 事件／搜尋／軌跡查詢、Agent 與 teammate 控制、後臺作業、持久終端以及 LSP 導航。展開內容讀取成功的記錄結果，為失敗或不支援的資料保留通用輸入／輸出，並保留 Inspect。日期包含檢視者的時區，狀態反映呼叫結果而非目前工作階段狀態。Session 軌跡保留後代的縮排。LSP 結果透過 Host 回呼開啟檔案系統路徑，其他 URI 則顯示為文字。瀏覽器介面卡消費已記錄的 producer 文字與 JSON；Host service 物件和 presenter 回呼不會進入 Client。[緊湊工具詳情](../../../.agents/notes/implemented/architecture/2026-09-10-compact-tool-details.zh.md)記錄了呈現取捨。

展開後的狀態圓點和文字使用靜態語義色。操作回執和任務輸出的標題保持中性色，展開時省略標題中的狀態。中斷回執僅確認已發出中斷請求。

terminal model 使用瀏覽器安全入口 `@deepseek-ai/dsh-spill-policy/notice` 的 `hasSpillNotice`，而非獨立的 UI 匹配規則。[spill-policy README](../../spill/spill-policy/README.zh.md#shared-notice-ownership) 負責提示文字的格式化與識別。該檢查保守地選擇通用輸出；匹配的文字無法證明其來源，回放也不改變已記錄的結果位元組。
</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋對話主機、檢視 slot 與卡片模型。

- [ui-conversation](../ui-conversation/README.zh.md)——把 `tool-call` 節點分派給本包的聊天介面。
- [ui-primitives](../ui-primitives/README.zh.md)——內建檢視所拼裝的輸出卡片原子元件。
- [ui-skill](../ui-skill/README.zh.md)——`skill` 工具的業務自有註冊。
- [Auto review](../../experimental/auto-review/README.zh.md)——結構化拒絕身份與使用者可見原因的 owner。
- [Conversation 子系統](../../../docs/subsystems/conversation.zh.md)——業務自有功能如何註冊 Conversation node。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——keyed slot 背後的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包渲染流式工具身份與已記錄呼叫，不改變模型上下文。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義分派深度與檢視歸屬；它們是目前包約束。

- **Host 不把 `run_code` 暴露為 PTC mode 程式 binding**：生產事件只產生一層分發；遞迴的執行時/UI 約定支援巢狀。
- **第一方工具檢視集中在本包**：它們可以透過 keyed slot 獨立遷移到各自所屬的業務包。
- **Web 工具連結總是開啟新標籤頁**：摺疊的 `web_fetch` URL 與展開的 web 卡片連結不遵循 `ui-chat` 的連結開啟方式設定，因為工具檢視沒有外部連結回呼。
- **工具文案複用 `ui-conversation` locale namespace**：工具標題、行 chrome 與無 Cordis 的 primitive label 使用該字典；展示轉換器模型保留 locale key 或資料，而不是已渲染文案。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。工具組合只存在於瀏覽器，不貢獻事件或跨外掛可變狀態；slot 所有權由 ui-slots 驗證。
