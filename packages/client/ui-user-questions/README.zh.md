---
description: "dsh Web 用戶端的 ask_user_question 功能：接管編輯器的提問 UI 與 plan-review 審批卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-user-questions

[English](README.md) | 中文

## 概述

當 agent（智慧代理）在 Web 用戶端中提問時，本包會用互動式提問介面接管聊天編輯器。使用者可以在問題之間導航、選擇一個或多個選項、輸入自定義答案、跳過問題，並提交一批結構化答案。選擇單選項後會立即前進，而草稿會在目前頁面的生命週期內跨工作階段導航保留。若唯一的問題宣告瞭受支援的呈現意圖，則可使用專用介面，包括帶 `Request changes` 和 `Approve` 操作的 plan-review 卡片。

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

當 agent 提問時，編輯器變成提問介面：回答每個問題、用翻頁器導航，或跳過它。選擇單選選項後會立即前進；Enter 繼續流程，並在所有問題均已回答或跳過後提交，而 Shift+Enter 改為換行（IME 組合輸入期間按 Enter 只會確認輸入候選，不會前進）。

### 作答

使用者開啟或編輯自定義答案時，多選題草稿會保留已選中的標籤，因此提交項可以同時攜帶 `selected` 與 `custom`；單選題的自定義答案仍保持互斥。問題詳情複用助手輸出的 `MarkdownText` 原語，包括其 GFM 渲染與不受信任內容策略。限高卡片保持標題、導航與提交動作固定，超長的詳情與選項共享內部滾動區。「跳過」會保留其他草稿，併為該項發出既有的空 `{ selected: [] }` 結果；關閉則以 `ASK_CANCELLED` 拒絕整個等待。

### plan-review 卡片

`plan-review` 意圖——由 `dsh-plan-mode` 在 `exit_plan_mode` 審閱上設定——渲染緊湊審批卡片：頂部為帶“檢視全文”連結的“計劃待審”條帶，正文顯示計劃標題和兩行純文字摘要，底部提供“要求修改”和“同意執行”。條帶使用共享 warning 狀態點，並在任一操作結算期間切換為 ongoing loading。透過連結或聊天曆史中的常駐卡片可在側邊欄閱讀完整計劃。“同意執行”用提問方的批准標籤回答；“要求修改”以 `ASK_CANCELLED` 拒絕等待，讓編輯器歸位供使用者輸入回饋，不會提交批准。卡片不單列拒絕按鈕。

### 失敗與恢復

通用提問流程把目前題號、已選標籤、自定義文字和顯式跳過狀態儲存在非持久化 slot 儲存中；該儲存歸屬對應 Session generation，並以待處理請求的本地渲染標識為鍵。從 Session A 切換到 B 時，如果沒有其他引用持有 A，A 就會結束，因此返回 A 時會得到空的問題草稿；如果另一個引用繼續持有 A 的 generation，該草稿也會保留。不同的請求標識讀取空草稿，並在首次編輯時替換舊值；成功回答或取消會清除相符的值。請求是否仍在等待由主機保持權威。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包是一條歸屬規則：渲染提問是主機的 UI 能力，擁有該工具則是 agent 的能力，因此 `tool-ask-user` 行屬於需要它的各個 preset（以及沒有 preset 的 TUI 組裝）。

### 意圖介面選擇

卡片接管宣告瞭意圖、以 `detail` 攜帶計劃、提供了被指名的批准標籤的單個問題，要求除批准外最多一個選項，且非多選。次要操作返回編輯器供使用者提出修改要求。更多選項或多選問題仍由通用流程處理。

### 文案與 locale

編輯器外框文案（翻頁器、按鈕、預留位置、驗證提示）是雙語的：外掛在 `dsh-client-locale` 的 `question` 名稱空間下注冊 zh/en 詞典，並透過 inject face 把繫結的翻譯函式和 locale 快照源交給該條目，因此切換語言會重新渲染已掛載的編輯器。問題與選項文字來自模型並原樣渲染；載體失敗訊息也不經翻譯直接顯示。

計劃審批透過 `conversation.plan-review.actions` 插槽提供請求鍵、完整正文和可選的呼叫標識。計劃外掛從歷史中開啟已記錄計劃，並把沒有呼叫標識的審批作為臨時側邊欄預覽開啟。開啟文件不會回答或關閉審批。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋編輯器主機、工具 seam 與 plan-mode 消費方。

- [ui-conversation](../ui-conversation/README.zh.md)——擁有 `conversation.composer` 鏈的聊天介面。
- [tool-ask-user](../../interaction/tool-ask-user/README.zh.md)——面向模型的工具；本 UI 會渲染其 schema 與答案。
- [ui-plan](../ui-plan/README.zh.md)——設定 `plan-review` 意圖的 plan-mode 介面。
- [user-questions](../../interaction/user-questions/README.zh.md)——Host 側提問 seam 及其應答方 waterfall（瀑布式事件）。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：本包在 Web 用戶端呈現 `dsh-tool-ask-user` 所擁有的模型可見 schema 與答案渲染。

#### KV Cache 影響

不會直接失效；模型可見的工具呼叫與結果由 `dsh-tool-ask-user` 擁有。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義草稿永續性與編輯器歸屬；它們是目前包約束。

- **未提交草稿的生命週期限於目前頁面與工作階段**：只要該工作階段作用域仍留在頁面內，工作階段導航就會保留草稿；完整重新整理頁面、工作階段被裁剪，或待處理請求以新的本地標識重新交付時，則從空草稿開始。儲存從不把草稿寫入主機、`localStorage` 或磁碟。
- **每次只有一個請求擁有編輯器**：後續待處理請求仍留在工作階段快照中，並在較早請求落定後顯示。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。工具與 slot 註冊都是由各自註冊表持有和觀察的 effect；Host 待處理表透過公開的 wire protocol 測試。
