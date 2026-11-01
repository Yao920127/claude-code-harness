# Agent Note: 模型可見的 Agent 可用狀態與 Team 目標

Status: implemented

[English](2026-09-15-model-agent-availability-and-team-targets.md) | 中文

## 問題

Team 操作接受成員名稱，但同時返回名稱和 Session UUID 容易使模型選擇不可用的地址。已載入與僅儲存的 agent 也有不同的內部狀態，儘管模型繼續其工作時採取相同操作。

## 決策

Team 工具介面卡從現有成員名稱生成 `target`，並從建立和列表結果中省略成員 Session ID。訊息、中斷和任務分配使用同一名稱。任務的 `ownerName`、任務 ID 和訊息 ID 保持現有含義。內部服務、Web 檢視和持久化 Team 記錄保留 Session 身份。

普通 subagent 工具結果與 Team 服務檢視把已載入但處於輪次之間的 agent 和僅儲存的 agent 都投影為 `inactive`。只有正在執行輪次時才是 `running`；Team 保留表示成員建立狀態的 `provisioning` 與 `failed`，普通 subagent 的診斷行保留讀取失敗原因。中斷結果按同一規則投影之前的狀態。可用狀態不報告任務結果或等待依賴。

Team 服務為工具和 Web 統一提供 roster 與中斷的可用狀態。普通 subagent 的投影歸其列表工具所有。執行時載入、冷恢復、中斷權限和電子郵件投遞保持現有行為。普通 subagent 繼續使用 `agent_id`；穩定的 subagent 名稱和歷史資料處理暫緩。不修改持久化型別或 Session 格式。

## 考慮過的替代方案

**立即為普通 subagent 增加穩定名稱。** 這需要持久化命名策略，以及對歷史無名稱子級的明確處理。它與移除誤導性的 Team 身份和模型狀態區別相互獨立。

**合併內部執行狀態。** 駐留狀態決定投遞是啟動已載入的 agent，還是從儲存恢復。底層 Agent 狀態與註冊表中的存在性保留該區別；Team 檢視僅暴露輪次可用狀態。

## 影響

模型可以把 Team 結果的 target 直接複製到適用操作。這些工具結果不再提供成員 UUID 和駐留細節；Team 定址不需要它們。在另行決定命名方案之前，普通 subagent 與 Team 的定址方式仍不同。

定向服務與工具測試覆蓋所有狀態投影、返回目標的操作、診斷行和線上與僅儲存子級。錄製的 headless Team 與 SDK subagent 情境固定組裝後的模型輸出和 schema。[Agent Teams 決策](../feature/2026-08-05-agent-teams.zh.md)繼續擁有 roster 持久化、作用域和權限規則。
