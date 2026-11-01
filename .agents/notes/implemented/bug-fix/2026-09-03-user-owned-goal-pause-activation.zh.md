# Agent Note: 使用者獨佔的 goal 暫停並暴露即時啟用態

Status: implemented

[English](2026-09-03-user-owned-goal-pause-activation.md) | 中文

## 問題

[主機發起的 goal 暫停中止目前輪次](../../archived/bug-fix/2026-09-01-host-goal-pause-aborts-turn.md) 修復了目前模型輪次不停止的問題，但之後的人類輪次仍可透過 `update_goal resume` 解除持久的 `paused` goal。Web 條帶也只讀取持久的 `goal` 投影，因此 active-but-disarmed 的 goal 與 armed 的 goal 渲染相同，並提供相同的暫停動作。

## 決策

`ctx.goals.get` 現在是一個只讀 Remote 方法。`GoalService` 在程序本地 activation 變化時發出 `goal/activation-changed`，載荷為 `{ sessionId, goal: { id, revision, activation } }`，clear 後則不攜帶 goal。API Remote 允許列表把這份 JSON 載荷轉發給 Web 用戶端。

GoalBar 消費由 slot inject 建立的 registrant-private activation hook source。該 source 僅在框架 hook 觀察期間啟動，讀取 `ctx.remote.goals.get`、訂閱 `goal/activation-changed`，並在 running 狀態或連線 reset 時重新整理。activation 邊界推進 epoch，使在途讀取失效，因此較舊的 HTTP 回應不能覆蓋更新的邊界；running 重新整理會保留最後一次 activation，直到讀取完成。Active goal 僅在 armed 時渲染 `Ongoing Goal`；active-but-disarmed goal 渲染 `Inactive Goal`，暴露 resume 而不是 pause；持久 paused goal 繼續暴露 resume。暫停權威仍屬於 goal 領域和人類 `/goal resume` 命令，它們仍可恢復每個可恢復 phase。

`update_goal resume` 會在呼叫 goal 服務前用 `GOAL_TOOL_RESUME_PAUSED` 拒絕持久 paused goal。它仍會在工作階段恢復或 fork 後恢復 active-but-disarmed goal，並在人類要求繼續時恢復 blocked goal。模型提示詞和工具描述說明持久 paused 的恢復由使用者獨佔。

## 考慮過的替代方案

**把 activation 存入持久 `GoalSnapshot`。** 否決：按 goal 領域約定，activation 是程序本地的，絕不能跨恢復或 fork 存活。

**把 activation 加入持久 session projection。** 否決：投影狀態會寫入檢查點；快取的 `armed` 會在武裝它的程序消失後繼續錯誤存在。

**把完整的 scoped `goal/changed` 事件轉發給用戶端。** 否決：其 `Agent` 載荷不是 JSON wire 資料。專用 activation 事件只攜帶用戶端需要的 session id、goal ref 與 activation。

**允許模型從自然語言輪次恢復持久 paused goal。** 否決：人工暫停是使用者控制，僅靠提示詞約束仍會把同輪撤銷能力留給模型。

## 後果

Web 無需持久化 activation 就能區分執行中、disarmed 與 paused goal。持久 paused goal 只能透過 Web 控制元件、`/goal resume` 或其他直接呼叫 goal 服務的呼叫方恢復；模型 `update_goal resume` 僅限 disarmed-active 與 blocked goal。API 表面新增一個讀取和一個轉發 live 事件；持久 goal change 載荷與投影 stateVersion 不變。元件不持有 Remote 訂閱；activation source 遵循既有的 inject-hooks live-data 通道。

## 測試

Goal 單元測試固定 create、session start 與 resume 過程中 activation 事件的 id 與 revision。工具測試固定後續人類輪次中持久 paused goal 的拒絕，同時保留已恢復 disarmed-active goal 的恢復。API Remote 測試固定 JSON 轉發。Activation-source 測試固定 stale read 拒絕與 running 重新整理保留舊值。Web 單元測試固定 armed 顯示 pause、disarmed 顯示 resume；組裝的 goal-bar 瀏覽器情境透過 fixture timing hook 同時固定 armed 與 active-disarmed golden。
