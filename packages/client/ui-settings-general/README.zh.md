---
description: "dsh Web 用戶端的設定外殼、無特定功能歸屬文案與持久化產品引導名稱空間：「通用」分割槽、觸發控制元件介面框架與引導帳本投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-general

[English](README.md) | 中文

## 概述

使用本包可為 dsh Web 用戶端提供 Settings 面板、連線恢復控制元件、由功能包貢獻的導航，以及依次進行的首次執行引導。使用者可以從側邊欄開啟面板、立即重試失敗的連線，並在主機為迴環瀏覽器提供本地設定檔時存取該檔案。各功能包提供自己的設定行、分割槽和引導步驟；本包提供共享的介面展示和程式碼工作工具開關，但不新增引導文案。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

設定面板採用各頁面共享的 760 × 500 佈局，並受視口大小約束。較長的頁面在內容欄內部滾動；帳號入口使用帳號圖示。面板掛載在 `#root` 之外而不是其內部，這樣在文件序上更靠後的 chrome 行所宣告的 macOS 視窗拖拽區不會吞掉它的控制元件。

<a id="use-this-package"></a>
## 使用本包

使用者透過側邊欄底部的 Settings 控制元件進入外殼；功能外掛透過本外殼所投影的 slot 帳本貢獻自己的頁面與引導步驟。在展開側邊欄和收起軌道中，該控制元件都會把在地化的 Settings 文案作為其可存取名稱。Settings 右側淺黃色的**連線異常**操作表示瀏覽器離線暫停；其常駐重試圖形與中文文案「連線異常，重新整理重試」都指明重試動作。每次恢復嘗試都顯示共享 ongoing loading 加**重新連線中**，其後一至三個點每 500ms 前進一次，且每次嘗試至少可見 800ms，短暫重試不會閃動。選中任一黃色狀態都會立即發起重試；按壓回饋留在黃色色階內。恢復後該區域變為淺綠色的**連線成功**，從綠色藥丸可見起駐留 2 秒再消失。藥丸出現時淡入、移除時以 150ms 淡出，寬度隨目前文案自適應。首次啟動與未曾中斷的健康連線保持靜默。外殼渲染模態面板、由 `settings.section` 條目建置的導航，以及每次只掛載一個的引導步驟。

當分割槽導航超出面板可用高度時，列表獨立於設定內容滾動，並保持「設定」標題固定。

在 Desktop 中，帳戶行更新控制元件顯示可用版本、進度、驗證、就緒和持久重試回饋。它與連線指示器共用 28px 高度、8px 圓角、14px 圖示佔位、4px 圖文間距，以及 12px 中等字重文字和 18px 行高；更新狀態的邊框、填充和文字顏色獨立定義。重試文字及其圓點與其他更新文案使用相同的品牌藍色；數字下載進度不帶省略號。預載入僅傳遞語義化階段、版本、進度和失敗類別；元件從目前 `settings` locale 解析全部可見與無障礙文案，並在應用內語言變化後同步更新。選擇可用更新即開始下載；安裝需要獨立的殼擁有的確認。側欄收起時，其頂部展開按鈕以品牌藍色圓點顯示相同狀態，包括失敗狀態。連線回饋通常優先展示，但殼報告正在安裝時，預期的後端斷開不能遮蓋更新狀態；失敗後恢復連線回饋。兩個控制元件共用一次載體訂閱；瀏覽器程式碼不能選擇安裝檔或授權安裝。[Desktop 更新](../../../apps/desktop/README.zh.md)負責釋出流程。

設定的可見狀態和分割槽選擇由 shell owner store 儲存。外殼將設定命令的有效繫結傳給入口貢獻，用於選單鍵帽和 `aria-keyshortcuts`；退回按鈕使用相同繫結提供懸停、鍵盤聚焦提示和 `aria-keyshortcuts`。設定位於最前方或沒有模態彈出視窗時，設定命令（預設為 `Mod+,`）切換設定彈出視窗的開關；側欄控制元件開啟同一彈出視窗。快捷鍵速查或其他模態彈出視窗位於前方時，該命令不能開啟或關閉設定。長按產生的重複按鍵不執行操作。初始焦點落在導航中選中的分割槽；沒有可用分割槽時落在標題上，均不繪製焦點外輪廓線。Tab 和方向鍵導航保留可見焦點提示。`Mod+/` 可在設定上方開啟快捷鍵速查；`Escape` 關閉最上層彈出視窗，焦點返回觸發該彈出視窗的控制元件。透過快捷鍵、Esc 或滑鼠關閉後的回焦均不繪製外輪廓線。

### 「通用」分割槽

Web 與桌面端的通用設定底部顯示目前釋出版本，使用建置注入的 `DSH_CLIENT_VERSION` 中繼資料和目前語言。缺少版本中繼資料的區域性建置不顯示該行。

程式碼工作工具開關控制 [ui-settings](../ui-settings/README.zh.md#use-this-package) 定義的共享偏好 `ui-settings.enabled`。Web 和桌面端均提供此開關，立即跟隨已接受的變更，並在寫入完成前停用重複輸入。寫入失敗時顯示在地化的重試提示。

「通用」分割槽承載內建的程式碼工作工具行與目前版本行，以及功能包註冊進 `settings.general.item` 的行。每個註冊方擁有自己的行文案與行為。例如「外觀」行位於 ui-theme。

### 開啟設定檔

在迴環瀏覽器上，只有當主機確認可準備好一份由提供者持有的本地文件時，外殼才渲染**開啟設定檔**。該操作會在原生文字編輯器中開啟該文件（macOS 上繞過瀏覽器檔案關聯）。遠端瀏覽器從不註冊該操作，也從不發起這項特權設定讀取。

### 引導步驟

引導帳本按升序投影，每次只掛載一個步驟。註冊方持有持久化完成狀態、能力就緒狀態、文案、變更操作與可見包裝，因此獨立註冊的流程無法堆疊，外殼也不會成為第二個設定事實來源。可見步驟自行持有彈出視窗框架與應用根節點 `inert` 生命週期。

-----

<a id="understand-the-implementation"></a>
## 理解實作

外殼宣告 settings.launcher，供帳號功能提供側邊欄選單，並以設定按鈕作為退回。入口接收 settingsOpen，其 false→true 邊沿代表一次進入設定頁，因此註冊方在每次進入時執行一次，而不是在同一次開啟中的每次重渲染執行。關閉對話方塊後，焦點返回目前入口。

<details>
<summary>實作細節——點選展開</summary>

外殼擁有介面框架與投影，並提供程式碼工作工具行與目前版本行；功能註冊方擁有其餘內容與文案。

### 帳本投影

導航是 `settings.section` 帳本的投影；導航 label 可以是跟隨語言的 thunk，經 `resolveSlotLabel` 解析，並在分割槽帳本更新或 locale revision 變化時重新渲染（`ctx.get('locale')` 可選讀取，無硬 locale 依賴）。引導帳本按升序投影；目前註冊方會收到該條目的 id、`complete()` 與 `openSection(id)` 回呼，完成或跳過目前步驟後，所有權轉交給下一項。

### 連線恢復

外殼是明確的恢復功能消費方，因此直接注入 Connection，而不把生命週期控制放進 `ctx.remote`。它的私有 hooks compartment 繫結 `ctx.connection.state`，元件只接收選出的狀態與呼叫 `ctx.connection.reconnect()` 的注入回呼。`ConnectionIndicator` 擁有內聯展示並從 `settings` locale namespace 接收全部可見與無障礙文案；連線中狀態的 800ms 最短可見駐留與 2 秒恢復確認計時器歸外殼所有；恢復計時從駐留結束、恢復藥丸實際可見時開始。

### 文件可用性

在 loopback 頁面上，Client 透過 `settings/describe` 載入提供者的 `hasDocument` 能力，且只有在 Host 確認可準備好一份由提供者持有的本地文件時才渲染**開啟設定檔**操作。該操作呼叫無路徑參數且經瀏覽器認證的 `settings/openSettingsDocument` Remote；Host 會再次解析提供者路徑、在文件缺失時將其建立出來，並交給原生文字編輯器（macOS 上使用 `open -t`，繞過瀏覽器檔案關聯；Linux 和 Windows 上使用桌面檔案關聯；WSL 上經 `wslpath -w` 轉換後使用 Windows 檔案關聯）。開啟失敗時該操作仍可使用，並渲染在地化錯誤。臨時讀取失敗或 Host 拓撲變化後，重新開啟對話方塊或重新連線會重新整理可用性。非 loopback 頁面保留 Client 策略，不提供該原生操作及其 settings 讀取。

### 主機端

主機端在 `ui-settings-general` 條目的 Config 中把 `welcomeNoticeVersion` 宣告為 volatile 欄位。`ui-settings-models` 提供的歡迎步驟透過既有公開 settings 邊界讀寫其中的 `welcomeNoticeVersion`；外殼本身仍不持有產品策略。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設定介面家族與組合模型。

- [ui-settings](../ui-settings/README.zh.md)——本外殼所依賴 slot 型別與 scope 服務所在的領域底座。
- [ui-sidebar](../ui-sidebar/README.zh.md)——承載 `sidebar.settings` 席位的側邊欄外殼。
- [ui-settings-models](../ui-settings-models/README.zh.md)——貢獻 DeepSeek 引導步驟的功能包。
- [settings](../../settings/README.zh.md)——持久化使用者設定 seam 及其檔案提供者。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——帳本背後的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明外殼自身提供什麼、功能包必須提供什麼；它們是目前包約束。

- **額外的通用設定行需要相應功能外掛**：外殼提供程式碼工作工具與目前版本；功能外掛提供其他偏好。
- **Windows 頂欄徽標的氣泡仍向右展開**：`DesktopUpdateBadge` 佔用頂欄的 `sidebar.toggle.badge` 且請求 `side="right"`，側欄收起時其氣泡會被 Desktop 選單文字遮擋；側欄開關與新建工作階段的氣泡則改在頂欄下方展開（#4688）。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。settings seam 驗證並行布持久 onboarding section，slot core 會拒絕衝突；本地 document action 由 store 與元件測試覆蓋。
