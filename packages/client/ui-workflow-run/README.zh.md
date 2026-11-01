---
description: "dsh Web 用戶端的持久化工作流執行 Conversation Node：把頂層工作流執行重建為帶巢狀成員摺疊的獨立聊天節點。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workflow-run

[English](README.md) | 中文

## 概述

使用 `dsh-client-ui-workflow-run` 可以把每個持久化的頂層工作流執行作為獨立 Chat 節點檢視。展開執行可檢視階段，展開階段可檢視成員；執行中、失敗、已取消與已中斷的層級預設展開，已完成層級保持摺疊。只有當執行中的成員屬於目前工作階段且可在本地存取時，才能開啟其子工作階段。節點只顯示身份與狀態；腳本、輸出、錯誤、日誌、用量、拓撲與控制操作不屬於本介面。

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

經 `dsh-tool-workflow` 發起的頂層工作流執行會在對話中顯示為獨立節點：展開執行檢視其階段，展開階段檢視其成員。階段組只來自開始過的成員；成員結算只改變狀態，不刪除或重排成員。

### 導航節點

執行使用 32 畫素行，帶常駐 chevron、行內狀態點與狀態文字；階段使用 disclosure 行，在主區顯示標題與成員數、在固定尾部顯示聚合狀態；成員使用 16 畫素狀態點槽、可省略名稱區與固定狀態列。開啟成員的子 Session 需要成員與子級均在執行，且子級屬於目前 Session 的直接子級目錄。子級活動狀態使用統一 UI status，未知時使用 Session 摘要。Session 摘要不建立成員關係；目錄中缺失、父級不符或終態的條目不可互動。

### 狀態與完成

完成狀態會立即更新，但只要焦點仍位於展開內容內，自動摺疊就會等待焦點離開。若所屬輪次或步驟已關閉但終點事件缺失，介面把相應執行或成員顯示為已中斷，而不改寫工具結果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

節點是持久化工作階段事件的確定性回放：`tool-workflow/run-start` 以 `runId` 建立唯一上下文，成員開始、成員結束與執行結束事件按日誌順序更新該上下文。只有 update 的歷史尾頁會保持 pending，直到更早頁面補入唯一 start；此後 prepend、完整回放與即時 append 得到相同狀態。

### 展開選擇

普通執行更新保留目前選擇，首次進入異常狀態時僅自動展開一次，正常完成時僅自動摺疊一次；已完成階段在同一 phase key 下有新的成員開始執行時，該階段與外層執行會再次自動展開。若一次全新的正常週期在同一次渲染中完整到達，而執行仍處於活動狀態，該階段最終保持摺疊，但外層執行會自動展開一次，以展示更新後的摘要。階段選擇由 `WorkflowRunPanel` 持有，因此關閉並重新開啟外層執行不會重置這些選擇；renderer remount 會根據持久化事實重建每層的初始選擇。

### 裝配

本包把 Definition、locale 字典與 `workflow-run` renderer 都註冊為 Cordis effect；移除用戶端 entry 會撤銷三者。shipped Web bundle 在 `ui-conversation` 與 `ui-tool` 之後裝配該外掛。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋工具 seam、對話主機與工具展示層。

- [tool-workflow](../../workflow/tool-workflow/README.zh.md)——擁有四類 `tool-workflow/*` 工作階段事件的工具。
- [ui-conversation](../ui-conversation/README.zh.md)——承載 `conversation.chat.node` slot 的聊天介面。
- [ui-tool](../ui-tool/README.zh.md)——本節點相鄰的工具呼叫展示層。
- [Conversation 子系統](../../../docs/subsystems/conversation.zh.md)——業務自有功能如何註冊 Conversation node。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，只渲染持久化工作流記錄，不改變模型上下文。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義哪些執行會產生記錄、節點暴露什麼；它們是目前包約束。

- **只有經 `dsh-tool-workflow` 發起的頂層呼叫會生成這些記錄**：巢狀 PTC mode 呼叫和直接 `WorkflowEngine` 消費方不會生成。
- **導航刻意只面向即時執行**：終態成員繼續保留供檢討，但本節點永不為其提供冷工作階段入口。
- **節點只顯示執行、階段、成員身份與狀態**：腳本、輸出、錯誤、日誌、用量、靜態拓撲與控制操作都不屬於本介面。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。瀏覽器外掛只貢獻由 effect 持有的 Conversation Definition、keyed renderer 與 dictionary；測試證明資源釋放時會撤銷這三項貢獻；Host tool 包負責持久事件不變式。
