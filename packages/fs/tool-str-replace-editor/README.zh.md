---
description: "基於 `ctx.fs` 的獨立 str_replace_editor 工具：供為 agent（智慧代理）組合 Claude Code 風格檔案編輯能力的使用者與維護者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-str-replace-editor

[English](README.md) | 中文

## 概述

`dsh-tool-str-replace-editor` 提供基於 `ctx.fs` 的獨立面向模型 `str_replace_editor` 工具：`view` 顯示帶行號的檔案內容或淺層目錄列表，`create` 建立新檔案，`str_replace` 應用唯一的字面量替換，`insert` 在選定的邊界處插入行。它可以與持久 Bash、一次性 Bash、沙箱 Bash 或其他終端介面組合。修改操作遵守與 fs 家族其餘部分相同的編輯前讀取策略與沙箱圍欄，具體由所掛載的後端與策略外掛強制執行。當部署需要 Claude Code 風格、使用絕對路徑的單一編輯器工具時選擇它；`dsh-tool-fs` 包提供替代的 `read`/`write`/`edit` 套件。

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

當模型應透過熟悉的 `view`/`create`/`str_replace`/`insert` 命令詞彙在絕對路徑上編輯檔案時，把工具與 `ctx.fs` 後端（以及需要防護變更時的策略外掛）一起掛載。

### 最小組合

一個後端、可選地加策略外掛，然後是工具；編輯器可與任何終端介面組合。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

### 設定

| 鍵 | 預設值 | 含義 |
|---|---|---|
| `maxOutputChars` | `16000` | 檔案和目錄檢視結果保留的字首字元數 |
| `description` | `Custom editing tool for viewing, creating and editing files`（多行） | 面向模型的工具描述 |

### 命令

`view` 返回從 1 開始編號的檔案內容（保留製表符，因此顯示的文字仍可作為有效的字面量替換輸入）或忽略隱藏、依賴與 Python 快取條目的兩層目錄列表。`create` 建立新檔案，並拒絕覆蓋現有檔案。選定命令不使用的專用欄位可以包含 `null` 預留位置；必填欄位仍保持必填，`view_range: null` 選擇完整檢視，`str_replace.new_str: null` 會被拒絕，因此刪除內容必須省略該欄位。`str_replace` 要求字面量唯一匹配，錯誤只使用公開的 `old_str` 詞彙；`insert` 遵循所選的零基插入邊界，不會隱式補尾換行。修改操作會保留請求編輯範圍之外的製表符。

### 失敗與恢復

`view`、`str_replace` 或 `insert` 發生中繼資料未命中時，工具會在返回 `FS_NOT_FOUND` 前記錄確認缺失，因此後續 `create` 可以透過已掛載策略的防護建立流程恢復外部刪除的路徑；缺失狀態絕不會授權 `str_replace` 或 `insert`。防護變更繼承策略外掛的錯誤碼與恢復指令——`FS_NOT_OBSERVED`（先讀取檔案再重試）、`FS_STALE_VERSION`（先重新讀取再重試）——沙箱拒絕則表現為 `[sandbox: file access denied under <mode> mode]` 標記。路徑必須是絕對路徑；相對路徑會被拒絕並給出提示。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋編輯器工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該工具是基於 `ctx.fs` 的單一 schema、四個命令。修改操作絕不帶著自己的假設直接觸碰提供者：每個操作都執行 `fs/write-intent` 或 `fs/edit-intent` waterfall（瀑布式事件）以取得策略外掛的防護，在已掛載的 `ctx.fs` 實施沙箱限制時解析每次呼叫的沙箱策略，並把強制執行委託給提供者。`str_replace` 與 `insert` 還會重新讀取檔案，並在沒有策略外掛提供防護時把觀察到的版本作為比較並交換的基礎。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 整個工具：schema、命令分派、檢視渲染、修改策略 |

### 各命令如何執行

每個命令都先解析絕對路徑；修改操作隨後遵循同一條共享流程——策略防護、提供者強制執行、成功後記錄 `fs/observed`——而 `view` 只執行 stat 並渲染。整個工具——schema、命令分派與檢視渲染——都位於 `src/index.ts`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具逐步進入它所組合的約定、策略與後端。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本工具消費的 `ctx.fs` 約定。
- [tool-fs](../tool-fs/README.zh.md)——替代的 `read`/`write`/`edit` 工具套件。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——透過 `fs/*` 事件防護變更的策略外掛。
- [fs-sandbox](../fs-sandbox/README.zh.md)——圍欄變更的沙箱強制後端。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-str-replace-editor)——本包註冊的窮盡式 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到的內容

生成的 [`str_replace_editor` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-str-replace-editor)，包含設定的 `description`。本外掛不貢獻獨立系統提示詞段。

#### Token 影響

`str_replace_editor` 可見時產生固定的 schema 成本。

#### KV Cache 影響

設定的描述與 schema 不變時字首穩定。

### 工具結果

#### 模型看到的內容

檢視操作返回帶行號文字或淺層目錄列表。呼叫會提供檔案位置，建立/替換呼叫還會向展示層提供 diff 卡片。修改操作返回簡潔確認。長檢視結果保留字首並追加截斷提示。

#### Token 影響

隨資料變化，並受 `maxOutputChars` 與固定截斷提示約束。

#### KV Cache 影響

工具結果以追加方式位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明編輯器工具何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用編輯器對比或任務積壓。

- **操作面向 UTF-8 文字**——不支援二進位制檔案。
- **`str_replace` 刻意拒絕零匹配或多匹配**——它沒有 `replace_all` 參數。
- **每個修改操作都會經過已掛載的策略與沙箱**——`fs/write-intent` 或 `fs/edit-intent` 解析目前工作階段的沙箱策略，並把強制執行委託給已掛載的檔案系統與策略外掛，因此未掛載它們的部署會得到無條件變更。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。工具介面卡不持有獨立持久狀態；檔案系統修改關係屬於提供者與策略外掛。
