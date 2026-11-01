# Agent Note：設定頁作為伴生包

狀態：已實作

[English](2026-09-17-settings-pages-as-companion-packages.md) | 中文

## 問題

四個官方設定頁——終端、Agent 迴圈、Subagent、網頁搜尋——都放在一個使用者端包 `ui-settings-plugins` 裡，與「內建外掛」分割槽挨著。每新增一個內建頁面都讓這個包再長一截，而想要設定頁的社群組合包也找不到"頁面與擁有名稱空間的外掛放在一起"的現成樣板。曾考慮把每個頁面搬進註冊其名稱空間的主機包，但行不通：shell 名稱空間由執行器家族在 sandbox 行之下注冊，迴圈包為了一個數字欄位要長出瀏覽器建置，Subagent 的名稱空間從子路徑行註冊，而子路徑行不攜帶瀏覽器半側。

## 決策

**社群外掛的設定頁放在自己包的瀏覽器半側。** 它註冊進 `plugins.bundle.config` 或 `plugins.row.config`，自己擁有文案和樣式，透過 `ctx.settingsScope` 讀寫。它的 i18n 走使用者端 locale 服務，已釋出的社群組合包本來就是這麼做的。

**內建名稱空間的頁面放在伴生用戶端包裡。** `ui-settings-shell`、`ui-settings-agent-loop`、`ui-settings-subagent`、`ui-settings-web-search` 是純用戶端包，主機 `apply` 為空，各在 Web 組合花名冊裡佔一條裸名行，在 Host 服務其名稱空間期間註冊進 `plugins.item`。主機包不含瀏覽器程式碼；它們編輯的名稱空間以字面量拼寫，從不從 owner 匯入。

**表單機制搬進 `ui-primitives`。** `SettingsFormModel` 及 `settingsNumberField`、`settingsTextField`，`SettingsValueField` 與 `SettingsSecretField`，以及 `SettingsForm` 框架，是每個頁面共同渲染用的套件；框架以 `labels` 接收文案，模型接受結構化的 scope，因此基線包既不依賴任何外掛也不依賴其字典。

**`settingsScope.whileServed(namespaces, register)` 是註冊規則。** 頁面恰好在 Host 服務其某個名稱空間期間存在：服務監視共享的 describe 映像，名稱空間出現時執行註冊，一個都不再服務時登出，四個包共用一條規則而不是四份副本。

**`ui-settings-plugins` 只保留「內建外掛」分割槽：** 導航項和供功能外掛註冊標籤頁的標籤行。

## 考慮過的替代方案

**由 schema 驅動的通用表單。** 否決：通用渲染器只覆蓋標量欄位，碰到第一個動態控制元件就止步——Subagent 頁的即時模型目錄、跨欄位規則、一次 mutate 提交——而每個例外都會變成一個 schema 本不該承擔的 role。每個頁面都是程式碼；沒有發頁面的社群外掛就沒有頁面。

**內建頁面做成雙面主機包。** 因上述原因否決；伴生包給能帶半側的包留了這個選項。

**表單框架的文案放在一本共享字典裡。** 否決：那會讓每個頁面耦合到另一個外掛的字典鍵；每個頁面的字典自帶那幾條框架文案。

## 後果

- 外掛頁官方分組列出同樣四個頁面、同樣順序，來自四個包而不是一個；標籤與表單未變，頁面 golden 保持不變。
- 手冊[新增設定頁](../../../../docs/cookbook/adding-a-settings-card.zh.md)展示社群路徑並點名伴生包範本。
- 用戶端模組系統的規則不變：瀏覽器半側掛在說明符為裸包名的 Loader 行上，因此拆成子路徑行的組合包，其註冊的所有頁面都留在根行上。
- 終端頁在 `plugins.item` 裡的 id 是 `shell`，舊包註冊的是 `bash`：官方頁面上的 `subject.id` 現在是 `plugins.detail.*` 貢獻可以據以判斷的標識，所以 id 以頁面編輯的能力命名，而不是某一個執行器家族。

## 測試

每個伴生包的 `tests/apply.client.spec.ts` 在 Host 服務名稱空間時註冊頁面、停止服務時登出、teardown 時收攏；其 card 與 controller 案例延續原包裡的頁面行為。`packages/client/ui-primitives/tests/settings-form-model.client.spec.ts`、`packages/client/ui-primitives/tests/settings-form.client.spec.tsx` 與 `packages/client/ui-primitives/tests/settings-fields.client.spec.tsx` 釘住套件；`packages/client/ui-settings/tests/while-served.client.spec.ts` 釘住註冊規則。`apps/web/tests/plugin-config.e2e.ts` 走真實鏈結驗證終端頁與 Subagent 頁。
