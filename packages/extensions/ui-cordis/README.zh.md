---
description: "歷史 Cordis 卡片及程序內 runner 定義的控制元件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-cordis

[English](README.md) | 中文

## 概述

`dsh-client-ui-cordis` 渲染歷史生成外掛卡片，併為程序內定義提供控制面板。使用者可以操作程式消費者提供的定義；重新啟動後持久化卡片仍可讀取，但不會重建定義。新建 Creator 外掛使用 Plugin Manager。

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

將本包與 Host 和 Client runner 組合，可渲染歷史工具卡片，並在面板中操作程式註冊的定義。新建 agent 外掛使用 Plugin Manager；本包不提供模型變更工具。

### 面板顯示什麼

一個 `sidebar.footer.action` 席位顯示角標，計數在跑數加待確認數；點開後列出每個定義及其執行控制元件。列表從不按工作階段過濾：目前工作階段的行置頂成組，其他工作階段的行仍在下方列出。行來自 host 的目前清單，並在公告改變「有哪些定義」時更新。上一次讀取覆蓋不到的待審批 run 請求仍然有行，直接用請求自帶的工作階段、標籤、用途與標識渲染。每一行顯示兩個獨立事實——host 在跑什麼與本頁裝載了什麼——並把它們對映到共享狀態標記：idle 使用 idle，用戶端裝載及正在執行的操作使用 ongoing，執行中的定義使用 done，等待批准使用 warning，失敗使用 error。重新整理後的頁面會先給「裝回本頁」、再給全域 stop，而純 host 定義的行如實讀作執行中、只給 stop。該行還會把本頁最後一次渲染失敗就地顯示，與裝載失敗共用同一個位置：一個是「它從來沒裝上」，另一個是「它裝上了、然後拋了」。

### 工具卡片顯示什麼

準備中的呼叫顯示為帶普通 Cordis 圖示與標題的不可展開單行。此階段不派生包身份、不讀取其目前清單，也不掛載其業務檢視；這些操作需要 start/result props。

`cordis_define` 卡片是一份記錄：模型寫下的 name 與 purpose、它寫的原始碼，以及該定義是否在跑——沒有開關、沒有審批，只有一句指向面板的指引。`cordis_run` 卡片顯示模式、外掛標識、包標識與執行標識、結果，並在包註冊了業務檢視時經 `tool.view.cordis` slot 提供它。define、run、stop 與 undefine 卡片在失敗或中斷時繼續保留普通業務圖示，包括呼叫回執成功後發生的關聯啟用失敗。所有卡片都渲染工作階段記錄下的 call 與 result，因此回放顯示同一張卡。

### 需要規劃的邊界

定義僅存在於程序內：重新整理後的頁面手上什麼都沒有，直到有人再次執行某個包；面板在每次公告時重讀清單。審批按設計是框架級的，所以某個標籤頁裡的人可以批准模型為另一個標籤頁正在看的工作階段所發起的 run；首個應答生效，其餘收斂。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋這些介面背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

這些介面建立在一個規則之上：兩者都不把執行態放進元件 state，因為 define 呼叫結算時卡片會在聊天流裡換位置並重掛。事實活在「誰能關閉它、就歸誰」的觀察量裡——瀏覽器 runner 擁有開放請求、編排結果、本頁的 live set 及其渲染失敗，而本包擁有自己讀來的清單與摺疊過的公告。面板做成全域，是因為 run 請求會阻塞模型、且可能點名一個目前沒人在看的工作階段裡的定義；審批入口若只存在於那個工作階段的對話流裡，就會在它正阻塞模型的時候恰好不可達。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 外掛入口：slot 註冊和 inventory 連線 |
| [`src/client/CordisPanel.tsx`](src/client/CordisPanel.tsx) | 全域面板及其執行控制元件 |
| [`src/client/CordisDefineRow.tsx`](src/client/CordisDefineRow.tsx) | 只讀的 `cordis_define` 卡片 |
| [`src/client/CordisRunRow.tsx`](src/client/CordisRunRow.tsx) | `cordis_run` 卡片及其業務檢視席位 |
| [`src/client/CordisActionRow.tsx`](src/client/CordisActionRow.tsx) | `cordis_stop`／`cordis_undefine` 行 |
| [`src/client/card-model.ts`](src/client/card-model.ts) | 從凍結 call/result 切片派生的可回放檢視模型 |
| [`src/client/inventory.ts`](src/client/inventory.ts) | 單飛清單讀取及其重連處理 |
| [`src/client/status.ts`](src/client/status.ts) | 基於清單與本頁 live set 的可見狀態讀數 |
| [`src/client/slots.ts`](src/client/slots.ts) | 注入面與包自有的 `tool.view.cordis` slot 宣告 |
| [`src/client/run-card-index.ts`](src/client/run-card-index.ts) | 每工作階段「最新合格 `cordis_run` 卡片」索引 |

### 面板如何保持最新

公告（`cordis/dynamic-package`、`cordis/dynamic-retract`、`cordis/request-run`、`cordis/request-run-resolved`）觸發清單重讀，而不是就地打補丁——因為公告不攜帶標籤，而定義可能在兩次公告之間出現或消失。讀取是單飛的，因此多條公告同時結算不會放大呼叫次數；連線重置既丟棄在途讀取、又為新讀取騰出位置，所以重連絕不會發布舊 host 的行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從這些介面逐步進入它們所操作的面，以及其呼叫被渲染成卡片的工具。

- [Client runner](../cordis-client-runner/README.zh.md)——面板讀取並呼叫的瀏覽器面。
- [Host runner](../cordis-host-runner/README.zh.md)——面板背後的清單與生命週期動詞。
- [工具包](../tool-cordis/README.zh.md)——只讀執行時 API 發現。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.dynamicCordisRunner` API 與轉發的 `cordis/*` 事件。
- [slots 子系統](../../../docs/subsystems/slots.zh.md)——slot 註冊的瀏覽器 UI 如何歸其包所有。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過負責工作階段 steering 和權限結果的 runner 生命週期操作；本包渲染歷史呼叫與結果，不新增工具或提示段落。

#### KV Cache 影響

沒有直接影響：本包負責渲染；runner 發出的 steering 會改變工作階段歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這些介面何時需要特別小心。它們是目前包約束，不是任務積壓。

- **面板無法看到沒有廣播的註冊表變更**——程式側 `define` 和未執行定義的 `undefine` 可使目前行保持不變，直到下一次 inventory 讀取。執行請求會觸發讀取。
- **只有請求、沒有清單的行可應答但不可操作**——它只提供批准與拒絕，因為 run／stop 控制元件需要那次讀取尚未送達的註冊表行。
- **行可能消失一次讀取的時長**——活動的 orchestrating 臂帶工作階段但刻意不帶標籤，因此一個已批准、但註冊表讀取尚未落實的請求，在讀取落實前沒有行；實踐中讀取在請求到達時即已觸發。
- **渲染失敗屬於目前頁面，且發生在載入回執之後**——面板顯示本頁的崩潰；Host runner 單獨向所屬工作階段傳送 steering。
- **某一頁的裝載失敗對其他頁不可見**——host 以首個裝載回報結算一次 dispatch，因此在另一頁確認之後瀏覽器半才失敗的頁面，在其他頁上仍會讀作執行中。
- **任何頁面都可以應答任何請求**——審批按設計是框架級的，所以某個標籤頁裡的人可以批准模型為另一個標籤頁正在看的工作階段所發起的 run；收窄「誰有權應答」延後。
- **call head 掉出事件窗的卡片會丟掉標籤**——define 卡片的 name 與 purpose 取自呼叫參數，因此工作階段長到把它們截斷時，卡片只能以自己的 call id 自稱；面板不受影響，因為 host 清單攜帶標籤。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個 keyed toolview，其資源釋放已由 HMR 安全性測試證明。本包擁有的唯一可變關係，即 per-definition run-state 觀察量，只存在於瀏覽器程序中，Host 不變式服務無法觸及；Node 端不發出任何 Cordis 事件，也不持有任何跨外掛狀態。
