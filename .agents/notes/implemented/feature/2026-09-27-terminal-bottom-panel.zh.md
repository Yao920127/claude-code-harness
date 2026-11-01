# Agent Note: Terminal bottom panel

Status: implemented

[English](2026-09-27-terminal-bottom-panel.md) | 中文

## 問題

以右側欄標籤頁開啟的使用者終端要與瀏覽器、檔案和文件預覽爭用同一窗格，而終端放在對話記錄旁邊會讓兩者都變窄。使用者期待編輯器的慣例：工作區下方的終端面板，隱藏時仍保留標籤頁和高度。

## 決定

終端位於對話內容下方的每 Session 面板中。`ui-conversation` 在 `main.conversation` 下宣告工作階段作用域的 `conversation.panel.bottom` 位置，只在選中 Session 時渲染；該位置的佔用者負責自己的高度，隱藏時不渲染任何內容。`ui-terminal-panel`（由 `ui-sidebar-terminal` 改名）佔用該位置，並把 `terminal.toggle` 繫結到 Control+\`。右側欄透過「開始」頁上的**終端**卡片開啟面板，該卡片在工作階段傳送第一條訊息前就會顯示，而對話標題欄的工具區不會：`ui-terminal-panel` 註冊攜帶該卡片的 `terminal` 頁面型別，自行渲染卡片，使選取它時開啟面板而不是頁面，並讓任何 `terminal` 頁面（例如儲存的佈局恢復出的頁面）開啟面板後關閉自身。

`TerminalPanels` 管理每個 Session 的面板狀態：顯示或隱藏、高度以及標籤頁。標籤頁由面板內的 key 與全域唯一的內容身份組成。[Web 終端決策](2026-09-09-web-sidebar-terminal.zh.md)仍約束終端控制器：它把每個內容身份繫結到對應的 Host 終端，因此重新整理後會重連同一程序。一個瀏覽器儲存條目儲存所有 Session 的面板，讀取時會驗證；結構無效的條目會丟棄全部面板，而不是採用其中一部分。啟動時，所有 Session 已儲存的標籤頁都會提供給控制器的視窗持有，包括尚未開啟的 Session。快捷鍵作用於最後掛載的面板所屬 Session，因為面板位置只存在於主對話中。移除 Session 會丟棄其面板。

## 考慮過的替代方案

**保留右側欄標籤頁形式，並給側欄增加底部停靠區。** 側欄的停靠佈局只有水平方向且作用於整個 Session；增加第二個方向會為一種頁面型別改變其持久化佈局格式與驗證。

**在應用框架中渲染位於所有列下方的面板。** 終端屬於 Session，而框架的 main slot 也承載沒有 Session 的全域面板。對話的工作階段作用域提供 Session，並隨 Session 一起消失。

**像側欄佈局一樣按 Session key 分別持久化面板狀態。** 視窗持有在啟動時需要所有 Session 的標籤頁；單個條目只需讀取一次，無需列舉儲存 key。

## 影響

每個瀏覽器記住自己的面板；換用其他瀏覽器或清除儲存後，所有面板都從隱藏且為空的狀態開始，而 Host 終端仍受空閒回收約束。隱藏面板會保留程序；關閉最後一個標籤頁會隱藏面板。嵌入式對話不渲染該位置。由於該位置是 single 型別，將來如有第二個 `conversation.panel.bottom` 佔用者，會取代終端面板。
