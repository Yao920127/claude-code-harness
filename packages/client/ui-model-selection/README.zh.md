---
description: "Web GUI 的模型選擇：/model 彈出視窗與 composer 模型位共用一份按提供者分組的工作階段級目錄；供模型路由的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-model-selection

[English](README.md) | 中文

## 概述

Web GUI 允許使用者透過 `/model` 彈出視窗或 composer 模型控制元件切換既有工作階段使用的模型與推理（reasoning）強度。兩個介面呈現同一組按提供者分組的選擇；所選模型決定可用的推理強度名稱與預設值。完整選擇從下一次請求開始生效；執行中的步驟保留其啟動時的模型與推理強度。所選模型不可用時，composer 保持停用，直到使用者選擇可用模型或同一模型恢復可用。

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

DeepSeek 帳號和 API Key 路由顯示為獨立提供者分組，各自展示相同的已設定模型目錄。

未選模型文案與可用模型名使用相同的常規字重，並在既有工作階段與新工作階段中保留已儲存的推理強度顯示；調整推理強度需要先選擇可用模型。點選未選模型控制元件直接開啟模型列表，Escape 關閉列表。

與 `ui-conversation` 及命令包一起掛載本外掛；composer 隨即在待處理指示器旁顯示模型位，`/model` 則以彈出視窗開啟同一份目錄。模型位選單開啟期間，`↑`／`↓` 在所顯示面板的行間移動焦點，`Tab` 選定聚焦行，Escape 與 `Shift+Tab` 先退出已下鑽的面板，否則關閉並回到觸發器。下鑽落在正在使用的那一行，返回則落在開啟該面板的格子上。所選模型可用時，composer 顯示目錄中的模型名稱；模型或提供者被刪除時（包括帳號退登），改為顯示已儲存的 `provider/model` ID。儲存的提供者、模型和推理強度均保持不變。

滑鼠選擇沿用瀏覽器原生點選及其取消行為；僅按下按鈕不會選定。開啟選單時聚焦觸發按鈕，再次點選觸發按鈕會關閉選單並把焦點還給它。等待任一入口發起的選擇結果時，焦點停在觸發按鈕，觸發按鈕以載入圖示代替下拉箭頭，該選擇包含的值所在行以載入圖示代替勾選標記；選擇被拒絕後選單保持開啟，Tab 可回到目前選中的行。

### 模型與推理強度

模型按提供者分組。composer 選單隻顯示模型與推理強度名稱，DeepSeek 帳號排第一，DeepSeek 排第二，第三方提供者保持目錄原有順序。導航箭頭使用 `--dsw-alias-menu-icon` 文字色。`/model` 彈出視窗顯示提供者名稱與目錄說明；其中兩個內建 DeepSeek 模型的說明使用目前語言，外部提供者說明保持原文。彈出視窗應用所選模型的預設推理強度；composer 隨後可以選擇任一已公佈的推理強度。介面卡沒有推理中繼資料時不顯示 Effort 行；不存在任意推理強度輸入。

展開的控制元件無法排在同一行時，composer 將模型與推理強度文字替換為模型圖示；空間足夠後恢復文字。觸發器的無障礙名稱、提示和選單仍提供完整選擇。

### 不可路由的工作階段

目錄可用性不會阻止使用已儲存選擇傳送訊息；請求執行負責報告憑證缺失或模型不可用。重新整理及重新整理失敗期間保留上次顯示的選擇和分組。Host 重置時清空這些顯示。退登後選擇器隱藏帳號提供者，同時保留已儲存的提供者／模型 ID 和推理強度。再次登入且該模型可用時恢復目錄名稱。既有工作階段日誌保持不變。

### 選擇失敗

當工作階段被其他寫控制代碼佔用時，模型選擇失敗提示使用者退出其他正在執行的 DSH 後重試。

-----

<a id="understand-the-implementation"></a>
## 理解實作

選單採用共享 `MenuSurface` 材質，包括用於背景模糊的 macOS 底層；自定義內容遵循[選單規則](../../../docs/web-styling.zh.md#component-rules)。

<details>
<summary>實作細節——點選展開</summary>

兩個入口共用一份由 `ModelDirectoryResolver`（`ctx.modelDirectories`）持有的工作階段級目錄：`/model` popupSelect 貢獻項（經 `ctx.commandUi` 註冊）與 composer 的具名 `conversation.input.model` 位都經 `session.models` 載入工作階段的可用目錄、經 `session.selectModel` 透過同一個 `ModelDirectory` 實例提交，因此任一入口所做的切換正是另一個入口接下來顯示的。目錄載入與選擇共享一個代次計數器，舊回應不會覆蓋新結果。目錄把最近一次提交的選擇釋出為 `pending`，直到它完成或被連線重置作廢；連線重置丟棄所有常駐投影，並在顯示前重新拉取 Host 恢復的選擇。目錄按工作階段惰性解析，隨工作階段作用域一併 dispose（資源釋放）；已定址 subagent 工作階段不公開任一入口。每份常駐目錄都會直接在轉發的 `llm/adapters-updated`、`settings/document-updated` 與憑證更新事件上重拉。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當僅瞭解模型介面還不夠時，請閱讀以下頁面。這些頁面從瀏覽器介面逐步深入到命令彈出視窗外殼與選擇約定。

- [ui-commands](../ui-commands/README.zh.md)——`/model` 貢獻項註冊進的 popupSelect 外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告 composer 的 `conversation.input.model` 位。
- [dsh-agent-default-model](../../core/agent-default-model/README.zh.md)——為從未選擇的工作階段提供預設模型的預設模型服務。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

兩個入口提交的 `session.selectModel` 選擇會間接影響模型：Host 會在下一次提示片語裝邊界為完整的 `ModelSelection` 建立快照，並負責使其對模型生效；執行中的步驟則保留已組裝的選擇。

#### KV Cache 影響

切換路由可能減少提供者側後續請求的快取複用，或使其失效；提示詞字首本身不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制界定了目前模型選擇介面。它們是目前包約束，不是通用模型路由器對比或任務積壓。

- **無建立期或已定址 subagent 選擇**——兩個入口都要求既有普通工作階段的 agent（智慧代理）；沒有可納入工作階段建立的草稿階段模型選擇，subagent 繼續執行也有意不公開獨立的模型選擇約定。
- **目錄名僅供呈現**——選擇與持久化使用提供者／模型／推理強度 id；目錄查詢或確切模型中繼資料查詢失敗的提供者以不可選失敗行列出，重新載入前保持原樣。
- **不能任意輸入推理強度**——composer 僅提供確切模型由介面卡公佈的推理強度；介面卡沒有推理中繼資料時不顯示 Effort 行。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個 command contribution，HMR（熱模組替換）安全性測試證明該註冊的 dispose 能正確完成；它不發出 Cordis 事件，也不持有跨外掛可變狀態。
