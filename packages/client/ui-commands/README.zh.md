---
description: "Web GUI 的用戶端命令 API：/ 命令 source、三類派發、工作階段級命令目錄，以及面向業務包的 popupSelect 與 action 註冊；供斜槓命令的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-commands

[English](README.md) | 中文

## 概述

鍵入 `/` 命令會開啟已註冊的彈出視窗、執行用戶端動作、進入主機命令的輸入或直接執行，命令列不會被靜默降級為普通提示詞。業務包透過 `ctx.commandUi` 註冊 popupSelect（`/model`、`/permission`）或 action，也可用這兩種方式裝飾既有主機命令，同時保留其目錄行與參數宣告。空格與回車根據工作階段目錄解析命令列：帶 `input` 的主機描述符是 `leadingInput`，註冊了 `CommandUiSpec` 的是 `popupSelect` 或 `action`，其餘是 `execute`。

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

與 `ui-input-trigger` 及 `ui-conversation` 一起掛載本外掛；`/` source 隨即出現在觸發選單中，業務包經 `ctx.commandUi` 註冊自己的命令表面。鍵入 `/model` 開啟已註冊的彈出視窗；帶參數宣告的主機命令開啟其輸入或直接執行。彈出視窗持有 composer 焦點：鍵入即在已載入的行上本地篩選，`↑`／`↓` 在行間移動，回車與 `Tab` 接受高亮行，Escape 與 `Shift+Tab` 把焦點還給 composer。高亮落在選項標記為工作階段目前值的行上，因此在剛開啟的彈出視窗上接受即確認目前值。composer 的 `+` 按鈕與鍵入的 `/` 開啟同一個選單：「新增」小節（檔案、目標、計劃、回饋）與「指令」小節（壓縮、權限、模型、下載日誌）按使用頻次排列，每行帶圖示、在地化的標題與說明，在地化標題與命令名不同時還顯示命令名作為別名。

### 種類與裝飾

貢獻項是用戶端自有命令，與主機命令同名會明確報錯。它的 UI 是 popupSelect 規格或動作：裸呼叫消費觸發 token 後執行回呼，不提交訊息。業務包負責自己的動作及可用性，輸入框透過同一 API 註冊「檔案」。裝飾為已有主機命令新增裸呼叫彈出視窗或動作，並保留其目錄行、參數認領與生命週期記錄；沒有匹配的主機行時不觸發。選單查詢按順序、不區分大小寫地模糊匹配命令名與標題的子序列，字首優先，不顯示小節標題。

### 內建行的展示面

內建命令定義攜帶穩定的 `definitionId`。用戶端按標識選擇在地化標題、說明、圖示和輸入寫法，修改主機說明不會改變選擇結果。沒有匹配標識的同名覆蓋保留自己的文案，也不獲得內建別名。在任何介面語言下，中英文寫法都透過同一個工作階段有效目錄解析，草稿保留手輸寫法，提交使用主機註冊名。貢獻項提供自己的 `label`、`description` 和 `icon`，每次生成候選項時讀取。空查詢按名稱確定小節順序，未列出的行排在「指令」末尾。

### 帶附件提交

composer 攜帶圖片或通用檔案提交時，只有宣告瞭 `input.attachments` 的主機命令繼續。其餘命令路徑都會丟擲在地化的 `attachmentsUnsupported` 拒絕，以瞬態 toast 呈現，草稿與附件卡保持原位。處理器出錯時保留相同草稿狀態供使用者重試。

-----

<a id="understand-the-implementation"></a>
## 理解實作

選單採用共享 `MenuSurface` 材質，包括用於背景模糊的 macOS 底層；自定義內容遵循[選單規則](../../../docs/web-styling.zh.md#component-rules)。

<details>
<summary>實作細節——點選展開</summary>

`src/client/contract.ts` 定義貢獻項和裝飾的註冊介面，以及 `dismiss(name)`：它關閉該命令已開啟的彈出視窗與確認對話方塊，中止待完成的選項載入，阻止晚到結果重新開啟彈出視窗，並保留 composer 草稿。`CommandDirectory` 負責工作階段級協定快取，並透過 `resolution.ts` 解析輸入命令；該模組負責內建命令標識匹配和在地化輸入寫法。`matchSpace` 同步讀取就緒快取，`matchEnter` 等待快取就緒，預熱失敗或取消時拒絕。轉發的目錄和連線事件使快取失效。主機執行匹配的命令後，本瀏覽器釋出 `command/executed`，其他用戶端只觀察持久命令事件。`PopupSelectController` 負責彈出視窗狀態，`PopupSelectView` 佔據輸入浮層。`presentation.ts` 負責行標題、圖示和分節，展示與解析輔助函式均留在外掛內部。

每次命令目錄拉取都要求用戶端已持有該工作階段，並等待首次歷史開啟成功後才傳送 `commands.list`。臨時的 `commandCatalog` 引用持續持有工作階段，直到拉取結束。未被持有的工作階段或開啟失敗會直接拒絕，不傳送 RPC，因此後臺目錄重新整理不會重新開啟已關閉的工作階段。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

如果僅瞭解命令互動還不夠，請閱讀以下頁面。它們從命令 API 進入觸發流水線與主機命令註冊表。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——`/` source 註冊進的流水線。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告輸入浮層 slot 並擁有 composer。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

派發路徑透過其觸發的主機 `command.execute` RPC 間接影響模型：每個命令 handler 的主機包擁有任何模型可見效果（`/plan` 的 handler 翻轉 plan 模式，其歸屬包注入 policy 段），而命令列、分離結果與所有選單和 notice 渲染都留在用戶端，永不進入工作階段日誌。

#### KV Cache 影響

無直接影響；該包既不組裝也不傳送提供者請求。它觸發的命令 handler 可能改變歸屬主機包對下一個請求系統提示詞的貢獻——某個 section 的出現或消失會替換較早的請求 token，並使提供者字首從該點起失效——但這一影響由各命令的主機包擁有並記錄。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前命令互動方式。它們是目前包約束，不是通用命令列對比或任務積壓。

- **脫離工作階段後，分離結果 notice 退回到 console**——fire-and-forget 路徑經 `SessionInput.notify` 把結果送到觸發工作階段的 composer；工作階段銷燬後，console 輸出行是僅剩的呈現面。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是基於 wire 命令目錄的瀏覽器側 source，不發出 Cordis 事件，也不持有跨外掛可變狀態；dispatch 與 cache 行為由包測試覆蓋。
