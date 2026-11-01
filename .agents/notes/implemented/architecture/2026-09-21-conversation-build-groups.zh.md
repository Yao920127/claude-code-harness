# Agent Note: Definition 擁有分組業務，框架統一排程 Node／Group 輸出

Status: implemented

[English](2026-09-21-conversation-build-groups.md) | 中文

## Problem

Chat 需要把連續過程內容收進可展開的組，同時保留獨立回覆、使用者輸入和輪次控制元件。Compact、Detailed、Expanded 必須共用分組結果；切換模式不能透過刪除組容器、移動成員父級或更換 key 重建 React 實例。

Chat Builder 彙總整個目標的節點及索引。在其中固定建立 Chat 過程投影器，即使把部分快取移到通用層，仍然讓 Builder 擁有業務分段。業務 Definition 才是這些規則的註冊點。

過程組與 Step 正交：同一個 Assistant Node 可以把推理放在組內、回覆放在組外，回覆後的工具進入後面的組。Step 編號範圍無法描述這種成員歸屬。現有事件 Definition 逐個解釋事件，分組則需要這些 Definition 已經解釋完成的節點。

寬鬆的基準預算不能證明分組更新具有區域性性。按鍵通知、元件身份、瀏覽器佈局與常駐記憶體是不同的性質，透過其中一項檢查不能證明其他性質。

## Decision

分組基礎機制提供獨立的節點輸入 `ConversationGroupDefinition`、註冊表及 Session 內上下文、Builder 通用輸入與釋出、按鍵 Group 儲存及兩種 React 分支。Chat 在[業務規則參考](../../../../packages/client/ui-chat/src/client/conversation-nodes/README.zh.md)中擁有其已註冊的分段與展示規則。[子系統參考](../../../../docs/subsystems/conversation.zh.md#group-definitions)與[原始碼型別](../../../../packages/client/ui-conversation/src/client/contract/groups.ts)擁有目前 API 細節。

### 職責

| 要求 | 含義 |
|---|---|
| 分組業務屬於已註冊 Definition | 成員、分段、回覆、steering、重試、摘要和快取失效放在一起。 |
| Builder 與 assembler 做統一工作 | 提供輸入、排程 Definition、驗證引用、複用身份並行布，不建立具體分組類。 |
| PR #4565 提供產品參考 | Chat 業務規則參考擁有目前行為及已確認的調整。 |
| React 根迴圈只有兩種 kind | 根順序包含 NodeReference 和 GroupReference，不引入另一套佈局物件模型。 |
| 所有模式共用分組 | 模式不進入 Definition 輸入、key 或父級選擇。 |
| 不採用 buildLayout | ConversationViewDefinition 保留現有職責。 |
| 業務屬於目標包 | Chat 擁有過程分組、摘要、通知和頁尾行為，通用組裝不解釋這些業務。 |

### 與已有記錄的關係

| 記錄 | 關係 |
|---|---|
| [業務節點組裝](2026-08-09-client-conversation-node-assembly.zh.md) | 保留事件匹配、Context、Location、每個 Context 一個業務 Node 及目標 Builder，分組增加另一種輸入類別。 |
| [Chat 滾動與頁尾](../bug-fix/2026-09-22-chat-scroll-follow-and-footer-geometry.zh.md) | 負責裁剪與獨立的巢狀跟隨，不改變 Group Definition 成員關係。 |

分組保留獨立的節點組裝決策。跨 View 導航與 `toolCallFocus` 仍是獨立職責，Group 引用不攜帶 View 控制代碼或資源導航策略。

## Definition 輸入、狀態與註冊

`ConversationNodeDefinition` 保留 `match/start/update/publication/buildLocationData/buildViewNode`，`ConversationViewDefinition` 保留 `target/create/isActive/toolCallFocus`。分組業務透過 `ctx.uiConversation.groups.register(processGroupDefinition)` 註冊，不加在上述已有 Definition 的回呼中。

- 每個目標只有一個 Group Definition，擁有完整分組語義。重複目標註冊報錯，不選擇勝者，也不疊加策略。
- 註冊要求已有 View 目標，但不建構 Builder。首次啟用取得 Builder 後檢查 `groupInput()`，缺少輸入方法時報錯。未分組目標不要求該方法，也不分配 Group 狀態。
- 每個 Session 為已註冊 Definition 擁有一個派生上下文。`create()` 初始化 State，不是 `turn/start` 事件，也不是事件 Definition 的唯一 start Match。Definition 物件不儲存跨 Session 的可變狀態。
- `update(context, input)` 返回框架採納的 State。`buildGroups(context)` 物化待輸出結果，不重新解釋事件，不因重複讀取增加計數。替換輸入要求輸出完整根序列和組替換，避免已移除節點留下懸掛引用；apply 的 `null` 保留結果。
- `replace` 提供目標順序、時間線及同步的 `readNode`、`readTurn`、`readPosition` 讀取器；`apply` 還提供投影后的節點前後值、`changedTurns` 和 `changedTurnOrders`。讀取器僅在目前同步呼叫中有效，不保留到 State。
- 節點資料仍在目標 Node Store。僅正文更新保留順序陣列；舊值在 Builder 安裝投影結果前記錄，也覆蓋目標投影額外改變的節點。
- `ConversationLocationIndex` 從邊界事件和 Location 資料寫入累計變化輪次。assembler 將同一批變化交給全部被更新目標，覆蓋沒有節點 upsert 的 Turn 結束。直接呼叫未分組 Builder 的呼叫方可省略該欄位。
- 目標位置索引透過 `changedTurnOrders` 提供可見鍵、所屬 Turn 或緊鄰關係的變化，包含移動 Node 的新舊所屬輪次，以及受相鄰輪次外 Node 影響的輪次。`readTurn` 返回某個 Turn 的可見鍵，`readPosition` 返回包含所屬 Turn 和前後緊鄰鍵的 `GroupNodePosition`。僅按 Turn 讀取會遺漏輪次外 Node 造成的分隔，業務分段可以透過相鄰事實保留這些分隔。索引提供位置，不決定分組。
- 通用 GroupDataMap 在註冊、儲存及讀取之間關聯目標和 Data。未宣告的目標沒有組載荷型別，業務消費方不透過 unknown 斷言恢復摘要型別。

## Node／Group 引用與更新

`NodeKey` 表示既有 Context Node，`GroupKey` 在 Session、目標及 Definition 內標識組。`NodeReference` 與 `GroupReference` 在 `RenderEntry` 中地位相同。`GroupSnapshot<Data>` 單獨儲存組的不可變資料與有序 NodeReference 成員，不混入根順序。建立 Group 不增加 Session 事件或執行生命週期。

`groupPart` 是渲染器擁有的節點部分，例如 reasoning 或 response，省略表示整個 Node。部分引用也可以獨立位於根層。部分內容的完備性和歸屬由業務渲染器負責，不由框架判斷。組資料描述狀態、計數或摘要，不複製 Node 正文、工具結果或可變業務 State。組不攜帶 renderer 欄位、CSS、座標、React 元素、導航或巢狀組。

| 更新 | 含義 |
|---|---|
| apply 輸入省略 `entries` | 保留根順序；替換輸入必須提供完整序列。 |
| 提供 `entries`，包括 `[]` | 替換完整根序列，空陣列清空根序列。 |
| `groups: { kind: 'replace', snapshots }` | 替換完整組記錄，移除未包含的舊組。 |
| `groups: { kind: 'apply', upserts, removes }` | upsert 完整快照，只按具名 GroupKey 刪除組。 |
| 僅資料變化 | upsert 新 data，複用 members，省略 entries。 |
| 僅成員變化 | upsert 該組完整的新成員陣列，不替換全部組。 |
| 僅根順序變化 | 提供 entries，apply 的 upserts/removes 為空。 |
| 解散一個組 | 原子地用成員替換根引用並刪除 GroupKey，保留原 Node。 |

`entries` 與 `groups` 屬於同一安裝批次，不是獨立釋出通道。刪除成員引用不刪除 Node。upsert 需要快照內容，刪除只需要身份。真實成員歸屬變化可以讓 React 重掛載成員，但模式切換不能解散組。

儲存在修改前驗證最終提交結果：每個根 Group 恰有一份記錄和一個根位置；Node 引用存在；重複 upsert、重複刪除及同時 upsert/刪除均報錯。全部根和成員中，每個 `(NodeKey, groupPart)` 最多出現一次。整 Node 不能與自身任一部分共存，不同部分可以佔據不同位置。允許引用在一次原子更新中移動位置。

GroupStore 按 GroupKey 索引記錄和來源，不反覆查詢陣列。等價根陣列、成員陣列及未變化組快照保留身份。僅資料 upsert 只檢查提交的快照，不掃描根、未變化成員或 Node。完整替換重新驗證引用，仍按 key 對齊結果。Definition 快取擁有業務計算，GroupStore 擁有已安裝結果及通知。

## 組裝時序與生命週期

1. BoundConversation 從現有 feed 接收 append、prepend、replace 或 Assistant settlement。
2. assembler 執行既有 Node Definition 匹配、狀態更新及必要的 Context 重放。
3. 既有 immediate/animation-frame/none 節奏排程釋出，分組不增加計時器或事件訂閱。
4. flush 依次物化 Step、Turn Location 資料及目標 Node。
5. Builder.replace/apply 安裝投影后 Node、目標順序及索引，記錄位置變化，保留包含索引讀取器的 GroupInput，不通知獨立來源。
6. assembler 取得目標已註冊的 Group Definition 上下文，以 builder.groupInput() 呼叫 update，採納返回 State。
7. 呼叫 buildGroups，驗證並安裝結果，安裝目標快照。
8. 全部受影響目標安裝完成後，呼叫 Builder.publish，釋出 Group 來源和 Location 資料。
9. BoundConversation 釋出既有根 Conversation 來源。

首次啟用的 replaceView 與普通 flush 使用同一目標更新函式。未啟用目標不建立 Builder 或 Group 上下文。註冊重建一併採納 View 和 Group Definition，丟棄被替換或刪除的 Group 上下文並清空舊觀察結果。未替換的 Definition 複用按鍵儲存。React 接收 Node Store 身份，讓儲存替換時重新繫結按鍵掛鉤，不替換 key 或 DOM 實例。

已註冊的 View Definition 被移除後，分組計算暫停並清空派生結果，Group Definition 註冊仍保留。View 恢復時沿現有替換流程，從目前已載入時間線重建。首次註冊 Group 時仍拒絕缺失的 View 目標；切換頁籤不會登出 View。

分組不重放原始事件。Node Definition 先處理重放，分組消費其最終目標替換或變化。prepend 可以修正邊界並真實移動成員。Definition 處理新舊 Location 和變化輪次，不把分頁或每個正文分片都當作完整歷史重新分組。

## 具體實作落點

| 層／檔案 | 職責 |
|---|---|
| [groups.ts](../../../../packages/client/ui-conversation/src/client/contract/groups.ts) | Group Definition、輸入、引用、更新、型別資料對映及讀取器。 |
| [conversation.ts](../../../../packages/client/ui-conversation/src/client/contract/conversation.ts) | Builder 可選 groupInput/publish 和快照儲存 grouped 讀取，已有 Node/View Definition 不變。 |
| [group-registry.ts](../../../../packages/client/ui-conversation/src/client/conversation/group-registry.ts) | 複用註冊表基類，目標唯一性、型別化註冊及 effect/disposer 生命週期。 |
| [assembly.ts](../../../../packages/client/ui-conversation/src/client/conversation/assembly.ts) | UiConversation.groups 與現有 binding 重建通知。 |
| [assembler.ts](../../../../packages/client/ui-conversation/src/client/conversation/assembler.ts) | 首次啟用和 flush 共用排程，上下文歸屬、安裝及釋出。 |
| [location-index.ts](../../../../packages/client/ui-conversation/src/client/conversation/location-index.ts) | 累積變化輪次，覆蓋僅生命週期和 Location 資料變化。 |
| [group-store.ts](../../../../packages/client/ui-conversation/src/client/conversation/group-store.ts) | 原子引用驗證、按鍵來源、陣列複用及區域性發布。 |
| [chat-snapshot-builder.ts](../../../../packages/client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts) | 記錄投影后節點增量、目標位置及變化輪次順序，提供索引讀取器並推遲來源通知，不持有過程分組類。 |
| [ChatView.tsx](../../../../packages/client/ui-chat/src/client/chat/ChatView.tsx) | 讀取可選根引用並切換 node/group，無分組時使用既有 Node 順序。 |
| [ChatGroupSeat.tsx](../../../../packages/client/ui-chat/src/client/chat/ChatGroupSeat.tsx) | 穩定組父級、組內訂閱及巢狀 Node 容器。 |
| [ChatNodeSeat.tsx](../../../../packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) | 既有 Node 來源及渲染器、groupPart 傳遞、獨立部分錨點及 Store 替換時重繫結。 |
| [slots.ts](../../../../packages/client/ui-chat/src/client/contract/slots.ts) 與 [apply.ts](../../../../packages/client/ui-chat/src/client/apply.ts) | 使用現有按鍵掛鉤注入 Group 來源，不改 Slot 引擎。 |

## React 讀取與展示

根層透過既有 useConversation 來源選擇 `views.grouped('chat')?.entries`。按鍵 Group 掛鉤沿用現有注入，Group 容器選擇 members。成員使用既有按鍵 Node 來源。根列表移除元件前，已刪除 Group 來源可能先返回 undefined，因此選擇器允許不存在，並保持掛鉤順序穩定。

React key 由引用 kind、NodeKey/groupPart 或 GroupKey 的無歧義元組派生，不另設 RenderKey 型別或 renderer 分發欄位。Compact、Detailed、Expanded 保留同一組容器及成員父級，展示變化不重新執行 Group Definition，也不選擇不同的根分支。

穩定 Group 父級使用可測量的 `div`，正文擁有組內限高滾動，內容盒子報告尺寸增長。CSS 繼承仍然可用，業務樣式適應子級／兄弟選擇器。CSS 變數和幾何資訊都不進入 Definition。閱讀位置取樣測量成員 Node，保留部分專屬錨點；既有輪次導航將原 NodeKey 解析到它的第一個可見部分。

展示通道將每個儲存模式對映為穩定策略物件。Seat 和 renderer 選擇自己使用的欄位，不透過所有 renderer 直接傳遞模式 prop。模式變化不註冊 Definition，也不重放 Context。整輪摺疊資格使用本輪已載入的生命週期事實，不依賴整個 Session 的分頁完成狀態；半截歷史的摺疊規則由業務參考定義。組開合保留在元件本地狀態中，顯式收起整輪透過注入 Hook 重置參與摺疊的內部開合，不更換 key。

## Alternatives considered

**Builder 持有 buildGroups 或過程投影器。** 不採用，目標彙總器仍然擁有業務規則，把快取移到通用層不能改變歸屬。

**在原事件 Definition 加 buildGroups，不補輸入。** 不採用，回呼名稱不能提供跨節點輸入、生命週期變化或重建語義。

**Group Definition 重放原始事件。** 不採用，它重複 Assistant、Tool、Message 解釋，並可能偏離 Builder 最終可見順序。

**ConversationViewDefinition.buildLayout。** 不採用，它把目標工廠擴充功能成業務佈局回呼，沒有獨立註冊業務 Definition。

**每個 Group 一個事件 Context。** 不採用，邊界取決於前方可見內容，不由一個攜帶組起點身份的事件決定。目標內派生上下文也能處理 Turn 外獨立節點。

**依賴圖、ViewItem 類、工廠、巢狀組或策略疊加。** 本階段不採用，一個目標輸入和一份非巢狀分組輸出覆蓋目前訴求。

**獨立的資料更新操作。** 不採用，複用 members 的不可變快照 upsert 已經能更新摘要，不替換其他組。

**Group Definition 同時增刪 Node 和 Group 實體。** 不採用，Node 資料已有所有者，引用對稱不需要第二個 Node 所有者。

**Expanded 移除組容器。** 不採用，即使 key 不變，父級改變仍會重掛載成員。

**讓首成員或每 Step 的 Context 承載組頭。** 首成員組頭把組 UI 耦合到任意業務行。每 Step 的身份無法區分同一步內的多個組，共享整輪聚合資料還會重新整理無關組頭，或讓後續 Step 的讀取過期。

**一個事件 Context 輸出多個 Node，或派生子 Context。** 多數事件 Context 只擁有一個 Node，陣列增加間接層卻不能解決跨 Node 分組。父級派生 Context 需要轉發、重放及移除生命週期，只有派生實體需要獨立於分組的這些生命週期時，才值得另作框架決策。

**常駐全部 Markdown，或靠重掛載重置 renderer。** 保留輕量 Seat 不意味著需要常駐所有完整 Markdown 正文。完整正文仍由開合狀態控制，顯式重置避免銷燬無關 renderer 狀態。一次性引入 #4565 的全部改動還會混合獨立視覺變化與分組成本，難以判斷導致退回的具體行為。

## Verification

- [Group 儲存測試](../../../../packages/client/ui-conversation/tests/conversation-group-store.client.spec.ts)覆蓋原子引用驗證、根與成員身份複用、區域性發布，以及刪除組但保留原 Node。
- [分組排程測試](../../../../packages/client/ui-conversation/tests/conversation-groups.client.spec.ts)覆蓋首次啟用、僅生命週期輸入、註冊替換、View 移除與恢復，以及完整替換輸出。[Assembler 測試](../../../../packages/client/ui-conversation/tests/conversation-assembler.client.spec.ts)覆蓋變化輪次報告和 Location 資料來源。
- [Node 來源測試](../../../../packages/client/ui-chat/tests/chat-node-source.client.spec.ts)覆蓋投影后的分組輸入、索引讀取器和空變化批次。
- [Chat 渲染測試](../../../../packages/client/ui-chat/tests/chat-view.client.spec.tsx)保留模式切換時的元件狀態，重繫結替換後的 Node 儲存，傳遞獨立部分，並省略未引用 Node。[視口測試](../../../../packages/client/ui-chat/tests/chat-viewport.client.spec.ts)覆蓋組內閱讀錨點、歷史前插及部分感知的輪次導航。

業務行為透過按鍵更新迴歸與已錄製的 Web 回放驗證。

| 證據 | 必須觀察到的結果 |
|---|---|
| 按鍵通知與 React 更新 | 正文增長影響所屬 Node 和相關 Group；未變化歷史行及其他 Turn 沒有額外通知。模式變化保留 key 與成員父級。 |
| 已錄製的 Web 回放 | 目前可存取標題、組開合、普通 Context 隱藏、觸發通知及頁尾位置與提交的預期輸出一致。 |

[已錄製的 Web 情境](../../../../apps/web/tests/steering.e2e.ts)透過正式 Web profile 覆蓋線上 steering、重連線續與分組展示。這些行為檢查不構成量化延遲或記憶體改善的證明。

## Consequences

- 這是明確的框架擴充功能，包含新輸入協定、註冊表、上下文、釋出階段及讀取器，不只是增加一個回呼。
- 目標內 State 不會自動讓業務更新區域性化，Definition 可以根據節點變化和輪次順序變化選擇受影響的組及範圍。結構變化仍按可見順序重建目標位置索引，僅正文更新不重建該索引。結構性分組輸出仍替換完整根引用陣列。
- Node 順序及可見性只有 Builder 一個所有者，分組不獨立排序原始事件，也不在通用層再次推斷成員。
- 穩定掛載不消除佈局、繪製或保留記憶體的成本，不宣稱實測延遲或最優效能。
- 真實組拆並、首成員變化及分頁修正可以改變身份，模式切換保證不禁止這些正常變化。
- 隱藏部分的揭示、選擇複製、中斷提示、組開合與外層 Turn 聯動屬於 Chat 業務適應，僅憑通用引用測試不能確認這些行為。
- 整輪狀態與用時替代舊工具／訊息計數標題，因此狀態、可存取名稱和空過程輪次需要明確的展示覆蓋。隱藏普通 Context 時保留非人工喚醒通知及原始 Session／Trajectory 檢視能力；頁尾定位依賴真實 Turn 結束，不依賴分組成員。
