# Agent Note: 外掛頁上的外掛設定

Status: implemented

[English](2026-09-16-plugin-configuration-on-the-plugins-page.md) | 中文

## 問題

外掛的設定原本放在設定裡、外掛分割槽的設定標籤頁上：四張可摺疊卡片，每個主機平面名稱空間一張，旁邊是隻讀的清單標籤頁。側欄的外掛頁能列出並啟停組合包，卻打不開外掛的設定，於是同一個物件被兩個介面各持一半；儲存庫之外安裝的組合包更是完全沒有地方放自己的表單。

## 決策

**外掛頁承載設定；設定只保留清單。** 頁面在其 `main` 條目下宣告三個子 slot。`plugins.item`（list）按 `label` 把官方外掛列在官方分組裡。`plugins.bundle.config`（以組合包的包名為鍵）渲染在組合包頁面的描述與行之間。`plugins.row.config`（以 `<包名>#<行 id>` 為鍵）給這一行一個設定控制元件，開啟它自己的頁面。該頁面的標題與描述遵循[外掛元資訊決策](2026-09-18-localized-package-metadata.zh.md)；slot 鍵和技術身份不隨展示文字改變。

頁面透過 `view: 'page'` 渲染每個表單。官方外掛卡片與詳情還使用 `view: 'summary'`；行詳情頁只在外掛沒有展示描述時使用它。組合包設定僅渲染 `page`。頁面負責畫標題、圖示與麵包屑，把三份帳本投影成一個可觀察物件（`configLedgerSource`）綁在 store 旁邊，自身從不點名任何可設定外掛。側欄導航與安裝請求歸屬遵循[側欄管理決策](2026-09-09-plugin-management-in-the-web-sidebar.zh.md)。

**歸屬由註冊方在 slot 名與鍵裡宣告。** 不加 manifest 欄位，不加註冊中繼資料，也不從 settings 服務取 owner 資訊：官方頁面不帶組合包註冊，組合包的頁面帶自己的包名註冊，行的頁面帶組合包與其 patch 宣告的行 id 註冊。沒有瀏覽器半側的社群組合包就沒有設定頁；頁面不會從 settings schema 渲染通用表單。

**只有儲存才寫入。** 表單沒有放棄控制元件或未儲存標記；離開頁面時在解除安裝過程中丟棄暫存修改。儲存經由用戶端 settings scope，帶 revision 柵欄。

**四個主機平面頁面在 Host 服務其名稱空間期間註冊。** 每個頁面所在的包在共享的 settings 映像顯示某個名稱空間時透過 `ctx.slots.inject` 註冊對應頁面，名稱空間消失時銷燬，因此沒有組裝該外掛的部署不會留下它的痕跡；自[設定頁作為伴生包](2026-09-17-settings-pages-as-companion-packages.zh.md)起，每個頁面各是一個伴生包，`ui-settings-plugins` 把設定分割槽保留為清單標籤頁外面的**內建外掛**外殼。`settings.plugin.item` slot 退役。

**官方分組。** 安裝隨附的可選組合包開啟這個分組，屬於實驗包的帶 **Beta** 標籤，沒有官方標籤；設定頁排在其後。[實驗能力的可選 bundle 決策](2026-09-21-experimental-capabilities-as-optional-bundles.zh.md)列出這些條目。

## 後果

- 組合包的瀏覽器半側用一次 slot 註冊加自己的詞典就能提供表單；組合包的 patch 必須以鍵裡的 id 宣告這一行，註冊只在承載組合包瀏覽器半側的那一行開啟期間存在：`dsh-client-modules` 把該半側掛在說明符恰為包名的那一行上，因此鍵指向子路徑行的行級頁面隨根行消失，而不隨它自己的行。
- 四個頁面使用現有表單和 settings 寫入路徑；`ui-settings-plugins` 擁有設定分割槽，設定頁則位於外掛頁。
- 設定只列出清單；Settings 瀏覽器 golden 覆蓋該只讀分割槽。

## 考慮過的替代方案

**slot 條目上的註冊中繼資料。** 由 slot 宣告的 `meta` 份額（描述、組合包、行）能讓單個 `plugins.item` slot 覆蓋所有情況，代價是 `ui-slots` 多一個概念；三個 slot 用現有 API 表達了同樣的資訊。

**從 settings schema 生成通用表單。** `describe()` 已經把每個名稱空間的 schemastery schema 發給瀏覽器，沒有瀏覽器半側的社群名稱空間本可獲得一份預設表單。延期：官方頁面是精選的，通用表單會在沒有白名單的情況下暴露內部名稱空間，而把名稱空間歸屬到組合包還需要 descriptor 帶 owner。

**把卡片留在設定裡、從外掛頁連結過去。** 這會把一個外掛的描述和設定分散到不同頁面。

## 測試

`ui-plugin-manager` 單測覆蓋帳本投影、官方分組的卡片與頁面、組合包的表單以及行的頁面，包括描述優先於其摘要的規則；`ui-settings-plugins` 單測覆蓋按被服務的名稱空間註冊與撤下，以及表單只儲存不放棄的行為。`plugin-config` web lane 透過真實鏈結編輯 shell 頁面，並在開啟社群夾具的組合包後開啟其行的頁面；`plugin-manager` lane 記錄官方分組。
