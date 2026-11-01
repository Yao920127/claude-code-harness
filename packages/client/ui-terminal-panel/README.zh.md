---
description: "在 Web 視窗底部可調整高度的面板中，或以右側欄頁面的形式，開啟、切換和控制互動式 shell 標籤頁。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-terminal-panel

[English](README.md) | 中文

## 概述

在視窗底部（對話與右側欄下方）開啟終端面板，或在右側欄開啟終端頁面，在工作階段工作區執行命令。每個工作階段在重新整理後保留自己的終端標籤頁、面板高度與顯示狀態。隱藏面板讓命令繼續執行，關閉終端標籤頁則請求結束程序。Tab 補全使用 shell 的設定。命令使用執行環境中系統使用者的權限，獨立於 Agent 權限；詳見[使用者終端執行](../../api/terminal-controller/README.zh.md#use-this-package)。

## 目錄

- [使用此包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

面板從左側欄邊緣延伸到視窗右邊緣，因此左側欄收起時它會變寬，並讓對話與右側欄各縮短其自身的高度。它只在對話是主面板時顯示。面板隱藏時，對話右下角的終端按鈕會把它顯示出來；停靠的輸入框佔滿對話寬度時，該按鈕會隱藏。右側欄全螢幕並遮住對話時，同一個按鈕改為出現在視窗右下角，顯示的面板則在右側欄下方橫跨整個視窗寬度。`terminal.toggle` 命令顯示和隱藏目前顯示工作階段的面板；Desktop 以及 Windows、macOS Web 把它繫結到 Control+\`，Linux Web 預設不繫結，右下角按鈕的提示會顯示有效的鍵位。

右側欄「開始」頁的**終端**卡片會把「開始」頁替換為右側欄中的終端頁面，工作階段傳送第一條訊息之前也可使用；該頁面用記住的可用 shell 啟動終端。右側欄終端頁面與底部面板的標籤頁彼此獨立：每個頁面執行自己的程序，可同時開啟多個，並像其他側欄頁面一樣移動、分屏和浮動。雙擊頁面的標籤可重新命名其終端。已退出的 shell 提供**新建終端**，在原位置開啟新頁面。關閉頁面會在後臺結束其程序；隱藏右側欄時程序繼續執行。

最後一個標籤頁後面的 **+** 按鈕用記住的 shell 再開啟一個終端標籤頁。旁邊的箭頭開啟已安裝 shell 選單；選擇某項會記住它並開啟該 shell。選單開啟時才執行發現，不會分配終端。查詢失敗時選單提供重試。點選標籤頁，或聚焦後按 Enter 或空格鍵，即可切換終端。最右側的箭頭隱藏面板。拖曳面板上邊緣，或聚焦後按上、下方向鍵，即可調整高度。

雙擊終端標籤頁可重新命名。當其他頁面持有輸入權時，**接管輸入**會讓目前連線可寫。臨時斷開會保留螢幕並提供**重新連線**，不顯示傳輸診斷。已退出的 shell 保持可見並顯示結束代碼，同時提供**新建終端**，在原位置替換該標籤頁；它從不自動重新啟動。已退出的終端計入工作階段上限；達到上限時請關閉不用的標籤頁。

關閉終端標籤頁會立即移除它，並在後臺結束其程序；關閉最後一個標籤頁會隱藏面板。清理失敗沒有通知或手動重試操作；儲存下來的未完成關閉請求會在 Client 外掛啟動時重試。隱藏面板以及切換標籤頁或工作階段都會保留程序。刪除工作階段會丟棄其面板。

重新整理後，每個工作階段的面板連同標籤頁一起恢復，每個終端都會重新連線到儲存的 Host 身份。未出現在已儲存面板中的 Host 終端不會自動重新開啟，也沒有 UI 恢復入口；它們仍受控制器的無人值守空閒回收以及工作階段/Host 釋放約束。儲存的程序缺失時，會顯示在地化的不可用提示與**新建終端**；恢復過程從不自動建立替代終端。

終端背景、預設文字、游標和選區跟隨 DSH 主題，包括系統偏好與主題 token 覆蓋。切換主題會保留正在執行的 shell、輸出以及應用 OSC 顏色覆蓋。重置命令會把顏色恢復為目前 DSH 預設值。xterm 會把文字對比度調整到 4.5:1；游標相對其所在單元格背景至少保持 3:1 對比度，包括 Vim 配色方案。

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

本外掛佔用 [ui-layout](../ui-layout/README.zh.md#bottom-seat) 框架的 root 作用域 `shell.bottom` 座，面板在其中跟隨透過 `ctx.uiSession` 選中的工作階段；它還佔用對話的工作階段作用域 `conversation.panel.bottom` 位置，在其中渲染右下角按鈕。掛載右側欄時，它註冊可多實例的 `terminal` 頁面型別，把「開始」頁卡片渲染進 `sidebar.right.tab.guide.entry`、螢幕渲染進 `sidebar.right.pane.tab`、即時名稱渲染進 `sidebar.right.pane.tab.title`，並透過側欄關閉處理器結束已關閉頁面的程序。頁面的標籤 id 就是其終端 key；導航參數指明已儲存的 Host 終端，或其首個終端啟動的 shell。`TerminalPanels` 管理每個工作階段的面板：是否顯示、高度以及標籤頁；每個標籤頁由面板內的 key 與全域唯一的內容身份組成。一個瀏覽器儲存條目儲存所有工作階段的面板，讀取時會驗證；無效條目會讓所有面板從空狀態開始。底部座會記錄它顯示的工作階段，開關命令作用於最後記錄的工作階段。

不依賴 React 的終端模型由 `api-terminal-controller` 負責；按 key 的框架 hook 暴露其狀態。`ui-primitives` 的 Menu 與 Button 提供 shell 選擇器和麵板控制元件。面板顯示期間每個標籤頁的螢幕都保持掛載，非活動螢幕只是隱藏，因此切換標籤頁會保留每個模擬器的輸出。終端螢幕掛載時，主體才載入包內的 `client.terminal.js` 分塊，讓 xterm.js 與 FitAddon 不進入啟動時的 `client.js`；隨後由它們渲染螢幕並測量視口。輸入（包括 Tab 與控制字元）原樣傳到 PTY。

終端控制器分別儲存每個內容身份的 Host 關聯，並負責內容恢復；本外掛負責面板狀態。恢復的檢視不能分配替代程序。關閉或替換標籤頁會透過[終端控制器](../../api/terminal-controller/README.zh.md#understand-the-implementation)安排清理並同步返回。瀏覽器元件清理只會斷開瀏覽器側工作。

外掛啟動時，每個工作階段已儲存的面板標籤頁以及每個開啟的右側欄終端頁面都會保留匹配的 Host 身份，包括尚未開啟的工作階段。該視窗持有獨立於 React 掛載與螢幕訂閱。移除最後一個匹配的標籤頁會釋放它；隱藏面板不會。[終端控制器](../../api/terminal-controller/README.zh.md#use-this-package)負責無人值守的空閒回收與長命令保護。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Subprocess](../../subprocess/subprocess/README.zh.md)
- [對話](../../client/ui-conversation/README.zh.md)
- [Web 終端決策](../../../.agents/notes/implemented/feature/2026-09-09-web-sidebar-terminal.zh.md)

<a id="model-experience"></a>
## 模型體驗

無，本包處理使用者終端互動，不增加模型輸入。

#### KV 快取影響

無；終端輸出只在瀏覽器與 Host 之間傳輸。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- shell 發現或原生 PTY 啟動可能失敗。標籤頁會報告失敗，而不會啟動另一個 shell。
- 補全選單與行內建議取決於 shell 設定。Web UI 不提供獨立的補全引擎。
- 應用 OSC 顏色覆蓋由已掛載的渲染器保留；新開啟的渲染器無法從 Host 螢幕快照恢復它們。
- 終端歷史有上限。本功能不會把終端輸出傳送給 Agent，不支援並排拆分終端，也不會在 Host 重新啟動後恢復程序。
- 面板狀態儲存在單個瀏覽器的儲存中；換用其他瀏覽器或清除儲存後，所有面板都從隱藏且為空的狀態開始。
- 終端分塊載入失敗需要重新整理頁面，因為 React 會在頁面生命週期內快取被拒絕的懶載入匯入。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

不釋出執行時不變數伴生。終端中繼資料與螢幕更新由單一所有者排序；提供者不暴露可供比較的獨立觀測尺寸。

</details>
