---
description: "Web 用戶端外掛的動態圖同步與開發時 bundle 過載。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-hmr

[English](README.md) | 中文

## 概述

`dsh-client-hmr` 讓已開啟的 Web 頁面與 Host 外掛圖保持同步，並過載重建後的瀏覽器 bundle。普通外掛的啟停無需重新整理頁面或重新啟動 Host 即可生效。程式碼重建會替換受影響外掛並重置其元件狀態。模型不會收到新的輸入或輸出。

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

隨包提供的 Web 組合掛載此傳輸，以交付外掛動態變更。開發時，bundle watcher 還會提供程式碼重建。停用此傳輸會停止向已開啟的頁面交付圖更新。

### 啟動過載鏈結

執行 `pnpm run dev:web`，它會同時啟動主機與重建 watcher（`--no-serve` 則只把 watcher 接到別處啟動的主機上，使用共享 Client tsdown 預設的任何 watch 程序亦然）；重建後的外掛隨後會被自動逐個替換進執行中的瀏覽器。該預設會在所有包內 chunk 寫完後標記 `lib/client.js`，因此僅 chunk 發生重建也會推進包 revision，無需 Host 掃描 chunk。

### 一次過載做什麼

每次成功的過載都會重新執行外掛 bundle，並用全新狀態重新掛載外掛。依賴被過載外掛的外掛會隨之自動過載。失敗會顯示在外掛列表中，可直接重試，無需等待下一次重建。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `pollIntervalMs` | `500` | bundle stat 輪詢間隔，單位為毫秒 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-hmr)是所有受支援欄位及其 JSDoc 的完整真源。

### 觀察成功

成功的替換會立即顯示編輯後的 UI，無需頁面過載，且外掛在替換後繼續工作。請記住權衡：被過載外掛內的 React 狀態會丟失，而工作階段、工作區與連線狀態會保留。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋過載鏈結的建置方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

Host 半側監聽每個包帶完成標記的入口產物，並提供 `/plugins/events`。它轉發現有的圖變化與重建通知；每個新連線都會收到目前完整圖。圖描述瀏覽器的目標條目，不保證 Host 清理已經完成。Host 的啟用與清理仍由 Host 生命週期管理。入口的 mtime、ctime 和大小共同標識 revision，無需對其內容求雜湊；中繼資料未變時無需讀取內容。Host 重新啟動時若產物未變，revision 保持不變，因此圖流重連不會替換瀏覽器外掛。瀏覽器半側將兩種幀都交給 Client Modules，由它序列處理條目變更並等待瀏覽器資源清理。

### 瀏覽器側替換

收到 `rebuilt` 幀後，控制器使舊模組失效，並在舊 fiber 仍然服務時預取其單資源腳本。隨後刪除註冊表 runtime、等待舊 fiber 清理、清除條目中的 fiber 引用並移除自身樣式。模組系統先物化新匯出，再由 `entry.refresh()` 透過 Loader 掛載；這樣即使 Loader 只記錄匯入錯誤，頁面診斷仍能獲得失敗原因。CSS 在舊 effect 完成清理後注入。

### 級聯與自過載

fiber 的啟用 epoch 會串聯其服務提供者的 uid，因此替換提供者 fiber 會透過 Cordis 自身級聯過載所有依賴方，無需 HMR（熱模組替換）側維護任何簿記資訊。本外掛本身也是一個圖 entry，因此 `rebuilt` 幀可能點名它；進行中的過載在舊 bundle 的閉包中繼續執行，新 bundle 的 apply 會開啟全新通道。

### 失敗策略

下載失敗時，正在執行的外掛保持活動。舊 fiber 被解除安裝後，匯入或啟用失敗不會恢復先前的 bundle。失敗會顯示為目前頁面的同步錯誤。「設定 → 外掛 → 外掛列表」會針對最新圖重試，即使其 revision 未變化；後續重建也會重試受影響的外掛。無關且已成功執行的外掛保持活動。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | node 半側：bundle stat 輪詢、`rebuilt` 上報、`/plugins/events` SSE 通道 |
| [`src/client/index.ts`](src/client/index.ts) | 瀏覽器半側：SSE 訂閱與共享條目控制器呼叫 |
| [`src/events.ts`](src/events.ts) | 共享幀型別（`graph` / `rebuilt`）與端點常數 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當過載約定不夠用時閱讀以下頁面：提供 bundle 的模組系統、啟動它們的外殼，以及 external 背後的模組圖規則。

- [用戶端模組系統](../modules/README.zh.md)——本驅動器驅動的惰性 CJS 模組表與 `invalidate`/`prefetch` 掛鉤。
- [Web 啟動核心](../web/README.zh.md)——啟動外掛樹並展示 entry 狀態的外殼。
- [用戶端組地圖](../README.zh.md)——本包過載的瀏覽器半側。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-hmr)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無。過載驅動器屬於瀏覽器側 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明過載驅動器不會保留或恢復什麼。它們是目前包約束，不是任務積壓。

- **過載有意保持粗粒度**——全新 fiber 與全新元件；被過載外掛內的 React 狀態會丟失，而資料層（連線 fiber、執行時 fiber、Session 物件）不受影響。react-refresh 級狀態保留與重新執行 bundle 衝突，因此有意排除。
- **失敗時不復原**——舊 fiber 被解除安裝後，替換失敗不會恢復先前的 bundle。
- **僅負責 Web 傳輸**——Electron 的安裝和後端重新啟動流程不使用此 SSE 路徑。條目對帳本身不依賴傳輸。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
