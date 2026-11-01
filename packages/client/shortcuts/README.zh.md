---
description: "為每臺裝置自定義應用鍵盤命令"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-shortcuts

[English](README.md) | 中文

## 概述

為每臺裝置自定義應用鍵盤命令。桌面端和 Web 按接收輸入的裝置選擇不同預設鍵位。自定義鍵位在同一裝置重新載入後保留。命令隨所屬外掛解除安裝而移除，儲存的覆蓋仍保留供重新安裝使用。

Windows 在修飾鍵之間及第一個普通鍵之前使用 ` + `。Windows 和 macOS Desktop 上同時按下的兩個普通鍵均並排顯示，如 `F G`，提示和快捷鍵速查保持一致。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

Web 應用 bundle 自動掛載此包。功能外掛在 `ctx.effect()` 中透過 `ctx.shortcuts` 註冊命令。每個命令為 `desktop:macos`、`desktop:windows`、`desktop:linux`、`web:macos`、`web:windows` 和 `web:linux` 顯式宣告預設值；省略的設定不繫結按鍵。服務接收物理 `code`，按裝置展開 `primary`，並拒絕重複 ID 和任一支援設定中重疊的預設鍵位。同一可觀察目錄提供名稱、鍵帽、已修改標記和鍵位衝突。命令 owner 在執行操作前解析目前目標。

功能外掛透過 `registerFixed()` 貢獻只讀序列，透過 `observeFixedInput()` 觀察區域性控制元件處理後的輸入。固定操作行隨所屬註冊和語言變化；owner 可使用 `application` 展示分組，操作仍不可編輯。每個操作至少宣告一個物理按鍵組合，不儲存覆蓋設定。這些組合參與衝突驗證，不能分配給可編輯命令。Host 的 `stopSequenceMs` 設定控制連續兩次 Esc 的最大間隔，預設為 500 毫秒，只接受 1 至 2,147,483,646 的整數，確保過期計時不超過瀏覽器定時器上限；頁面載入時採用已驗證的值。

偏好只儲存覆蓋：缺少命令表示繼承預設，`null` 表示清除繫結，恢復預設則刪除覆蓋。全部恢復隻影響目前執行端／平臺設定。Web 使用同 origin 的 `dsh.keybindings.v1` 儲存；Desktop 使用 Electron 裝置本地的 `userData/keybindings.json`，與 Harness home 和工作區設定獨立。其 schema 版本與 Session 資料無關。 macOS 和 Windows Desktop 讀取版本 1 時不重寫，在下次成功編輯時儲存為版本 2；版本 2 增加可選的 `secondCode`。Web 和 Linux 保留原有繫結限制。

Windows 和 macOS Desktop 接受一至兩個不同的受支援非修飾鍵，可搭配零至四個修飾鍵。雙鍵繫結要求按住時間重疊，順序不限；先後按鍵不匹配。僅含修飾鍵的繫結會被拒絕。同一修飾鍵集合下，單鍵與包含該鍵的雙鍵組合衝突，包括固定操作佔用的按鍵。已儲存的繫結若與目前掛載的固定操作衝突，會保留顯示但不能執行。包括 Command+C 和 Ctrl+C 在內的所有有效繫結優先於原生操作、編輯器、終端、內嵌頁面和模態控制元件。錄製和輸入法組合狀態仍受保護。只有兩個鍵都按住時，雙鍵組合才優先接管；第一個鍵仍正常處理，可能輸入一個字元。

首次讀取完成後啟用鍵位。讀取失敗保留上次接受的設定；沒有已接受設定時使用預設值。偏好不可讀時，編輯和全部恢復均保持停用。修復儲存文件後重新開啟應用；重置操作不會替換不可讀或未來版本的資料。寫入失敗保留有效鍵位和草稿。其他瀏覽器標籤頁的更新使開啟的草稿過期，儲存前需要核對最新設定。瀏覽器寫入前重新讀取，但同時跨標籤頁寫入仍採用最後一次成功寫入。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

Host 建置在 Desktop 打包鍵盤整合之前生成 Node 入口和 `./protocol`；Client 階段生成瀏覽器 bundle。

Windows 和 macOS Desktop 在區域性處理器之前攔截已接受的完整組合，透過可信 preload 轉發。所有平臺的 Desktop 啟動都要求原生鍵盤橋接。Windows 和 macOS 的可設定命令只由原生輸入分發；DOM 輸入繼續交給固定操作。介面卡僅攔截初次按下事件已被攔截的按鍵的鬆開事件。預設繫結與使用者儲存的繫結優先順序一致，均優先於模態控制元件。其他環境在區域性處理器之後分發，並遵守宣告的區域。輸入法組合、死鍵、AltGraph 和已消費的輸入繼續傳遞；macOS Web 可在輸入法組合之外消費已繫結且報告為死鍵的 Option+Command+N，不保護後續輸入。Web 和 Linux 的模態層阻止後臺命令。已接管的重複事件仍被消費，但不重複執行。上下文攜帶原始 DOM 輸入元素，包括 shadow root 內的元素。owner 同步解析目標，並負責操作錯誤。`ctx.shortcuts.closeWindow()` 統一持有 Desktop 鍵盤橋接，並攜帶目前已接受的 revision；Web 呼叫和橋接請求錯誤均返回失敗。純 `./protocol` 匯出不依賴 React、DOM 或 Electron，在兩個介面卡間共享總和檢查碼序列持久化。顯式覆蓋取代衝突的新預設值；互相沖突的顯式覆蓋全部停用。Desktop 拒絕過期版本，並將 IPC 限制在目前產品視窗和頂層 frame。介面卡呼叫被拒絕時會記錄日誌並返回儲存失敗；釋出已接受命令目錄時的錯誤會向呼叫方丟擲。

DOM 固定輸入觀察者在應用分發前收到輸入法組合和消費標記。消費事件後，後續觀察者和命令不能使用它。焦點、指標、視窗失焦、輸入法組合、模態變化和區域性停止傳播會重置待完成的 DOM 序列。原生雙鍵狀態在視窗失焦、焦點 frame 或設定變化、輸入法組合、錄製和修飾鍵釋放時重置。Electron 在原生攔截後可能省略 keyup；原生繫結完成時立即清空按住狀態，因此每次觸發雙鍵組合都需要重新按下兩個鍵。釋放修飾鍵會清空按住狀態，因為 macOS 在按住 Command 時可能省略字元鍵的 keyup。介面卡釋放時移除監聽器和模態觀察者；單個功能觀察者失敗不妨礙其他觀察者接收輸入。

Desktop 原生選單和內嵌 frame 使用與 DOM 輸入相同的命令註冊表。Preload 和 Client 將獲焦 iframe 的名稱或瀏覽器 webview 租約與原生輸入匹配；Client 拒絕舊設定訊息。瀏覽器 guest 的輸入監聽在租約釋放時結束，無需等待 guest 銷燬完成。原生選單選擇是顯式操作，不依賴快捷鍵繫結。雙鍵組合沒有原生選單快捷鍵，其鍵位仍顯示在快捷鍵速查中。Windows 和 macOS Desktop 之外的終端 Ctrl+W/R 保留為區域性輸入。顯式原生選單操作保留模態檢查；鍵盤繫結使用對應裝置的分發策略。

</details>

-----

<a id="further-exploration"></a>
## 進一步閱讀

- [Web Client](../../../docs/subsystems/web-client.zh.md)
- [UI primitives](../ui-primitives/README.zh.md)
- [Web app bundle](../../bundle/web-app/README.zh.md)

-----

<a id="model-experience"></a>
## 模型體驗

無；此包是瀏覽器側 UI 外掛，不註冊面向模型的內容。

#### KV Cache 影響

無；此包不組裝或傳送模型提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 功能 owner 顯式宣告 Windows 和 macOS Web 的預設鍵位：Mod+Slash、Mod+Comma、Mod+Backslash 和 Control+Backquote 保持雙鍵；其他不含 Alt 的預設鍵位使用 Mod+Alt，含 Alt 的使用 Mod+Shift，全螢幕除外，使用 Mod+Alt+Enter。macOS Web 的“重新整理目前頁”預設不繫結快捷鍵，以保留瀏覽器自身的 Command+Option+R 操作；重新整理按鈕和使用者顯式繫結仍然可用。Mod 在 macOS 上為 Command，在 Windows 上為 Control。Windows 和 macOS 的 Web、Desktop 均接受任意三個或四個不同修飾鍵的組合。Web 還接受上述組合及 Mod+Shift 組合；瀏覽器或系統能否送達按鍵需在對應平臺測試。Linux Web 接受 Mod+Slash、Mod+Shift+Comma 和 Mod+Shift+Period。未送達視窗的作業系統快捷鍵無法被攔截。雙鍵組合等待第二個鍵時，不延遲或消費第一個鍵；原生操作或焦點變化可能使組合無法完成。命令註冊或登出會使開啟的編輯草稿過期，即使儲存的偏好未改變。Desktop 在每次命令目錄更新時重新讀取檔案，不設定檔案 watcher。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**Runtime invariant:** 不釋出配套檢查模組。目錄和鍵位索引由私有註冊表同步派生，沒有獨立維護、需要檢查的執行時關係。
