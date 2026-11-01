---
description: "面向使用者與維護者的 web GUI 啟動核心說明：用戶端外掛樹的兩階段啟動、無框架啟動頁與共享模組表，用於組合或排查瀏覽器應用。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-web

[English](README.md) | 中文

## 概述

`dsh-client-web` 啟動 web GUI：它先從 Host 提供的啟動圖載入用戶端模組系統，再在應用掛載前啟用每一個用戶端外掛，因此只有當所有外掛都就緒時完整 UI 才會出現。無框架啟動頁會逐 entry 報告狀態，因此失敗的 bundle 或外掛保持可見，而不是白屏。它還定義共享模組表（`PLATFORM_MODULES`），每個動態 bundle 都依據它解析 external。模型永遠看不到本包。

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

組裝瀏覽器應用時使用它：`apps/web` 的 Vite 入口對掛載點執行 `new AppWebEntry(container).run()`，啟動頁會在啟用過程中向使用者展示進度。普通瀏覽器呼叫方不傳任何選項。預設使用預注入的頁面傳輸，除非提供 `seams` 覆蓋：當 `globalThis.__DSH_TRANSPORT__` 攜帶 `loadBundle` 時，模組階段將其採納為 bundle 傳輸並跳過 `immediately` 層級的 HTTP 預取，而顯式 `seams` 仍然優先（例如外部 `<script>` 執行無法到達頁面上下文的 jsdom 測試）。

靜態應用頁面在入口執行前安裝 `__DSH_BOOT_READY__`。`run()` 等待期間會立即顯示啟動頁；頁面所有者透過 `applyIndexInjections`（也從 `./injections` 匯出）應用 Host 注入項，並在所有腳本完成後兌現延遲物件。延遲物件拒絕時顯示啟動失敗；若呼叫方提供 `run(onFailure)`，則由外部呈現錯誤並保留載入頁。Desktop 使用該回呼請求原生恢復。Desktop 與 WebWorker 共享注入直譯器；伺服器端 `tapIndex` HTML 轉換僅適用於伺服器端提供的文件。

外殼基礎樣式會在支援的瀏覽器中為普通內容自動新增中西文間距。語義化程式碼以及終端、diff、讀取和搜尋輸出容器會保留原始碼中的原始間距和列對齊；不支援 `text-autospace` 的瀏覽器會忽略這兩項宣告。

### 啟動過程是怎樣的

啟動分兩個階段：模組階段接納 parser 已載入的 bootstrap 批次，從 Host 提供的啟動圖建置模組系統，並透過只執行一次的共享 application 批次 URL 預取 `immediately` 層級。外掛階段隨後啟用每個圖 entry 並等待全部就緒，之後才把帶標記的啟動 DOM 交給 UI 渲染器，由它 hydrate 並切換到完整 UI。

### 啟動頁

啟動頁只使用原生 DOM 與本地 CSS，因此 bundle 與外掛啟用失敗保持可見：它顯示一個 spinner 節點，其 CSS 圓弧隨 entry 啟用而增長，並逐 entry 報告狀態。spinner 及其動畫相位會一直保留，直到完整 UI 替換啟動頁。匯入或啟用失敗的外掛會按名稱報告並給出原因（缺失服務、匯入失敗或狀態），而不是白屏。控制檯包含原始匯入錯誤。

### 共享模組表

`PLATFORM_MODULES`（位於 `src/platform.ts`）列出外殼預置的共享模組——React、Cordis 與靜態 UI 庫——並與 `PRELOADED_CLIENT_EXTERNALS`（parser 預載的執行時行）一起定義每個動態 bundle 解析所依據的隱式 external 基座。`dsh.client.external` 只新增基座之外的精確請求；參見[共享模組與模組圖](../AGENTS.md#shared-modules-and-the-module-graph)。

### 設定

本包自身不接受任何外掛設定；生成的[設定目錄](../../../docs/config-catalog.zh.md)列出儲存庫中每個外掛設定以供對照。

-----

<a id="understand-the-implementation"></a>
## 理解實作

選單採用共享 `MenuSurface` 材質，包括用於背景模糊的 macOS 底層；自定義內容遵循[選單規則](../../../docs/web-styling.zh.md#component-rules)。

<details>
<summary>實作細節——點選展開</summary>

本節解釋啟動核心的建置方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

核心恰好擁有三樣東西：模組系統、Cordis Loader 與啟動頁。Graph、批次 preload 與 loader facade 歸 Host 所有，因此 `AppWebEntry` 永不感知 bootstrap 包 id，也不解析協定格式（wire format）。動態 UI 渲染器只在每個用戶端 entry 啟用後收到掛載點。

### 兩階段啟動

`run()` 呼叫 Host 安裝的 `window.__ModuleLoader__.create({ boot, staticModules, ...seams })`；facade 接納 parser 已載入的 bootstrap 批次後返回建構好的模組系統與已解析 manifest（中繼資料清單）。模組階段透過一個共享的 application 批次 URL 預取 `immediately` 層級。外掛階段掛載 Loader、把 `loader.internal` 賦為 `modules`、統一建立全部圖 entry、等待完全停穩，然後審計啟用：任何匯入失敗、因缺失服務而 pending，或落入其他非 active 狀態的 entry，都會丟擲一個聚合錯誤，點名每個失敗 entry。

### 啟動頁機制

啟動頁是原生 DOM 加本地 CSS，其退回字型與顏色匹配載入期間到達的主題 token。`internal/status` 事件驅動一個 spinner 節點與逐 entry 標籤；hydrate 會保留該節點與動畫相位直到應用提交，`fail()` 渲染丟擲的原因。React 掛載、slot 渲染與應用組裝位於 `ui-renderer`；`ui-layout` 擁有組裝後的瀏覽器標題投影。

啟動核心把清單條目建立交給 Client Modules，使啟動後的動態圖同步繼續持有相同的條目身份。初始啟用審計仍然嚴格；後續頁面本地失敗顯示在「設定 → 外掛 → 外掛列表」。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 庫入口：`AppWebEntry`、`getStaticModules`、平臺表 |
| [`src/boot.ts`](src/boot.ts) | `AppWebEntry`：模組階段、啟動頁、immediately 層級預取、安裝視窗拖拽矩形 watcher，隨後呼叫 `bootClient` + `mountClient` |
| [`src/boot-client.ts`](src/boot-client.ts) | `bootClient` / `assertEntriesActive`：掛載 Loader、每個 manifest 行一個 entry、啟用審計 |
| [`src/mount.ts`](src/mount.ts) | `mountClient`：經 `uiRenderer` 依賴 fiber 完成渲染器交接 |
| [`src/boot-page.ts`](src/boot-page.ts) | 無框架啟動頁：spinner、逐 entry 狀態、失敗渲染 |
| [`src/platform.ts`](src/platform.ts) | `PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`：隱式 external 基座 |
| [`src/seed.ts`](src/seed.ts) | 啟動時交給 loader 的靜態模組表 |
| [`src/window-drag/regions.ts`](src/window-drag/regions.ts) | darwin app-region 組合模型，以及 `base.css` 減除的互動元素選擇器 |
| [`src/window-drag/recall.ts`](src/window-drag/recall.ts) | 外殼唯一的視窗拖拽矩形 watcher（electron/electron#32341）：逐幀測量被打標行，並在它們移動期間脈衝 recall 標記 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當啟動約定不夠用時閱讀以下頁面：它所啟動的模組系統、掛載應用的渲染器，以及基座背後的用戶端編寫規則。

- [用戶端模組系統](../modules/README.zh.md)——本核心消費的惰性模組表與啟動圖。
- [UI 渲染器](../ui-renderer/README.zh.md)——接收掛載點並把 slot 資料繫結到 React。
- [用戶端模組子系統](../../../docs/subsystems/client-modules.zh.md)——web 外掛表、啟動圖協定與 bundle 路由。
- [用戶端編寫規則](../AGENTS.md#shared-modules-and-the-module-graph)——共享模組基座與 `dsh.client.external` 語義。
- [用戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。啟動核心屬於瀏覽器側 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明啟動核心不支援什麼。它們是目前包約束，不是任務積壓。

- **應用會等待全部 entry 就緒**——只要一個 entry 失敗，無框架啟動頁就會保留並逐項報告；不支援部分 UI 可用。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是 Vite entry shell，只負責 boot glue 與 module-table seeding，不發出 Cordis 事件或持有跨外掛可變狀態；boot chain（載入頁 → 啟動就緒 → 一次切換至 UI）由真實 carrier 上的 web e2e 冒煙測試驗證。
