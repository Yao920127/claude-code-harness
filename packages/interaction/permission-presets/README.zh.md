---
description: "面向使用者的權限預設：供選擇、設定或排查把沙箱模式與審批策略捆綁在一起的 Permissions 選擇器的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-permission-presets

[English](README.md) | 中文

## 概述

提供具名權限模式，同時設定沙箱與審批，但各執行服務仍保留自己的值。設定預設提供未來工作階段預設值；顯式載入的 Auto review integration 可以增加一個僅限目前工作階段的選項。用戶端從程序目錄讀取可選項，從 Session 投影讀取目前選擇。不匹配任何預設的旋鈕組合顯示為 `custom`，使用者可以離開該狀態，但不能選擇它。本包擁有選擇與預設值；沙箱、審批和 Auto integration 擁有執行行為。

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

當部署希望向使用者提供一個 Permissions 選擇器、而非分離的沙箱與審批控制元件時，選擇此服務。它捆綁旋鈕；執行與審批各自保留自己的取值，因此以後移除本包，最後一次取值依然生效。

### 設定預設

外掛設定定義預設表與新工作階段的預設值。每個預設名稱把一個沙箱模式與一個審批策略捆綁為一組；`name` 與 `description` 是可選的用戶端呈現。保留名稱 `custom` 與 `auto` 不能出現在該表中。

```yaml
- name: '@deepseek-ai/dsh-permission-presets'
  config:
    presets:
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `presets` | `workspace-write`、`danger-full-access` | 預設名稱 → 沙箱／審批捆綁的表 |
| `defaultPreset` | 推斷 | 固定到新工作階段的預設；組合預設值不匹配任何預設時必填 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-permission-presets)是每個受支援欄位及其 JSDoc 的窮盡式真源。`custom` 保留給推匯出的非預設狀態，`auto` 則保留給 Auto review integration。掛載需要具有約束能力的 bash 執行器（會報告 `sandboxMode` 的執行器）與審批服務。

### 切換預設

切換到 Auto 時，服務先同步執行其准入檢查；每次預設切換隨後只改變實際值不同的旋鈕，再次選擇目前已生效的預設不會產生任何變化。目前值解析順序為：仍匹配的最近一次記錄選擇（已記錄的 Auto 選擇在 `never` 審批策略下也匹配），其次是設定表中的第一個匹配項，否則為 `custom`。使用者透過 `/permission` 命令切換：不帶參數呼叫時報告目前預設與所有可用條目，帶預設參數時切換過去。

### 使用者看到什麼

用戶端從程序級目錄渲染可選條目：先按表順序列出設定預設，再在 Auto integration 存活時列出 Auto。用戶端把這份快照與 Session 目前值合併；不匹配的 `custom` 值可以標記目前控制元件，但絕不會成為可選目錄行。Auto 的身份與旋鈕組合（Full access 沙箱加 `ask` 審批策略）固定在本服務內部；已記錄的 Auto 選擇也匹配委派子工作階段固定的 `never` 策略。shipped 用戶端的 locale 字典擁有 Auto 的 label 與 description，而設定預設保留 Host 提供的展示資訊。呼叫方不能透過通用 contribution API 釋出其他預設；他們可以從 `custom` 切換出去，但不能透過此服務選中或持久化一個具名 custom 預設。

### 工作階段預設值

`permission` 設定名稱空間為未來工作階段持有 `defaultPreset`，且只接受設定預設。建立工作階段時讀取它，將其應用於沙箱模式與審批策略，並把應用的預設記錄為一次 `permission/preset` 選擇。之後的設定變更絕不會改變現有工作階段。恢復的 seed（包括由 `session/end-seed` 明確標記的空 seed）會保留其有效權限，並只接收缺失的持久事實，而不會接收最新使用者預設值；持久化的 `auto` 身份在釋出前必須存在 live Auto 註冊並透過准入。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋寫入路徑、程序級目錄、由投影支援的目前值與可選命令。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `PermissionPresetService`：設定表、固定 Auto 註冊、寫入路徑、設定名稱空間、工作階段固定、子功能 |
| [`src/types.ts`](src/types.ts) | 程序級目錄、目錄變化事件與 `permissions` 目前選擇型別 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：驗證設定預設名稱；Auto 恢復在釋出前另行檢查 |

### 寫入路徑

`set()` 解析預設，並在適用時同步執行 Auto 准入檢查。切換僅在有效預設變化時追加 `permission/preset`，再透過各自的權威 setter——`dsh-sandbox-policy` 的 `setSandboxMode` 與 `dsh-user-approval` 的 `setApprovalPolicy`——寫入每個變化的旋鈕。因此，兩個預設共享同一組取值時，選擇事件仍會保留使用者意圖。Auto 與 Full access 之間切換時，記錄新的身份與變化的審批策略。淨變化為零的選擇不追加任何內容。

### 讀取側與 `custom`

`current(session)` 讀取必需的 `permissions` 投影；該單元在組合預設值（`ctx.shell.sandboxMode` 與審批設定）之上摺疊三個全量值旋鈕事件。host 狀態還會保留 `session/end-seed` 是否已經出現，使工作階段固定無需重掃日誌即可區分顯式為空的恢復 seed 與真正的新工作階段。仍匹配的最近選擇在共享捆綁時勝出，已記錄的 Auto 選擇在 `never` 審批策略下也匹配；否則設定表中的第一個匹配項勝出；否則返回推匯出的 `CUSTOM_PRESET`。投影 key 缺失時會顯式失敗。

`optionOf(name)` 返回設定條目、存活的 Auto 條目或僅供顯示的 `custom` 條目。只有名稱不匹配這三者時才拋錯；已撤回的 Auto 條目不可用。

### 工作階段固定與空白複用

掛載時會固定所有存活與未來的工作階段：真正全新的工作階段獲得設定預設預設與兩個旋鈕事實，而 seed 工作階段或部分初始化的工作階段保留其有效旋鈕值，只補充缺失的持久事實。投影自有的 seed 標記讓該判斷與旋鈕值共用同一份增量狀態。儲存的 `auto` 身份在 Auto integration 缺失或拒絕准入時無法釋出；服務既不會改寫它，也不會靜默推導為 Full access。

### 目錄、投影與可選命令

該服務要求 `ctx.sessionProjections`，並註冊一個只含 `currentValue` 的 `permissions` 投影。程序級 `catalog()` Remote 返回一份完整的可選快照。註冊或移除 Auto 會發出無 payload 的 `permission-presets/catalog-changed` 通知，因此用戶端先訂閱再重新讀取目錄；該過程不會追加 Session 事件、釋出 Session 投影幀或改變 Session 序列。`/permission` 命令僅在組合了 `ctx.commands` 註冊表時註冊。派生目前預設或固定初始選擇的呼叫會在投影 key 缺失時顯式失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從預設詞彙逐步進入執行旋鈕與設計依據。

- [權限預設子系統參考](../../../docs/subsystems/permission-presets.zh.md)——預設表、程序級目錄、目前選擇與 `ctx.permissionPresets` Cordis API。
- [沙箱切換設計 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——沙箱模式與審批策略如何組合與切換。
- [審批子系統參考](../../../docs/subsystems/approval.zh.md)——此服務捆綁的審批策略旋鈕。
- [互動組對映](../README.zh.md)——相鄰的命令、審批與問答包。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-user-approval` 和 `dsh-tool-bash`：二者渲染由此服務的旋鈕事件所選擇的審批策略提示詞、切換通知與經沙箱執行的工具結果；`permission/preset` 本身只寫入日誌。

#### KV Cache 影響

不會直接使快取失效；具名消費方擁有所有請求字首變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明預設服務不提供什麼。它們是目前包約束，不是權限系統對比。

- **只組合兩個機制級旋鈕**：預設選擇沙箱模式和審批策略；固定 Auto integration 可以增加准入行為，但 agent（智慧代理）／profile 選擇不屬於 `PresetSpec`。
- **`custom` 只能推導得出**：呼叫方可以從不匹配的旋鈕組合切換出去，但無法透過此服務選中或持久化一個名為 custom 的預設。
- **設定預設表在外掛生命週期內固定**：只有固定的 Auto contribution 可以在不重新載入本服務的情況下改變即時程序目錄。
- **Auto 不能成為預設值**：它只在 integration effect 存活期間存在，並且有意不進入 `permission` 設定 schema。
- **設定的預設值必須指向已設定預設**——移除被引用預設時，必須在同一次 Config 編輯中修改 `defaultPreset`。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
