# Agent Note: Web subagent 目錄與使用者繼續互動

Status: implemented

[English](2026-07-27-web-subagent-conversations.md) | 中文

## 問題

由工作階段支撐的 subagent 具有持久化身份、持久化 transcript（文字記錄）與直接 child 目錄，但普通工作階段譜系無法將它們與 fork 區分開，也無法證明其描述符 mode 與繼續執行授權。否則，繫結到 agent（智慧代理）的通用 Host 操作可能在其直接 parent 繼續執行 owner 之外恢復或驅動 child。

瀏覽器必須遵守[可繼續 subagent 約定](../../implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)：一個可繼續 child 在程序內最多只能有一項 Activation，只能透過確切的存活直接 parent 接受後續工作，並將 agent inbox 用作唯一的 FIFO。檢視歷史不得建立 Activation。inbox 訊息一經接受，HTTP 呼叫方既不擁有其執行過程，也不會獲得取消控制代碼。

UI 還必須保留[持久化目錄](../architecture/2026-09-01-parent-owned-subagent-catalog.zh.md)的成員與 mode。Web 投影會新增確切 child Agent driver 的 `running` 或 `inactive` 狀態。這兩種活動狀態都不是持久化結果，也不承諾繼續執行會成功。

## 決策

Web 產品透過頁頭的目前 title 譜系區域公開選中工作階段中由工作階段支撐的直接 subagent。使用者可以懶載入展開後代目錄，並在現有對話區域中開啟任一 mode。one-shot child 永久只讀。可繼續 child 只有在其確切直接 parent agent 存活時才接受使用者後續訊息；否則，其持久化 transcript 仍然可讀，並附帶恢復說明。

同一個頁頭行還可以把 child 作為 `dsh-resource://subagentchat/session/<childSessionId>?parent=<parentSessionId>&mode=<mode>` 在右側 Sidebar 開啟。開啟時優先使用獨立分欄；無法分欄時退回到目前分欄。Sidebar tab 使用共享 Conversation Component Factory 渲染並省略寬度控制，因此主對話與嵌入式對話共用一套組裝，而不共享佈局介面。

每個開啟的 child 都攜帶目錄派生地址 `{ parentSessionId, childSessionId, mode }`。選擇專用歷史與提示詞傳輸的是包含 mode 的地址，而不是譜系或粗粒度 origin 標記。歷史操作會從持久化儲存讀取工作階段，而不觸發啟用。可繼續提示詞透過 `subagent.prompt` 攜帶 Queue 或 Steer 投遞，並在 inbox 接受訊息時以 `{ messageId }` 成功返回；它不會公開 Activation、等待完成或返回結果。相鄰 Agent 的模型訊息使用單獨擁有的固定 Steer 操作。

通用 Host 領域遵守同一所有權邊界。`session.history` 與 `session.fork` 的源端會讀取已附加 Session 或檢查持久化儲存，而不取得 Agent；history 從所檢查的確切字首歸併冷態投影值，fork 則釋出一個普通的獨立工作階段。繫結到 Agent 的通用工作階段、命令與目標路由會對由工作階段支撐的 subagent 返回 `agent-busy`；顯式 id 的 `session.create` 接納與僅針對已附加工作階段的佇列控制元件亦然。拒絕分類器接受粗粒度 `origin` 標記、工作階段自身字尾中的 `subagent/descriptor`，或 parent 對其確切的存活執行時所有權；這些訊號只會阻止通用路徑取得所有權，絕不取代目錄 mode 或直接 parent 授權。

停止一個已定址 child 絕不退回到 `session.cancel`。瀏覽器 prompt 投遞只負責訊息被 inbox 接受前的准入，不授予取消控制代碼；正在執行的可繼續 child 透過專用的 `subagent.interrupt` 路由停止，遵循[目前輪次中斷約定](2026-08-06-continuable-subagent-interrupt.zh.md)，該約定會停放並保留待處理工作，而不是將其丟棄。one-shot child 在 Web 端仍不可取消。

本決策涵蓋 Web 端發現、transcript 檢視與經 parent 授權的使用者繼續互動。它不會讓 subagent 成為使用者獨立所有的物件；這類產品仍然屬於[互動式 side session](../../proposed/feature/2026-07-08-interactive-side-sessions.zh.md)。

## 設計上下文

Figma 中的 [subagent 列表](https://www.figma.com/design/jRBBK7zBgcszdVWQ0Fh5J8/Harness?node-id=383-14602&p=f)、[層級展開](https://www.figma.com/design/jRBBK7zBgcszdVWQ0Fh5J8/Harness?node-id=383-15917&p=f)與 [child 對話](https://www.figma.com/design/jRBBK7zBgcszdVWQ0Fh5J8/Harness?node-id=388-18584&p=f)畫框是非規範性的互動與視覺參考。本記錄負責生命週期、協定與失敗語義。

| 設計意圖 | 已交付約定 |
| --- | --- |
| 工作階段頁頭可開啟緊湊的 child 列表。 | 觸發器統計 parent catalog service 返回的健康直接條目。 |
| 選擇一行會複用對話 UI。 | 已定址歷史絕不啟用 child；只有 parent 存活的可繼續行才保留普通輸入框。 |
| 巢狀 agent 會逐層展開。 | row 在自身 catalog 成功載入為空前保持可展開；展開時只載入該直接 catalog，並保留 row 的 parent 地址。 |
| 條目顯示 label、狀態、token 用量與活躍耗時，同時避免側邊欄條目重複。 | mode 與 `running`／`inactive` 活動狀態會同時以文字和視覺呈現；可選 title、持久化 token 用量與活躍輪次耗時來自列表保留的投影值。緊湊耗時從一天起省略更小的單位，而懸停和無障礙名稱仍保留精確的整秒數。`SessionHeader.origin` 會移除重複的導航條目，但不授予任何能力。 |

## 產品約定

直接 catalog 有子項或讀取失敗時顯示 child 數量控制元件；空目錄缺席、載入中或成功讀取為空時均隱藏該控制元件。普通工作階段會用斜槓分隔目前 title 和該控制元件。每一級 subagent 麵包屑都將緊湊的 12px title 與固定顯示的雙向箭頭組合成一個控制元件：目前麵包屑使用主標籤顏色和 500 字重，祖先則使用三級標籤顏色和 400 字重。懸停組合控制元件 150ms 後會開啟其直接 parent 目錄；浮層選單具有短暫的跨越寬限時間，ArrowDown 保留為鍵盤入口。點選祖先會取消待觸發的懸停、關閉已開啟的目錄，並且只向上導航。每個直接 parent 目錄都可切換 sibling，並會加粗其選中行；目錄 label 優先於可選的工作階段摘要 title，缺失的切換器目錄在互動時載入。只有目前 subagent 會追加自己的直接 child 數量控制元件。過長的 title 會在固定箭頭之前截斷。觸發器報告直接 catalog 的總數與執行數。普通側邊欄 row 隱藏 origin 為 subagent 的 Session，並從同一份已載入 catalog map 讀取直接執行 child 數；Session summary 提供 activity，但絕不建立 membership。執行中的直接 child 使用共享的三級灰色 ongoing loading。待處理互動優先於 parent 的執行中狀態；二者無論哪一項存在都會保持為主要狀態，而直接 child activity 則成為懸停與無障礙狀態中的第二項。普通 Workspace 行存在待處理的審批、計劃審閱或問題時，會用緊湊的「待批准」「計劃待審」或「待回答」替換相對時間；懸停與無障礙詳情仍保留完整狀態和相對時間。兩種主要狀態均不存在時，直接 child activity 優先於未檢視的完成提醒；最後一個執行中的直接 child 停止後，該提醒會恢復。tree row 在 child catalog 缺席、載入中或失敗時保持可展開，只有 catalog 成功載入為空後才成為已知葉子。載入時顯示通用提示，不會從 summary 生成佔位 row。tree 會呈現 continuable 與 one-shot row；one-shot 的可選 label 缺失時，退回到其 Session id。

`running` 表示子 Agent driver 正在處理工作；`inactive` 表示該 driver 空閒或不存在。Session 列表基線與狀態事件提供活動狀態，移除事件將完成的子代理標為 inactive 並保留其展示 projection。共享的父 `subagentCatalog` projection 提供成員關係。初始讀取與推送值進入同一個 projection store，較新序號優先。[projection 消費決策](../simplification/2026-09-08-web-subagent-catalog-projections.zh.md) 說明載入、重連與同步取捨。提示詞回應仍是投遞時的權威依據。

健康行會複用列表映像中保留的標準工作階段投影。token 用量數值會彙總持久化日誌中四個互不重疊的 `tokenUsage` 桶。`subagentTiming` 會在每個描述符處重置，使繼承的 fork 種子不會計入 child 總量；它會累加已完成的 `turn/start` → `turn/end` 時段，並攜帶未結束輪次同一切面的 `active.since` 和 `active.through` 邊界。該輪次保持未結束期間，現有工作階段事件會推進 `active.through`；選單不會增加單獨的計時器或日誌讀取，且僅在有已知後代處於執行狀態時才推進其本地時鐘。不足一天時，選單會以整秒格式化時間；達到一天後的視覺值最多保留兩個相鄰單位，其中月份按近似 30 天計算，年份按近似 365 天計算，而懸停資訊與無障礙名稱會保留精確的天／小時／分鐘／秒耗時。對 inactive 行，選單以 `active.through` 為被中斷未結束輪次的上界，因此陳舊投影絕不會借用更新的工作階段中繼資料，且重新開啟選單絕不會讓已完成工作重新計時。這兩項指標都不蘊含持久化結果語義。

選擇一行後，系統會先記錄其確切地址，再開啟常駐用戶端 `Session`。歷史分頁、事件 fold、工具渲染意圖、title 與即時 mux 歸併都會複用普通對話機制。麵包屑導航只會沿 `origin: 'subagent'` 行的父連結逐級回溯，包含第一個普通 owner，並讓普通 fork 保持單層。每一級 subagent 麵包屑都會獲得其直接 parent 的 sibling 目錄，並在目錄可用時採用其中的 label。從已定址 subagent 建立 fork 時，會生成具有直接源譜系的普通 fork，並將其附加到最近擁有 Workspace 的祖先。目錄是一棵 ARIA 樹，支援懶載入式 ArrowRight／ArrowLeft 展開與摺疊、線性 ArrowUp／ArrowDown 導航、Home／End、Escape 以及焦點恢復。

one-shot 行始終會用文案替代輸入框，說明執行記錄為只讀。可繼續行僅在 `parentAvailable` 為 false 且 child 未在執行時如此；parent 離線但仍在執行的 child 保留普通輸入框，並停用其輸入區和 Send 操作，讓獨立的 Stop 與線上 QueueDock 控制保持可達，停止後只讀替代恢復。parent 線上時，即使 child 正在執行，普通 Enter／Cmd+Enter 偏好也會選擇 Queue 或 best-effort Steer。對線上可繼續 child，QueueDock Edit、Remove 與 Steer 在 parent 離線時仍可用；獨立 Stop 經由 `subagent.interrupt` 路由（[中斷約定](2026-08-06-continuable-subagent-interrupt.zh.md)）。提示詞失敗會透過普通錯誤行為保留草稿。

已定址 child 檢視不提供繫結到 agent 的輔助控制元件。具體而言，模型選擇器與 `/model` contribution 不會呼叫普通 `session.models` 或 `session.selectModel`；Host 也會拒絕任何意外呼叫，而不是在直接 parent 繼續執行路徑之外啟用持久化 child 歷史。

## 主機介面卡與協定約定

Session Controller 負責 catalog 與 history read；`@deepseek-ai/dsh-subagent` 負責 continuation control：

- `session.projections` 接受 `sessionId`，返回一次 live-preferred Session observation 的完整 projection 基線，不啟用 Agent。Client 將基線寫入標準 projection store；subagent 消費者選擇 `subagentCatalog`。父 Agent 可用性來自 Session 列表摘要與生命週期事件。
- `session.page` 與 `session.follow` 接受包含 mode 的完整地址。它們在觀察到的 cut 上驗證 child header、直接 parent、descriptor identity 與 mode，隨後在不釋出 Agent 的情況下返回普通 raw event、pagination、live reconciliation 與 Host projection baseline。
- `subagent.prompt` 只接受 `mode: 'continuable'` 地址、`delivery: 'queue' | 'steer'` 與上傳形態的 `PromptContentPart[]`；Host 在投遞前把圖片部分准入並持久化為持久引用（[圖片投遞](../../archived/bug-fix/2026-08-27-steer-followup-image-delivery.md)）。它要求確切的存活 parent，重新驗證目錄地址，使用 continuation manager 共享的人類投遞准入，並返回已接受的 `MessageId`。

閘道會將 parent 或目錄條目缺失、child 不可恢復或未授權、請求取消、圖片准入或圖片能力拒絕（`subagent/attachment-invalid`）以及繼續執行准入暫時不可用等失敗對映為型別化 RPC 錯誤。它不會公開描述符或提供者細節。list／prompt 競態屬於正常情況：權威依據是提示詞操作的結果，而不是更早的可用性或活動快照。

檢視持久化歷史本身不會建立 Agent。當後續訊息物化冷態 child Activation 時，現有 Host 與 Session journal stream 會發布其生命週期與事件。重新連線時，系統透過 `session.follow` 重建已定址視窗。

普通 `session.page` 與 `session.follow` 地址對於普通工作階段和 subagent 工作階段同樣只執行觀察，但它既不攜帶目錄地址，也不授予繼續執行權限。每條需要 Agent 的普通路由都會在恢復冷工作階段前經過共享所有權柵欄；`session.cancel` 保留該柵欄。`session.updateQueue` 只有一個目標本地例外：目標是線上 child，且其目前 projection identity 為 continuable 並來自自身的非 seed suffix；one-shot、缺失、未知、損壞、僅含 seed identity 或冷 child 仍受柵欄阻擋。

介面卡仍位於生成的 Remote 名稱空間之後；`dsh-host-webserver` 仍作為載體。瀏覽器程式碼透過現有連線包匯入約定，絕不直接存取主機 `ctx`，從而保持[已歸檔的 GUI RPC 分層決策](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)。

## 用戶端物件層與呈現

不依賴 React 的執行時負責目錄、單次並行重新整理、保留的地址、可用性提示、傳輸選擇，以及每個列表行目前投影值的引用穩定對映。再次選擇已知 child 時會保留其地址，避免導航靜默切換到普通工作階段 API。缺失的中間麵包屑地址可以從已載入的祖先目錄恢復，但在使用者選擇該麵包屑之前不會保留為傳輸地址，也不會建立 scope。恢復的導航會持久化包含 mode 的完整地址。

目錄透過標準 `useSessions` 快照傳遞。元件區域性狀態負責選單可見性、已展開分支、焦點與懸停計時器。`ui-conversation` 為目前普通 title 和每一級 subagent 麵包屑宣告譜系 slot，傳入純資料形式的麵包屑身份與顯示文字，併為祖先傳入向上導航回呼；普通 title 由 render site 保留為退回。`@deepseek-ai/dsh-client-ui-subagent` 以直接 parent 目錄導航佔用每個譜系 slot，並根據普通 owner props 選擇按原因區分的只讀編輯器。元件只接收派生 props 與回呼，絕不接收 `ctx`。

每個程序內 subagent child 都會在釋出前寫入 `SessionHeader.origin: 'subagent'`。工作階段列表摘要與增量 Host 幀會投影該欄位，使分組和扁平側邊欄省略重複的 child 行，同時保留普通 fork。parent catalog projection 擁有 membership 與 tree structure 權威；descriptor identity 與精確 parent check 擁有 addressed history 與 continuation validation 權威。

該包現有的 `@label` source 仍然是獨立的面向模型純文字輸入。它不會將 label 解析為地址，也不會獲得繼續執行語義。

## 預設 Web 組合

已交付的 Web 組合會在 JSONL 持久化旁掛載 SQLite 工作階段查詢，並將 spawn 與 fork 後臺委派設定為可繼續模式。它還會掛載面向模型的 `send_message` 與 `list_agents` 介面卡，以保持 coordinator 對等性，但 GUI 會透過主機 RPC 域呼叫共享的 `SubagentRuntime`，而不是呼叫模型工具。one-shot child 仍在目錄中可見且只讀。

## 備選方案

**對已定址 child 使用普通工作階段 API。** 不予採納，因為通用歷史不攜帶目錄 mode 驗證，而繫結到 Agent 的通用控制元件會有意拒絕 subagent，不會授予直接 parent 繼續執行授權。

**將介面卡放入 webserver。** 不予採納，因為目錄與繼續執行是通道無關的用戶端能力；webserver 只承載已驗證的訊息。

**把由 Host 支撐的檔案與工作階段引用放進本包。** 不予採納，因為目錄與已定址 child 呈現依賴 subagent 譜系，而組合引用發現是獨立的 Host 功能，由 [`ui-reference`](../../../../packages/client/ui-reference/README.zh.md) 消費。

**自動恢復缺失的 parent。** 不予採納，因為繼續執行要求確切的存活直接 parent。child 導航不得改變 parent 生命週期。

**公開普通取消操作。** 不予採納，因為已獲 inbox 接受的輪次會比其准入請求存續更久，且在本決定當時，繼續執行約定未公開具備安全授權的取消控制代碼。後來的[目前輪次中斷約定](2026-08-06-continuable-subagent-interrupt.zh.md)以專用 subagent 路由補上了這項顯式授權；退回到 `session.cancel` 仍被拒絕。

**只顯示可繼續 child。** 不予採納，因為持久化目錄有意描述由工作階段支撐的兩種 mode。one-shot transcript 即使絕不接受後續訊息，仍然有用。

**根據譜系推斷 mode 或側邊欄過濾。** 不予採納，因為普通 fork 共享 `parentSession`。由描述符支撐的目錄負責提供 mode；單獨的 `origin` 標記只是低成本的導航分類器。

**建置預先載入的遞迴樹或專用目錄流。** 就目前規模而言不予採納。展開控制元件按需載入缺失目錄，現有 control 幀傳遞完整 projection 更新。

**讓 child 在 parent 消失後仍能獨立互動。** 不予採納，因為獨立生命週期與使用者所有權需要 side session 語義。

## 測試

- 主機協定測試固定健康的直接 catalog schema、id 回顯、mode 驗證、非啟用式歷史、確切 parent 強制要求、FIFO 准入回執、取消與脫敏後的失敗對映。
- 通用 Host 測試固定在不釋出 Agent 的情況下讀取已附加與冷態歷史及執行 fork、冷態投影歸併、按描述符／origin／執行時 owner 拒絕、拒絕顯式 id 接納，以及直接佇列控制柵欄。
- 用戶端物件測試固定已保留與已恢復的地址、one-shot 只讀與取消拒絕、歷史路由、可繼續提示詞與中斷路由、遮蔽繫結到 agent 的模型控制元件、來自 Session 摘要與 Agent 銷燬的即時活動狀態、權威 catalog membership 與成員重新整理。
- jsdom 測試固定普通 title 分隔符、逐級合併的 subagent title 切換熱區、巢狀 title 的 12px 字號、目前與祖先樣式、選中行字重、目錄 label 優先順序、懸停延遲、向上點選抑制、保留箭頭的截斷、catalog 直接計數與 activity、側邊欄直接 child activity、行狀態優先順序、token 用量總計、精確到秒的執行中耗時與凍結後 inactive 耗時、採用自適應單位的長耗時及其精確無障礙文字、通用載入提示、混合 mode row、ready-empty 葉子判定、descendant 懶載入展開、直接 parent 地址、鍵盤行為與兩種只讀原因。
- 無金鑰的組裝 Web 快照包含一個具有持久化 token 用量的 inactive 可繼續 child、一個具有確定性長耗時的 inactive one-shot sibling 和一個持久化 grandchild；它會固定直接 catalog 數量、token 用量與計時行、自適應長耗時呈現及巢狀懶載入，在不啟用的情況下開啟持久化歷史、准入一條使用者 FIFO 後續訊息、歸併 child mux 事件，並證明 one-shot 歷史仍然只讀。另一個獨立的組裝情境會在 LLM seam 處保持一個真實的 child Agent 輪次進行中，同時固定頁頭和可見空閒 owner row 中的直接執行狀態，隨後在 teardown 期間取消該輪次。
- 導航測試固定僅含 subagent 的麵包屑導航、從 subagent 建立 fork 時的 Workspace 歸屬，以及 `origin: 'subagent'` 側邊欄過濾，同時不隱藏普通 fork。

## 後果

- catalog read 只 fold 所選 parent 的 catalog projection。Web activity 來自 Session 摘要；token 用量與耗時複用 projection baseline 和 push，無需按 row 讀取日誌，投影讀取保持 single-flight。
- parent 可用性與 child activity 都是快照。列出之後，釋出、dispose（資源釋放）、其他傳送方或其他程序都可能搶先改變狀態；型別化提示詞失敗仍屬預期行為。
- child 可能在歷史取得與 mux 訂閱之間釋出，因此現有序號歸併也涵蓋從冷態轉為存活的已定址路徑。
- 持久化 origin 會為 child header 與列表投影新增一個有意保持弱約束的產品分類欄位；它不能變成授權捷徑。
- 除對正在執行的可繼續 child 的目前輪次 Stop（[中斷約定](2026-08-06-continuable-subagent-interrupt.zh.md)）之外，UI 不提供 child 取消、持久化結果、Activation 身份、刪除或可獨立互動的離線 mode，其文案不得暗示這些能力已經存在。活躍輪次耗時度量的是已記錄工作，而非 Activation 駐留時間。
