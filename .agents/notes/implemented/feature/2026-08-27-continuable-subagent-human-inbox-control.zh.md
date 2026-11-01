# Agent Note: 可繼續 subagent 的人類 inbox 控制

Status: implemented

[English](2026-08-27-continuable-subagent-human-inbox-control.md) | 中文

## 問題

可繼續子級與普通 Agent 使用相同的 agent loop（智慧代理迴圈）和 inbox，但人類投遞路徑只公開 FIFO 後續輪次。Client 選擇專用 subagent prompt Remote 時會丟棄既有的 Queue／Steer 選擇，通用 Session ownership fence 又拒絕 subagent 所有身份的全部 queue 變更。因此，瀏覽器隱藏了線上子級 inbox 已經支援的控制。

無差別開放通用 Session 控制會削弱 subagent 所有權規則。Prompt 投遞仍需要確切線上直接父級授權驗證與冷恢復記帳，而 queue 變更必須拒絕一次性、未知、損壞和冷子級。child 自身 log suffix 中的有效 continuable descriptor 可標識哪些線上 subagent-owned Session 能使用 occurrence mutation。Settlement 還必須在 idle Agent 仍有會被 driver 認領的待投遞工作時保留該 Agent，也不得拆除在 `whenIdle()` 兌現後才佔用 idle 階段執行 maintenance 任務的 Agent。

## 決策

線上可繼續子級公開普通的人類 inbox 控制，不增加另一套 queue、Remote endpoint、queue action 或面向 Host 的 subagent 操作。一次性子級繼續只讀。

現有 `SubagentPromptRequest` 攜帶 `delivery: 'queue' | 'steer'`。Client 把 `Session.prompt(content, mode)` 已選出的 mode 經 `subagent.prompt` 原樣轉發。Remote 仍要求確切線上直接父級，隨後使用一個包內 continuation manager 投遞操作。Queue 呼叫 `Agent.followup(message)`；steer 呼叫 `Agent.steer(message)`。兩條路徑共享 child lock、冷恢復、最終父級重新授權驗證、呼叫方 signal 截止、`MessageId` 建立、復原與 dispose 競態處理。該人類選擇不新增公開排程方法或模型工具；由其他決策擁有的 `sendMessage()` 與面向模型的 `send_message` 操作保留固定的相鄰 Agent Steer 語義。

瀏覽器為可繼續子級提供普通的繁忙態 Enter／Cmd+Enter Queue／Steer 偏好、QueueDock Edit／Remove／Steer 操作，以及空草稿 steer-all 手勢。Send 與 Stop 繼續是獨立控制。Composer prompt 會建立新的已准入工作，因此仍要求線上父級。QueueDock 變更直接定址已經線上的 inbox 工作，所以父級離線時仍可使用；父級離線的 composer 繼續鎖定。

現有 `session.updateQueue(itemId, action)` 會解析確切線上 Agent，並且只有 subagent-owned Session 的目前 projected identity 為 continuable、descriptor 序號屬於 child 自身的非 seed suffix 時才會准入。線上 one-shot Agent 以及缺失、僅繼承或無效的 identity 都會繼續觸發所有權失敗。Agent 不存在時返回 `queue-item-not-found`，且不會冷恢復子級。對線上 inbox occurrence 變更而言，目標 Session id 已是充分的人類權限；無需 parent 地址。Edit 與 Remove 保留既有完整 `nextTurn` 和 `nextStep` 語義，包括外掛注入的 context；Steer 要求排隊 occurrence，且 command 開始時 Agent 必須報告 running。

Continuation manager 不保留第二套訊息 reservation 狀態。一個私有 `SubagentInbox` 會把 Queue 與 Steer 委託給 Agent inbox，並持有 Activation 既有的 closing promise。自然結算會等待 `Agent.whenIdle()`、child Inbox 為空以及所擁有的每個子級完成 dispose。管理器會在 child lock 內確認 Inbox、owned-child set 與 wake generation，再在准入保持開放時 flush 最終 Session 狀態。最終 child-lock 決策會重新驗證 Session 序號與相同的駐留事實，然後同步啟動一個 `Agent.runMaintenance()` 任務；該任務的入口會佔用 idle 階段，並在同一個 JavaScript turn 內關閉包裝層。每個待處理 Inbox occurrence 都會保留 Activation，無論其投遞模式或來源如何。由 manager 所有的投遞、Inbox claim 或 discard，以及所擁有子級的釋放都會更新 wake generation。flush 期間直接接受的 Agent 工作要麼改變最終 Session 或駐留觀察，要麼保持活躍並阻止最終 maintenance 任務啟動，要麼在重驗前完成。

QueueDock Steer 在 command 准入一個正在執行的排隊 occurrence 後，採用 Agent 的 best-effort 投遞。如果排隊 occurrence 先被 claim，`queue-item-not-found` 表示其普通 Queue 投遞已經開始。如果活躍取消在同步轉移期間先發生，Agent steering 會把訊息追加到 `nextTurn`、鎖存喚醒，Session command 仍然成功。在該 fallback 情況下，選中訊息會移到 Queue 剩餘項之後。新組合的 Steer 使用同樣的 fallback，錯過最近步驟時仍保證可投遞。

本決策部分取代 [Web subagent 目錄與人類 continuation](2026-07-27-web-subagent-conversations.zh.md)、[可繼續 subagent](2026-07-28-continuable-subagent-conversations.zh.md)、[Steer Web 已排隊訊息](../../archived/feature/2026-07-30-web-queue-steer-action.md)和[用空草稿 Cmd/Ctrl+Enter steer 整個 Web queue](../../archived/feature/2026-08-06-web-queue-steer-all-gesture.md)中的人類控制排除項。活躍記錄擁有目錄授權驗證與 Activation 生命週期；歸檔記錄保留最初的 QueueDock Steer 與手勢決策。

## 考慮過的替代方案

**新增 `SubagentRuntime.steer()` 與 Remote。** 拒絕，因為人類 prompt 投遞已經擁有帶 mode 的 Client 方法和一個已授權驗證 Remote。新的公開操作會擴大 service 與模型相鄰介面，卻不增加執行原語。

**新增 `subagents.updateQueue`。** 拒絕，因為 `session.updateQueue` 已經擁有準確 inbox occurrence 變更及其競態失敗。Projected continuable identity 提供狹窄的 ownership-fence 例外，無需新增操作。

**把所有 subagent 控制都路由到通用 Session API。** 拒絕，因為 prompt 與取消需要 subagent 血緣授權驗證、冷恢復記帳與專用失敗對映。只有線上 inbox occurrence 變更擁有足夠的目標本地狀態，可使用狹窄的 ownership-fence 例外。

**把可繼續 queue 變更限制在 `nextTurn`。** 拒絕，因為人類 inbox 對齊有意包括編輯或刪除待處理 steering 與注入 context。如果外掛需要圍繞其 `nextStep` 輸入建立更強事務，該保護應屬於共享 Agent inbox 語義，而非 subagent 專屬限制。

**按 `MessageId` 跟蹤喚醒工作，並在 mutation 中轉移該記錄。** 拒絕，因為這會用第二套活動帳本重複 Inbox 的待處理集合，並讓駐留依賴 occurrence 身份。`whenIdle()` 會等待既有 Agent 活動，`Inbox.hasPending` 保守地保留每個 occurrence，Activation generation 會讓過期觀察失效，而最終 maintenance 任務則以原子方式銜接 idle ownership 與准入關閉。這項選擇可能保留靜默注入的 context，但既避免額外的 mutation 協定，也避免靜默丟失已接受的 steering。

**用 `MessageSource.kind` 推導駐留，把 `plugin` 視為停放 context。** 拒絕，因為 `kind` 記錄的是訊息由誰產生，而非如何投遞，且 `MessageSourceMap` 可合併擴充功能。外掛會以 plugin 來源 steer（`cordis-host-runner` 的失敗報告、阻斷式 Stop hook），host 也會以非 plugin 來源 inject（`dsh-experimental-agent-team` 的靜默郵件），因此該對應關係在兩個方向上都不成立。統一對待所有待處理 occurrence 可以避免這種沒有依據的推斷。

## 結果

可繼續子級工作階段與普通 Session 共享一套人類 inbox 互動模型和一套 Agent-loop queue。人類 steering 可以影響駐留或冷恢復的子級，而不改變公開模型控制。父級離線後，QueueDock 對線上子級仍有用；新訊息則繼續遵守直接父級授權驗證。

通用 Session command 為擁有有效自身 suffix continuable identity 的線上 subagent-owned Agent 提供一個狹窄的 ownership-fence 例外。因為該操作可定址兩個 inbox 目標，知道待處理 `MessageId` 的呼叫方可以像操作普通 Session 一樣，編輯或刪除外掛提供的 next-step 輸入。QueueDock 只渲染 `queued` placement 的行，因此沒有瀏覽器手勢能到達該輸入；在那裡編輯還會保留原產出方的 `MessageSource`，從而把人類文字歸屬給該產出方。

Inbox notification 保留 occurrence 語義，不攜帶 continuation 駐留狀態。Claim 與 discard notification 只負責在待處理工作變化後喚醒 settlement；`whenIdle()`、最終 idle 階段 maintenance 任務、`Inbox.hasPending`、owned-child set、Activation generation 與 Session 序號無需依賴排程順序、訊息身份或來源即可決定何時安全 dispose。最終 flush 位於 closing cutoff 之前，因此 detached hook、job completion 或直接 Agent 投遞只要在該 await 期間被接受，就會讓觀察失效，而不會被隨後發生的 dispose 停止。仍然活躍的 maintenance 會阻止最終任務佔用 idle 階段；在 flush 期間開始並結束的 maintenance 已在 dispose 前完成。僅持有被注入 context 的 child 即使沒有 driver 必須認領它，也會保持駐留；如果之後沒有喚醒投遞、queue removal 或 manager teardown，該 child 及其線上祖先可以在程序生命週期內一直駐留。重放出的 Inbox 遵循同一條保守規則，無需重建每條待處理訊息的投遞方式。

模型側排程保持固定，不由呼叫方選擇。相鄰 Agent 的 `send_message` 工具始終使用 Steer，只有瀏覽器人類路徑選擇 Queue 或 Steer。
