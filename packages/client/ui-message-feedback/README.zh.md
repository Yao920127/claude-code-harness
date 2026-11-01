---
description: "Web 回饋介面：已定稿助手訊息動作行中的 Like/Dislike 對、兩種評分與 `/feedback` 共用的回饋彈出視窗，以及確認和失敗 toast；供回饋體驗的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-message-feedback

[English](README.md) | 中文

## 概述

本包是 Web GUI 的回饋介面：已定稿助手訊息動作條中的 Like/Dislike 對、輸入框浮層中的回饋彈出視窗及其確認與失敗 toast，以及讓不帶文字的 `/feedback` 開啟彈出視窗的裝飾。點贊和點踩都會開啟彈出視窗，先收集分類與可選描述，再記錄所選評分。每個 Session 一個 surface 支撐所有條目，因此一次列表讀取即可填充整段對話，一個彈出視窗同時服務 Session 與其訊息。評分、分類與備註是僅寫日誌的 Session 事件，絕不進入模型上下文。

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

與 `ui-conversation`、`ui-commands` 一起掛載本外掛；Like/Dislike 對隨即出現在每個輪次收尾助手訊息的動作行中，位於複製與分支之間，輸入框選單裡的「回饋」會開啟同一個彈出視窗。掛載 `session-log-export` 後，工作階段標題欄的更多操作選單也會增加「回饋」。已記錄的評分顯示實心圖示，不需要懸停也一直可見。點贊和點踩都會開啟彈出視窗：七個分類標籤和一個詳情框都可不填；提交後才會記錄帶所填內容的對應評分並彈出感謝 toast，對話日誌隨每個回饋事件一起投遞。再次點選已記錄的評分會直接撤回，不開啟彈出視窗。不帶文字的 `/feedback`，無論是從選單選中還是直接輸入後傳送，都會為 Session 開啟同一個彈出視窗；`/feedback <text>` 仍走主機命令路徑並顯示確認行。

### 失敗

評分或列表載入失敗在行內展示；提交失敗透過警告 toast 展示，彈出視窗保持開啟以便修正草稿。只有已定稿的訊息能到達訊息條目——被中斷凍結的部分輸出不帶 `messageId`，因此沒有回饋控制元件。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包貢獻 `conversation.chat.assistant-actions` 的 `feedback` 條目（order 10），由 ui-conversation 宣告並渲染在已定稿助手訊息的 IconActions 行內；同時貢獻 `conversation.input.overlay` 的 `feedback-dialog` 條目（order 2），它透過 body portal 渲染 Modal 與 Toast 基元，並讓 toast 以其所在的輸入框卡片為中心。`feedbackUi.openSession(sessionId)` Client 服務開啟同一個 Session 級彈出視窗，不記錄回饋；標題欄選單和命令裝飾共用此方法。`/feedback` 裝飾是經 `ctx.commandUi.decorate` 註冊的 `action`，因此選單選中或不帶參數的回車會消費觸發 token 並開啟彈出視窗，而帶參數的命令列仍到達主機命令。

每個 Session 有一個 `MessageFeedbackController` 支撐所有訊息控制元件，以及一個 `FeedbackDialogController` 擁有彈出視窗草稿、提交與 toast 序號。訊息控制器只讀取一次 `messageFeedback.list`，且延遲到首次 hover 或 focus 才發起，而非掛載時觸發；變更序列執行，每次都攜帶最後觀察到的版本，`version-conflict` 回應帶回權威條目，據此對帳檢視而不重新拉取。任一評分操作執行前，該行都會檢查已提交條目：評分相同則呼叫 `retract`，它會在序列佇列內重新檢查評分並在並行變更後變為無操作；其他狀態則攜帶所選評分開啟彈出視窗。彈出視窗控制器按目標提交：訊息目標透過訊息控制器 put 一條帶彈出視窗備註與分類的對應評分，Session 目標透過 `ctx.remote.sessionFeedback` 記錄。成功會關閉草稿並彈出確認 toast；被替換的舊草稿遲到的成功只彈確認 toast、不關閉新草稿；失敗會保留彈出視窗並彈出停留時間更長的警告 toast。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當回饋介面不夠用時閱讀以下頁面。它們從瀏覽器條帶進入 Session 日誌後端與工作階段外殼。

- [dsh-message-feedback](../../feedback/message-feedback/README.zh.md)——擁有按條目比較並交換與持久化的 Session 日誌後端。
- [dsh-command-feedback](../../feedback/command-feedback/README.zh.md)——`/feedback` 命令、`sessionFeedback` Remote 與分類表。
- [ui-commands](../ui-commands/README.zh.md)——`/feedback` 行所經過的命令裝飾約定。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告助手動作條與輸入框浮層。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

無。評分、分類與備註是僅寫日誌的事件，不是模型輸入。可選的 Session 日誌投遞使用請求中繼資料，而非模型上下文。

#### KV Cache 影響

無；回饋變更不改變模型可見的歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前回饋介面。它們是目前包約束，不是通用評分對比或任務積壓。

- **備註大小是主機策略**——部署方設定 `maxNoteBytes`（Web bundle 中為 8192），超長備註由主機以 `note-too-large` 拒絕。彈出視窗不預先驗證該上限，因此針對訊息的超長描述在提交時才失敗，而不是在輸入過程中；Session 級備註沒有上限。
- **無跨標籤頁推送**——另一個標籤頁的評分要等到重連或下一次衝突回應才可見，不會立即出現；控制器不消費回饋日誌事件。
- **僅限對話檢視**——trajectory 與 waterfall 檢視不渲染回饋控制元件，儘管它們的助手節點也帶有相同的 `messageId`。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛持有兩個 slot 註冊、一個命令裝飾、`feedbackUi` 服務，以及一個按 Session 劃分的控制器對 map；它們都隨所屬外掛 fiber 釋放。生命週期規格測試驗證，fiber 釋放時會撤銷所有註冊和服務並丟棄所有控制器，因此不存在需要在執行時檢查的第二權威來源。
