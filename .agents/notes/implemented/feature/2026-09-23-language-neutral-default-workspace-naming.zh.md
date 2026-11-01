# Agent Note: 語言中立的預設工作區命名

Status: implemented

[English](2026-09-23-language-neutral-default-workspace-naming.md) | 中文

## Problem

[首次使用預設工作區](2026-09-20-default-workspace.zh.md)讓 Client 按啟動語言同時決定目錄名和儲存標題：中文安裝環境建立 `預設工作區`，英文建立 `Default workspace`，其他語言建立 `default-workspace`。讀者看到的名稱與寫入磁碟的名稱是同一個字串，因此一個產品決策承擔了兩項互不相容的要求。路徑會被 shell 命令、工具參數、`@path` 引用、工作階段日誌和備份定址，不應取決於安裝環境啟動時恰好使用哪種語言。標籤是給人讀的，應當使用讀者的語言。事後切換語言兩者都無法滿足：路徑已經固定，由它派生的標籤也已固定。

## Decision

目錄名與儲存標題是同一個固定的、語言中立的字串；只有螢幕上的標籤跟隨讀者語言。

`DEFAULT_WORKSPACE_DIRECTORY`（`default-workspace`）由 [Workspace 控制器](../../../../packages/api/workspace-controller/README.zh.md#first-use-workspace)擁有，並透過其獨立的 `./default-workspace` 子路徑匯出——它是一個沒有任何 import 的純摺疊函式，因此 Client 包會內聯它，而不是去請求本包並未釋出的模組表條目。Host 將它拼接在 `<Documents>/deepseek-harness` 下，註冊表則以規範目錄的最後一段作為工作區標題，因此自動標題*就是*同一個名稱，不存在需要同步的第二個來源。

因此 `workspace.initializeDefault` 完全不接受請求參數；`WorkspaceInitializeDefaultRequest` 及其名稱驗證被刪除，註冊表的解析器返回路徑而不是路徑加標題。語言不會傳到 Host，因此那裡不可能與 Client 在命名上產生分歧。

瀏覽器消費方透過 `workspaceDisplayTitle(title, localizedDefault)` 為單個工作區加標籤：標題仍等於自動標題時顯示為在地化的預設名稱，其他標題一律原樣顯示。該名稱放在 `common` 語言名稱空間（`workspace.defaultName`），因為有兩個包展示它——Workspace 瀏覽區在讀取 store 時解析一次，行、懸浮卡片、搜尋結果元資訊以及重新命名與刪除對話方塊都繼承該結果；Conversation 的工作區 chip 則為 hero 自行解析。

讓某一行不再跟隨語言的動作就是重新命名，無需額外儲存標記：對話方塊以螢幕上的標籤作為初值，而判斷確認是否需要儲存用的是*儲存*標題。對於仍保留自動標題的工作區兩者不同，因此直接確認未改動的初值就是一次真實的重新命名，會把該名稱固定下來。重名檢查中排除自身也因此改為按工作區身份判斷——初值標籤與該行自己顯示的標題相同，但這並不構成與自身的衝突。

## Alternatives considered

- 在 `WorkspaceView` 上標記"從未重新命名"狀態（由 Host 依據 `defaultWorkspaceId` 與自動標題推導的布林值）可以消除下述誤判，但會讓一個共享的傳輸型別多承載一項 Host 本身別無用途的展示狀態。比較儲存標題是同一項判斷，且不增加 wire 表面。
- 在 Client Workspace store 內部在地化標題可以一處覆蓋所有消費方，但返回產品文案的 store 需要在語言修訂變化時重新投影，而且會把文案放到 i18n 門禁檢查的 `t` 座位之外。
- 保留在地化目錄名並另存一個標題可以保住舊路徑拼寫，但每個安裝環境的路徑仍由其首個語言決定——正是本筆記要消除的缺陷。
- 在語言切換時重新命名已有的在地化目錄，會為了外觀收益破壞已記錄的工作階段 `cwd`、工具參數和 `@path` 引用。

## Consequences

本次改動之前建立的安裝環境保留其既有的在地化目錄和標題。不會有任何重新命名或遷移；它們的標題不再與自動名稱相同，因此原樣顯示——這與從未重新命名過中文安裝環境的使用者已經看到的結果一致。

儲存標題恰好為 `default-workspace` 的工作區會按預設工作區顯示，即使它並非註冊表的預設工作區——例如從選擇器採用的同名資料夾，或被重新命名為該字面值。除標籤之外沒有其他行為依賴該判斷。Workspace 瀏覽區在 Client 側的重名檢查比較的是在地化標題，因此當第二個工作區被命名為在地化預設名稱時它會報衝突，而按儲存標題比較的 Host 會允許；拒絕兩行顯示完全相同的名稱是更好的答案，權威的唯一性檢查仍由 Host 擁有。

有兩處由工作目錄派生的 *Session* 標籤仍顯示原始路徑片段，因為它們命名的是目錄而非工作區：Session Controller 的 `displayTitleOf` 在 Session 沒有持久標題時退回到 cwd 最後一段，側欄搜尋結果的元資訊在 Session 沒有所屬工作區時同樣退回。兩處此前顯示在地化名稱，現在顯示 `default-workspace`。把它們接入 `workspaceDisplayTitle` 會把自動標題判斷擴散進 Session 命名，而這種情形幾乎總會先被 Session 標題生成填上。
