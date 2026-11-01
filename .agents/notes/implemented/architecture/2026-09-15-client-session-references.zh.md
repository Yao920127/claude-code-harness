# Agent Note: Client Session 引用、引用來源與 UI 狀態

Status: implemented

[English](2026-09-15-client-session-references.md) | 中文

## 問題

Session 目錄、活躍 Client 物件、檢視與非同步操作具有不同生命週期。目錄成員關係不能證明仍在使用。借用的 binding 無法保護非同步工作，也無法區分同一 Session ID 的不同 Client 代。全域 current Session 會使獨立繫結的元件操作另一個檢視的 Session。

引用計數能表明仍在使用，但不能識別使用方。主區域高亮、Sidebar 所有權與後臺操作需要使用方來源資訊。待處理互動與完成提醒也需要統一的 UI 讀取介面，避免 Workspace 和 Conversation 各自組合相同狀態。

Client 歷史存取與 Host Agent（智慧代理）執行具有獨立生命週期。歷史開啟可能失敗；取得本地 Context 不一定需要讀取歷史。顯式所有權必須保持導航、載入、錯誤處理與恢復行為，不新增無關 UI 策略。

## 決策

### 範圍與所有權

Client Session 物件、Agent 作用域的 Client Context、引用、使用方來源中繼資料、UI 狀態與顯式 Provider 組合遵循下述所有權規則。Host Session 和 Agent 生命週期、SlotFactory、activity 列表檢視、持久 Session 格式及兩個 SDK 的 Host 協定保持獨立。

| 所有者 | 職責 |
| --- | --- |
| Client Session Controller | 目錄、活躍代、引用、來源計數、binding、歷史視窗與既有 Session 控制狀態 |
| `ui-session` | 顯式 Session Provider 整合與統一 UI 狀態來源 |
| 檢視或操作 | 自己的引用、目標、來源標識與釋放時機 |
| Workspace UI | 主區域目標與引用、導航、持久目標及建立流程 |
| UI 組合邊界 | 將所有者提供的引用交給一個明確的 `SessionProvider` |
| Conversation 與 Sidebar 子樹 | 只消費所在 Provider 的 Session，不讀取主區域引用或全域選擇 |
| Client Gateway | 處理 Host 事件時呼叫期的 Context 所有權 |

[Client 分層設計](../../implemented/architecture/2026-08-20-client-session-conversation-ownership.zh.md)定義資料、介面卡、渲染器與展示層的單向依賴。引用來源統計不會使 Controller 依賴 UI 包。

本決策部分取代 [Web Client Session scope 與 provide channel 決策](2026-07-25-web-client-session-scope-and-provide-channel.zh.md)中由 list 選擇驅動的 scope 生命週期；後者保留顯式 Provider 所有權下的 blank Session 與收養語義理由。

### 地址、binding 與引用

`SessionTarget` 是已知 `SessionId` 或持久的直接父子 `SubagentAddress`。它標識要取得的目標，不持有任何物件。Controller 解析顯式地址時不要求預先載入 parent catalog，Host 則在開啟歷史時驗證其 parent、child 與 mode。子工作階段發現與已知子工作階段地址均不等同於持有該子工作階段。導航使用同一種目標表示，不增加另一套導航地址。

`SessionBinding` 是共享的 Client 代，包含 `sessionId`、Session 介面、事件來源與作用域 Context。同一活躍代的多個引用共享這個 binding。同 ID 的新一代具有不同的 binding 和 Context。

`SessionReference` 持有某個確切代的一次使用。它公開只讀 `sessionId` 和 `binding`、表示共享首次歷史開啟的 `ready` Promise，以及冪等 `release()` 與 `Symbol.dispose`。對應 `Session.open()` 嘗試解析時，`ready` 解析為該確切 binding，包括以狀態表示的 Remote failure 結果。引用釋放或其代清理後，讀取 `binding` 會失敗。取得、釋放或檢視引用均不建立持久 Session，也不啟動、停止或持有 Host Agent。

`SessionBinding` 是借用值，不構成持有。只有未釋放的 `SessionReference` 計入來源與總引用數。同步程式碼可以在擁有者引用的生命週期內借用 binding；需要越過該生命週期的工作必須擁有自己的引用。

| API | 返回結果與呼叫方義務 |
| --- | --- |
| `sessions.retain(target, options)` | `SessionReference`；立即返回，呼叫方持有該引用直到釋放 |
| `sessions.using<T>(target, options, operation)` | `Promise<T>`；依次等待 `reference.ready` 與 `operation(reference)`，釋放自己的引用，並返回操作結果 |
| `sessions.retainInfo(id)` | 本地引用計數的穩定只讀 observable，不取得引用、不建立作用域，也不執行歷史 I/O |
| `sessions.scope(id)` / `sessions.binding(id)` | 借用已存在的活躍代或返回 `undefined`，不開啟它，也不延長其生命週期 |
| `sessions.sessionOf(ctx)` | 返回匹配的活躍 Session 介面或 `undefined`；已結束的 Context 不能解析為同 ID 替代代 |
| `sessions.create(...)` / `sessions.fork(...)` | 既有 Host 操作，返回 Session 身份；持有與展示仍需顯式執行 |

`SessionRetainOptions` 包含必填 `source: SessionReferenceSource` 與可選 `signal: AbortSignal`。兩個取得方法均接受 `target: SessionTarget` 和這些 options。來源鍵由使用方定義，透過宣告合併擴充功能；不提供執行時來源註冊協定，也不預設使用主檢視來源。來源是使用標籤，不是另一種 Session 地址，也不授予操作權限。

### 取得、失敗與釋放

取得操作同步解析目標，建立或持有本地 Session、Context、fiber 和 binding，記錄一份引用及其來源計數，啟動該代共享的首次歷史開啟，然後返回引用。並行取得共享這次開啟，但分別獲得獨立引用與就緒等待。共享的 `Session.open()` 嘗試解析時，`reference.ready` 解析為仍然有效的確切 binding。

未知 Session id 的定址在返回引用前失敗；顯式 subagent 地址由 Host 在開啟期間驗證。丟擲的開啟失敗、呼叫方取消、引用釋放或該代結束會拒絕該引用的 `ready`；取消一個等待方不會取消其他所有者共享的開啟操作。以 `openState: 'error'` 表示的 Remote failure 跟隨 `Session.open()` 語義並解析就緒，錯誤仍可透過 binding 渲染。呼叫方持有已返回的引用直到釋放，而 `sessions.using` 會在就緒或操作失敗時釋放自己的引用。

`using reference = sessions.retain(target, options)` 在所在作用域退出時釋放；需要等待首次歷史嘗試結算的程式碼等待 `reference.ready`。`sessions.using` 是面向回呼呼叫方的輔助方法：它先等待該次結算，再呼叫操作並等待操作返回的普通值或 Promise，最後釋放。回傳值不能依賴輔助方法已經釋放的引用仍可使用；需要更長生命週期的使用方自行取得引用。輔助方法傳播被拒絕的就緒與操作失敗，不提供後備結果、重試或錯誤展示。模型選擇的代際檢查與錯誤狀態更新保留在 ModelSelection。

`ready` Promise 成功表示首次 `Session.open()` 嘗試已經結算；它不保證 `openState: 'open'`，也不保證連線永不中斷。以狀態表示的開啟失敗與之後的流失敗繼續透過既有 Session 狀態公開。呼叫方保留對這些錯誤的既有處理與展示。

釋放只移除該引用及其來源計數。最後釋放在清理 Session 與 fiber 前撤回該代的准入和 ID 對映。後續 retain 可以立即建立新一代；舊代清理不能移除替代代。`release()` 同步發起本地清理，根清理等待尚未結束的非同步釋放工作。

所屬 Client 根在關閉時使全部引用失效。它拒絕新的取得，撤回活躍對映，並匯合作用域清理與 Session 流釋放。引用不能使已清理的 Client 根繼續存活。僅移除目錄記錄不會清理仍被引用持有的代。

### 引用來源與 Session 列表記錄

Controller 將來源計數與每個活躍代的引用共同管理。每個來源的計數等於該代尚未釋放且帶有該來源的引用數。同一 Session 可以有多個來源，同一來源可以持有多份引用。分配器不賦予任何來源特殊生命週期行為。

每條已有 Session 列表記錄公開只讀 `retainedBy`，由來源鍵對映到正數引用計數。未被持有的記錄使用空物件；零計數鍵不存在。取得失敗與釋放更新該投影，包括刪除最後一個來源鍵。Host 中繼資料重新整理時，來源計數仍是本地事實，Host 回應不能覆蓋它。

即使 Session 尚未進入 Host 目錄或其目錄中繼資料已被移除，計數仍由對應代持有。`byId` 包含 Host 摘要、子工作階段目錄投影行，以及已保留且具有明確直接父子地址的 subagent 後備行。取得引用時同步釋出缺失的 subagent 行，使 Provider 發現不依賴父目錄到達；標題投影和引用來源計數繼續更新該行。普通被保留 Session 不合成後備行。`ids` 仍表示 Host 列表成員關係與順序。未列出 generation 的使用方直接讀取其 binding 與 `retainInfo`。每條記錄的 `retainedBy` 投影均使用活躍代的計數。引用物件與計數均不持久化，也不傳送給 Host。

例如，`retainedBy = { mainView: 1, gateway: 2 }` 表示主檢視與兩個 Host 呼叫持有三份引用。釋放主檢視引用只移除 `mainView`；Gateway 呼叫繼續持有該代。範例中的來源名是使用方鍵，不是 Controller 內封閉的列舉。

`current` 表示主檢視佔用：記錄的 `mainView` 來源計數為正數時，就具有這個標記。這只是通用來源記錄的一種用途，不是獨立的 `sessions.current` 值或 Session 選擇服務。其他使用方可以從自己的來源鍵派生標記。引用系統不要求全域唯一使用方，也不從多個來源中選擇一個 Session。

主區域所有者管理自己的目標與引用切換。列表不根據恰好掛載了多少 Provider 推斷選擇。來源記錄反映實際所有權，包括取得期間的短暫重疊；UI 導航仍負責自己的目標，不把選擇權交給分配器。

視窗級使用方可以檢視來源標記。Session 業務操作仍使用傳入的作用域或顯式引用，不得從目錄中查詢 `mainView` 來補齊缺失的操作目標。後臺引用只能證明所有權，不能證明使用者檢視過 Session。

`SessionRetainInfo` 包含 `referenceCount` 與只讀 `retainedBy` 記錄。`sessions.retainInfo(id)` 獨立於目錄成員關係觀察本地所有權，並在同 ID 換代時保持穩定。沒有活躍代的身份具有零引用和空來源記錄；讀取該值不代表該身份在 Host 上存在。

`ui-session` 透過 `useSessionRetainInfo(sessionId, selector)` 讀取明確身份，透過 `useSessionRetainInfo(selector)` 讀取外圍 Provider 繫結的 Session。未繫結作用域向後一種形式提供缺失值，不退回到主區域 Session。兩種形式均由渲染器從相同的裸 retain-info 來源建構。使用方檢查 `mainView` 來源計數以識別原 current-Session 角色，其他來源鍵也可同等查詢。讀取或訂閱不會持有 Session。

### 統一的 UI Session 狀態

`ui-session` 擁有不依賴 React 的 `sessionStatus` 來源，透過標準 `useSessionStatus` 掛鉤公開。快照按 Session 身份索引，為每個已知 Session 提供一條 UI 狀態記錄。它組合下列獨立事實，不將它們壓縮成互斥的單一階段：

| 欄位 | 取值 | 含義與所有者 |
| --- | --- | --- |
| `running` | `boolean` 或 `undefined` | 最新已知的 Session 執行事實；缺少基線不表示已確認 idle |
| `pendingInteraction` | `SessionPendingInteraction` 或 `undefined` | 領域擁有的有效請求；沒有待處理請求時缺失 |
| `completionUnread` | `boolean` | 已觀察到停止、但尚未確認的 UI 提醒 |

來源計數以 `SessionListState.byId[id].retainedBy` 為準；UI 狀態讀取它以執行確認策略，不維護另一套引用註冊表。標題、Workspace 關聯、歷史、佇列和投影資料保留在各自的既有所有者中。

待處理領域保留 `SessionPendingInteractionMap`、請求身份、優先順序、釋出清理函式與解除安裝委託。統一狀態包含同一個有效請求物件，不複製請求，也不建立第二套待處理註冊表。Workspace 狀態指示器與 Conversation composer 選擇讀取 `useSessionStatus`，不再分別讀取 `useSessionPendingInteraction` 和 `useCompletedSessionIds` 掛鉤。

完成跟蹤訂閱已有 `api-session/status` 事件，避免 running 到 idle 的變化在合批目錄快照中丟失。Host 列表行（`ids`）建立初始與重連的 running 基線；目錄合成行與 retained 行保留獨立觀察到的狀態。pending 狀態下的空目錄不能證明 Session 已消失。更新規則如下：

- 初始 idle 基線不產生完成提醒。
- 觀察到 running 時清除舊提醒，並記錄執行基線。
- 從已知 running 變為 idle 時，僅在 Session 沒有主檢視持有的情況下設定 `completionUnread`。
- 獲得主檢視持有時清除提醒；無關來源的 retain 不清除提醒。
- 釋放主檢視持有不會為更早的一次停止補造提醒。
- 移除 Session 時清除其完成提醒與執行基線；待處理請求的清理仍屬於請求領域。

提醒表示觀察到的一次停止，不代表任務成功，也不代表某條排隊訊息完成。即使全域面板暫時隱藏 Conversation，主檢視所有權仍保持基於選擇的確認語義。本設計不提供 `ui-session/view-presence` 事件、已掛載 Provider 索引或 Provider 掛載時的隱式確認。

Session Controller 釋出執行與引用來源事實，但不擁有完成提醒集合、`consumeCompletion` 方法或待處理互動展示。引用取得不執行完成提醒業務邏輯。

### 顯式 Provider、並行 Conversation 與快取身份

唯一的 `SessionProvider` 可以繼承外層 binding，也可以用顯式 `session={reference | undefined}` 覆蓋本子樹。它不取得或釋放所有權。根 Provider 從 `mainView` 所有權標記解析主 binding，不維護另一份 current；並列或巢狀 Provider 隻影響各自子樹。顯式缺失保持缺失，不退回到主區域。

Provider 注入選定 binding，但不為整個 body 設定 key。嚴格 `session` entry 在 binding Context 改變時重新掛載。空白 `session-maybe` entry 接受首個 binding 時不重新掛載；接受後，切換到另一個 binding Context 或回到缺失狀態會建立新的元件 incarnation。

`uiWorkspace` 持有來源為 `mainView` 的主區域引用，`ui-session` 從該引用在 Session 記錄中的所有權標記建立根 Provider。Provider 下的 Conversation、右 Sidebar、preset、命令、輸入與模型元件只能讀取 Provider 繫結的標準資料。它們不得讀取主區域引用或全域選擇，也不得按 Session ID 重新尋找一個可能屬於其他 Provider 的 binding。

每個 Provider occurrence 以傳入的 `SessionReference` 建立獨立渲染作用域。兩個引用可以指向不同 Session，也可以共享同一 `SessionBinding`；不同 binding 的業務與觀看資料完全分離，同一 binding 的 Provider 共享 Session、Conversation、輸入等 Session 級資料，但保留各自的元件區域性狀態。主區域與 Sidebar 可以同時掛載兩個 Conversation，任一 Provider 的替換或解除安裝不改變另一棵子樹的目標。

`ui-session` 為每個活躍 `SessionBinding` 複用穩定的業務 observable。Conversation assembly、input shell、command popup、input-trigger controller 與 model directory 等代際快取以 binding 為弱鍵，不再以 Session ID 為鍵；需要列舉活躍值的快取使用 `util-values` 的 `WeakMapWithValues<SessionBinding, Value>`，由弱鍵表和強值集合共同維護身份查詢與值遍歷。該容器不執行清理；訂閱、控制器、URL 和其他資源仍透過 `binding.ctx.effect()` 確定性釋放。Provider occurrence 的觀看狀態隨該 Provider 的渲染作用域釋放，最終 generation 清理由 binding Context 負責。

Descriptor 變化先組裝替代來源再發布，不重建 Session 代。Provider 在讀取 reference 時驗證它仍有效；已經釋放、來自其他 Controller 或不再對應活躍 binding 的 reference 不能建立作用域。

| 使用方 | 取得與釋放 |
| --- | --- |
| 主 Conversation | `uiWorkspace` 取得導航目標；`ui-session` 從 `mainView` 標記建立根 Provider，Conversation 子樹只消費 Provider 繫結 |
| 關聯右 Sidebar | `RightbarRoot` 繼承根 Provider，不讀取主區域引用 |
| 獨立 Session 檢視 | 自己的所有者持有目標，並以自己的引用建立 Provider；與主區域同時執行 |
| Client 中的 Host 事件 handler | 持有本地 Context 引用直到 handler 與回覆結算 |

Conversation 的引用屬於其檢視所有者，不屬於 Chat、Trajectory 或某次點選。Chat、Trajectory、命令、輸入、上傳、圖片讀取與模型選擇在 Provider 生命週期內借用同一 binding；它們不按行動重複取得引用。切換或關閉該 Conversation 可以結束仍在途的本地工作。Sidebar tab 的佈局與資源所有權保持獨立；只有承載 Conversation 的 Sidebar 檢視所有者需要自己的 Session 引用。空佈局與 guide 佔位頁不持有引用。

作用域業務物件從 Provider 捕捉自己的 binding，不把舊 Context 或目錄重新解釋成同 ID 的新一代。ModelSelection 借用 Provider binding，並保留自己的選擇代際與錯誤規則。編輯器脫離回呼可能與作用域清理重疊；可選 trigger 和 popup 對已結束的 Context 返回空值，不解析其他 generation。

### 主區域導航與展示

`uiWorkspace.openSession`、`openWorkspace` 和 `startSession` 是導航入口。它們接受或解析明確目標，改變主檢視，並按既有導航策略將主區域返回 Conversation。側邊欄 `forkSession` 建立並重新命名子工作階段，不 retain 子工作階段，也不改變選擇。`retain` 本身從不導航。引用所有權不引入 `registerNavigation` 接收者協定，也不引入第二個導航服務。

現有 `uiWorkspace` 實作直接持有來源為 `mainView` 的主區域引用與目標。導航方法直接更新該所有者，不呼叫 Conversation 註冊的接收者。`ui-session` 根據來源標記把該引用對應的 binding 注入根 Provider；主 Conversation 和關聯右欄只繼承 Provider，既不依賴 `uiWorkspace`，也看不到主引用。獨立 Sidebar Conversation 以自己的 reference 建立巢狀 Provider，並覆蓋本子樹的 binding。主引用不是全域標準 prop、子樹 Hook 或按 ID 查詢的預設值。

主檢視在 `dsh.sessions.current` 下私下持久化目標身份與子工作階段地址，不儲存引用。啟動恢復、初始 Workspace 選擇與歸檔主目標後的清空仍屬於 UI。歸檔或移除目錄中繼資料不撤銷其他使用方持有的獨立引用。

| UI 行為 | 最終規則 |
| --- | --- |
| Session 列表高亮與空白記錄處理 | 從 `retainedBy.mainView` 派生主區域佔用，不按已掛載 Session Provider 的數量判斷 |
| New Session 的 Workspace | 優先使用顯式 Workspace，其次按既有查詢規則使用主 Session 的 Workspace，最後使用既有最近 Workspace 策略 |
| Onboarding | 判斷主區域 Session 是否缺失或為空白，不判斷所有歷史 Session |
| 瀏覽器文件標題 | Conversation 顯示 Session 標題與產品標題；全域面板顯示產品標題 |
| Chat/Trajectory 恢復 | 為顯式選中的主目標恢復檢視；獨立繫結的檢視保留自己的狀態 |
| Cordis inventory 面板 | 使用不區分 current/other 的單一列表；runner 不提供主區域選擇的公開 getter |

DOM 焦點移動或全域面板隱藏仍被持有的檢視時，來源中繼資料不變。[全域主面板設計](../../implemented/architecture/2026-09-08-global-main-panels.zh.md)擁有面板選擇與佈局；Session 引用所有權不替代它。

Conversation 保留 `hero`、`settling`、`active` 組合與既有歷史載入和 `openError` 處理。取得引用不增加外層 loading/error 階段展示、額外隱藏 composer 的條件、Retry 按鈕或替換 Sidebar 內容的恢復面板。已有錯誤處理方繼續處理自己的錯誤；沒有錯誤展示的呼叫點不增加展示。Promise 拒絕與正確釋放引用不意味著額外增加 UI 處理方。

Workspace 連線保持既有導航檢查與面板切換失效規則。側邊欄 fork 不替代尚未完成的導航。直接開啟 Session 不增加全域導航取消策略。Agent Team 重新整理保留髮起時選擇仍然有效的條件，不在重新整理前啟動全域導航 token。引用取得不擴大取消範圍，不影響無關導航或正在執行的操作；本地取消不復原 Host 效果。

### 預設與建立流程

預設目錄與部署預設值可以共享。已繫結 Session 的預設透過 Provider 的 binding 讀取或修改；預設控制器按 `SessionBinding` 快取，不由根級 current-Session 跟隨器管理。Hero 的 preset seat 使用 `session-maybe` Provider：沒有 Session 時顯示建立流程選擇，繫結空白 Session 後操作該確切 Session。標題標籤讀取同一 Provider 繫結 Session 的投影。

Session 建立前選擇的 preset 保留在主 Conversation 的 `session-maybe` preset surface 中。Workspace 建立或複用空白 Session 並建立主 Provider 後，該 surface 將選擇應用到 Provider 繫結的 Session。設定頁修改預設 preset 時，preset 服務從 Provider 已建立的 binding 快取中選擇帶 `mainView` 所有權標記的空白 Session，並更新該 Session。非空白主 Session、Sidebar 的獨立 Provider 與其他後臺引用均不受該設定動作影響；preset 子樹不讀取主引用，也不透過全域 current follower 尋找目標。

### Host 事件 Context 所有權與 Typert

經驗證的 Host waterfall（瀑布式事件）身份可以先於目錄發現到達。Client Context 解析器必須保持同步。它帶上 Gateway 的來源取得本地代引用，返回 `TypertOwnedValue<Context>`，不開啟歷史，也不重新整理子目錄。需要歷史的 handler 另行取得公開引用並等待其 `ready` Promise，或使用 `sessions.using`。

Gateway 持有本地引用，直到 handler 使用與回覆結算均結束。Context 取得失敗保留既有的記錄錯誤並委託語義，handler 失敗產生拒絕回覆。取消透過已有 signal 到達 handler，並抑制晚回覆，但不會在 Context 仍被使用時提前釋放。外掛關閉匯合目前連線代的在途 handler；Connection 只在該來源結算後啟動替代代。

`TypertOwnedValue` 跨通用 Gateway 傳遞值及其清理操作。它沒有額外引用計數，也不要求 Gateway 理解 Session 專用所有權。獨立 Client bundle 共享 owned-value 標記。Client 發請求的 `identity(ctx)` 保持同步；Host Context 解析與 Host 生命週期不變。

## 考慮過的替代方案

**以目錄成員關係作為所有權。** 發現資料無法證明檢視或操作仍在使用，而且部分 Context 身份先於目錄成員關係到達。

**隱式主 Session 加顯式替代路徑。** 兩套目標解析規則會使可複用元件依賴其渲染位置。顯式 Provider 提供目標，通用來源記錄服務於視窗級觀察。

**Provider 子樹繼續讀取 `mainSession`。** 同一元件會同時擁有 Provider 與視窗級目標，Sidebar 的獨立 Conversation 也會被主區域變化重定向。主引用只參與 Provider 裝配，子樹只讀取 Provider。

**以 Session ID 為代際快取鍵。** 最終釋放允許同 ID 新代在舊清理結束前出現，ID 鍵會複用舊物件或讓舊清理刪除新物件。業務快取使用弱引用的 binding 身份，資源清理由 binding Context 負責。

**只在歷史開啟後解析的非同步 `retain`。** 它會把 Provider 安裝與主檢視導航推遲到歷史到達之後，導致既有載入狀態無法立即渲染。同步引用把所有權與顯式的 `ready` 結果分開。

**在同步 Context 解析中執行歷史 I/O。** Host 事件派發需要作用域生命週期，不一定需要歷史視窗；耦合兩者會在目錄發現之前延遲或阻止 handler。

**專用 current 標誌。** 一種使用方專用標誌無法描述 Sidebar 與後臺所有權。主檢視標記可以從通用的按來源計數中派生。

**Session Controller 中的完成狀態，或獨立的待處理與完成提醒掛鉤。** 完成確認屬於 UI 策略。統一 UI 狀態來源組合獨立事實，同時保留領域擁有的待處理物件與 Controller 擁有的執行事實。

**以 Provider 呈現決定確認或釋放。** 掛載既不等於所有者生命週期，也不等於基於選擇的確認。它無法決定哪些後臺或暫時隱藏的使用仍應存活，或應當算作已檢視。

**Provider 中的裸 ID 或全域 binding revision。** ID 不表達代際所有權，全域重新整理會使無關 Session 使用方失效。

**每個行動各自取得引用。** Provider 已經定義 Conversation 的使用生命週期；為每次點選重複持有會把檢視所有權拆成大量細粒度來源。只有明確需要越過 Provider 生命週期的工作才另行持有引用。

**導航註冊、新的取消策略與取得專用恢復 UI。** 引用所有權要求顯式目標、釋放與失敗傳播，不要求額外導航或恢復行為。

**Client 引用持有 Host Agent。** 歷史存取與 Host 執行是獨立使用需求，長時間開啟的 Client 檢視不能定義 Host 業務操作生命週期。

## 驗證

- 取得測試覆蓋共享首次開啟、普通與意外開啟失敗、獨立等待方取消、確切代替換，以及根清理達到完全停穩。
- 來源測試覆蓋多個來源、同來源多份引用、取得失敗復原、冪等釋放、目錄重新整理或移除，以及舊代的晚釋放不改變替代代。
- Retain-info 掛鉤測試覆蓋明確身份、Provider 繫結預設值、未繫結與巢狀作用域、跨代來源更新，以及讀取不建立引用或請求歷史。
- 作用域與 Gateway 測試覆蓋目錄發現前不執行歷史 I/O 的同步 Context 取得、取得失敗的記錄與委託、handler 的拒絕回覆、取消與結算期間的所有權，以及跨 bundle 共享的 owned-value 標記。
- UI 狀態測試覆蓋待處理優先順序與清理、會被快照合批丟失的事件變化、初始與重連基線、主來源確認、無關來源持有，以及不存在 Provider 呈現事件。
- 檢視驗證覆蓋兩個不同 Session 和同一 Session 多次使用的並行顯式 Provider、互不重定向的 Conversation、獨立 Slot store、作用域 preset、descriptor 更新，以及沒有新恢復控制元件的 Sidebar 生命週期。
- 實際組合瀏覽器情境保持主區域高亮、空白記錄、onboarding、Workspace 預設值、標題與約定的導航或錯誤行為。只有 Client 所有權改變時，已有模型輪次錄製仍作為行為輸入。
- 公開 `retain`、`using`、Provider、生成 API 目錄、包約定與型別檢查對 options 和所有權保持一致。Provider 子樹不讀取主區域引用，獨立所有者各自釋放自己的引用。

## 後果

使用方必須把引用保留到真實結束點；在活躍 Client 根內，未釋放引用仍會洩漏。最後釋放後再次 retain 會建立新一代，並可能重新開啟歷史。來源計數描述所有權，不描述可見性、任務成功或操作權限；以主標記作為業務後備會重新引入隱式 current-Session 耦合。

最後一份 reference 釋放後，未持久化的 binding 自有狀態會被丟棄，包括已載入的歷史頁、Chat 滾動錨點、預覽換行、Files 展開狀態、composer 附件和 undo 歷史。只有持久化的 Session-keyed Store 值或由另一份 reference 保活的 generation 能跨檢視切換保留；runtime 不會清除這些持久值。

每次公開 `retain` 都會啟動該 generation 共享的首次歷史開啟，包括普通 Session 重新命名所用的臨時引用。Fork 標題設定直接傳送 rename 並應用返回的投影，不取得 Client 引用，也不讀取歷史。因此，僅修改中繼資料的 fork 操作不會建立列表臨時行或切換主檢視。

目錄、UI 狀態與檢視目標由不同所有者管理，可以獨立釋出。使用方不能僅從通知順序推斷生命週期變化。主檢視仍是普通引用所有者，其導航與展示規則留在 UI，不進入引用分配器。
