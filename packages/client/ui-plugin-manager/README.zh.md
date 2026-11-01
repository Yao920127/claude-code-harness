---
description: "從 Web 側欄管理 profile 的外掛組合包、它們的行，以及外掛的設定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plugin-manager

[English](README.md) | 中文

## 概述

使用 Web 側欄的**外掛**入口管理 profile 已安裝的組合包，以及安裝隨附、預設關閉的官方組合包。可以啟停組合包及其行、在 Host 讀出 spec 指向什麼之後安裝組合包、檢視 pnpm 輸出、停止一次執行，並啟用它新增的包。解除安裝會要求確認。註冊了設定頁的外掛在這裡、在它自己的頁面上編輯；設定裡只保留只讀的外掛列表。

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

在側欄選擇**外掛**。頁面首次開啟時透過 `api-remotes` 讀取清單與組合包；沒有受管 profile 的 Host 上頁面顯示為不可用。**官方**排在前面，列出安裝隨附、供開啟的組合包——開啟前保持關閉、沒有解除安裝、屬於實驗性功能的帶**實驗性**標籤——其後是註冊了設定頁的官方外掛；**已安裝**列出 profile 持有的組合包。卡片按名稱排序，啟停組合包不會挪動它的卡片。沒有組合包 patch 的依賴不是外掛，除非 profile 選中了它才會帶異常標籤列出。全域設定仍在設定的**外掛**分割槽中編輯。

已安裝的組合包及其外掛行在卡片和詳情頁中，按目前介面語言顯示各自的標題與描述。每個欄位先讀取匯出的 locale `meta`，缺失時退回到該外掛地址下可存取的 `package.json`；標題最終使用完整包名或模組名，兩處都沒有描述時不提供包描述。作者格式見[外掛展示元資訊](../../../docs/cookbook/adding-a-package.zh.md#plugin-display-metadata)。組合包卡片、詳情和元件行顯示各自 `package.json.icon` 宣告的圖片；未宣告或無法解碼時保留預設插畫。安裝預覽仍使用註冊表或 manifest 資訊。

### 安裝一個組合包

首次使用時，如果未顯式設定安裝源、pnpm 使用官方 npm 源，且列表提供 npmmirror，Host 會並行探測這兩個源，選擇最先成功回應 HTTPS ping 的源。已記住的選擇、使用者手選、管理器顯式設定，以及自定義或未知的 pnpm 源均保留。在初次探測期間點選安裝會等待這次有時限的操作；遲到結果不會覆蓋手選或重新開啟已關閉的對話方塊。

Host 透過普通 fetch 代理向 `https://registry.npmjs.org/-/ping` 和 `https://registry.npmmirror.com/-/ping` 傳送 GET 請求，以最先返回 2xx 的源為結果；重定向和失敗不參與選擇。隨後取消另一條請求、丟棄兩個回應體，並在清理完成後返回。預設時限為 1500 毫秒，包括不可用結果在內的探測結果均快取五分鐘。在 `ui-plugin-manager` 上設定 `registryProbeTimeoutMs` 和 `registryProbeCacheTtlMs`；`registryProbeEnabled: false` 關閉探測。兩條請求都失敗或超時時保留現有預設源。不使用 IP 地區服務，也不傳送 Session 內容。

**新增外掛**接受包名（可帶版本）、Git 地址、壓縮包或本地絕對路徑；對話方塊說明包名就是 README 裡 `dsh plugin add` 後面的那一段。輸入框下方的**外掛安裝引導和範例**展開一段引導，給出三種常見形式各一個範例；**填入範例**把範例填進輸入框。旁邊的**安裝源**寫著安裝首先詢問的註冊表，展開後可選：pnpm 自身的註冊表，按它實際指向的源命名——npm 官方源、中國大陸映像源，其餘以主機名顯示——Host 讀不到時保留中性的預設名稱，只列一次，選項標題帶上主機名（主機名即名稱時不重複顯示）；Host 設定的每個映像（`pluginManager.registries`），npmmirror 顯示為中國大陸映像源；以及手動輸入的 http(s) 地址。選項從控制元件上浮在對話方塊之上，展開不會拉長卡片；引導使卡片高過視口時，卡片內容可以滾動。初始選擇遵循上文的回應比較規則；之後選擇記在本瀏覽器（`localStorage`）裡，下次開啟對話方塊從它開始，Host 不再提供的已記住地址保留為手動輸入的地址；在安裝源列表返回前開始安裝，也仍請求該地址。**安裝**先讓 Host 在所選註冊表讀出 spec 指向什麼（`pluginManager.inspect`）：列表中已有的名字、所有註冊表都沒有的名字、沒有包的路徑、沒有組合包 patch 的包，或 pnpm 會拒絕的 spec，都以一句話回到輸入框下方，spec 保留可繼續編輯；所有註冊表都連不上時，這句話列出問過的每一個。隨後安裝從作答的那個註冊表開始。透過檢查的 spec 開啟安裝中介面，展示 Host 讀到的包名、一句話簡介和版本，pnpm 的命令與輸出摺疊在**檢視安裝詳情**之後。安裝完成後提供**立即啟用**：啟用新組合包、關閉對話方塊並把列表滾動到它；直接關閉則讓它保持已安裝但關閉。Host 改問另一個註冊表時，安裝中介面會說明哪個源沒能提供這個包、現在改問哪個，詳情裡每次 pnpm 執行都帶一個寫明所用源的標記。安裝失敗時按 Host 的歸因用一行話說明原因——所有安裝源都連不上，並列出問過的每一個；GitHub 地址或壓縮包連結自身的主機連不上，換源無濟於事；包不存在、磁碟已滿、profile 不可寫、pnpm 攔下了建置腳本——pnpm 輸出在詳情裡，**重試**就在手邊，Host 把失敗歸於所問註冊表時還在旁邊提供**更換安裝源**，回到 spec 輸入介面並展開安裝源選項；Host 已經把 profile 檔案放回原樣。pnpm 攔下依賴的安裝腳本時，失敗介面列出等待允許的包，並以**允許這些腳本並重試**取代**重試**；Host 把授權寫進 profile 的 `pnpm-workspace.yaml`（失敗的執行保留 pnpm 寫入的這個檔案）再執行 pnpm，安裝完成介面會說明允許了哪些腳本。安裝成功不代表模組一定能夠啟用。

準備和下載期間，**取消安裝**會請求 Host 停止執行並等待確認。載入組合包的階段不可取消。點選 ×、按 Escape 或點選遮罩會立即隱藏對話方塊，並在可以取消時請求取消。**檢視安裝任務**會重新開啟同一任務並保留輸出；結果待定或尚未確認時不能發起另一項安裝。確認取消後回到 spec 輸入介面並顯示 toast；manifest 與 lockfile 已恢復，已下載檔案可能保留。安裝回應丟失後會請求恢復結果；**核對安裝狀態**和重連會重試該請求。Host 已無活動請求時，**未能取得安裝結果**允許檢查外掛列表後返回編輯。早於接收確認的取消請求會等待並自動重試；取消失敗可手動重試。隱藏的任務透過 toast 通知結果，不會重新彈出對話方塊。

Host 將網路失敗或超時歸因於 GitHub 地址，且提供 npmmirror 時，對話方塊顯示**無法存取 GitHub**，超時時顯示**連線 GitHub 超時**，提供**改用國內映像**和**取消**。選擇映像後回到空的包名輸入框，記住所選安裝源，不自動開始下一次安裝。安裝已在使用 npmmirror 時（無論是選中、手動輸入，還是 pnpm 自身設定指向它），按鈕改為**試試其他方式**，同樣回到空的包名輸入框並展開**外掛安裝引導和範例**，安裝源保持不變。其他失敗保留原有診斷和操作。映像提供註冊表中的包及依賴，不代替 GitHub 儲存庫下載。

### 切換一個組合包

組合包頁面在標題下方顯示完整包名，也就是在別處安裝它所需的 spec。組合包開關改變其層選擇。啟用了 HMR 的 profile 在操作完成前重組；沒有 HMR 的 profile，以及被更高層覆蓋的組合包，會以 toast 說明。Host 讀不了的組合包帶異常標籤，其頁面給出原因，且不能開啟；提供管理元件的組合包保持鎖定。Host 以錯誤碼作答，由頁面字典措辭；pnpm 與 Loader 自己的診斷原樣顯示。頁面從卡片與數量中排除內建 profile 組合包，即使 profile 將它們列為依賴或 Host 報告了異常。Host 清單仍保留完整資料；設定中「外掛」分割槽的「外掛列表」標籤頁負責檢視它們的外掛。

### 切換組合包裡的一行

組合包頁面上行的開關呼叫 `pluginManager.setPluginEnabled`，往 profile 的 `cordis.patch.yml` 寫入該行的 `disabled` 覆蓋。啟用了 HMR 的 profile 的樹隨即重組，該行的主機半區卸下或掛上，組合包其餘部分照常執行，頁面無需過載即跟隨用戶端模組圖。行使用共享狀態標記表示 Host fiber 階段：pending 與 disabled 為 idle，loading 與 unloading 為 ongoing，active 為 done，failed 為 error。開關只出現在已開啟的組合包上；沒有存活條目的行，以及 Host 不透過 profile patch 定址的行，帶著 Host 的原因鎖定。超過十行的列表帶一個按在地化標題、描述、行 id 和模組名篩選的輸入框。

### 設定頁

自帶設定的外掛把設定渲染在本頁而不是設定裡，透過本頁宣告的三個 slot：`plugins.item`（list）用於官方外掛，按其 `label` 列在官方分組裡；`plugins.bundle.config`（以組合包的包名為鍵）用於組合包自己的設定，顯示在組合包頁面的描述與行之間；`plugins.row.config`（以 `<包名>#<行 id>` 為鍵）用於某一行的設定，這一行由此多出一個**設定**控制元件，開啟該行自己的頁面。頁面用 `view: 'page'` 渲染帶自己儲存控制元件的表單。官方外掛卡片還在標題下渲染 `view: 'summary'`；行詳情頁只在缺少包描述時使用該檢視。只有儲存才寫入：頁面負責畫標題、圖示與麵包屑，條目的表單在離開頁面時丟棄暫存的修改。安裝隨附的四個主機平面設定頁——shell 執行器、agent loop、子智慧代理、搜尋來源——各來自一個伴生包：[ui-settings-shell](../ui-settings-shell/README.zh.md)、[ui-settings-agent-loop](../ui-settings-agent-loop/README.zh.md)、[ui-settings-subagent](../ui-settings-subagent/README.zh.md) 與 [ui-settings-web-search](../ui-settings-web-search/README.zh.md)，在 Host 服務其名稱空間期間註冊。組合包的瀏覽器半側用同樣的方式註冊：

```tsx ignore-check
ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
  name: 'plugins.row.config',
  key: '@acme/dsh-sidebar#sidebar',
  locale: 'acmeSidebar',
}, ({ t, view }) => view === 'summary' ? t('summary') : <SidebarForm t={t} />))
```

組合包的 patch 必須以該 id 宣告這一行；註冊只在組合包開啟期間存在，因此關閉的組合包不顯示設定控制元件。

### 詳情頁擴充功能點

對某個不屬於自己的組合包、行或官方外掛有話要說的外掛，透過本頁宣告的三個 list slot 向該物件的頁面貢獻內容：`plugins.detail.actions` 在頁頭放一個控制元件，位於頁面自己的開關和解除安裝之前；`plugins.detail.badge` 在標題旁放一個標籤，位於版本、實驗性和異常標籤之後；`plugins.detail.section` 在頁面自身內容之下放一個區塊——組合包頁在元件列表之後，行頁和官方外掛頁在設定之後。每個條目都以頁面的 `subject` 渲染：`{ kind: 'bundle', pkg }`、`{ kind: 'row', pkg, row }` 或 `{ kind: 'item', id }`，其中 `pkg` 與 `row` 攜帶包名、版本、是否已安裝、是否啟用以及行列表這些供貢獻者判斷的事實。條目對無話可說的 subject 返回 null，自繪區塊外觀；頁面按 `order` 排列條目。

```tsx ignore-check
ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
  name: 'plugins.detail.section',
  id: 'acme-health',
  locale: 'acmeHealth',
}, ({ t, subject }) => subject.kind === 'bundle' ? <HealthSection pkg={subject.pkg} t={t} /> : null))
```

行頁只在某個 `plugins.row.config` 條目點名這一行時存在，因此給行的貢獻渲染在該設定開啟的頁面上。

-----

<a id="understand-the-implementation"></a>
## 理解實作

外掛管理依據 profile 的依賴記錄：已安裝組合包可啟停、可移除，隨安裝提供的組合包保持鎖定。這一區分不決定啟動失敗策略。

<details>
<summary>實作細節——點選展開</summary>

### 註冊

Host 入口透過生成的 Remote 介面暴露 `pluginRegistryProbe.fastest()`，共享進行中的比較、讓快取按時過期，並在解除安裝時中止和等待未完成探測。解除安裝後呼叫會返回拒絕的 Promise。

瀏覽器外掛透過 `ctx.slots.inject()` 註冊 `plugins` 側欄入口與它的 `main` 面板，使兩者跟隨 slot 延遲宣告、在地化變化與銷燬。頁面為全域頁面，不屬於任何 Session。顯示文字來自包元資訊與頁面字典。

### store

`PluginManagerController` 擁有組合包檢視、忙碌鍵、提示、安裝進度和解除安裝確認。每次讀取先問清單 Host 是否管理著 profile，再把 `listBundles` 與 `listPlugins` 合成每個組合包一份檢視，其行攜帶存活條目的啟停狀態與 fiber 階段。它合併重疊讀取，在操作後、收到 `plugin-manager/changed` 時以及重連後重新整理，並在銷燬後忽略晚到結果。安裝輸出按 job id 分組。安裝對話方塊沿 `idle → checking → starting → running → done | failed` 推進，`cancelling` 與 `applying` 按 Host 的報告呈現，安裝或取消回應丟失時進入 `unconfirmed`；已確認的 `applying` 階段不會倒退。透過 `waitForInstall` 恢復結果，無活動請求時結束為 `unknown`；checking 與所有活動階段使用 ongoing，最終頁面使用 done 或 error。檢查在一個 `AbortController` 下執行，返回編輯或關閉會中止它並丟棄其結果；執行只能透過 `pluginManager.cancelInstall` 停止。關閉會隱藏任務而保留其狀態。如果取消請求先於安裝到達，在進度或輸出確認該請求後會再次請求取消。Host 無法應用的變更、要等重新啟動的變更、被更高層覆蓋的變更，都是會自行消失的 toast。

### 設定 slot

自定義條目頁以 Host 條目 id 作為註冊 id；行頁面使用 bundle 包名和行 id。當條目提供可編輯 Config 欄位時，頁面主機傳入 `form.state` 和 `form.mutate(operations, expectedRevision)`。自定義頁面負責草稿和驗證提示，並可複用 ui-primitives 的 `ConfigField`。整個 bundle 的頁面可以包含多個條目，因此沒有單一表單。

頁面的 `main` 註冊把 `plugins.item`、`plugins.bundle.config` 與 `plugins.row.config` 宣告為子 slot，因此它們與頁面同生，註冊方的 `ctx.slots.inject` 會等到它們出現。`configLedgerSource` 把三份帳本投影成一個可觀察物件——按帳本順序排列、標籤按目前語言解析的官方條目，以及組合包與行的鍵——在帳本或語言變化前保持快取；頁面把它作為 `useConfigLedger` 綁在 store 旁邊，自身從不點名任何可設定外掛。註冊擁有的導航 store 選擇卡片、某個組合包、某個官方外掛或組合包的某一行；切換離開外掛面板時重置為列表，React 重新掛載則保留所選目標。其他 Client 外掛注入 `pluginNavigation`，呼叫 `ctx.pluginNavigation.openBundle(packageName)` 即可開啟組合包詳情，不改變目前 Session。首次讀取清單期間保留導航目標；組合包不存在時顯示列表。註冊與做出它的瀏覽器半側同生共死。`dsh-client-modules` 只把一個包的瀏覽器半側掛在說明符恰為包名的那一行 Loader 行上，所以組合包為自己或任一行註冊的頁面，都會在那一行被關閉時一起消失；需要在其他行關閉時仍保留頁面的子外掛，應作為獨立的包釋出。 名稱以 `@deepseek-ai/dsh-experimental-` 開頭的官方包顯示實驗性標記。

`plugins.bundle.config` 以 npm 包名為 key，提供 Bundle 詳情設定。`plugins.bundle.activation` 在使用者從列表顯式啟用後提供 Bundle 自有引導，並傳入關閉引導和開啟詳情的回呼。僅列出已啟用的 Bundle 不會觸發引導。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

這些頁面覆蓋側欄、Remote 呼叫與 Host 側管理器。

- [ui-sidebar](../ui-sidebar/README.zh.md)——外掛入口註冊進的面板列表；[ui-layout](../ui-layout/README.zh.md)——頁面佔用的主 slot。
- [api-remotes](../../api/remotes/README.zh.md)——`pluginManager.*` 與 `pluginInventory.*` 背後的 Remote BFF 面。
- [plugin-manager](../../boot/plugin-manager/README.zh.md)——本頁驅動的 Host 側管理器。
- [ui-settings-shell](../ui-settings-shell/README.zh.md)、[ui-settings-agent-loop](../ui-settings-agent-loop/README.zh.md)、[ui-settings-subagent](../ui-settings-subagent/README.zh.md)、[ui-settings-web-search](../ui-settings-web-search/README.zh.md)——註冊進本頁 `plugins.item` slot 的官方設定頁。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包是瀏覽器側的管理介面，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送 provider 請求。

## 已知限制與延期工作

- Ping 回應時間不代表包下載吞吐量。探測使用 Host fetch 的網路路徑，pnpm 專用代理設定可能使用不同路徑；使用者始終可以手動選擇安裝源，安裝仍遵循現有退回規則。

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了管理檢視的範圍；它們是目前包的約束。

- **頁面生命週期**——重新整理瀏覽器會丟失跟蹤的請求與輸出。同一頁面內重連可以恢復活動請求；Host 不保留已完成的結果。profile 檔案鎖序列化安裝寫入。
- **只管理組合包**——沒有組合包 patch 的依賴在安裝前就被拒絕；profile 裡已有的這類依賴不上頁面，除非 profile 選中了它；載入普通外掛模組仍是檔案操作。
- **行只顯示階段，不顯示原因**——失敗的行只顯示為失敗，沒有 Host 的錯誤文字；Host 日誌裡有。
- **一次只能安裝一個**——對話方塊一次執行一個 pnpm 命令；第二個 spec 要等前一個完成。
- **沒有版本選擇器**——spec 按 pnpm 接受的寫法輸入；頁面不列出註冊表版本，也不提供升級。
- **安裝源選擇只屬於本瀏覽器**——它存在 `localStorage` 裡，所以另一個瀏覽器會獨立計算初始推薦；`dsh plugin` 命令和 agent 工具使用 Host 設定的註冊表。
- **每次讀註冊表都要執行 pnpm**——開啟對話方塊、檢查、安裝各問一次 pnpm 自身設定指向哪裡；沒有 pnpm 的機器讀作未知，不提供備選。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生檢查。面板讀取 Host 事實，安裝源探測快取只儲存一次比較結果，沒有獨立維護的投影。
