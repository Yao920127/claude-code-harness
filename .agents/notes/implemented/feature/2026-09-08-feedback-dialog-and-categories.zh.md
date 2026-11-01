# Agent Note: 回饋彈出視窗、分類與確認 toast

Status: implemented

[English](2026-09-08-feedback-dialog-and-categories.md) | 中文

## 問題

Web 用戶端有兩條互不相連的回饋路徑，且都沒有可見結果。`/feedback <text>` 記錄一條 Session 備註並在轉錄裡渲染一行確認；贊踩對立即記錄評分，自由文字則透過錨定在該行下方的備註浮層填寫。兩條路徑都不告訴使用者提交了什麼、去了哪裡，都不收集分類，而點踩這個使用者最願意解釋的情境什麼也不問。Issue #3515 及其設計稿要求：一個彈出視窗，可從輸入框選單、不帶文字的 `/feedback` 和點踩三處開啟，帶七個固定分類、可選描述、成功 toast，以及已記錄評分的實心圖示；點贊保持立即記錄。

## 決策

`command-feedback` 在其用戶端可用的 `./types` 匯出中以 `FeedbackCategory` 聯合型別與 `FEEDBACK_CATEGORIES` 元組擁有分類表，`feedback/record` 變為 `{ text?, category? }`：空白文字記為預設，兩個成員都沒有的條目仍會記錄，因為回饋所授權的日誌投遞本身就是內容。同一個包透過 `TypertRemoteService` 釋出 `sessionFeedback.record` Remote，按 id 找到 live Session 後呼叫已有的 `recordFeedback` 生產方，因此彈出視窗記錄的是與命令相同的事件，只是沒有命令簿記。`message-feedback` 給 `MessageFeedbackItem` 與 `MessageFeedbackPutRequest` 加上可選 `category`，按元組驗證已存值，並把分類變化算作實質編輯。

`ui-message-feedback` 成為 Web 回饋介面。每個 Session 一個 `FeedbackSurface`，擁有訊息回饋控制器、負責草稿、提交與 toast 序號的 `FeedbackDialogController`，以及兩者之間的路由：訊息目標經訊息控制器 put 一條帶彈出視窗分類與備註的所選評分，Session 目標經 `ctx.remote.sessionFeedback` 記錄。`conversation.input.overlay` 的 `FeedbackDialog` 條目從彈出視窗 store 渲染 Modal 與 Toast 基元。主機 `feedback` 命令上的裝飾讓選單選中或不帶參數的回車為 Session 開啟彈出視窗，而 `/feedback <text>` 仍到達主機；它使用 `CommandUiSpec` 中的 `action` 種類：裸呼叫消費觸發 token 後執行一個用戶端回呼，不提交任何內容。後續的[對稱訊息回饋提交](2026-09-10-symmetric-message-feedback-submission.zh.md)決策擁有評分入口規則：任一未記錄的評分都會開啟彈出視窗，再次點選已記錄的評分則撤回。備註浮層、`clearNote` 與 `clear` 繼續保持移除，因為彈出視窗是唯一的備註編輯器。

工作階段標題欄的更多操作選單也透過 `feedbackUi.openSession` Client 服務開啟 Session 彈出視窗。選單仍由 `session-log-export` 持有，現有的逐 Session 回饋控制器持有草稿與提交。一個可觀察值跟蹤可選回饋外掛的可用狀態，因此解除安裝回饋外掛只移除其選單行，匯出仍然可用。開啟或關閉表單不寫回饋事件；點選提交才記錄一條 Session 回饋。

彈出視窗是共用的 Modal 卡片，寬度按設計稿；設計稿裡「包括目前對話的日誌」核取方塊不做，因為日誌隨每個回饋事件一起投遞，不是可選項。超長描述仍在提交時以 `note-too-large` 失敗；彈出視窗保留草稿並透過警告 toast 展示在地化錯誤。

## 考慮過的替代方案

**為標題欄選單動作宣告子 slot。** slot 可以讓每個外掛持有自己的選單行，但需要共享選單項 API，超出 #4445 所需回饋入口的範圍。可選的 `feedbackUi` 服務將改動限制在區域性，同時讓彈出視窗狀態與提交繼續由回饋外掛持有。

**把分類編進備註文字。** 自由文字裡的字首不解析就無法過濾，還會混進遙測上傳的原樣備註；載荷裡的持久 id 才是消費方能分組的東西。

**讓彈出視窗經命令平面以 `/feedback <text>` 提交。** 命令拒絕空文字、帶不了分類，還會寫一行設計稿已用 toast 取代的確認；Remote 記錄同一個事件且沒有這兩個約束。

**在彈出視窗之外保留備註浮層。** 同一條備註有兩個可達性不同的編輯器，會讓該行在某些寬度下變成兩行，正是當初引入浮層要避免的缺陷，而且設計稿只有兩個拇指。

**每個訊息控制元件各自一個 Toast。** 輸入框浮層已經按 Session 掛載一次，彈出視窗又擁有 toast 序號，因此一個持有者同時服務兩種訊息評分路徑與 Session 彈出視窗。

**在 `CommandUiSpec` 裡新增 dialog 種類。** 一個消費 token 後執行用戶端回呼的 action 已經夠用；「檔案」行使用同一個 `action` 種類，一份定義即可服務兩個條目。

## 後果

新增分類意味著把它加進聯合型別、主機元組、彈出視窗的標籤記錄和 `feedback` 詞典；用戶端打包純度門禁止從主機包做值匯入，因此彈出視窗以 `Record<FeedbackCategory, true>` 重述分類表，鍵的順序就是標籤順序，完整性由編譯器檢查。凍結的已釋出 v2 載荷清單仍把 `feedback/record` 列為僅有 `text`：它管轄從舊代際遷移來的產物，那些產物不可能攜帶新成員，而同版本恢復應用的是已安裝詞彙。固定浮層幾何的 `message-feedback-layout` Web 情境隨浮層一起刪除。message-feedback 與 feedback-release 的 Web 期望輸出和回饋子系統文件在同一個 PR 中更新；SDK 的回饋生產方會記錄一條帶分類的 Session 備註和一條帶分類的差評，因此兩個 SDK 期望輸出都攜帶新成員。
