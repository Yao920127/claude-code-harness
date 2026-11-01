---
description: "透過 present 宣告交付可存取的檔案；設定、Session 歸屬與原始檔開啟。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present

[English](README.md) | 中文

## 概述

使用 `present` 宣告交付Session 檔案系統可存取的最終檔案，包括透過 shell 命令建立的檔案。使用者使用預設應用開啟目前原始檔。工具記錄路徑和可選說明，不複製檔案內容。

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

`standard`、`ptc` 與 `cordis` Agent preset 掛載本外掛。建立檔案後，以 `files: [{ path, description? }]` 呼叫 `present`。檔案必須是 Session 檔案系統可存取的普通檔案。相對路徑按 Session 工作目錄解析；絕對路徑可以指向工作區外的檔案，包括 `/tmp` 或 Downloads。檔案缺失、為目錄、最終路徑為符號連結或提供者拒絕存取時，呼叫失敗。Shell 沙箱私有 `/tmp` 中的檔案需要先寫入 Session 檔案系統可存取的位置。

在 Agent 的 Cordis 組合中掛載，並提供 `tools`、`fs` 和 `turnBoundary` Session 投影：

```yaml
- name: '@deepseek-ai/dsh-tool-present'
  config:
    maxFiles: 8
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxFiles` | `8` | 每次呼叫的最大檔案數，為正整數 |

掛載時驗證檔案數量上限。工具要求 Agent Session 具有工作區和尚未結束的輪次。交付歸呼叫方 Session 所有；父 Session 如需宣告交付子 Agent 建立的檔案，必須自行呼叫 `present`。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

工具透過設定的檔案系統提供者解析路徑，檢查普通檔案中繼資料，不讀取內容。成功的最終 `tools/result` 通知追加 `deliverables/presented`，巢狀呼叫也適用。外層程式隨後失敗不會撤銷已完成的宣告。被阻止的結果不釋出宣告。每個外掛實例只記錄其實際執行的呼叫；同名作用域工具不能透過其他實例釋出交付。

純 `./types` 入口宣告 `PresentedFile` 與 Session 事件，不匯入 Host 執行時程式碼。Web 消費方在展示或開啟檔案前驗證持久宣告。事件不儲存 Session ID，因此 fork 歷史中的相對路徑按目前檢視的 Session 工作區解析。

**執行時不變式：** 不釋出伴生入口。工具與事件註冊歸 effect 所有，Session 日誌擁有檔案宣告；外掛不維護獨立的檔案內容儲存。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——提供者路徑與錯誤。
- [Web 交付](../../client/ui-deliverables/README.zh.md)——原始檔開啟與卡片。
- [交付決策](../../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.zh.md)——Session 歸屬與讀取端必須識別的事件。

<a id="model-experience"></a>
## 模型體驗

### present

#### 模型看到的內容

[present schema](../../../docs/tool-catalog.zh.md#present)要求已有且可存取的檔案：“Declare existing files as final deliverables for the user. Use it when the user needs a separate file, especially Office documents, spreadsheets, and slide decks; prefer your final response when that suffices. The user opens the current files; their contents are not copied.” `files` 參數要求選擇 1-2 個最重要的交付物，每次呼叫最多 4 個。每個檔案的結果為 `Presented <path>`；程式結果和持久事件包含路徑及可選說明。

#### Token 影響

每個掛載的 Agent 增加一個工具 schema，每個交付檔案增加一行結果。檔案位元組不進入模型訊息。

#### KV Cache 影響

工具 schema 在掛載期間保持靜態。交付結果文字擴充功能對話，不重寫提示詞字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 中繼資料和 Host 路徑檢查無法原子性地阻止桌面應用開啟檔案前發生的路徑替換。
- 編輯會改變開啟的內容。原始檔刪除或移動後，無法透過原宣告開啟。
- Session ZIP 匯出包含宣告，不包含檔案內容。交付版本持久化和寫時複製儲存延期實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
