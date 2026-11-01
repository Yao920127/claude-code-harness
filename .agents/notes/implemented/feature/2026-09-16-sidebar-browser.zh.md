# Agent Note: 沙箱化 Sidebar 瀏覽器

Status: implemented

[English](2026-09-16-sidebar-browser.md) | 中文

## Problem

右側 Sidebar 可以預覽已定址的工作區檔案，但沒有用於存取網頁的獨立介面。在應用外開啟會丟失 Sidebar 的分欄、浮動與 tab 生命週期。把任意網頁當成 Document Preview 內容，也會混淆兩種不同的信任模型：網頁控制一個活躍瀏覽上下文，而文件 renderer 只接收為一次預覽選定的位元組。

父頁面不能檢查或驅動跨域 iframe 的內部 history。支援的行為不能暗示具備這種能力。

## Decision

`@deepseek-ai/dsh-client-ui-sidebar-browser` 註冊可多開的右側 Sidebar `browser` tab 型別。`SidebarRightTabParamsMap.browser` 接受可選初始 URL，使其他 Client 外掛無須匯入本包執行時值即可開啟 Browser。

`MarkdownDelegateProvider` 為巢狀的 Markdown anchor 提供可選 owner callback，用於委託普通 HTTP(S) 點選，同時保留帶修飾鍵點選的原生行為。Chat 在 node list 外放置一個 Provider；已註冊該型別時，它以 URL 作為 typed navigation 參數開啟新的 `browser` tab，否則使用系統瀏覽器；Markdown renderer 不匯入 Browser feature。

地址解析器接受 `http:` 與 `https:`，包括 loopback 目標；不帶 scheme 的主機名補為 HTTPS。它拒絕內嵌憑證、應用自身 origin、畸形地址、`file:` URL，以及所有其他 scheme。本地檔案繼續由 Document Preview 負責。

Web 使用 iframe 載體；Desktop 使用[保持頁面實例的 webview 載體](2026-09-20-desktop-browser-webview.zh.md)。它的預設 Web 策略是 `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"`；frame 沒有直接的下載或頂層導航 flag。popup 會脫離 sandbox，Web popup 會保留 opener，並可以透過該鏈導航頂層應用。same-origin 允許被存取的 origin 使用自己的 Cookie 與 Web storage；它不會讓跨域目標與 DSH 變成同源。iframe 不傳送 referrer，也不新增包自有的 Permissions Policy，因此瀏覽器預設策略與使用者授權生效。最右側 toolbar 開關會為目前 tab occurrence 移除 sandbox attribute；該模式不持久化，啟用期間持續顯示警告。未受 sandbox 約束的頁面可以按瀏覽器 activation 規則導航頂層應用，並使用下載、模態對話方塊和輸入鎖定。本包不執行 Host 側 URL probe 或代理。

每個 tab 獲得一個 `BrowserController`，負責地址驗證與載體無關的命令。`BrowserFrame` 提供導航、可觀察的地址/載入/history/錯誤狀態和可選 sandbox 控制，`BrowserPresentation` 負責 DOM 掛載。`pages.ts` 把兩個物件組裝成 `BrowserPage`。`IframeImpl` 持有應用已知的 `BrowserNavigation`，`ElectronWebViewImpl` 則觀察原生 history。Slot injection 透過 `useBrowserState` 提供按 key 索引的控制器狀態和普通回呼；React body 只持有草稿與內容容器，沒有載體分支、控制器實例或可觀察源。

對於 iframe 載體，`BrowserNavigation` 儲存 canonical 目前 URL、受控載入 revision、導航狀態，以及有上限的序列與目前位置。新地址丟棄 forward 分支；後退和前進移動 index；重新整理重建應用最後已知的 URL 且不增加 history。在仍存活的控制器內，body 重掛載會重新載入最後請求的 URL。Session-scoped store 持久化不可變檢查點，供 Tab 標題與冷啟動恢復使用，不序列化活頁面。

從已儲存檢查點建立的控制器展示上次標題、URL 和“恢復頁面”按鈕。提供者初始為空閒狀態：掛載恢復的 Tab 既不建立瀏覽 guest，也不請求儲存的站點。恢復、工具欄重新整理或提交地址才啟動導航；新開啟 Tab 時顯式傳入的 URL 仍是主動導航請求，會直接載入。頁面尚未請求時，後退和前進仍停用，重新整理則透過與“恢復頁面”相同的控制器操作載入儲存的地址。切換空閒 iframe 的沙箱也不會恢復頁面。恢復提示屬於 `BrowserControllerState`，不進入活頁面的 `BrowserFrame` 介面或持久化導航狀態。

occurrence 取消會釋放控制器。只有 Sidebar 的權威 `openTabs` 清單已不再包含該 Tab 時，才刪除儲存的檢查點。清單先發布布局中的 Tab 移除，再由 `TabDomain` abort 對應 occurrence；外掛解除安裝也會 abort occurrence，但仍保留已儲存的 Tab 成員資訊。因此清理不會把外掛解除安裝當成刪除恢復資料的請求。

Browser 狀態只屬於呈現層，不進入 Session log、模型請求、resource model 或 DockKit layout operation。現有的[右側 Sidebar 基礎設施](2026-09-04-right-sidebar-docking-infrastructure.zh.md)、[tab 型別契約](../architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)、[resource model](../architecture/2026-09-05-client-resource-model.zh.md)和[文件預覽操作](../architecture/2026-09-08-document-preview-operations.zh.md)繼續負責各自現有職責。

## Web 導航狀態

對於一個受控 revision，Web 載體只把 iframe 的第一次 `load` 當作應用已知 URL 的確認。同一 revision 後續發生 `load`，只能證明文件已經變化，無法給出新的跨域 URL。攜帶舊 revision 的事件會被忽略。這些狀態描述活動導航；尚未請求的已儲存檢查點仍是獨立的恢復提示。

| 狀態 | 進入條件 | 地址與控制元件 |
|---|---|---|
| `empty` | tab 沒有受控目標。 | 地址為空；後退、前進、重新整理與外部開啟均停用。 |
| `loading` | 地址提交、應用 history 移動或重新整理啟動新的 revision。 | 請求 URL 仍是權威地址；後退和前進遵循應用 history 範圍；重新整理保持可用；外部開啟遵循已知目標的協定。 |
| `known` | 目前 revision 收到 iframe 的第一次 `load`。 | 即使第一次載入包含 HTTP redirect，請求 URL 仍是權威地址。控制元件規則與 `loading` 的已知目標規則相同。 |
| `unknown` | 目前 revision 收到 iframe 的第二次或後續 `load`。 | 最後一個受控 URL 變灰，並標記 `URL 已變化`。iframe 不提供跨域 `canGoBack` 或 `canGoForward`，因此後退和前進停用；外部開啟停用。重新整理以最後一個受控 URL 啟動新的 revision。 |

每個狀態都允許編輯地址。無效草稿只報告地址錯誤，不改變目前導航狀態。聚焦 unknown 地址會隱藏標記並顯示前往按鈕；回車與前往都會啟動受控載入。對於已經請求的頁面，切換 sandbox 模式會使用新的 revision 重新載入最後一個受控 Web 目標。iframe `error` event 只會為目前 `BrowserFrame` revision 標記臨時載入失敗 notice；它不改變 URL history，下一個受控 document 會清除它。瀏覽器不會為 DNS、TLS、mixed-content、CSP 或 `X-Frame-Options` 失敗可靠觸發該 event。不產生 iframe `load` 的 `pushState`、`replaceState` 與 fragment 變化仍不可觀察。

## Electron carrier

[Desktop webview 決策](2026-09-20-desktop-browser-webview.zh.md)負責原生頁面生命週期、Workspace 儲存共享、guest 策略與執行時驗證缺口。本文的 iframe 行為仍具有獨立價值；其跨域限制不描述 Desktop 載體。

## Alternatives considered

**Tab 掛載時自動重新載入已儲存頁面。** 這會僅因恢復佈局就恢復第三方請求與腳本執行。顯式恢復操作保留已儲存地址，但不會自行開啟站點。

**增加 Host embeddability probe 並持久化 sandbox 偏好。** 不採用，因為由 Host 請求任意目標會新增 SSRF 路徑，probe 可能與後續重定向結果不一致，而持久化的全域逃生開關會讓後續 tab 繼承不安全選擇。Browser 改為提供顯式、按 tab、非持久化的 sandbox 開關，並持續顯示警告。

**把 parent-owned history 當成完整 Web 模型。** 不採用，因為 iframe 內導航後，地址會悄然陳舊，而相關操作仍顯示可用。目前受控 URL 已知時，有上限的 parent history 仍然有用；顯式 `unknown` 狀態會移除 iframe API 無法支援的能力宣告。

**在 Browser 中支援 `file:` URL。** 不採用，因為本地檔案已由 Document Preview 負責，而 browser 導航使用不同的信任模型。Browser 直接拒絕該協定，不取得檔案系統或 Workspace Files 能力。

**透過 Host 代理網頁。** 不採用，因為相容代理必須重寫 URL、CSP、Cookie、module、stream、form 與 download，同時會把 Host 變成通用出站請求器。

**在首個 Browser 變更中實作 Electron 載體。** 延期處理，避免在沒有打包應用證據覆蓋 overlay stacking、target lifetime、Cookie 隔離與全部 permission 拒絕路徑時啟用新的 Electron guest surface。

## Verification

單元測試覆蓋協定解析、Markdown 連結委託、controller 命令與生命週期、確定性導航狀態轉換、有界 history、best-effort iframe error 和外掛 disposal。Keyless Web 情境啟動隨附 composition，並覆蓋訊息連結路由、HTTP(S)、後退、前進、sandbox 控制、unknown 導航和協定拒絕。

手動冷啟動恢復和跨外掛解除安裝保留檢查點尚無執行時驗證。

## Consequences

iframe 載體不暴露 Electron 或 Node API。很多站點拒絕 iframe 嵌入，或者依賴預設 sandbox 不向 frame 提供的下載或頂層導航。HTTPS 應用可能按 mixed-content 策略阻止公共 HTTP 頁面，或限制 private-network 請求；關閉 sandbox 也無法繞過這些瀏覽器策略。關閉 sandbox 在其他方面會用自身保護換取相容性：frame 可以按瀏覽器 activation 規則導航頂層應用，並使用下載、模態對話方塊和輸入鎖定。逃逸出 sandbox 的 Web popup 會保留 opener，並可以透過該鏈導航頂層應用。這兩條路徑都不會增加 Electron 或 Node API。URL 檢查無法阻止 iframe 內頁面自行選擇目標。後續 iframe load 能表明已經發生導航，但無法給出跨域 URL；History API 與 fragment 變化可能完全不可見。

Web 站點 Cookie 行為遵循使用者瀏覽器，並不按 Browser tab 隔離。本地檔案會被拒絕，並繼續由 Document Preview 負責。持久化 URL 可能含敏感 query 或 fragment，因此使用者不應在位址列輸入不希望保留在應用本地瀏覽器儲存中的憑證。
