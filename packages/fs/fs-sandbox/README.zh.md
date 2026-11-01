---
description: "強制沙箱的 `ctx.fs` 後端：面向把模型檔案變更限制在工作階段工作區內的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-sandbox

[English](README.md) | 中文

## 概述

`dsh-fs-sandbox` 按各工作階段的沙箱模式限制模型對檔案的寫入與編輯，同時保留本地檔案系統的讀取行為。`read-only` 拒絕所有變更；`workspace-write` 只允許目標位於工作階段工作區或平臺臨時根目錄內；`danger-full-access` 不限制變更。當工作階段需要將檔案變更限制在工作區內時，使用它代替 `fs-local`，並載入 `ctx.sandboxPolicy`。被拒絕的操作返回 `FS_SANDBOX_DENIED`，檔案系統工具會顯示目前模式和同輪次升級提示。

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

當模型的檔案寫入與編輯必須受工作階段沙箱模式約束、而讀取保持不受約束時，掛載此後端以替代 `fs-local`。圍欄按呼叫生效：工具層把呼叫工作階段的模式與工作區根目錄解析為與 bash runner 收到的相同策略，因此檔案系統與 shell 兩個能力族絕不會約束到不同根目錄。

### 最小組合

先載入共享策略服務，再載入此後端，最後載入工具；編輯前讀取策略外掛仍為可選。

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-fs-sandbox'
  config:
    cwd: /absolute/path/to/workspace
- name: '@deepseek-ai/dsh-tool-fs'
```

後端的設定與本地後端完全相同（`cwd` 解析預設值與 `diffBasisMaxBytes` 覆寫上限）；[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-fs-sandbox)是完整設定的真源。

### 圍欄行為

有效模式來自呼叫工作階段的覆蓋值或升級授權，兩者都未生效時才退回到部署預設值。`read-only` 以結構化 `FS_SANDBOX_DENIED` 拒絕所有變更。`workspace-write` 只允許目標規範化後位於工作區根目錄或平臺臨時區域（`/tmp`、`os.tmpdir()`）之下的變更——與 Seatbelt profile 授權的可寫集合相同。`danger-full-access` 不加圍欄直接委託。

### 可觀察的成功與失敗

讀取、列出、中繼資料操作與只讀監聽均與 `fs-local` 完全一致；變更圍欄不限制觀察。被拒絕的變更返回攜帶有效模式的 `FS_SANDBOX_DENIED` 錯誤；經工具，模型會看到 `[sandbox: file access denied under <mode> mode]` 及唯一一次獲批更寬權限的重試提示，與 bash 的拒絕完全相同。獲得批准升級的工作階段可以在該次呼叫中以嚴格更寬的模式重試同一操作。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋沙箱後端背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

圍欄是在可信程式碼中檢查模型控制路徑的策略，而非核心邊界。操作屬於 seam 自身（open、rename），只有目標路徑不可信，因此「規範化後檢查包含關係」就是該介面的完整答案。不可信程式碼的核心級隔離仍由 `ctx.shell` 負責。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SandboxedFileSystem`：`writeText`/`editText` 上的模式圍欄、`sandboxMode` 事實 |
| [`src/containment.ts`](src/containment.ts) | 祖先包含檢查，帶詞法快速路徑與基於身份的後備 |

### 變更如何被圍欄

每次變更先解析按呼叫策略（`danger-full-access` 原樣返回呼用方目標；`read-only` 丟擲 `FS_SANDBOX_DENIED`），`workspace-write` 則立即重新規範化目標，並要求它位於由唯一的 `writableRoots` 函式派生的某個可寫根之下——與 Seatbelt profile 授權的集合相同，因此 fs 圍欄與 bash runner 不會漂移。被變更的正是這個新目標，因此工具解析後被替換的符號連結祖先也會被發現。

### 威脅模型

解析到系統呼叫之間殘留的 TOCTOU 透過寫入前立即重新規範化來縮小，併為該威脅模型所接受；核心嚴密邊界需要 `openat2` 一類原語，其可移植性成本在此不值。拒絕是結構化 `FsError`，而不是 stderr 推斷——程序內圍欄準確知道自己拒絕了什麼。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本後端逐步進入共享策略歸屬及其背後的隔離決策。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本後端實作的 `ctx.fs` 約定。
- [fs-local](../fs-local/README.zh.md)——本後端擴充功能的本地後端。
- [sandbox-policy](../../sandbox/sandbox-policy/README.zh.md)——本後端所需的共享逐工作階段策略解析器。
- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐呼叫策略與故障關閉錯誤。
- [跨能力族 fs 沙箱決策](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——共享模式圍欄及其升級編排。

-----

<a id="model-experience"></a>
## 模型體驗

### 檔案系統策略與拒絕

#### 模型看到的內容

策略歸屬方貢獻與具體能力無關的 `sandbox:policy` 上下文。作為間接影響，`dsh-tool-fs` 會把本後端的 `FS_SANDBOX_DENIED` 拒絕渲染為 `[sandbox: file access denied under <mode> mode]` 標記和同輪次升級提示。

#### Token 影響

該後端掛載期間，目前策略條款會增加一條簡短的執行時上下文訊息；拒絕則會把有界標記與升級提示追加到對話歷史。

#### KV Cache 影響

常駐策略發生變化時，會在保留的歷史之後追加一份由歸屬方渲染、取代先前狀態的執行時上下文快照；操作結果保持僅追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明沙箱後端何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用沙箱對比或任務積壓。

- **策略圍欄，而非核心邊界**：該檢查是可信程式碼處理模型控制的路徑，因此解析到系統呼叫之間殘留的 TOCTOU 會被原位重新規範化縮小，但不會消除；對抗性主機程序不在範圍內。不可信程式碼的核心級隔離仍屬於 `ctx.shell`。
- **圍欄與 runner 的一致性由單一所有方派生**：可寫集合來自 `writableRoots`，該函式與 Seatbelt profile 共享；在其他位置定義可寫集合的 runner profile 會發生漂移。
- **要求 `ctx.sandboxPolicy`**：工具使用它解析每個工作階段策略，後端用它處理無 agent（智慧代理）呼叫的退回；未組合該服務時，後端不會實施約束。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個無狀態介面卡把策略與檔案系統關係委託給各自所屬的 seam。
