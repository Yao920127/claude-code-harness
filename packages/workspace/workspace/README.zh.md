---
description: "面向選擇、掛載或排查持久 workspace 記錄與工作階段頭驗證成員資格的主機的 Workspace 實體註冊表（ctx.workspaceRegistry）說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workspace

[English](README.md) | 中文

## 概述

使用此包可以維護一個有序、持久的專案目錄列表，以及在每個目錄中執行的工作階段。主機可以建置專案側邊欄、在不刪除歷史的情況下把工作階段從分組中隱藏，並在不刪除資料夾、檔案或工作階段的情況下移除專案。重新新增已移除的目錄會建立一個全新專案，而目錄無法驗證的工作階段會保持 Ungrouped。需要持久專案分組的 GUI 或主機工作流適合使用它；它對模型不可見，不增加提示詞或請求上下文成本，但需要工作階段持久化與儲存後端。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

使用此包為產品提供專案列表：使用者工作的命名目錄、每個目錄中執行的工作階段、穩定順序，以及在不丟失工作階段的前提下將其隱藏或重新取回的能力。每項操作背後的 API 約定放在實作章節中。

### 何時使用

當產品展示持久 workspace 介面——側邊欄、工作階段分組或需要命名並排序目錄的自動化——時使用它。它對模型不可見，因此不增加任何 token 或請求成本。沒有分組介面時跳過它；harness 中沒有其他包需要它。

### 設定

此包需要工作階段儲存、工作階段持久化後端，以及儲存其記錄的儲存行。最小組合如下：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-workspace'
```

掛載這些行之後，建立專案會立即出現在列表中並在重新啟動後保留；首次啟動還會按工作階段執行的目錄對既有工作階段分組。如果缺少某個必需依賴，workspace 功能會一直不可用，直到它被掛載。

### 建立與排序專案

從任何已存在的絕對目錄路徑建立專案：`C:\` 等檔案系統根目錄和普通目錄都有效。相對路徑、`C:work` 等 Windows 磁碟機代號相對路徑、不存在的路徑和檔案都會被拒絕，且不會建立專案；為已有專案的目錄再次建立會原樣返回現有專案。你可以隨時重新命名專案，並把它移動到列表中的任意位置：

```text
// Host consumer code, after the composition above is loaded:
const project = await ctx.workspaceRegistry.create('/path/to/dir', 'My Project')
await project.setTitle('Renamed')
ctx.workspaceRegistry.list() // shows the project, newest first
```

<a id="first-use-workspace"></a>
### 預設工作區

`initializeDefault(resolveDirectory)` 確保永久預設 Workspace 存在，不建立 Session，也不考慮已有的其他 Workspace 和 Session 歷史。登記後由 `defaultWorkspaceId` 指明它。

目錄解析器在每次呼叫時於變更佇列內執行。它返回絕對路徑；註冊表建立缺失的父目錄、規範化路徑，再一起提交 Workspace 和預設標記，標題取所請求目錄（而非規範路徑）的最後一段，因此該路徑上的符號連結不會讓工作區改用連結目標的名稱。已存在的目錄直接複用，已登記在該目錄的 Workspace 會被採納為預設工作區；檔案衝突或目錄操作失敗時拒絕初始化。[Host 控制器](../../api/workspace-controller/README.zh.md#first-use-workspace)提供目錄策略。

首次成功登記會持久儲存工作區身份。解析出已登記預設工作區目錄的呼叫直接返回它，並在磁碟上缺少其目錄時重新建立；改名保留該身份。解析出其他目錄的呼叫把預設工作區移到該目錄，原預設工作區保留為普通 Workspace。解析器拒絕時，若已有登記的預設工作區，則重建其目錄並返回它；否則傳出該拒絕。`delete` 以 `WorkspaceDefaultUndeletableError` 拒絕刪除預設工作區。舊版本已刪除其登記的標記會被新的登記取代。目錄或登記失敗時，標記保持未設定，可以重試。後續步驟失敗前已建立的目錄會保留在磁碟上。目錄解析成功後，呼叫方取消操作不會復原目錄建立或登記。[永久預設工作區決策](../../../.agents/notes/implemented/feature/2026-09-26-permanent-default-workspace.zh.md)說明這一生命週期。

### 將工作階段歸入專案

工作階段加入它執行目錄所在的專案：在專案目錄中建立工作階段，它就會出現在該專案下，新到舊排列。一個工作階段只能屬於一個專案。目錄無法驗證的工作階段——沒有記錄目錄，或目錄被移動、刪除——無法加入，保持 Ungrouped。

### 隱藏、恢復工作階段與移除專案

`forgetSession(sessionId)` 將已刪除的 Session 從頭部索引、所有 Workspace 歸屬以及歸檔與置頂集合中移除；呼叫方需先刪除其已儲存日誌。

當工作階段不應再出現在分組中時隱藏它：它會從可見列表中消失，但其工作階段、歷史與在專案中的位置都保持不變。仍有工作在跑的工作階段——它自己的回合、執行中的子代理、後臺任務或活躍提醒——不會被藏在這些工作之下：註冊表會拒絕並列出還在跑的內容；呼叫方若要求先停止這些工作，註冊表會按使用者自己的停止操作同樣的方式停掉它們，然後再隱藏。當被隱藏的工作階段應重新出現時恢復它：它會回到其專案下記錄的位置；不屬於任何專案時則回到 Ungrouped，並從一份正常收尾的日誌繼續對話。專案不再需要時移除它：它離開列表，而其資料夾、檔案與工作階段歷史絕不受影響——這些工作階段變成 Ungrouped。之後再次新增同一目錄會從空專案開始，不會帶回舊工作階段。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋此功能背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **每個規範路徑一條記錄。** `fs.realpath` 是唯一的一套唯一性規範：路徑以規範化形式儲存，因此指向已有記錄目錄的符號連結會與之衝突，唯一性即規範路徑的字串相等。
- **成員資格是所有權加即時 cwd 事實。** 記錄的 `sessionIds` 順序是所有權真源；啟動時的頭部索引驗證它，`sessionIds` 在讀取時過濾，下一次變更會持久化剪除無效項。
- **僅讀取頭部。** 引導與 attach 驗證只讀取 `SessionHeader` 欄位；事件正文絕不載入。
- **兩次寫入的變更帶顯式標記。** 建立與刪除在記錄/順序對可能分叉之前先持久化 `pendingMutation` 標記，因此啟動只補全被中斷的操作，未標記的分叉作為損壞明確報錯。
- **序列化寫入。** 註冊表操作跑在同一條操作鏈上；實體變更透過領域寫鏈上的 `table.update` 執行，寫入 `updatedAt`，並在其所在的鏈位置決定成員資格。

<a id="api-behavior"></a>
### API 行為

該 API 由兩個物件負責：`WorkspaceRegistry` 建立、排序與刪除專案，管理工作階段記帳，並置頂、取消置頂、歸檔或恢復工作階段；`Workspace` 實體暴露顯示標題、目錄狀態與工作階段投影。置頂要求工作階段已知且未歸檔；歸檔在同一次持久化寫入中清除置頂，恢復工作階段不會恢復置頂。各方法的精確約定見 [src/index.ts](src/index.ts) 與 [src/entity.ts](src/entity.ts)。

歸檔准入是本包宣告並派發的兩個主機事件之上的能力接縫：`workspace/session-activity`（waterfall）向已組合的提供者詢問某工作階段還有什麼在跑，`workspace/session-stop`（parallel）請它們停止這些工作。`archiveSession(sessionId)` 只詢問一次活動 waterfall，對非空答案以 `WorkspaceActiveSessionError` 拒絕，其 `activity` 按族列出各項——鍵由各提供者自己合併進本包留空的 `SessionActivityKindMap`；`archiveSession(sessionId, { stopActivity: true })` 跳過活動檢查，先寫入歸檔，再派發停止事件，因此持久化的歸檔集合已經攔住停止所引發的每一次喚醒；提供者拋錯只記日誌，歸檔保留。呼叫在每個提供者的停止請求都已發出後返回，被停止的工作自行收斂。兩種詢問都在存在性檢查之後進行，對已歸檔 id 從不發生。隨附的提供者是 Agent 註冊表（執行中的回合）、任務註冊表接縫（所屬任務）、Subagent runtime（執行中的子孫）與 Schedule 外掛（活躍提醒）；沒有提供者的組合可自由歸檔。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`WorkspaceRegistry` 服務、頭部索引、引導、操作序列化 |
| [`src/entity.ts`](src/entity.ts) | 包私有 `Workspace` 實作及其唯一的 `mutate` 寫入路徑 |
| [`src/spec.ts`](src/spec.ts) | 領域宣告：記錄 schema、註冊表狀態、`defineDomain` 規範 |
| [`src/types.ts`](src/types.ts) | 公開 `Workspace` 介面與 `WorkspaceId` 品牌 |
| [`src/paths.ts`](src/paths.ts) | `realpath` 唯一性規範 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：實體快取映像持久表 |

### 持久形態

註冊表開啟 `workspace` 領域（版本 2）：一張以 `WorkspaceId` 為鍵的 `workspaces` 表，加上一個持有 `workspaceIds`（權威顯示順序）、`archivedSessionIds`、`pinnedSessionIds`、可選的首次使用身份 `defaultWorkspaceId` 與可選 `pendingMutation` 標記的全域狀態。歸檔與置頂集合儲存工作階段 id 字串，預設值為空，不包含逐項物件或時間戳；置頂陣列把最近置頂的 id 放在前面。歸檔在同一次全域狀態寫入中清除置頂，但不改變 Workspace 成員關係。取消歸檔不做工作階段存在性探測，因為從集合中移除 id 不可能引入未知 id，而歸檔會在加入前驗證工作階段。

### 生命週期

啟動時，註冊表開啟領域、若存在標記則補全被標記的變更、驗證已存狀態——重複路徑、重複工作階段記帳與順序漂移都會明確報錯——並在尚未初始化時先憑持久化頭部引導歷史、最後寫入已初始化標記，因此被中斷的引導可以安全恢復。全新空註冊表一旦初始化即成為正式狀態，絕不會再次引導。

### 失敗與恢復

建立或刪除的第二次寫入失敗時，快取與先前順序會復原；當操作與復原都失敗時，持久標記仍指明被中斷的操作，下一次啟動會補全或復原它。已提交的刪除即使標記清理失敗仍報告成功，下一次啟動會冪等地清除該標記。

### 不變式

`workspace-invariant` 伴生外掛註冊歸屬關係：`workspaces` 表的每個持久 `domain/changed` 都必須指向實體快取已持有的記錄——只有在註冊表從快取移除實體之後刪除才有效，因此繞過註冊表的寫入路徑會觸發不變式失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本包的視角不夠用時閱讀以下頁面：子系統參考是權威的功能約定，Agent Note 記錄了專案為何從工作階段歷史起步、以及移除為何是非破壞性的。

- [Workspace 子系統](../../../docs/subsystems/workspace.zh.md)——專案及其工作階段的功能約定，以及 workspace 服務的生成 API。
- [Workspace 包對映](../README.zh.md)——本組唯一的包及其儲存庫位置。
- [領域 KV 儲存 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——為什麼專案記錄使用領域資料形式。
- [Workspace UI 產品流 Agent Note](../../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)——首次啟動如何從工作階段歷史建置專案，以及 GUI 如何排序。
- [刪除 Workspace 註冊記錄決策](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)——為什麼移除專案絕不會刪除其資料夾或工作階段。

-----

<a id="model-experience"></a>
## 模型體驗

### Workspace 記錄與工作階段記帳

#### 模型看到什麼

沒有。`ctx.workspaceRegistry` 只向主機側消費方提供 workspace 記錄：此包不註冊工具、不注入提示詞、不寫入工作階段事件，因此沒有請求欄位會攜帶此包資料。

#### Token 影響

每個請求的直接 token 為零。

#### KV Cache 影響

與即時請求無關：此包絕不觸及請求字首，因此不會使提供者快取複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明專案列表何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **移除絕不刪除資料**——移除專案會保留其資料夾、檔案與工作階段歷史；這些工作階段變成 Ungrouped，而工作階段刪除與資料夾移除是彼此獨立且尚未提供的功能（參見[決策記錄](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)）。
- **只有帶記錄目錄的工作階段才能加入**——只有記錄中帶有可解析為專案路徑的目錄的工作階段才屬於專案；沒有目錄的工作階段保持 Ungrouped，來自其他目錄的工作階段無法移入。
- **外部變更延遲可見**——如果另一程序刪除或損壞目錄，專案只能在下次重新整理或重新啟動後反映出來。
- **歸檔與取消歸檔執行不同的工作階段驗證**——恢復只是從歸檔集合中移除 id，因此工作階段已不存在的條目仍能取消歸檔，也不會留下未知引用；對未歸檔 id 執行恢復不寫盤即完成，而 `archiveSession` 會拒絕既非即時也未持久化的工作階段。
- **活動檢查與歸檔寫入不是一個原子步驟**——在提供者作答與持久化寫入之間開始的回合會在隱藏狀態下執行，`agent/pre-step` 先於該寫入的每個模型步連同其工具呼叫照常執行；API Session Controller 的門禁把寫入之後提出的第一步以 `blocked` 收口，因此暴露面以該寫入的時延為界，實際上是一個模型步。
- **重新新增目錄從空開始**——移除後再次新增同一目錄會建立空工作階段列表的新專案；舊工作階段不會自動回來。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 開放：`create(path, title?)` 的 title 參數

閘道的按名稱建立分支移除後，`title` 參數已無生產呼叫方；程式碼中的 TODO 提議把該參數與其 `@param` 子句一併移除（參見[筆記](../../../.agents/notes/archived/simplification/2026-07-31-one-route-to-add-a-workspace.md)）。

</details>
