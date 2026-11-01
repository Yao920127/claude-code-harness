---
description: "動態 Cordis 包的瀏覽器半說明，供選擇、組合或排查頁面如何應答執行請求並裝載瀏覽器半程式碼的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-client-runner

[English](README.md) | 中文

## 概述

`dsh-cordis-client-runner` 為程式呼叫方和現有瀏覽器控制元件執行程序內動態包的瀏覽器部分。它在請求獲批或使用者顯式操作後載入定義，並在 Host 撤銷執行時移除定義。頁面重新整理不會恢復定義。Creator UI 外掛透過 Plugin Manager 使用已安裝的 Client 模組。

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

在組合裡同時掛載了 host runner 的 web 用戶端中掛載本外掛——host 半跑在程序裡，瀏覽器半跑在頁面裡。當某個帶瀏覽器半的動態包被執行時，開啟的頁面會收到一次執行請求；本包在本頁執行裝載，UI 包（`ui-cordis`）則渲染人用來應答它的面板與卡片。純 host 包不需要瀏覽器半，也就不需要頁面：host 自己執行它們。

### 頁面會做什麼

瀏覽器半用純 JavaScript 編寫——無 JSX、無 TypeScript、不能 import 模組——並作為一個 async 函式執行。它拿到一組固定的名字——`React`、`console`、`styles` 與 `host`——而 `fetch`、`setTimeout` 這類瀏覽器全域不可用。返回的外掛只能使用生命週期動詞，以及它自己在 `inject` 裡宣告的服務。從已裝載半呼叫 `host.call(method, args)` 會到達它自己的 host 半。React 渲染已裝載半時發生的崩潰會上報 host，點名槽位、崩潰是否已把條目摘掉，以及寫給作者的 message。

### 執行介面提供什麼

執行介面可以應答一次待審批的 host 請求——批准它（可選地同時覆蓋同一外掛的未來版本）或拒絕它——也可以按使用者自己的手勢啟動一個定義，該手勢本身就是授權。每個定義最多有一個在途活動，因此基於該狀態建置的控制元件能在 remount 後存活。介面就本頁顯示的內容都是頁面本地的：每包最後一次渲染崩潰、本頁自己的嘗試為何失敗，以及某個包是否已在本頁裝載——絕不是 host 眼中「在跑」的檢視。

### 生命週期邊界

裝載是冪等的：要求裝載這一頁已在執行的 revision 不會改變任何東西，更新的 revision 頂替已裝載的那個，同一 revision 在 retract 之後再裝則重新裝載。同一定義的操作序列執行。重新整理按設計從乾淨狀態開始——host 仍持有定義，本頁在再次被要求之前不執行它。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋瀏覽器半背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

瀏覽器半建立在一個原則之上：動態包必須與靜態包共享同一套啟用門控、fiber effect 清理與狀態投影。求值後的外掛被塞進模組表，並經 `loader.create` 掛載；解除安裝先移除 entry，等待其 fiber 清理完成，再使 factory 失效並撤下樣式。guard 是一份白名單——生命週期動詞加已宣告服務——與 host 側沙箱門面對稱，因此包作者在兩側面對同一個約定。一個觀察者供兩個出口：只有這裡監視槽位註冊表的 entry-error seam，凡屬於本 runner 落座過的包的崩潰，一路上行給 host（給模型），一路釋出到本包自己的 `renderFailures`（給面板）。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 外掛入口：runner、編排器、inspect 註冊表、轉發事件訂閱 |
| [`src/client/runtime.ts`](src/client/runtime.ts) | 裝載引擎：按執行標識收斂、guard 掛載、撤回 |
| [`src/client/orchestrator.ts`](src/client/orchestrator.ts) | 執行編排：先 host 半、再取原始碼、再瀏覽器半、一次結算 |
| [`src/client/evaluator.ts`](src/client/evaluator.ts) | 閉包求值：符號面及其教學陷阱 |
| [`src/client/guard.ts`](src/client/guard.ts) | 已裝載瀏覽器半收到的白名單 `ctx` façade |
| [`src/client/inspect-registry.ts`](src/client/inspect-registry.ts) | Client Inspect Provider 與待答查詢路由器 |
| [`src/client/providers.ts`](src/client/providers.ts) | 第一方 client Inspect Provider（slots、theme、events） |
| [`src/client/timer.ts`](src/client/timer.ts) | 動態包注入的 client 定時器服務 |

### 查詢槽位輸入

Slots provider 的精確 `listSubTree` 查詢包含帶說明的 owner 欄位及頂層別名、交叉型別和聯合型別宣告。巢狀欄位的值型別只列出引用名稱，因此查詢 Tool 檢視可以獲得共享回呼和階段聯合，而不會展開完整 Session 型別圖。

### 一次 run 如何執行

一條 `cordis/request-run` 事件問這一頁要不要執行某個定義。作答的一方——審批後的頁面，或按下執行的使用者——驅動編排：先 host 半（host 半失敗會在瀏覽器動作之前短路），再取原始碼，再瀏覽器半，最後一次結算帶上發生的一切。瀏覽器半原始碼作為 async 函式體求值，符號面就是參數；返回的外掛經 guard 包裝後透過 loader 掛載；結算報告已裝載的 revision，或失敗階段加閉包、guard 或 fiber 的訊息。`host.call` 經 Remote namespace 路由；省略的入參以 `null` 過線，而生成 codec 拒收的載荷會變成一條點名「哪次呼叫 + 約定是什麼」的教學錯誤。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從瀏覽器半逐步進入發問的 host、其執行被應答的工具，以及渲染它的介面。

- [Host runner](../cordis-host-runner/README.zh.md)——本包應答的註冊表與執行往返。
- [工具包](../tool-cordis/README.zh.md)——只讀執行時 API 發現。
- [UI 包](../ui-cordis/README.zh.md)——操作這個面的面板與卡片。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.dynamicCordisRunner` API 與 `cordis/*` 事件。
- [用戶端外殼與動態包 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)——瀏覽器半的包歸屬與建置面。

-----

<a id="model-experience"></a>
## 模型體驗

### Host 轉發的執行結果

#### 模型看到的內容

本包不提供工具或提示。它以啟用成功、缺失服務、拒絕或 Host/Client 失敗回應 `cordis/request-run`。傳送給工作階段的任何訊息由 Host runner 負責。

#### Token 影響

有條件且有界：每次 run 請求最多一個回答，花在 host 本來就會發出的那個 `run` 結果裡。文字隨資料而定（某個定義自己的錯誤訊息），本包跨請求不留存任何東西——一頁後續的裝載失敗是頁面本地診斷，在模型側沒有任何承載物。

#### KV Cache 影響

Host steering 追加到工作階段歷史；本包不改寫更早的訊息。

### run 落定之後的渲染期失敗

#### 模型看到的內容

React 可能在載入成功後失敗。Client 報告其擁有的每個 entry 失敗，包括 slot、訊息及 entry 是否已移除。Host 保留最新失敗並向所屬工作階段傳送 steering；頁面也顯示本地失敗。

#### Token 影響

有條件，且其上界由 host 的留存策略決定、不由這一頁決定：每次崩潰一條報告，而 host 每包只留最新一條——所以一個反覆崩潰的 entry 對模型的代價是一條訊息，而不是一張越來越長的清單。報告本身不會自帶任何工具結果：模型只在被 steer 或主動去問的時候才為它付費。

#### KV Cache 影響

自身沒有。報告經 RPC 送出並被存起來，而不是追加進對話；模型透過一條 steer 訊息或自己發起的檢視讀到它們，那次檢視與任何工具結果一樣只延長尾部。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明瀏覽器半何時需要特別小心。它們是目前包約束，不是任務積壓。

- **被拒絕的回答不會重試**——`resolveRequestRun` 的 ack 不讀，所以當 host 拒絕一個陳舊的成功答覆（`accepted: false`——這一頁裝載期間定義的 revision 被頂掉了），這一頁會保留已裝的東西、也不再重新編排。那次請求仍可作答（別的頁面作答或呼叫方取消都能收尾），而頂掉 revision 的那次 stop 會 retract 掉陳舊裝載。
- **host namespace 存在之前外掛一直掛起**——它宣告 `remote.dynamicCordisRunner`，因此絕不會裝載一個永遠夠不到自己 host 半的瀏覽器半。
- **槽位準入沒有載體**——下發行宣告的是服務，不是目標槽位，因此按部署的槽位允許／拒絕清單無處可馱。
- **guard 白名單是手抄的孿生**——瀏覽器 guard 復刻 host 側沙箱門面；抽取共享規格留待後續。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。所屬關係（一個 live Plugin 的 loader entry 僅在一個 Plugin Run ID 存活期間存在）是隻能透過 Client 半服務存取的瀏覽器側狀態，Node 平面的伴生入口無法觀察。該關係改由本包自己的裝載與拆除測試直接斷言。
