---
description: "面向需要在各項負責強制執行的能力之間組合、設定或排查檔案操作策略的使用者與維護者，提供共享的逐呼叫沙箱策略解析器與目前模型上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-policy

[English](README.md) | 中文

## 概述

使用本包可以讓每次受限的 bash、檔案系統和終端呼叫遵循同一份檔案操作策略。部署方選擇預設模式和退回工作區根目錄，每個工作階段則可以獨立切換模式。工作階段選擇可跨重新啟動保留，所有強制執行能力在一次呼叫中使用相同的模式和工作區。每次模型請求前，模型都會收到有效策略和工作區說明，但不會收到已掛載能力的清單。

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

在任何執行沙箱強制執行能力的組合中掛載此包：它擁有這些能力消費的部署預設值與逐工作階段覆蓋，並把目前策略貢獻給模型的執行時上下文快照。

### 何時選擇

為每個帶受限能力（bash、檔案系統、終端）的組合選擇它，讓單一策略歸屬位置防止它們漂移到不同的模式或工作區根目錄。只有沒有任何沙箱策略強制執行時才跳過它——沒有消費方時，解析出的策略不起作用。

### 最小設定

用預設模式載入本包；故障安全預設值是 `read-only`，需要 agent（智慧代理）可寫入工作區的部署必須顯式選擇 `workspace-write`。

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: workspace-write
    workspaceRoot: /absolute/path/to/workspace
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `mode` | `read-only` | 工作階段起始的部署預設模式，載入時驗證 |
| `workspaceRoot` | `process.cwd()` | 無 agent 呼叫或沒有 cwd 的工作階段所用的絕對退回根目錄；相對值在載入時拒絕。普通 agent 呼叫使用工作階段的不可變 cwd |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-sandbox-policy)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 切換工作階段模式

工作階段的模式可以在執行時透過 UI 策略控制元件或顯式切換來更改；切換記錄在工作階段日誌中，並在該工作階段的下一次受限呼叫時生效。切換透過回放跨重新啟動保留，每個工作階段保持自己的模式——兩個工作階段絕不會看到彼此狀態。切換後的工作階段繼續以不可變的工作區 cwd 作為寫入邊界。

### 失敗與恢復

無效的設定模式會在外掛載入時被拒絕，因此拼寫錯誤會導致顯式報錯，而不是靜默改變策略。沒有 cwd 的工作階段與無 agent 呼叫退回到設定的工作區根目錄；帶已批准顯式模式的呼叫只在該次呼叫中使用該模式。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋策略解析、逐工作階段儲存與模型可見貢獻；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 解析優先順序

`resolve({ session, mode })` 返回一份完整的逐呼叫策略：已批准的顯式模式優先於工作階段最後一條 `sandbox/mode` 事件，後者又優先於部署預設值。工作階段的不可變 `cwd` 提供工作區根目錄；否則使用設定的退回值。執行環境中的絕對路徑寫法保持不變。執行限制的提供者在自己的檔案系統上規範化根目錄，因此遠端 `symlink/..` 路徑絕不會在 Harness 主機上解析。

### 逐工作階段儲存

執行時切換是在對應工作階段日誌中追加的一條僅寫入日誌的 `sandbox/mode` 事件——切換本身就是事件，任何機制都不會在帶外修改模式狀態。`effective = explicit grant ?? fold(events) ?? deployment default`，因此覆蓋透過回放跨重新啟動保留，兩個工作階段也絕不會看到彼此狀態。工作區標識無需事件：建立時記錄的不可變 `SessionHeader.cwd` 是該工作階段每次呼叫使用的根。事件仍只進入日誌；在每次請求前，歸屬方會把目前事實貢獻給完整執行時上下文快照，agent loop（智慧代理迴圈）將該快照記錄為一條帶來源的 `user/message`。

### 模型可見文字

`sandbox:policy` 貢獻說明該模式與具體能力無關的檔案操作約定，以及 `workspace-write` 下已記錄的工作階段工作區。它不列舉已掛載能力；工具外掛保留特定於操作的拒絕與升權引導，批准策略單獨貢獻給同一份快照，計劃引導仍由 `dsh-plan-mode` 的系統段落管理。可選的 `./invariant` 配套元件會拒絕值超出封閉模式詞彙的偽造持久 `sandbox/mode` 事件。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SandboxPolicyService`、`Config` schema、策略解析與上下文貢獻 |
| [`src/session-mode.ts`](src/session-mode.ts) | `sandbox/mode` 事件、其 fold 與寫入路徑 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套元件：拒絕超出封閉詞彙的 `sandbox/mode` 值 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文件瞭解共享詞彙，再看 seam 約定與跨家族決策。

- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐呼叫策略與強制執行語義。
- [沙箱 seam 包](../sandbox/README.zh.md)——每個強制執行能力實作的隔離約定。
- [跨家族檔案沙箱決策](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——為何存在統一的共享策略歸屬位置。

-----

<a id="model-experience"></a>
## 模型體驗

### 目前檔案沙箱策略

#### 模型看到什麼

每個 agent 工作階段的目前執行時上下文快照中都有一項 `sandbox:policy` 貢獻。它不列舉已掛載的能力。工具外掛繼續負責操作與升權引導，批准策略單獨貢獻給同一份快照，計劃引導仍由 `dsh-plan-mode` 的系統段落管理。

##### 只讀

```markdown
Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

##### 工作區寫入

```markdown
Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

##### 完全存取

```markdown
Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.
```

#### Token 影響

首次請求和有效策略每次變化時增加一條簡潔的持久上下文訊息；未變化的請求不增加內容。`workspace-write` 只攜帶已記錄的工作階段工作區路徑；平臺特定的臨時路徑會以摘要表述，不會加入依賴主機的位元組。

#### KV Cache 影響

模式切換時，穩定的系統提示詞仍逐位元組相同。變化後的完整上下文快照會追加到保留的歷史之後，從而保留此前已快取的字首；後續未變化的請求會複用該保留快照。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了本包提供的策略範圍。它們是目前的包級約束，並非通用沙箱對比，也不是待辦事項清單。

- **每個工作階段只有一個主要工作區根目錄**——策略解析 `SessionHeader.cwd`；額外可寫根目錄不屬於 `SandboxExecutionPolicy`。
- **僅限檔案操作模式**——`SandboxMode` 管控檔案操作；網路和程序策略不在其詞彙中，因此這裡沒有限制它們的旋鈕。
- **有意概述臨時區域**——強制執行後端會授予不同的平臺臨時區域，這些區域在策略解析後才會選定，因此無法在目前上下文中如實列舉。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
