# Agent Note: 透過 Host settings 持久化 Web 使用者偏好

Status: implemented

[English](2026-08-06-host-backed-web-preferences.md) | 中文

## 問題

Web 的 Appearance、Language 和繁忙態 Enter 偏好原本存在瀏覽器 `localStorage` 中。瀏覽器儲存以 origin 為作用域，因此換一個埠重新開啟 `dsh web` 會選中另一個儲存分割槽並丟失選擇，即使兩個程序使用同一個 DSH home。這些是使用者級產品偏好；工作階段選擇、草稿、摺疊展開狀態和其他瞬態瀏覽器狀態仍保留在頁面內。

第一版主題實作只把 Appearance 移入 Host settings，但會在提供 `ThemeRuntime` 之前等待初始 RPC。緩慢或不可用的 settings 請求因而會掛起組裝後的頁面。該實作還在讀取後才建立訂閱，可能錯過此視窗內的失效通知；它寫入時不攜帶 namespace revision，並且允許已釋放外掛所排隊的寫入到達 Host。

## 決策

對應 Host Config schema 宣告 volatile 語言、主題和忙碌時 Enter 偏好。ConfigEditor 將顯式選擇儲存到活躍 profile patch。經過認證的 settings API 投影這些 Config 欄位，並對 secret 角色欄位脫敏。

`dsh-client-ui-settings` 持有一個瀏覽器全域的 settings describe 映像，並提供 `ctx.configForms.get(entryId)` 作為該映像上的逐 namespace selector。映像在開始後臺讀取之前安裝 `settings/document-updated` 和 `connection/reset` 監聽器，因此任何 settings 傳輸都不會阻塞外掛啟用，失效通知也不會掉入先讀取、後訂閱的空檔。每個共享條目表單會釋出一個供領域服務訂閱的快照 store（狀態、分節值、revision、可寫性、host／記憶體模式），自身不再增加協定讀取或監聽器。預設解碼器會對照該 namespace 自身的序列化 wire schema（經同包的 `ctx.settingsSchema` 服務還原）驗證每個傳入分節，因此各領域無需攜帶手寫的 wire 驗證器。領域服務把 scope 當作普通的建構函式協作者接收，立即釋出各自的暫定預設值：由瀏覽器派生的 locale、系統主題和 Queue；隨後採納已獲接受的 Host 分節，但不將其寫回；不帶 scope 建構的服務——獨立詞典或政策 fixture（測試前置資料）——則僅停留在程序本地。共享讀取與失效生命週期由後續的 [settings describe 映像決策](../../archived/architecture/2026-08-17-settings-describe-mirror.md)規定。

使用者修改立即更新即時偏好，並透過共享條目表單排隊提交帶修訂號檢查的修改。提供者為每個條目持有一個寫入佇列；消費者在解除安裝時釋放訂閱。提供者銷燬時跳過排隊工作、禁止遲到釋出，並等待正在執行的操作結束。

Client 在非 loopback 頁面停用 Host 持久化，因此這些頁面的偏好仍只保留在程序內，儘管 Connection 認證完整 API。動態第三方主題 id 仍是內建 Host schema 之外的程序內擴充功能；移除其中一個會重置即時註冊表，但不會替換上一個持久化的內建偏好。

## 曾考慮的替代方案

**保留 `localStorage`，並在不同埠間複製值。** 一個 origin 無法列舉另一個 origin 的儲存，而 Host 中繼會圍繞瀏覽器特有格式重新實作一套 settings 服務。

**將 Host settings 映像到 `localStorage`。** 第二個權威來源會要求另外定義啟動與失效時的衝突規則，同時依然保留造成該缺陷的分割槽。Host settings 文件是唯一的持久化真源。

**等待初始讀取，以避免暫定渲染。** 繪製頁面不以設定可用為前置條件。後臺讀取可能引發一次即時收斂，但它會隔離失敗，並保留既有的瀏覽器／系統／預設回落路徑。

**讓每個領域擁有自己的 settings 控制器。** 並行、revision、失敗、失效與釋放規則完全一致；此前的主題實作已因複製這些規則產生生命週期漂移。由領域持有 schema，可以避免把產品政策放入共享執行時。

**帶成對 sync/persist 回呼的逐欄位偏好控制器。** 第一版共享生命週期經領域提供的 `sync` 回呼同步單個標量欄位，服務則經注入的 `persist` 回呼寫回。這對相互依賴的回呼迫使建構分兩階段完成——寫入器先預設為無操作，稍後經 `bindPersistence` 替換——namespace 每新增一個欄位，本都得再攜帶一個自己的控制器和一次全文件讀取，且每個領域都重新宣告瞭一個已註冊 wire schema 本已表達的手寫驗證器。namespace scope 釋出一份供服務訂閱的快照並直接接受寫入，因此這對回呼與第二個建構階段都不存在。

**把每個 `localStorage` 條目都移入 settings。** 目前工作階段、草稿、面板展開狀態、trajectory 顯示狀態和類似條目屬於瀏覽器實例狀態，而非使用者設定。將它們提升為設定，會在沒有產品契約的情況下，跨標籤頁和埠同步短暫導航狀態。

## 後果

外觀、語言和忙碌時 Enter 偏好跟隨活躍 profile，跨重新整理、埠和迴環 origin 保持一致。ConfigEditor 和 volatile HMR 應用 profile 更改；表單映像透過 settings 失效通知跟隨已接受值。舊瀏覽器偏好鍵保持不使用。

啟動時可能會在後臺讀取結算前短暫顯示領域預設值。短暫的讀取失敗會保留該預設值或上一個正確的程序內值；重連時會重試。寫入被拒時，介面可能會在本地值立即變化後明顯恢復為持久化偏好。

聚焦的單元測試覆蓋 schema 註冊、先監聽後讀取的順序、非阻塞啟用、經 schema 驗證的分節接受、攜帶 revision 的有序寫入、陳舊回應隔離、故障恢復、釋放時完全停穩，以及遠端端僅記憶體模式。以 namespace 為粒度的 scope 也承載多欄位分節，因此後續的設定表面可以沿用同一份生命週期，而不必手搭 describe/mutate 同步。無金鑰 Web settings 情境透過 UI 寫入全部三項偏好，驗證 YAML 文件並確認舊 `localStorage` 為空，重新載入，再使用同一個 DSH home 在不同埠上啟動另一個 Host。
