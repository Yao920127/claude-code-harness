# Agent Note：歸檔仍有工作在跑的 Session

狀態：implemented

[English](2026-09-21-archive-stops-running-session-work.md) | 中文

## 問題

歸檔原本是一次純可見性寫入：`WorkspaceRegistry.archiveSession` 把 id 加進註冊表全域的歸檔集合，別的什麼都不做。在回合中途被歸檔的 Session 會在看不見的地方繼續跑——agent、它的工具子程序、它的模型請求一直跑到結束——而歸檔行刻意不畫狀態點，使用者無從得知還有 agent 在消耗 token。後臺子代理、所屬任務或到期提醒同樣可能繼續工作，或在隱藏的 Session 裡開啟新回合。Web 面從不銷燬 Agent，這種暴露會持續到主機程序退出。

## 決策

歸檔絕不隱藏正在執行的工作。規則歸註冊表所有，併為此宣告一個能力接縫：`workspace/session-activity`（waterfall）向提供者詢問某 Session 還有什麼在跑；`workspace/session-stop`（parallel）請它們停止。提供者像任何外掛註冊監聽器一樣註冊在根上，因此 workspace 包不認識任何 agent、任務或提醒的詞彙。`SessionActivityKindMap` 在 workspace 包裡是空的：每個提供者從其兩個面都匯入的模組合併自己的族（Agent 註冊表的 `turn`、`job`、`subagent`、`schedule`），渲染它們的消費方為其分支匯入這些模組，遇到其他任何鍵時落到通用行。

- **預設拒絕。** `archiveSession(sessionId)` 對非空的活動答案以 `WorkspaceActiveSessionError` 拒絕；API 把它對映為 `workspace/session-active`，details 攜帶各族及各項的 id 與名稱。沒有要求停止工作的呼叫方絕不會把工作藏起來，無論它是哪個用戶端或 SDK。
- **按請求停止，先寫後停。** `archiveSession(sessionId, { stopActivity: true })` 跳過活動檢查，先寫入歸檔，再派發停止事件：pre-step 門禁讀取的正是持久化的歸檔集合，因此停止所引發的每一次喚醒——被取消子代理的結算、排隊的 follow-up——都已被攔下。停止請求只發出、從不等待收斂，因此 Remote 在每個提供者的請求發出後即返回，使用者的行隨即隱藏；停止失敗只是一條 warn 日誌，不是撤銷歸檔的理由。
- **停止即使用者的停止。** Agent 註冊表用 `agent.cancel({ kind: 'user' })` 取消回合——與停止按鈕同一條路徑，因此被打斷的工具呼叫以 `tool/result` 收口、回合以 `aborted` 結束，但不帶按鈕的 `keepInbox`，因此排隊輸入被丟棄並記錄一次收件箱拼接。任務註冊表接縫 kill 所屬任務，由其建構函式只透過抽象的 `list` 與 `kill` 為每個實作安裝。Subagent runtime 以父身份取消執行中的子代理子孫（持久化血緣、subagent 來源、任意深度、從不包括 fork）。每個請求各自兜住，一個拋錯的子代理或任務不會讓其餘的繼續跑。Schedule 外掛在與工具相同的序列佇列的一個槽位裡刪除該 Session 已儲存的全部活動主機任務（[歸檔准入讀取已儲存的任務](2026-09-22-archive-admission-reads-stored-tasks.zh.md)）。它讀已儲存的行，而不是對工作階段日誌做 runtime fold，因為主機任務比其 Session 的 Agent 活得更久，是到期提醒唯一能被看見的地方。每個提供者只擁有它本來就有的詞彙：Agent 註冊表認識回合，任務接縫認識任務，Subagent runtime 認識子代理，Schedule 外掛認識提醒；API Session Controller 只保留已歸檔血緣的步驟門禁。沒有新事件型別，也不在別的所有者的回合內寫入，因此恢復後的 Session 從一份正常收尾的日誌繼續，取消歸檔不會帶回任何被停止的東西。
- **已歸檔即不跑模型步。** API Session Controller 的 `agent/pre-step` 監聽器拒絕為已歸檔 Session 或其子代理子孫提出的步驟，loop 以 `blocked` 收口且不發請求。這封住了遲到的喚醒投遞——子代理結算、排隊的 follow-up、在活動作答與寫入之間開始的回合——跑出隱藏回合的視窗，也讓無視 cancel 的子代理無法替一個誰也看不見的父級幹活；取消歸檔即為整條血緣解除門禁。
- **拒絕即確認。** 側欄先發普通歸檔；靜止的 Session 一如既往無對話方塊直接歸檔。`workspace/session-active` 拒絕會開啟"停止並歸檔"對話方塊，其清單來自主機的答案而非用戶端對執行狀態的映像，因此對話方塊列出的正是主機將要停止的內容。確認後帶 `stopActivity` 重發；提示提供撤銷，撤銷只恢復 Session，不會讓被停止的工作繼續。

## 考慮過的替代方案

**只拒絕，讓使用者逐項手動停止。** Reasonix 桌面端如此。它保住了歸檔的非破壞性，但已停止的 Session 若還有後臺子代理在跑仍會被拒，使用者得自己去追子代理、任務和提醒；提醒在 Web 上根本沒有控制元件。確認對話方塊已經寫明瞭破壞性，而這本是偏向拒絕的唯一理由。

**寫入前等待收斂。** Codex 把等待限定在十秒然後繼續；MiniMax 在回合鎖超出預算仍存活時拒絕。兩者都讓使用者的點選懸在最慢的那個取消上。這裡的停止是廉價的同步請求，pre-step 門禁無論是否收斂都保證不跑隱藏模型步，清理失敗也可接受，因此等待整個移出了請求路徑。

**歸檔前在用戶端停止。** OpenCode 在用戶端隱藏且從不停止，它執行中的 Session 從列表消失而狀態事件繼續。用戶端擁有的語義只覆蓋一個用戶端；註冊表擁有的接縫覆蓋每一個呼叫方。

**用用戶端的活動映像把歸檔動作置灰。** 那需要從列表投影自行推導執行中的回合、執行中的子代理、所屬任務和活動提醒，且可能與主機不一致（無主任務、沒有主機 Agent 的子代理）。一次被拒絕的往返就能拿到主機自己的清單。

**讓 workspace 或 schedule 包依賴 agent 註冊表。** waterfall 與 parallel 事件讓 Agent 註冊表、任務註冊表接縫、Subagent runtime 和 Schedule 外掛無需向實體註冊表新增依賴邊就能提供各自的族；每一方都為事件型別新增了指向 `dsh-workspace` 的可選純型別邊，方向是自然的"特性依賴實體"（`dsh-workspace` 不依賴它們中的任何一個，因此不成環）。

**由 API Session Controller 報告各族。** 控制器看得到每個活 Agent、任務註冊表和 Session header 上的血緣欄位，本可以自己列舉回合、子代理和任務——但那樣它就得認識每個 owner 的詞彙（描述符與名稱、父級原因的取消、任務歸屬）。Agent 註冊表、任務接縫與 Subagent runtime 本來就擁有這些詞彙，所以每一族都跟著自己的 owner；控制器只保留只讀歸檔集合與 header 欄位的血緣步驟門禁。門禁也不能反過來搬進 `dsh-workspace`：各 owner 現在依賴它的型別，workspace 包再依賴 Agent 的事件詞彙就會成環。

**只由活著的 Session 報告 `schedule` 族。** 已儲存的任務才是權威，且比其 Session 的 Agent 活得更久，因此以存活為條件會讓儲存行被武裝的冷 Session 靜默歸檔，其到期行隨後投遞進一個被門禁以 `blocked` 收口的回合，在沒有模型步的情況下消耗掉這次觸發（[歸檔准入讀取已儲存的任務](2026-09-22-archive-admission-reads-stored-tasks.zh.md)）。

## 後果

已歸檔的 Session 保證空閒：它要麼本來就靜止，要麼其工作已按使用者停止的方式停止，且在恢復之前不會為它跑任何一步。置頂與歸檔決策裡的"歸檔無需確認"僅對靜止 Session 成立；執行中的情形會先詢問。停止的收斂是盡力而為：無視 kill 的任務或無視 cancel 的子代理會被記錄，pre-step 門禁在此期間阻止該 Session 消耗模型請求。活動檢查與歸檔寫入是兩步，其間開始的回合會被隱藏，pre-step 先於該寫入的每一步連同其工具呼叫照常執行，直到寫入之後的第一步被阻斷。先寫後停與門禁留下兩處殘餘。在歸檔寫入與 Schedule 外掛的停止之間崩潰，會留下一個已儲存任務仍被武裝的已歸檔 Session；取消歸檔時它們再次出現，與從未請求過停止時一樣；當這類行的目標時刻過去，Schedule runtime 會按自己的定時器選中它並自行 resolve 該 Session 的 Agent，一次性提醒於是把 follow-up 投遞進一個被門禁以 `blocked` 收口的回合，該次觸發因此在沒有模型步的情況下被消耗，取消歸檔後也不會重放。准入本身會報告沒有活 Agent 的 Session 的已儲存任務，因此這類 Session 在殘餘發生之前就被拒絕。

為此決策調研的同行產品：Codex 與 Kimi Code 先停止再歸檔；Claude Code 透過讓遠端工作階段無法寫入來停止；Reasonix 與 MiniMax 拒絕忙碌的 Session，MiniMax 在有界取消之後才拒絕；Pi 沒有歸檔但在每次切換工作階段前 abort；OpenCode 既不拒絕也不停止。每一個會停止的產品都走自己的常規取消路徑，以便日誌正常收尾。
