---
description: "Host 與 Client 工作區控制：修改工作區導航並跟隨其完整投影。"
kind: "package-reference"
---
# Workspace Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-workspace-controller` 擁有 Host 的 `ctx.workspaceController` 服務和生成的 Client `ctx.remote.workspace` namespace。它的 Remote 方法負責建立、重新命名、移除和重排 Workspace，在 Workspace 內重排 Session，歸檔與取消歸檔 Session，以及跟隨完整的 Workspace 投影。當 Client 必須修改或跟隨 Workspace 導航時，請透過 API 閘道使用它。本包同時擁有 `ctx.directoryPickerController` 與生成的 `ctx.remote.directoryPicker` namespace，因為它承載的選目錄 seam 是抽象的，自身從不作為 Loader entry。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Host 控制器會序列執行正確性取決於目前註冊表狀態的變更，併為預期失敗丟擲帶有穩定錯誤碼的 `RemoteError`。它的 `follow()` 流會同步訂閱持久 Workspace 變更，先發出一份完整 baseline，再按順序發出 `upsert`、`remove`、`order`、`archived` 和 `pinned` 增量。歸檔與置頂集合都是工作階段 id 陣列，置頂陣列把最近置頂的 id 放在前面。重連會以替換 baseline 開始新一代，因此消費方不依賴收到斷線期間的每個增量。不帶 `stopActivity` 的 `archiveSession` 會以 `workspace/session-active` 拒絕仍有工作在跑的工作階段，其 details 按族（`turn`、`subagent`、`job`、`schedule`）列出這些工作及各項的 id 與名稱；帶 `stopActivity: true` 時註冊表的提供者先停止這些工作，歸檔集合持久化後即返回回應，停止在後臺收斂。

Client 入口提供 `ClientWorkspaceModel` 和 `createWorkspaceStateStream()`。該模型擁有 Workspace 行、registry 順序、歸檔與置頂工作階段身份、一元變更回顯，以及流與一元呼叫的競態處理。較新的 Host 行按 `updatedAt` 獲勝；已提交的流順序優先於較舊的一元回應；已經移除的 Workspace id 不會被延遲資料復活。置頂快照僅在工作階段身份或順序變化時更新。該包公開與框架無關的快照和訂閱，把導航策略與 React 掛鉤留給 UI owner。`WorkspaceController.archiveSession(sessionId, { stopActivity })` 丟擲攜帶 Host `rpcError` 的 `WorkspaceArchiveError`，介面因此能區分"仍有工作在跑"的拒絕與工作階段缺失或載體故障，並提議停止這些工作。

<a id="first-use-workspace"></a>
### 預設工作區

`defaultWorkspace` 為 `true`（預設值）時，控制器啟動時確保永久預設工作區存在，每個 `follow` 基線都會等這次嘗試結束，因此瀏覽器的第一個檢視就已列出它；失敗的嘗試會寫入日誌。`workspace.initializeDefault()` 重複這一確保並返回持久化的預設工作區；Client service 透過 `workspaces.initializeDefault(signal?)` 提供該操作。它不接受請求參數：固定目錄名 `default-workspace` 由 Host 擁有，註冊表也以同一路徑片段作為初始標題，因此任何語言下同一安裝環境都只有一個磁碟路徑和一個儲存標題。Host 將目錄放在其帳戶的 `<base>/<productDirectory>` 下：`baseDirectory` 選擇主目錄（`home`，預設值）或 Documents 目錄（`documents`），`productDirectory` 預設為空，必須是單個路徑片段或為空，遠端 Web Host 也遵循此規則。因此預設設定把每個帳戶的預設工作區放在 `<home>/default-workspace`，無需系統查詢；非空的 `productDirectory` 會在基礎目錄與 `default-workspace` 之間加入一層目錄。作業系統的檔名限制同樣適用。Linux 系統查詢要求存在 `xdg-user-dir` 且啟用了 Documents 目錄；不具備該條件的 Host 必須設定 `documentsDirectory` 或使用資料夾選擇器。

[Workspace 註冊表](../../workspace/workspace/README.zh.md#first-use-workspace)負責目錄建立和持久化初始化。每次確保都會重新解析設定的目錄。它與已註冊預設工作區的目錄不同時，預設工作區移到設定的目錄，原預設工作區連同其 Session 和檔案保留為普通工作區；查詢失敗時返回已註冊的預設工作區並重建其目錄。它的 `WorkspaceView` 帶有 `isDefault: true`，`workspace.delete` 以 `workspace/default-undeletable` 拒絕刪除它。不得在其帳戶的 Documents 下建立目錄的 Host 設定 `defaultWorkspace: false`：啟動時不做任何確保，`initializeDefault` 返回 `undefined`，啟動流程把目錄選擇留給使用者。查詢和建立失敗遵循標準 Remote 錯誤處理。初始化不建立 Session，也不傳送訊息；[永久預設工作區決策](../../../.agents/notes/implemented/feature/2026-09-26-permanent-default-workspace.zh.md)說明其生命週期。

`./default-workspace` 為瀏覽器消費方匯出 `DEFAULT_WORKSPACE_DIRECTORY` 與 `workspaceDisplayTitle(title, localizedDefault)`：仍保留自動標題的工作區按讀者語言顯示預設名稱，其他標題一律原樣顯示。被使用者重新命名為 `default-workspace` 的工作區，或從選擇器採用的同名資料夾，也會按預設工作區顯示；除顯示之外沒有其他行為依賴該判斷。

| 設定 | 預設值 | 用途 |
| --- | --- | --- |
| `baseDirectory` | `home` | `home` 或 `documents`：存放預設工作區的帳戶目錄 |
| `productDirectory` | 空 | 基礎目錄下的單個路徑片段；為空則不加 |
| `documentsDirectory` | 系統 Documents 目錄 | 完全限定的 Host 目錄覆蓋值，用於 `documents` 基礎目錄 |
| `documentsLookupTimeoutMs` | `10000` | 作業系統目錄查詢的正數最大時長，單位為毫秒 |

Documents 查詢佔用註冊表變更佇列，因此其他 Workspace 變更（包括登記已選目錄）最多可能等待 `documentsLookupTimeoutMs`。取消可以停止查詢；解析成功後，取消不會復原建立或登記。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 Workspace 組織屬於瀏覽器和 Host 的控制狀態，並且不註冊提示詞、工具或工作階段事件。

#### KV Cache 影響

無直接影響；Workspace 變更不會改變模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- `follow()` 在重連後替換完整投影，不提供持久 cursor 或增量追趕協定。
- 程序內刪除標記只會在 Client 模型生命週期內阻止延遲資料復活已移除的 Workspace。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。Workspace 註冊表負責持久化，每次流生成都是完整投影。
