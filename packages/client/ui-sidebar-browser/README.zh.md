---
description: "右側 Sidebar 瀏覽器 tab：在 sandbox 中存取 HTTP(S) 頁面，包括 loopback 服務。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-browser

[English](README.md) | 中文

## 概述

在獨立的右側 Sidebar tab 中瀏覽 HTTP(S) 頁面，包括 loopback 服務。Web 使用 iframe 和應用維護的 history；Desktop 使用 Electron `<webview>`、原生導航 history 和保活頁面。本包不會向被存取內容注入 Electron 或 Node 能力。

## 目錄

- [使用本包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Browser 在 Web profile 中預設停用，在 Desktop 中預設啟用。Web 使用者可透過 profile patch 啟用隨附條目。可以從右側 Sidebar guide 開啟 **瀏覽器**並輸入 HTTP(S) URL 或搜尋關鍵詞。Chat 的[連結偏好](../ui-chat/README.zh.md)選擇**應用內側邊欄**時，HTTP(S) 連結會在此開啟。不帶 scheme 的主機名會補全為 HTTPS。不帶 scheme 且包含空白、或主機名既無點也無埠且不是 `localhost` 的輸入視為搜尋：`youtube` 會搜尋，而 `youtube.com` 與 `localhost:3000` 會導航。公共目標與 loopback 目標使用相同的預設 sandbox。每次 guide 操作或委託到此的訊息連結操作都會建立一個新的 Browser tab。

在 Desktop 上，所有 Browser tab 共享同一個持久儲存分割槽，因此你登入過的網站會在每個 tab 中保持登入，應用重新啟動後也一樣。工具欄的 **登入資料** 選單提供 **清除登入資料**，它會清除所有網站的 cookie 與儲存並重新載入 tab。Agent 在 Browser 中開啟的頁面帶著同樣的登入狀態載入；Agent 的瀏覽器工具只能開啟地址，無法讀取頁面內容。Google 拒絕在內嵌瀏覽器中登入，因此 Google 帳號類網站請改在系統瀏覽器中登入。

### 何時選擇

當 Web 頁面需要保留在目前 Session 旁時，選擇 Browser。本地檔案使用 [Document Preview](../ui-sidebar-documentpreview/README.zh.md)；站點拒絕 iframe 嵌入或需要本包不授予的瀏覽器 capability 時，使用明確的外部瀏覽器操作。

### 最小設定

`searchUrl` 是關鍵詞使用的 HTTPS 搜尋地址，`%s` 接收編碼後的查詢；預設是 Google 搜尋，修改後即時生效。`homeUrl` 是新 tab 既沒有自己的地址、也沒有可恢復的已儲存頁面時開啟的 HTTPS 頁面；預設是 `https://www.google.com`，設為空值則不開啟頁面。Web profile 透過其 profile patch 啟用隨附條目，也可在其中設定搜尋地址：

```yaml
- id: ui-sidebar-browser
  disabled: false
  config:
    searchUrl: https://duckduckgo.com/?q=%s
```

Client 外掛可以呼叫 `ctx.sidebarRight.openTab('browser', { params: { url } })` 開啟 tab。可選 URL 會在導航前接受與位址列輸入相同的驗證。

Host 呼叫方（例如 Agent 工具）用 `ctx.sidebarBrowser.open(sessionId, url)` 為使用者開啟頁面：每個已連線的應用視窗都會在該 Session 中新開一個 Browser tab，呼叫返回收到請求的視窗數，0 表示沒有視窗連線。請求只在即時生效；之後才連線的視窗不會重放它們。[右側 Sidebar 頁面](../../../docs/subsystems/sidebar-right.zh.md#agent-open-requests)說明了這個通道。

命令 `browser.new` 在焦點停靠分欄開啟獨立瀏覽器頁，替換開始頁並保留已有內容頁。從聊天區或浮動內容頁觸發時，使用活動停靠分欄。桌面預設鍵在 macOS 上為 Cmd+T，在 Windows 上為 Ctrl+T；Windows 和 macOS Web 使用[快捷鍵服務的平臺預設值](../shortcuts/README.zh.md)；Linux Web 預設不繫結此命令。開始頁按鈕使用藍色地球圖示，並在按鈕內顯示有效快捷鍵，不額外彈出重複提示。

工具欄提供後退、前進、重新整理、前往和在系統瀏覽器中開啟。Web 還提供逐 tab sandbox 開關；關閉它是臨時選擇，並會顯示警告。Desktop 顯示觀察到的頁面標題。重新啟動後，Browser 展示儲存的標題和 URL；只有點選恢復或重新整理才開啟該地址。

-----

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

### 協定策略

地址解析器接受 HTTP 與 HTTPS，包括 loopback 目標。`file:` URL、腳本/data/blob 輸入、內嵌憑證、DSH 應用自身 origin 和畸形地址會被拒絕。本地檔案由 Document Preview 負責渲染。位址列與 typed-open 輸入先經過關鍵詞規則；搜尋目標是設定的搜尋地址，按同一策略解析，並以查詢作為標題。Host 尚未報告搜尋地址時輸入的關鍵詞會以可修正的提示被拒絕。頁面發起的開啟請求從不變成搜尋。

### Iframe 載體

Web 預設使用 `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"`。frame 沒有直接的下載或頂層導航 flag。popup 會脫離 sandbox；在 Web 中，逃逸的 popup 會保留 opener，並可以導航頂層應用。被存取的 origin 可以使用自身 Cookie 與 Web storage，但跨域目標無法讀取 DSH DOM、storage 或 API 回應。iframe 不傳送 referrer，也不新增包自有的 Permissions Policy，因此瀏覽器預設策略與使用者授權生效。toolbar 可以為目前 tab occurrence 移除 sandbox；該選擇不持久化。未受 sandbox 約束的頁面可以按瀏覽器 activation 規則導航頂層應用，並使用下載、模態對話方塊和輸入鎖定。本包不代理或探測遠端頁面。

Web 記錄 toolbar 提交和 typed tab 開啟。導航狀態機把每個受控 revision 的第一次 iframe load 視為已知，把後續 load 視為頁面已經變化到不可讀取 URL 的證據。進入 unknown 狀態後，地址會顯示標記，後退、前進和外部開啟會停用，重新整理則返回最後一個受控 URL。body 重掛載時會重新載入應用最後已知的 URL，並且僅在尚無受控目標時使用可選初始 URL。不產生 iframe load 的 History API 與 fragment 變化仍不可見。iframe `error` event 會顯示臨時載入失敗 notice，直到下一個受控載入，但不會改變 URL history。

### Controller

每個 tab 的 `BrowserController` 負責地址驗證、命令和顯式恢復。`BrowserFrame` 提供與載體無關的導航狀態；`IframeImpl` 使用 `BrowserNavigation`，`ElectronWebViewImpl` 觀察 Chromium history。`BrowserPresentation` 負責 DOM 的物理掛載。Slot injection 提供 `useBrowserState` 和普通 callback，React body 不接收 provider 物件或 observable。

Desktop 主程序批准 guest 租約，並執行掛載、導航和權限策略。preload 只暴露限定範圍的 Browser 操作。共享宣告透過標準 `/types` 出口配合 `import type` 引入；Host 與 Client 使用獨立 tsconfig 編譯。Desktop Browser tab 宣告 `keepMounted`，Sidebar 因而在切 tab、切 Session、收起與浮動期間保留其 DOM。

頁面重新整理快捷鍵呼叫工具欄使用的同一過載操作。其 Tooltip 和 ARIA 組合隨有效繫結更新。Desktop 透過所屬視窗路由已批准 guest 中的有效快捷鍵；獲焦 webview 必須仍持有該 guest 的租約。Web 保留瀏覽器專用組合。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [右側 Sidebar](../../../docs/subsystems/sidebar-right.zh.md)——tab composition、導航與生命週期。
- [Document Preview](../ui-sidebar-documentpreview/README.zh.md)——本地原始碼、Markdown、圖片、HTML 與 PDF 渲染。
- [Sidebar Browser 決策](../../../.agents/notes/implemented/feature/2026-09-16-sidebar-browser.zh.md)——iframe 行為與 controller 所有權。
- [Desktop Browser 決策](../../../.agents/notes/implemented/feature/2026-09-20-desktop-browser-webview.zh.md)——webview 租約與手動恢復。
- [共享持久登入決策](../../../.agents/notes/implemented/feature/2026-10-07-desktop-browser-shared-sign-in.zh.md)——單一持久分割槽，以及為何把 Google 登入留給系統瀏覽器。

-----

<a id="model-experience"></a>
## 模型體驗

無。Browser tab 是使用者側呈現狀態，不註冊工具、prompt section 或 Session event。呼叫 `ctx.sidebarBrowser.open` 的 Agent 工具自行說明其模型可見內容。

#### KV Cache 影響

無；瀏覽內容不進入模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

隔離策略有意放棄部分瀏覽器相容性：

- 很多站點拒絕 iframe 嵌入，或需要預設 sandbox 不向 frame 授予的下載與頂層導航。HTTPS 應用還可能按 mixed-content 策略阻止公共 HTTP 頁面。關閉 sandbox 會用自身限制換取相容性，但不會繞過 mixed-content 或 private-network 策略。未受 sandbox 約束的 frame 可以按瀏覽器 activation 規則導航頂層應用，並使用下載、模態對話方塊和輸入鎖定。該模式不會按 Browser tab 隔離被存取 origin 的 Cookie，也無法阻止 iframe 內頁面自行選擇後續 URL。
- 在 Web 中，逃逸出 sandbox 的 popup 會保留 opener，並可以透過該鏈導航頂層應用。Desktop 會單獨處理 popup 建立。
- 後續 iframe load 能表明發生了導航，但無法給出新的跨域 URL。History API 與 fragment 變化可能仍不可見；狀態變成 unknown 後，Web 的後退與前進不可用。
- 出於安全原因，瀏覽器會隱藏很多 iframe 失敗：DNS、TLS、mixed-content、CSP 與 `X-Frame-Options` 失敗可能觸發 `load`，也可能不提供可操作 event，而不是觸發 `error`。載入失敗 notice 只能作為 best-effort 提示。
- 只要 tab 仍在 Sidebar 佈局中，儲存的標題和 URL 就會跨重新整理與外掛解除安裝保留。關閉 tab 會刪除其檢查點。重新啟動恢復不恢復頁面記憶體、未儲存的表單或 Chromium history 棧。
- 本地檔案會被拒絕，並繼續由 Document Preview 負責。
- Google 與多數搜尋引擎拒絕 iframe 嵌入，因此在 Web 中關鍵詞搜尋與預設的 Google 首頁會保持空白：瀏覽器把被拒絕的 frame 報告為普通載入，所以不會出現失敗提示。可在系統瀏覽器中開啟，或使用由 `<webview>` 渲染的 Desktop。把 `searchUrl` 與 `homeUrl` 設為允許嵌入的網站可避免此問題。
- Desktop guest 在所有 Workspace 與 Session 之間共享同一個持久儲存分割槽，因此 cookie 與 Web storage（包括登入狀態）會跨應用重新啟動保留，直到 **清除登入資料** 將其清除。Google 與部分其他網站拒絕在內嵌瀏覽器中登入，因此這些帳號無法在 Sidebar Browser 中登入。guest 權限、下載與原生 popup 均被拒絕；透過檢查的 HTTP(S) popup 請求會開啟 Sidebar tab。Host 地址過濾不是通用私網或 DNS-rebinding 防火牆。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出 companion。每個導航 provider 擁有自身的即時狀態並直接釋出檢查點；UI 透過 controller 消費同一份 provider 狀態。
