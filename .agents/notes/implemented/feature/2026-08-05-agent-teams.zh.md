# Agent Note: Durable Agent Teams over continuable children

Status: implemented

[English](2026-08-05-agent-teams.md) | 中文

## Problem

subagent seam 已提供 fresh／fork provider、持久 child Session、FIFO follow-up 與可冷恢復 Activation。它的直接 parent control 不提供 peer 通訊、穩定具名 roster 或共享任務 owner。coordinator 可以建立多個 worker，但 worker 無法互相定址；持久 follow-up 意圖只存在於 target inbox；也沒有公共 compare-and-set 任務板來阻止陳舊 assignment 更新。

同程序 Agent 還共享一個 checkout。檔案系統 edit 工具可以拒絕已觀察到的陳舊版本，但 Bash、formatter、generator 與外部 writer 會繞過該屏障。把 teammate name 或 task owner 當作檔案鎖只會掩蓋而不是解決該並行邊界。

Agent Teams 的公開約定仍處於實驗階段，因此需要顯式啟用的組合。預設工具目錄與簡單任務行為必須保持不變；而顯式請求的 Team 必須能跨越 child Activation settlement 與 mailbox 投遞競爭，使 Lead 在程序 teardown 前彙總結果。

## Decision

每個普通執行時 Root 都是一個隱式 Team 的 Lead，Team id 等於該 Root 的 `SessionId`。Team 沒有 creation event：Lead pseudo-row 由身份直接存在，持久狀態從第一條 member、message 或 task event 開始。roster 是扁平結構，最多包含設定數量、不可變且採用小寫 kebab-case 的名字。每個 teammate 都是使用預留 Session id 的 continuable 直接 child；只有 Lead 可以建立或 interrupt teammate。roster 外由 provider 管理的普通 subagent 不是 Team member；普通 fork 是新的 Root，繼承的 Team 記錄會因 ancestor `TeamId` 被排除。

實作拆分為 `@deepseek-ai/dsh-experimental-agent-team` 與 `@deepseek-ai/dsh-experimental-tool-agent-team`：前者負責 `ctx.agentTeams` 和持久語義，後者負責 scoped schema 與模型指引。每個 Team 工具都宣告完整的結果 schema，並把該值渲染為緊湊 JSON，因此編譯器會檢查每個 `execute` 是否符合對模型的承諾，也沒有結果把 token 花在縮排上。部署顯式掛載兩個外掛，並可停用具有相同模型可見名稱的舊 continuable control。顯式 delegation 策略只允許在使用者要求 Agent Teams 或 teammate 時建立 Team。兩個包都是 `packages/experimental/` 的公開成員；[實驗性包決策](../architecture/2026-08-18-experimental-agent-teams-packages.zh.md)負責釋出、依賴隔離與 promotion。

Lead 必須等待所需工作後才能給出最終答案。程序 teardown 仍是最終生命週期 owner，並會 drain continuation Activation；Team task owner 是持久狀態，不會因 idle、interrupt 或程序退出自動釋放。

## Profile delegation

[Team profile](../../../../packages/experimental/agent-team-profile/README.zh.md) 停用 `subagent`、`subagent_fork` 以及名稱重疊的全域控制元件。模型直接委派使用支援 fresh 或 fork 上下文的 `spawn_teammate`，使這些子代理進入持久 roster。Workflow 仍透過 base profile 的 fresh `spawn` 提供者執行腳本編排；經模型工具建立的 workflow 子代理不會繼承 teammate 的對話身份。Subagent 服務和提供者仍是共享基礎設施。普通 Session fork 保留歷史，不糾正身份。提供者所擁有的子代理工具可見性仍是[已記錄的限制](../../../../packages/experimental/tool-agent-team/README.zh.md#known-limitations-and-deferred-work)。

## Team identity

工具 `spawn_teammate` 在初始任務前加上 user-role `<system-reminder>`，宣告 `You are teammate "<name>".`。身份和任務進入同一條持久化收件箱訊息。共享 system 策略和全部工具 schema 在成員間保持一致；執行時檢查角色權限。Team 工具根據呼叫者確定 Team，並接受成員名字，因此模型不需要 Team id。身份隨普通曆史經歷冷恢復和壓縮；外掛不檢查提醒是否保留，也不新增替代訊息。fork 繼承已記錄文字，不補發 Lead 身份修正。把身份放進 system prompt 會在繼承歷史之前改變字首；把它留在初始任務中既保留此字首，也無需每步維護身份提醒。已有的 system 內嵌身份可能需要一次提示詞協調；保留的事件格式代際保持不變。

## Provisioning and recovery

建立操作先在 Lead Session 中追加並 flush `team/member` provisioning 快照，再透過選定 fresh 或 fork provider 啟動預留的 continuable child。初始 inbox 獲准前的失敗會追加 failed 快照；成功會先 flush child 中已接受的 inbox 條目，再追加 active。恢復會在初始訊息仍處於 pending 或已進入使用者訊息歷史時識別它。名字由第一條 provisioning 記錄永久保留，包括失敗後也不能複用。dispose 會關閉准入，中止並等待已獲准的建立與 mailbox dispatch 事務，再停止 roster 記錄的所有 live child；failed child 在 Activation 退出前仍由 cleanup 擁有，cleanup 拒絕會讓 dispose 失敗。

Root 恢復時會把未終結 provisioning 記錄與獨立持久 child Session 對帳。直接 parent 與 continuable descriptor 匹配，並且已經記錄初始使用者訊息，才能證明准入成功並轉為 active；缺失、損壞、provider／lineage 不匹配或缺少已准入訊息都會轉為 failed。creator 會在同一 Lead 日誌 serializer 內重讀終態；如果 recovery 在建立成功時先標記 failed，creator 會 drain child 並報告 provisioning conflict，而不是遺留孤兒。這樣既無需重建從未儲存在 Team 日誌中的初始 prompt，也能約束外掛 reload 競爭。

fresh child 不繼承對話。fork child 只捕捉一次 Lead 已完成 turn 字首，並保留為自己的持久 seed。目前 delegation turn 保持排除，與既有 fork provider 契約一致。

## Mailbox and task transactions

Peer 通訊使用 Lead 日誌 mailbox。投遞前先追加並 flush `team/message/queued`。target message 會在持久 source metadata 與短模型可見字首中同時攜帶穩定 message id 和 sender identity。只有 pending inbox 條目或已記錄使用者訊息完成 flush，Lead 日誌才寫入 `team/message/delivered` acknowledgement。即時准入按 target 和 queued 日誌順序序列化，恢復按同一順序重試 queued-minus-delivered，並在冷恢復前摺疊 live 或 persisted target 的 inbox／歷史狀態。每個目前版本 Team payload 都會經過執行時驗證後才進入 replay state。Team runtime 從同步准入到 settlement 全程跟蹤 dispatch 與非同步 acknowledgement 工作；dispose 會關閉准入，並在移除服務前等待兩者。目前 waiter 只在所屬 Team event flush 成功後被喚醒。

事件投影和 checkpoint 准入期間，未知 mailbox 內容保持為已解碼 JSON。驗證只檢查其 type，不重建欄位，因為通用物件解析可能省略有效的自有 `__proto__` 鍵。本地宣告的內容變體接受結構驗證；不透明的外掛欄位不獲得 Team 語義。快取失效是必要的，因為只修正解析器無法恢復快取狀態中省略的鍵。[Team 文件](../../../../packages/experimental/agent-team/README.zh.md)擁有恢復行為的說明。

`send_message` 始終嘗試 Steer 投遞。running target 在最近的步驟邊界收到訊息，inactive target 在已載入時啟動一個輪次，否則冷恢復。即使臨時投遞失敗讓訊息保持 queued，成功也表示訊息已經持久化。該機制提供程序內重試與 target Session 去重，不宣稱跨程序 exactly-once。[Team Steer 訊息決策](../../archived/simplification/2026-08-30-team-send-message-steer.md)負責單工具排程的理由。

共享 task 是帶 Team-local id 與單調 revision 的完整快照。每次變更都攜帶 `expectedRevision`。任意 member 可以建立、讀取或 claim ready 且無 owner 的任務；Owner 或 Lead 可以編輯和轉換；只有 Lead 可以分配給另一個 member。數字 task id 保持在安全整數分配範圍內；該範圍耗盡時會失敗，不會複用 id。依賴必須指向未刪除任務，並形成完整 DAG。刪除任務保留為 tombstone。`writeScopes` 是規範化路徑字首，只產生重疊診斷，絕不會阻止 claim 或授予寫權限。

`wait_agent` 等待呼叫註冊後發生的下一條 roster、mailbox、task 或即時 status 邊，避免模型輪詢。它不會回放更早的邊，因此呼叫方需要在喚醒或超時後重新讀取權威狀態。僅限 Lead 的 interrupt 使用 inbox preservation 取消目前 turn，不改變 mailbox 或 task owner。

## Shared checkout boundary

所有 member 使用相同 cwd，並立即觀察寫入。策略要求 member 切分任務、記錄提示性 write scope、為有序工作新增依賴，並由 Lead 檢查最終 diff 和執行測試。檔案系統 stale-version 拒絕後必須重新讀取並 rebase 修改意圖。Bash、formatter、codegen 與直接外部寫入不具備等價保證。

Worktree isolation 不是 harness runtime 行為。deployment 或 prompt 可以安排獨立 worktree，但 Team 領域不會推斷 branch、merge 變更或靜默改變 cwd。這樣保留既有 same-world subagent 與 sandbox 契約。

## Web projection

Web panel 讀取 Lead Session 的 `agentTeam` 傳輸投影，因為現有投影流能持續更新瀏覽器狀態，無需獨立的 Team 讀取 API。Lead 與 teammate 工作階段均從共享的跨 Session store 選擇值。面板不負責投影讀取：Session 載入、列表快取值與控制基線提供資料。

傳輸檢視攜帶持久 roster phase、使用共享就緒與重疊派生邏輯的未刪除任務檢視，以及最後有效狀態旁的 `failure`。即時活動來自 Session 狀態。模型選擇有自己的持久投影；面板展示共享 store 中可用的值，不開啟成員工作階段。缺少的快取值保持缺失，直到 Session 載入或即時更新提供它。

釋出要求 `apply` 對每個已應用的 Team 事件返回新的 state 物件，並只替換被觸及的集合。僅電子郵件的事件保留檢視引用，不釋出 frame。現有傳輸層將每個變化後的完整檢視傳送給所有已連線瀏覽器；包 README 記錄了這項開銷。

## Alternatives considered

**用 peer id 擴充功能 direct-child subagent tool。** 拒絕，因為 parent／child 權限與 Team peer membership 是不同領域。向 continuation seam 增加 peer access 會削弱 exact-parent authorization，仍無法為 roster 與 task 提供持久 owner。

**在 Lead 日誌入隊前把 mail 存入每個 target Session。** 拒絕，因為 Team 提交傳送之後，target materialization 與准入仍可能失敗。始終 live 的 Lead Session 是事務 owner；target recording 是 acknowledgement 與去重邊界。

**把 task ownership 或 write scope 當作鎖。** 拒絕，因為外部 writer 會繞過它們，崩潰 owner 會持久保留，而路徑字首重疊不能證明語義獨立。虛假的互斥保證比明確 warning 更危險。

**自動建立隔離 worktree。** 拒絕，因為 worktree 建立、branch 命名、merge 策略、ignored file、建置產物與 cleanup 都是 deployment 選擇；它也會改變既有 subagent 與 sandbox 暴露的 same-world 行為。

**在預設工具目錄中啟用 Team。** 拒絕，因為 scoped Team control 會覆蓋同名舊全域工具，主動 delegation 也會給簡單任務增加延遲和 token 成本。opt-in profile bundle 會插入 Team 並停用舊 control，同時不向隨附依賴圖新增 Team 包。

**使用記憶體 task board 與 mailbox。** 拒絕，因為 child settlement、HMR 與程序中斷會丟失已接受協調狀態，並讓重試變得含糊。

**讓 Team 工具返回未型別化 JSON。** 拒絕，因為未宣告的結果型別會讓 `execute` 在沒有編譯錯誤的情況下偏離對模型的承諾，也會引入在每份 roster、task 與回執上都消耗 token 的縮排。因此每個 Team 工具都宣告完整的結果 schema，並由一個共享 helper 緊湊渲染。

## Testing

Package test 以逐檔案 100% coverage 覆蓋身份、名字與權限檢查、provider 選擇、預留 id 持久化衝突、child-before-Lead flush 順序、持久 provisioning 失敗與 pending-inbox JSONL 對帳、target-local 並行順序、pending／history 去重、mailbox 限額、flush 後 notification、取消在途建立與 dispatch 的有界 dispose、failed member cleanup、task CAS 與 DAG 驗證、write-scope warning、wait cancel／timeout、保留 inbox 的 interrupt、普通 fork 隔離、舊 control shadowing、宣告 schema 的緊湊結果渲染與 scoped registration HMR。一條 keyless 產品快照會透過 `dsh --profile headless` 載入 Agent Teams profile bundle，併為兩個 teammate、依賴任務、peer 投遞、等待、完成和彙總固定完整的面向模型工具列表、Team policy 與持久 workflow 投影。CLI e2e 會複用同一個確定性 adapter，並驗證帶持久 Team 與 child 日誌的正常退出。

模型可見的成員身份與可用狀態遵循[工具投影決策](../simplification/2026-09-15-model-agent-availability-and-team-targets.zh.md)；服務駐留狀態和持久身份仍保持區分。

## Consequences

Lead Session 會隨著完整 task／member 快照與 mailbox acknowledgement 增長。該設計用可獨立檢查的恢復能力換取更緊湊的 delta；設定的 task 與 pending-mail 限額限制 active state，而 deleted 與 delivered 歷史會保持 append-only，直到更廣泛的 Session retention 生效。

active roster member 可以不駐留，因此 `inactive` 不表示失敗，send 可能產生 cold-resume 延遲。臨時 inspection、resume 或 inbox 准入失敗可能留下持久 queued 訊息等待恢復。failed member 會永久佔用名字與 member slot，使 provisioning failure 保持可見而不是靜默回收身份。

協調可以降低 checkout 衝突機率，但無法消除檔案系統 CAS 工具之外的寫入。最終 diff 與測試仍是 Lead 的整合邊界。
