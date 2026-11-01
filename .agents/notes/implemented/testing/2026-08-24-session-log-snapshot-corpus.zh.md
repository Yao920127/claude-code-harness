# Agent Note: Session-log snapshot corpus

Status: implemented

[English](2026-08-24-session-log-snapshot-corpus.md) | 中文

## Problem

無金鑰快照語料透過 ACP 控制許多情境，但這些情境斷言的行為實際屬於組裝後的 Agent、工具、持久化或其他產品介面。這使自動化協定看似擁有後端行為，同時在受支援的 `dsh` 啟動器之外保留了測試專用應用入口，並將錄製工作階段分散在範例、SDK、Web 和腳本目錄中。

快照一詞也用於互不相關的 ARIA、幾何、生成器和包級單元測試預期輸出。貢獻者無法從路徑判斷測試是否由錄製工作階段驅動、工作階段是否同時作為回放輸入和預期輸出，或哪個命令負責重新整理。

## Decision

頂層 `snapshots/` 樹和 `*.snapshot.ts` 字尾只用於擁有或顯式引用錄製工作階段 JSONL 的情境。每個程序級情境都透過 `dsh` 啟動一個隨附 profile；小型介面卡控制 headless、SDK、ACP 或 Web 行為，但不成為另一個應用入口。宣告式 `snapshot.yml` 只儲存已完成工作階段無法表達的 profile、patch、生命週期控制、平臺、header pin 和 workspace 事實。

本決策取代[一次錄製／確定性回放決策](2026-06-19-acp-snapshot-tests.zh.md)中 ACP 專屬的放置位置與控制器所有權；後者繼續負責工作階段日誌回放、例外 override、規範化和 ACP transcript 比較。

錄製工作階段仍是主要輸入，並在目前代際情境中同時作為預期輸出。來自使用者的訊息驅動所選公開介面，錄製的 assistant chunk 驅動確定性模型回放，規範化後的持久化結果必須等於 fixture。父工作階段和子工作階段共享同一型別化脫敏對映。提交的 fixture 使用保留關係的身份 token，並將請求 system prompt 和工具 schema 替換為 token；每個不同 header 類仍保留一個顯式 sidecar 所有者。

Fixture 解碼與比較只取決於選定 JSONL 內容；檔名標識 inventory role，但不是 parser 輸入。replay、seed、record、refresh 與規範化比較路徑都使用同一個嚴格靜態 catalog 驗證。

Headless stderr 重建會同時展開 `assistant/message` 與僅寫入日誌的 `assistant/attempt` settlement 中嵌入的 reasoning，因此失敗或重試嘗試的 reasoning 仍屬於程序輸出投影。

每個 parent 或 child 角色都使用 `session[.<ordinal>][.vN].jsonl`；v0 省略版本，且每個檔名都與其 header 一致。回放、錄製與重新整理按角色選擇數值最高的 generation。大多數 owner 省略 `sessionFormat` 並跟隨目前 writer；受限的歷史 owner 會宣告精確版本與封閉 coverage 名稱。語料保留選定 v0 角色，覆蓋多跳、打包行、重試／失敗與隨附 profile，並保留選定 v1 角色覆蓋完整遷移鏈中的 v1→v2 結構 edge。錄製與重新整理絕不改寫顯式保留的歷史 fixture、重新命名已提交 generation 或透過自動清理刪除 generation。保留 Session generation 不會凍結非 Session 預期輸出：refresh 仍會根據目前 run 寫入 owner 持有的 system-prompt 與 tool-schema sidecar。受審閱的源樹整理只有在同角色存在已驗證的目前後繼後才移除前代。語料策略要求選定目前角色始終佔多數，並將選定歷史角色上限設為十個；更低的前代 generation 可以保留在選定目前後繼旁。

情境擁有的 HTTP fixture 將工作階段中錄製的穩定 authority 與傳輸 listener 分離。每個 fixture 在迴環地址上繫結埠 `0`，由作業系統以一次原子操作分配並繫結埠，再將錄製的 URL 或 endpoint 透過真實 provider 對映到該 listener。任何程序全域傳輸攔截只匹配錄製 endpoint，由 fixture fiber 擁有，並在關閉 listener 前恢復。

每個現有 ACP 情境都獲得一個保留行為的目標。普通單次行為使用 headless profile，需要持久機器控制的行為使用 SDK profile，只有 ACP 協定行為繼續歸 ACP 所有。由錄製工作階段驅動的 Web 情境加入該語料，並保留其 ARIA 或幾何預期輸出作為輔助證據。沒有錄製工作階段來源的 Web 和包級測試保留歸屬方本地的預期輸出，並停止使用快照路徑或檔名。

Workspace 輸入繼續歸各情境本地所有。變更檔案的情境比較完整的預期最終 workspace，record 與 refresh 絕不改寫該預期，因此模型或工具的自報結果無法滿足測試。現有的有意工作階段複用繼續使用顯式、無環的所有者引用；語料不增加 workspace 繼承或通用 fixture 合併機制。

目前 writer 的 request-header pin 與保留的遷移輸入分離：`tool-call-turn` 固定 default 組合，`empty-response-retry-current` 固定 retry 組合。可讀 sidecar 仍由 `text-turn` 持有。六份保留的歷史輸入保持位元組凍結，並繼續被選為回放輸入；其固定歷史版本的目錄不含會取代它們的更新的規範同角色檔案。單獨的 `writer.expected.jsonl` 與 `writer.<ordinal>.expected.jsonl` 檔案固定精確的規範化原生目前格式的父子工作階段輸出，保留歷史輸入的 SDK 情境則透過 `notifications.current.expected.jsonl` 固定目前通知。這些輸出比較基準不是 replay 代際。[快照工具包](../../../../packages/test-support/session-snapshot/README.zh.md)負責選擇與重新整理行為。結構遷移可以保留請求含義而不復現原生 writer 的事件佈局，因此正式遷移擁有獨立的正確性測試。反向投影為歷史 header、剝除結構差異、跳過輸出相等斷言或替換凍結輸入都會掩蓋迴歸，而不是驗證這些相互獨立的約定。

## Alternatives considered

**繼續將 ACP 作為通用驅動器。** 這會保留現有 harness，但繼續把後端覆蓋耦合到低優先順序協定，也無法證明受支援的 headless、SDK 和 Web 啟動路徑。

**將每個情境移動到新的 headless 測試驅動器。** 私有驅動器會重現應用入口問題，也無法表達隨附 SDK profile 已提供的多輪、取消或後臺生命週期控制。

**將每種預期輸出集中到 `snapshots/`。** ARIA、幾何、生成器和單元測試預期不會把錄製工作階段同時用作輸入和結果。混合這些內容會保留目前含糊的術語，並削弱包所有權。

**建立統一的宣告式瀏覽器和終端語言。** 複雜 UI 和 PTY 情境需要互動程式碼。共享快照核心加介面介面卡可以移除應用驅動器，而無需增加第二套測試框架。

**自動去重 workspace 和錄製工作階段。** 目前 workspace 重複很少，有意保持本地性更易審查。只有現有的語義工作階段複用值得顯式引用。

**直接繫結錄製 URL 的數值埠。** 穩定 listener 埠使傳輸值與 transcript 值一致，但同一主機上的並行快照 job 共享網路名稱空間，會爭用該埠。

**在啟動情境前探測未使用埠。** 子程序繫結前釋放已探測埠會產生檢查時間與使用時間競態。在擁有該埠的程序內繫結埠 `0`，可使分配與所有權保持原子性。

**讓每個選定 fixture 都使用目前版本。** 這會減少 fixture 版本，卻移除隨附 profile 對完整相鄰遷移鏈仍可還原已釋出輸入的證明。

**讓每個情境都繼續選擇其最舊 generation。** 這會最大化遷移呼叫，卻使快照語料不再把目前 writer 與目前格式快速路徑作為普通情況來覆蓋。

## Invariants

- 每個現有錄製工作階段情境都在移除舊所有者之前擁有一個透過的替代情境。
- 每個程序級快照都透過 `dsh` 啟動，應用入口清單不再允許已退休的快照驅動器。
- 每個頂層情境都擁有或引用工作階段 JSONL；非工作階段預期輸出繼續歸所有者本地所有。
- 提交的工作階段 fixture 是脫敏固定點，不含 system prompt 或工具 schema 正文，併為每個 header 類保留且僅保留一個 pin。
- 規範 fixture 名稱與其 header 版本一致；每項引用都指向 owner 選定的 parent generation；最多十個選定角色使用顯式 v0/v1 宣告，選定目前角色多於這些歷史角色，且後者的 coverage 名稱涵蓋每項保留的遷移行為。
- 變更內容的情境從外部驗證最終 workspace。
- 所屬位置的程序預期使用 `*.expected.e2e.ts`，並由單獨的建置產物門禁執行。
- 原始碼與建置介面卡在隔離的 profile fallback 中安裝僅回放包；不同的提示詞 section 順序值使兩種模式的請求 header 保持位元組一致。
- 情境 HTTP fixture 繫結由作業系統分配的迴環埠，同時保留錄製的模型可見 authority。
- 原始碼和建置啟動模式、瀏覽器回放、SDK 投影、打包 Python 執行時情境、文件門禁和儲存庫衛生檢查透過。

## Consequences

該語料讓控制器所有權可見：普通 Agent 行為不再繼承 ACP 協定輸出，SDK 和 Web 投影保留各自介面專有的證據，只有 ACP 取消與權限交換仍歸 ACP 所有。貢獻者審查一份規範化工作階段差異，以及提供獨立證據的 sidecar 或 UI 預期。新增組合必須提供 manifest 類別 pin；新增易變身份必須新增保留關係的帶型別脫敏規則，而不是擴大文字清洗範圍。並行 job 可以回放依賴網路的 fixture，而無需預留儲存庫級埠，代價是 fixture 內需要維護錄製 authority 與傳輸 listener 的對映。

歷史遷移覆蓋的代價是顯式逐情境中繼資料與保留的前代檔案；選定目前角色佔多數則防止相容性 fixture 隱藏目前 writer 迴歸。

## Risks

語料可能變更數百個 fixture，generation 名稱改動可能掩蓋行為變化。因此，diff 與驗證必須能分別歸屬機械 generation 輸出、規範化行為與控制器行為，預期輸出改寫需要逐情境審查。

將一份錄製工作階段同時用作回放輸入和預期輸出，可能會穩定復現錯誤的模型腳本。獨立的世界狀態斷言、協定或 UI 預期、真實模型錄制和聚焦包級測試仍是必要的補充證據。
