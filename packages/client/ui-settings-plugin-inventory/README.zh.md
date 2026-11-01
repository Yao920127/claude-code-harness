---
description: "dsh Web 用戶端設定中按作用域分組的只讀外掛清單標籤頁：Agent 預設組合在前，全域平面收在摺疊分組裡，搜尋跨兩組。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugin-inventory

[English](README.md) | 中文

## 概述

**外掛列表**標籤頁讓 Web 使用者檢視外掛，而不改變其設定。它先列 agent（智慧代理）預設分組，再列全域清單；兩個分組預設都收起，按需展開，搜尋期間保持展開。卡片顯示可用的在地化標題與描述，以穩定的條目 id 標識實例，並展示啟停狀態、出處、執行狀態、停用條件與發現失敗；由預設提供的全域條目會列出對應預設。搜尋覆蓋兩個分組，並指出其他預設中的匹配。標籤頁處理載入、空結果、無匹配、失敗與重試狀態，且不暴露傳輸細節；沒有預設 roster 時仍會展示全域清單。

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

開啟設定中的「外掛」分割槽並選擇**外掛列表**標籤頁，即可檢視主機的外掛清單。外掛啟用期間不會讀取 Remote——首次選擇該標籤頁時才掛載元件，並透過 `api-remotes` 懶呼叫 `ctx.remote.pluginInventory.list()`。

安裝失敗且存在待審批的 pnpm 建置權限時，頁面提供“允許這些腳本並重試”。該操作展示準確包名和持久授權範圍，再使用原來的包規格及啟用選項重試。一次點選批准整個列表，其中可能包括此前安裝留下的待審批包。關閉頁面不會授予權限。

### 閱讀卡片

每張收起的卡片使用外掛可用的在地化標題與描述。設定頁會縮短字面的包名或模組名退回值，移除 npm scope 以及 `cordis:`、`cordis-plugin-` 或 `dsh-`/`dsh-host-`/`dsh-client-` 字首；locale 標題保持原樣。Host 在 `meta` 中提供 locale 與包欄位的退回結果，Client 選擇目前語言。詳情與搜尋仍保留完整模組標識。缺失的描述不顯示，元資訊診斷隨卡片展示。這種短名顯示僅用於設定頁，不影響側欄的外掛頁。

穩定的條目 id 顯示在標題下方，卡片帶有表示啟停狀態的小標籤；彩色根 fiber 狀態圓點只標記標籤無法表達的階段：`pending` 對映為 idle，`loading` 與 `unloading` 對映為 ongoing。`active` 或 `failed` fiber 只顯示標籤，不顯示圓點。組合生成的次標題省略開頭的 `include:` 標記；懸停、搜尋、無障礙名稱與展開詳情仍保留完整 id。長條目 id 會在行內截斷，懸停時仍可檢視完整值。展開卡片後會顯示宣告的條目 id、完整模組標識與狀態事實：預設行說明它來自哪個預設、組合存活時的執行狀態，以及它攜帶的停用條件；被預設提供的全域行說明它由 Agent 預設按工作階段提供、列出啟用它的預設，並提供跳轉到預設組的入口。預設名經共享的 `presetDisplayText` 純函式（`dsh-agent-preset-registry/display`）疊在 [`ui-agent-preset`](../ui-agent-preset/README.zh.md) 的字典上解析：內建預設走目前語言，使用者自建預設保留自己的中繼資料，因此英文介面不會回顯預設宣告裡的中文名。搜尋按在地化標題與描述、模組名稱及條目 id 過濾兩組。

### 預設切換器

切換器與通用設定各行使用同一種「選擇膠囊 + 選單」控制元件。它列出 roster 的每個預設——預設項帶字尾、壞預設帶標記——並且只改變列表顯示什麼：它不寫任何設定，選中壞預設時在行的位置展示 discovery 報告的原因。選擇預設預設或工作階段預設的入口仍在原處：Agent 預設分割槽與新工作階段頁。

### 重試失敗的讀取

讀取失敗會在標籤頁內渲染共享 error 標記；載入與目前頁面同步使用共享 ongoing loading。重試會重新執行懶 `list()` 呼叫，且不會暴露傳輸細節。

外掛列表還顯示目前頁面的同步失敗。重試會重新應用最新用戶端圖，不改變 Host 啟用狀態，也不重新整理頁面。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

該標籤頁是主機擁有快照的只讀投影；外掛啟用期間不執行任何 Remote 讀取，首次選擇時才取快照。

### 註冊

瀏覽器外掛註冊一個 id 為 `all` 的在地化 `settings.plugins.tab` 貢獻；「外掛」分割槽擁有導航入口與標籤欄。註冊使用 `ctx.slots.inject()`，因此能跟隨標籤 slot 的延遲宣告、重新宣告、在地化變化與 teardown，而無需 import 分割槽擁有方。

### 渲染

行 key 按作用域限定（`global:`、`preset:<id>:<index>`），因此同一模組出現在兩個作用域時保持各自的展開狀態；宣告的條目 id 出現在展開詳情中，並在去掉開頭的組合 `include:` 標記後作為收起次標題，沒有 id 的行不顯示次級標籤。預設提供標記在用戶端推導：一個全域條目在全域被停用、且至少一個預設行對同一模組標識實際啟用時才攜帶它，因此被所有預設關掉（或僅條件宣告）的模組保持單純的已停用，而不是誇大提供關係。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設定分割槽、Remote 呼叫與主機側投影。

- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——本標籤頁註冊進的「外掛」分割槽。
- [ui-settings](../ui-settings/README.zh.md)——宣告 `settings.plugins.tab` 的領域底座。
- [api-remotes](../../api/remotes/README.zh.md)——`pluginInventory.list()` 背後的 Remote BFF 表面。
- [plugin-inventory](../../host/plugin-inventory/README.zh.md)——本標籤頁所渲染的主機側只讀 Loader 投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端清單投影，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義清單檢視的新鮮度與觸達範圍；它們是目前包約束。

- **每次 Settings 掛載或重試只讀取一份快照**：標籤頁不訂閱 Loader 變化，也不會在重連後自動重新讀取；切換標籤頁會保留目前快照，重新開啟 Settings 則會取得新快照。
- **兩個平面都只讀**：標籤頁展示全域與預設的啟停狀態但都不修改；寫回自定義預設組合檔案的啟停控制元件是刻意留作後續的工作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只持有一個只讀 Settings contribution。
