# Agent Note：共享持久的 Desktop 瀏覽器登入

Status: implemented

[English](2026-10-07-desktop-browser-shared-sign-in.md) | 中文

## Problem

Desktop Browser guest 過去使用按 Workspace CWD 劃分的隨機、非持久分割槽。使用者在一個 Workspace 登入某網站後，到其他每個 Workspace 都要重新登入，每次應用重新啟動後也要重新登入。需求是讓 Sidebar Browser 記住登入。

## Decision

本記錄取代[保留式 Desktop 瀏覽器 webview 決策](2026-09-20-desktop-browser-webview.zh.md)中關於儲存歸屬的部分；其租約、呈現與 guest 策略決策繼續有效。

- 每個 Desktop Browser guest 都使用同一個持久分割槽 `persist:dsh-sidebar-browser`（`apps/desktop/src/browser-guests.ts` 中的 `SIDEBAR_BROWSER_PARTITION`）。Cookie 與 Web storage 在所有 Workspace 與 Session 之間共享，並跨應用重新啟動保留。bridge 的 `acquire()` 不再接收 Workspace 標識，Client 也不再解析它。因此某個 tab 登入過的網站——任何允許內嵌瀏覽器登入的網站——會在每個 tab 中保持登入，重新啟動後也一樣，應用本身不處理任何登入憑證。
- 該分割槽沿用現有 guest 策略：拒絕權限、裝置、螢幕捕捉、下載與原生 popup，並取消發往 DSH Host 的請求。
- Browser 工具欄的 **登入資料** 選單隻在 Desktop 上出現，提供唯一一個破壞性專案 **清除登入資料**，它會清除該分割槽的儲存資料與 HTTP 認證快取並重新載入 tab。該專案放在選單後面，使一次點選不會清空所有登入。

沒有做任何 Google 專用登入。Google 拒絕在內嵌瀏覽器中登入，而繞過它的三種辦法各自都被否決，因此 Google 帳號類網站留給使用者自己的系統瀏覽器處理。

## Alternatives considered

**保留 Workspace 分割槽並改為持久化。** 登入只會落在一個 Workspace 中，使用者必須對每個目錄重複登入。需求是一次登入、所有 Browser tab 都能使用。

**加一個 Google 登入視窗，把 Electron 偽裝成普通 Chrome。** 曾經做過一個使用共享分割槽的沙箱化 `BrowserWindow`，並從 user agent 去掉應用與 `Electron/` 產品標記，之後又移除了。Google 仍然偵測到內嵌瀏覽器並拒絕，視窗始終到不了帳號頁面；為了騙過 Google 的內嵌瀏覽器檢查而去掉 Electron 標記，是對一道刻意安全措施的檢測規避，所以把它拿掉而非繼續推進。

**從使用者已安裝的 Chrome 設定檔匯入 cookie。** Chrome 用系統鑰匙串中的金鑰加密 cookie 儲存，其磁碟格式也會隨版本改變。讀取它屬於憑證提取工具，能對任何 Chrome 帳號使用，需要鑰匙串授權，會一次性把所有網站的工作階段交給應用；而且新版 Chrome 會把 Google 工作階段繫結到該裝置的 Chrome，匯入過來的工作階段可能根本無法使用。否決。

**在系統瀏覽器中開啟 Google 登入。** 被使用者否決，使用者不希望應用開啟 Chrome 或 Safari。因此 Google 帳號類網站無法在 Sidebar Browser 中以登入狀態使用；使用者在自己的瀏覽器裡登入它們。

## Consequences

允許內嵌登入的網站一旦登入，就會在所有 Workspace 中保持登入，Workspace 之間的隔離因此消失。Agent 用瀏覽器工具開啟的頁面會帶著這些登入狀態載入；該工具只能開啟地址、讀不到任何內容，但如果某個頁面在普通 GET 請求上就執行操作，它會以已登入使用者的身份執行。**清除登入資料** 是讓所有網站登出的唯一方式。Google 帳號類網站（以及任何拒絕內嵌瀏覽器登入的網站）完全無法在 Sidebar Browser 中登入。

主程序單元測試在替換 Electron 的情況下覆蓋共享持久分割槽與清除；用戶端測試覆蓋清除選單的成功與失敗路徑，以及它在 Web 上不出現。
