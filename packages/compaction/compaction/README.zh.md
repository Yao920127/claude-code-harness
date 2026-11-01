---
description: "面向後端實作者與部署方的共享壓縮約定：工作階段壓縮做什麼、何時使用，以及如何實作後端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction

[English](README.md) | 中文

## 概述

`dsh-compaction` 讓長時工作階段把較早歷史壓縮（compaction）成一條摘要訊息、保持近期對話不變，並像摘要一直存在那樣繼續下去——配合 `dsh-compaction-basic` 之類的後端與可選的 `/compact` 命令即可實作。被遮蔽的內容仍保留在工作階段日誌中，因此回放工作階段時能確定性地重現同一份壓縮後的對話。當你實作壓縮後端、建置觸發壓縮的元件，或需要識別壓縮後的訊息時，才需要本包——它本身不執行任何壓縮。想開箱即用地獲得該功能時，請選擇隨附後端。

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

先確定你需要什麼。隨附後端加 `/compact` 命令即可零程式碼獲得自動與按需壓縮；只有在你擴充功能或重實作該功能時才需要本包。以下各節說明壓縮做什麼、如何啟用，以及如何編寫後端。

### 何時選擇

當模型撰寫的摘要符合需求時，選擇 `dsh-compaction-basic`：工作階段增長時自動壓縮，並可透過 `dsh-command-compact` 按需壓縮。當你需要不同的摘要方式——固定範本或遠端服務——或建置以程式設計方式觸發壓縮的元件時，選擇本包。不要單獨掛載它：沒有後端就什麼都不會壓縮。

### 壓縮後會發生什麼

壓縮執行時，所選較早範圍的對話會被替換為一條摘要訊息；近期歷史不受影響，對話從摘要繼續。壓縮可以由 token 壓力自動觸發、按需觸發，或針對顯式範圍觸發；結果會報告壓縮了哪些歷史以及估算釋放的 token 數。

### 啟用壓縮

掛載隨附後端以註冊壓縮服務，並新增 `dsh-command-compact` 獲得按需命令：

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
- name: '@deepseek-ai/dsh-command-compact'
```

有了這兩行設定，功能即已開啟：工作階段增長時自動壓縮，`/compact` 收到請求後立即壓縮並報告替換了多少歷史項。如果未掛載後端，什麼都不會壓縮，`/compact` 也會失敗；隨附後端的完整依賴鏈見其自身 README。

### 實作後端

繼承提供的基類並實作三個操作：一個針對自動觸發決定並執行壓縮，一個按需壓縮，一個壓縮對話的顯式範圍。把你的類作為外掛載入，它就會成為該組合的壓縮服務。精確簽名、失敗規則以及每個後端必須生成的檢查點標記，見下方實作章節與[壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)。

### 識別壓縮後的歷史

後端寫入的摘要訊息帶有穩定標記，因此任何消費方都能在持久化或克隆後識別壓縮歷史，而無需知道是哪個後端生成的。該標記從包根匯出，也從一個無 Cordis 依賴的子路徑匯出，用戶端與 wire 程式均可匯入。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節以 API 術語解釋約定及其背後的設計決策；功能層面行為見[使用本包](#use-this-package)。

### 設計理念

該 seam 建立在一個拆分與三項承諾之上：

- **抽象約定，具體後端。** 介面規定壓縮做什麼；提供者擁有策略、保留與摘要，因此各角色可獨立演進、獨立替換。
- **工作階段與 LLM（大語言模型）詞彙是約定的一部分。** 操作作用於 `Session`，摘要使用 `ContentBlock`，因此儘管有通用的 Cordis-only 指引，Service Definition 仍依賴 `dsh-session` 與 `dsh-llm`——這是一項有意的偏離，記錄在[壓縮能力 seam Agent Note](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md) 中。
- **日誌記錄的標記對就是鎖。** `compaction/start` 在摘要讓出控制權之前追加，`compaction/end` 釋放；每次失敗都恰好進行一次閉合嘗試，閉合失敗會留下未匹配 start 作為有意的 busy 訊號。
- **表層只變更一次。** 摘要承載在標記對內的一條 `user/message` 替換上；所有 `compaction/*` 事件僅寫入日誌。

### 服務 API

該約定是後端實作的三個抽象操作：`compactIfNeeded` 針對自動 `pressure` 或 `context-overflow` 觸發，`compactNow` 進行一次顯式按需縮減，`compactRegion` 針對呼叫方選擇的表層範圍。可複用的請求測量是獨立服務 `ctx.tokenMeter`。窮盡式逐操作語義見[壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)；精確簽名見 [`src/index.ts`](src/index.ts)。

透過 `ctx.llm.stream()` 摘要的後端必須將 signal 轉發到呼叫的 `GenerateOptions.signal`，因此 abort 或 fiber dispose（資源釋放）會停止進行中的摘要。自動和顯式範圍標記對會從開啟的輪次恢復其數字形式歸屬；手動標記對不要求存在開啟的輪次，並標記 `turn: null`。

### 手動失敗分類

同步的 `compaction/summary-error` waterfall 讓後端為失敗的摘要及明確選區請求持久輸入恢復。監聽器只有在記錄實際進展後才返回 true，否則呼叫 `next()` 委派後續處理。後端在觸發事件前檢查取消和選區穩定性，重試前重新派生輸入並計價。事件宣告說明其載荷；圖片策略由 `dsh-compaction-image-offload` 負責。

預期手動失敗會丟擲 `ManualCompactionError`，攜帶來自小型封閉集合的穩定 `code`；只有 `compaction/start` 標記之後發生的失敗才會被記錄——以攜帶錯誤的 `compaction/end` 形式——而 `busy` 拒絕或 start 之前的取消不會留下記錄。每個錯誤碼的語義見[壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)。

<a id="tool-pairing-boundaries"></a>
### 工具配對邊界

該 Service Definition 匯出 `toolPairingBalancedBefore(session, seq)` 與 `toolPairingBalancedAfter(session, seq)`，用於對齊和驗證壓縮邊界。安全邊界不會被尚未回答的 assistant 工具呼叫跨越。每個 helper 都會驗證給定事件 seq 位於目前表層，並根據按表層順序快取的各切分點配對狀態返回結果，因此重複檢查不讀取事件；replace generation 會重建快取，缺失 seq 或孤立的 `tool/result` 會被視為表層狀態損壞並遭拒絕。

### 表層約定

`SurfaceEventType` 是封閉聯合——`user/message`、`assistant/message` 與 `tool/result` 必須攜帶 `surfaceOp`，其他事件禁止攜帶該欄位，因此 `compaction/*` 事件不能出現在表層上。成功的後端執行改為在日誌中包圍整個操作：先追加 `compaction/start`（僅日誌）取得鎖，摘要該範圍，追加僅日誌的 `compaction/summary` 記錄，用一條承載摘要的 `user/message` 替換所選範圍——這是唯一的表層變更——最後追加 `compaction/end`（僅日誌）釋放鎖。

替換位於鎖的起止範圍**內**，因此 `compaction/start` 與 `compaction/end` 之間崩潰會留下可檢測的遺留鎖，而不是虛假聲稱成功的 `compaction/end`。`deriveMessages()` 將摘要渲染為 user 角色訊息，後面跟隨已保留節點；已遮蔽事件仍保留在原始日誌中，因此回放具有確定性。每個事件的具體 payload 見[壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `CompactionEngine`、`CompactionTrigger`、`ManualCompactionError`、`ctx.compaction` 合併 |
| [`src/types.ts`](src/types.ts) | `CompactionResult` 與宣告合併的 `compaction/*` 工作階段事件 |
| [`src/tool-pairing.ts`](src/tool-pairing.ts) | 兩個邊界 helper 背後的每工作階段切分點平衡快取 |
| [`src/checkpoint.ts`](src/checkpoint.ts) | 無 Cordis 依賴的檢查點來源建構函式與謂詞（`./checkpoint` 葉子） |
| [`src/brand.ts`](src/brand.ts) | `CompactionId` 品牌化標識 |
| [`src/invariant.ts`](src/invariant.ts) | 不變數配套元件：驗證 `compaction/start`→`summary`→`end` 標記對、其屬主輪次包裹與檢查點關聯 |

### 鎖與序列化

所有入口點共享一個日誌記錄的鎖。尾部檢查會分別查詢最新的未匹配 `compaction/start` 與最新的 `session/end-seed`；位於該邊界之後的未匹配 start 是活動鎖並報告 `busy`，更早的則是先前程序生命週期留下的陳舊證據。活動標記對不能跨越 `turn/start` 或 `turn/end`。標記是鎖的時間點，而非排他容器：空閒的 `inject()` 可以在手動 start 與 end 之間追加不相關的上下文，因此手動路徑重新驗證其選中範圍，而不要求整個表層相等。

### 事件

`compaction/*` 事件透過 declaration merging 擴充功能 `SessionEventMap`（可合併擴充功能）——它們是工作階段事件，不是 Cordis `Events`，且都僅寫入日誌。生成的[持久化日誌事件目錄](../../../docs/persistence-catalog.zh.md)擁有每個事件的 payload；`compaction/prune` 記錄了與工具結果修剪器共享的影子價格協定。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享詞彙逐步進入隨附後端與決策證據。

- [壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)——壓縮詞彙、結果與生成的 API。
- [壓縮基礎後端](../compaction-basic/README.zh.md)——自動與按需壓縮的隨附後端。
- [工具結果修剪器](../compaction-tool-result-pruner/README.zh.md)——先修剪超大工具輸出的可選配套工具。
- [面向使用者的 /compact 命令](../command-compact/README.zh.md)——按需觸發壓縮的入口。
- [Token meter](../../llm/token-meter/README.zh.md)——決定何時壓縮的測量服務。
- [壓縮能力 seam Agent Note](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)——拆分及 session/llm 依賴的依據。

-----

<a id="model-experience"></a>
## 模型體驗

### 呼叫後端時的工作階段歷史

#### 模型看到的內容

成功的後端會用一條 user 角色摘要檢查點替換較早表層範圍——一條攜帶 `surfaceOp: { op: 'replace', startSeq, endSeq }` 的 `user/message`。原始事件仍會記錄，但不再出現在派生模型訊息中；seam 本身不執行改寫。

#### Token 影響

該 Service Definition 不會直接產生 token。後端用一份摘要換取多個原本保留的歷史 token，並保持近期尾部不變。

#### KV Cache 影響

成功的後端替換會使從第一個被遮蔽的歷史 token 起的複用失效；seam 本身不會改變請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明無論載入哪個後端，壓縮都無法做到的事；它們是目前包約束。

- **面向使用者的命令，而非模型工具**——壓縮由 `/compact` 命令與自動壓力觸發；不會註冊面向模型的壓縮工具。
- **部分單元溢位不在約定內**——平衡摘要壓縮無法拆分一個不可分單元。當閉合工具對中可移除的主要部分是承載文字的工具結果時，可選剪枝配套服務仍可修復該工具對；無法壓縮大型非工具節點，或不可剪枝剩餘部分過大的工具單元。
- **單獨接近視窗大小的 envelope 不屬於表層壓縮工作**——壓縮縮減派生歷史，絕不縮減系統提示詞、工具或工作階段字首。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性；已交付行為以上文、包程式碼與所連結的 Agent Note 為準。

- **面向模型的工具，尚未決定**——壓縮目前僅限使用者命令。面向模型的壓縮工具仍是開放問題；它需要自己的 schema，並與現有命令路徑協調。
- **範本與遠端後端，尚未決定**——`SummaryResult` 約定已帶有未標記的 `rawOutput` 變體，供不透過 `ctx.llm.stream()` 識別呼叫的摘要器使用，但此類後端尚未隨附。
- **`/compact` 的範圍參數，尚未決定**——無參數形式使各命令介面卡的行為保持穩定；顯式範圍仍由程式設計介面 `compactRegion()` 處理。

</details>
