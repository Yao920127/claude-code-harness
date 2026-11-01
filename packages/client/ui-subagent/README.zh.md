---
description: "dsh Web 用戶端的 subagent 對話目錄、續接路由 UI 與 '@' 引用 source。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-subagent

[English](README.md) | 中文

## 概述

使用本包可瀏覽父工作階段下的每個 subagent 對話、開啟任意後代，並檢視其是否正在執行以及 token 用量和活躍輪次耗時。已完成的 one-shot 對話會作為只讀執行記錄開啟。可繼續對話在執行期間按提交順序接收後續提示詞，並獨立提供 Stop。普通工作階段側邊欄會省略 subagent 對話，因此父工作階段頁頭目錄是它們的導航入口。獨立的 `@` source 會把執行中 child 的 label 插入使用者訊息，但不會把它解析成繼續執行地址。

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

工作階段頁頭把目前工作階段標題作為譜系麵包屑；當工作階段的直接目錄有子項或讀取失敗時，後代數量觸發器渲染在頁頭操作區的最前方，不帶任何麵包屑分隔符。目錄缺席、空目錄載入中或成功載入為空時，均隱藏數量觸發器。觸發器開啟該直接目錄，報告總數與執行數，並且只在行展開時載入巢狀目錄。選擇任意深度，即可用該子工作階段的確切 `{parentSessionId, childSessionId, mode}` 地址開啟其對話；也可以使用行尾箭頭在右側 Sidebar 開啟同一地址，並在空間允許時優先使用獨立分欄。

本包註冊 `dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>` 資源與 builtin Sidebar tab 型別。資源直接根據地址保留 child 的 `SessionReference`，不重新整理 parent 目錄，並在 tab 記錄關閉時釋放 reference。tab 透過 `sidebar.chat.conversation` 渲染共享 `conversation.content` Factory，把區域性 View 固定為 Chat，並省略主 Conversation 的 Header 與寬度控制。

### 瀏覽目錄

懸停觸發器 150ms 後開啟目錄；指標離開觸發器和目錄後，經過 120ms 關閉。點選後代數量觸發器會固定目錄，直到點選外部，或在觸發器或樹內按 Escape 關閉。點選麵包屑標題會導航至對應工作階段。

行顯示 mode、活動狀態與由日誌支撐的可選 title；running 使用共享 ongoing loading，最近一個已結束輪次正常完成的 inactive child 使用共享 success 綠點，其他 inactive child 使用共享 idle 灰點。每行都為狀態圖示預留相同的 14px 列寬，並將較小的圓點居中，使 title 與 loading 狀態對齊。緊湊的頁頭觸發器會垂直居中活動圖示與數量，並保留 4px 水平間距。尾隨列在上行顯示提供者的持久化 token 用量總計，在下行顯示活躍輪次耗時。鍵盤導航：ArrowRight/ArrowLeft 展開和摺疊分支；ArrowUp/ArrowDown、Home、End 與 Escape 用於導航或關閉樹。沒有 label 的 one-shot 行退回到其工作階段 id。只有一行自身的目錄載入為空後，它才是已知葉子。

### 續接對話

確切 parent 存活時，可繼續 child 保留普通輸入 chrome：child 執行期間輸入和 Send 保持可用，因為每條後續訊息都會進入 child 的 FIFO inbox，而獨立的 Stop 經由 `subagents/interruptByParent` 路由。確切 parent 不可用且 child 未在執行的可繼續 child 會選用說明恢復路徑的只讀編輯器；此類 child 仍在執行期間，selector 會讓位給普通編輯器——輸入區與 Send 被停用，但獨立的 Stop 保持可用。

### `@` 引用 source

`@` source 仍然刻意保持獨立且惰性：候選是從 `ctx.sessions.list` 零 RPC 得到的執行中 child；pick 會插入字面文字 `@label `，codec 投影為 `@label`。它不參與命令裁決，也不會把 label 解析成繼續執行地址。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

目錄與編輯器行為由 [Web subagent 對話筆記](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.zh.md) 與[目前輪次中斷筆記](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.zh.md) 規定。

### 目錄派生

頁頭譜系 renderer 透過標準 `useSessions` 掛鉤讀取 `projectionsBySession`。renderer 從每個 Session 的共享值中選擇 `subagentCatalog`，用於成員關係、展開控制元件與數量；活動狀態優先使用統一 UI status，缺少時使用 Session 摘要；摘要提供標題與用量。展開行會按需載入初始目錄。即時 projection 幀更新所有已載入層級，無需選單訂閱或重複成員查詢。行在目錄缺席、載入中或失敗時保持可展開，並在目錄就緒且為空後成為已知葉子。

開啟目錄下拉選單不會請求其根目錄。展開子節點目錄或重試失敗讀取時呼叫 `refreshProjection`；共享投影值的變化會自動更新顯示。

麵包屑地址從 Provider 所繫結的 Session 地址和已載入的 parent 目錄推導，也包括從未選中過的祖先。

### 耗時、完成狀態與 token

每個可見目錄層在包含執行中 child 時獨立推進時鐘；摺疊該層或關閉選單會釋放時鐘。token 用量總計為四個互不重疊的 `tokenUsage` 桶之和。`subagentTiming` 投影會累加已結束輪次的耗時，並記錄最近一個已結束輪次是否以 `completed` 結束；新輪次開始時會清除該完成狀態，直到自身的 `turn/end` 到達。耗時僅在執行中 child 存在未結束輪次時每秒遞增一次，並在 child 變為 inactive 後凍結；被中斷的未結束輪次以其同一切面的 `active.through` 為上界，絕不使用更新的工作階段中繼資料。

### 編輯器選舉

one-shot child 始終選用只讀編輯器。可繼續 child 僅在其確切 parent 不可用且 child 未在執行時選用只讀編輯器；否則普通編輯器的工作階段會經 `subagents/prompt` 路由提示詞。本包絕不接收主機上下文，也不呼叫面向模型的工具。

模式未知的目錄項仍可見、可點選，沒有標籤時顯示子工作階段 id。讀取子歷史並確認受支援模式前，輸入區保持只讀；讀取失敗在該子工作階段中報告。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋對話介面、主機 seam 與設計筆記。

- [ui-conversation](../ui-conversation/README.zh.md)——承載頁頭操作與編輯器鏈的聊天介面。
- [ui-input-trigger](../ui-input-trigger/README.zh.md)——承載 `@` source 的建議機制。
- [subagent](../../subagent/subagent/README.zh.md)——可繼續 child 背後的主機能力 seam。
- [Web subagent 對話](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.zh.md)——目錄與編輯器規範。
- [目前輪次中斷](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.zh.md)——獨立 Stop 的語義。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者提示詞中的 subagent label 文字

#### 模型看到的內容

只有 `@` 引用 source 會影響模型輸入：pick 的候選以字面文字 `@label` 進入普通使用者訊息，沒有專用內容塊或主機側解析。瀏覽目錄、導航 child 與檢視持久化 transcript（文字記錄）都不會新增提示詞 section；已接收的繼續互動內容會經主機 subagent 介面卡成為普通 FIFO 使用者訊息。

#### Token 影響

有條件且僅追加：字面 `@label` 或使用者後續訊息只會向對應的新使用者訊息增加 token。目錄與 transcript 操作增加零模型 token。

#### KV Cache 影響

僅追加。本包絕不改寫更早的請求 token。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義目錄能顯示什麼、`@` 引用意味著什麼；它們是目前包約束。

- **非完成的 inactive 結果仍合併顯示**：目錄能區分最近一次正常完成與其他 inactive 狀態，但不區分失敗、取消、拒絕、token 耗盡或尚無已結束輪次的 child；UI 不公開 Activation 身份，停止能力僅限編輯器上針對執行中可繼續 child 的目前輪次 Stop。
- **`@` 引用仍是顯示標題文字**：重複或改名後的 label 會有歧義，因此它們刻意不獲得繼續執行語義。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個 slash source，其資源釋放已由 HMR（熱模組替換）安全規範驗證；它不發出 Cordis 事件，也不持有跨外掛可變狀態。
