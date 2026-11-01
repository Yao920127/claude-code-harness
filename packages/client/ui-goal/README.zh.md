---
description: "Web GUI 的 goal 介面：顯示目前目標並支援編輯、暫停、恢復或清除的 composer 上下文條帶；供 goal 體驗的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-goal

[English](README.md) | 中文

## 概述

Web GUI 的 goal 介面同時顯示持久 goal 狀態及目前的程序本地啟用狀態，供使用者編輯、暫停、恢復或清除 goal；被拒絕的變更所產生的錯誤會內聯顯示。它把持久的 `/goal` 執行顯示為 `Command input` 氣泡，讓使用者或模型發出的命令在重新載入後仍然可見。goal 建立仍不歸本包。除 `minimal` 外，隨附的 Web preset 都會向 agent（智慧代理）提供 `/goal`。

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

與 `ui-conversation` 及 goal 領域包一起掛載本外掛；只要工作階段存在目標，條帶就會作為 composer 上下文堆疊的第二張卡片出現（位於 Todo 之後、Queue 之前）。Todo 與 Goal 使用相同的面板 elevation，使其位於 composer 層級之上。已 armed 的 active goal 提供暫停動作；active-but-disarmed 或 paused 的 goal 提供恢復；編輯重寫目標文字；清除移除目標，並在投影追上之前抑制條帶。

### 指令輸入氣泡

每條持久的 `/goal` 執行都投影為一個右對齊的使用者樣式氣泡，標籤為 `Command input`（或 `指令輸入`），渲染在通用命令結果行之前；開頭的 `/goal` token 經 ui-primitives 的 `projectUserText` 以等寬程式碼字型渲染為指令引用 chip，目標文字保持正文字型。它不含時間戳、複製或分支操作，重新載入時會依據執行記錄重建。

### 失敗

被拒絕的變更會把 Remote 錯誤內聯呈現到條帶上；載入中、無目標、已完成與成功清除的目標一律不渲染。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

持久 goal 經 `useProjection('goal')` 到達（由歷史尾頁播種、`session/projection` 幀更新）。注入面攜帶註冊方私有的啟用掛鉤源與四個變更動詞。該源僅在框架掛鉤觀察它時啟動；啟動後會讀取 `ctx.remote.goals.get`、訂閱 `goal/activation-changed`，並在 running 狀態或連線重置時重新整理。即時事件 epoch 會讓在途讀取失效，因此較舊的 HTTP 回應不能覆蓋較新的 activation 變化；running 重新整理會保留最後一次已知 activation，直到讀取完成。條帶不持有領域儲存或跨外掛快取。每個變更在呼叫時從工作階段目前投影值讀取 CAS ref，比較並交換（RPC 的 CAS）就是陳舊性護欄。由於 React 的 pending 渲染無法攔住同一幀內的點選，條帶會同步為變更建立 single-flight 防護。指令輸入投影是獨立的 Conversation Definition，在通用命令結果 Node 之前建置 `command-input` Chat Node；它絕不建立 `user/message` 或模型輪次。

啟用狀態讀取持有臨時的 `goalActivation` 用戶端引用，僅在該工作階段首次歷史開啟成功後傳送 `goals.get`。binding 已失效或開啟失敗時不傳送 RPC。讀取被拒絕時記錄錯誤，不改變投影中的目標或最後一次已知啟用狀態；讀取結束時釋放臨時引用。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 goal 介面不夠用時閱讀以下頁面。它們從瀏覽器條帶進入 goal 領域與它所填充的 slot。

- [dsh-goal](../../goal/goal/README.zh.md)——本介面讀取並變更的 goal 領域、投影與 `/goal` 命令。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告 `conversation.input.dock` slot 並擁有 composer。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響：條帶路由 `goals/edit`、`goals/pause`、`goals/resume` 與 `goals/clear` 變更；主機 GoalService 擁有這些變更排隊的模型可見 goal 上下文訊息。

#### KV Cache 影響

除非已排隊的 goal 上下文獲准，否則沒有影響。獲准的上下文會像其他訊息一樣擴充功能歷史尾部；准入前被丟棄的插入項不會影響快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前 goal 介面。它們是目前包約束，不是 goal 領域對比或任務積壓。

- **Host 狀態與 preset 無關**——把活躍工作階段切換到 `minimal` 後，Host 擁有的 goal 仍會保留。`/goal` 與 goal 工具會消失，但該條帶仍可編輯、暫停、恢復或清除 goal。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個 GoalBar dock，其釋放已由 HMR（熱模組替換）安全性案例證明；持久狀態來自 goal projection，程序本地 activation 來自入口私有掛鉤源，且該源只在框架掛鉤觀察期間訂閱。
