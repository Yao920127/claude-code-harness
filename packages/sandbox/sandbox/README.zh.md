---
description: "面向使用者與維護者的程序沙箱服務約定，用於組合、使用或擴充功能與主機共享檔案系統和核心的子程序限制機制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox

[English](README.md) | 中文

## 概述

使用 `dsh-sandbox`，可以讓子程序及其派生的所有程序在逐呼叫檔案存取策略下執行。命令可以禁止寫入（`read-only`）、只寫入工作區（`workspace-write`），或不受限制地執行（`danger-full-access`）。無法強制執行所請求的模式時，呼叫以 `SANDBOX_UNAVAILABLE` 失敗，絕不會不受限制地執行。呼叫被拒絕後，模型可以請求一個嚴格更寬的模式，交由人類批准一次。這種限制只適用於與主機共享核心和檔案系統的程序；需要隔離整個環境時，請使用容器、microVM 或遠端執行器。

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

將此服務與一個後端和一個受限消費方組合，消費方執行的每條命令都會在你解析的策略下執行——你只看到隔離結果及其強制執行完整度，永遠看不到 runner。

### 何時選擇

當組合需要在主機上隔離子程序時選擇本包：本地後端與受限執行器都實作這個約定，因此在 `ctx.sandbox` 後掛載 `sandbox-local`、在 `ctx.shell` 後掛載受限執行器，就能使每次 bash 或 pwsh 呼叫預設在限制下執行。當程序必須在隔離環境中執行時請另選方案——容器、microVM 或遠端執行器會替換整個 `ctx.shell`/`ctx.fs` 能力，而不是在這裡新增後端。

### 隔離命令

掛載服務、後端與受限執行器；隨附的組合由[基礎組合包（base bundle）](../../bundle/base/cordis.patch.yml)定義。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'     # the per-platform backend provider (ctx.sandbox)
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'    # the deployment default mode and workspace-write root
  config:
    mode: workspace-write                    # the deployment default every session starts from
    workspaceRoot: !!js process.cwd()        # the boundary workspace-write may write under
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'      # the confined executor behind ctx.shell
```

使用該組合時，bash 呼叫在 `workspace-write` 下受限執行：工作區內寫入成功，工作區外寫入被拒絕，模型可以透過下面的升權流程恢復。

### 模式與強制執行

模式指明命令可以執行的檔案操作；強制執行完整度報告後端對這些操作的管轄程度。

| 模式 | 效果 |
|---|---|
| `read-only` | 拒絕寫入，必需 sink（如 `/dev/null`）除外 |
| `workspace-write` | 允許寫入工作區根目錄及後端定義的臨時區域 |
| `danger-full-access` | 繞過隔離；消費方直接 spawn 原始 argv |

強制執行逐呼叫報告：`full` 表示後端管轄模式承諾的每個檔案操作，`partial` 表示活動後端或較舊的核心 ABI 只管轄子集——Windows ACL 檔與較舊的 Landlock ABI 是目前的部分強制執行情形，需要絕對邊界的消費方可以拒絕或向上暴露它們。

### 被拒絕的呼叫與升權

受限呼叫被拒絕時，操作會報告指明模式的拒絕標記——`[sandbox: file access denied under <mode> mode]`——組合宣告升權能力時還會給出升權提示。模型可以用 `sandbox_permissions`（足以放行的最窄更寬模式）加 `justification` 重試一次完全相同的呼叫；審批服務為操作取得同意。請求保留審計原因，同時提供英文和中文展示文案，模型給出的理由保持原樣。缺失的譯文遵循語言服務的退回鏈，最終退回到英文；請求方負責自己的展示譯文。更寬的模式需要審批，且只作用於該次呼叫。重複指定呼叫的生效模式無需審批即可成功；更窄的目標仍然無效。

### 故障關閉行為

沒有後端能強制執行所請求的模式時，呼叫以 `SANDBOX_UNAVAILABLE` 失敗，而不是不受限制地執行；錯誤文字會指明缺失的平臺 runner。啟動後失敗的後端還會報告結構化的 runner 失敗簽名，因此損壞的沙箱可以與命令失敗區分開。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋約定背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **同一執行環境。** 檔案系統、子程序與沙箱提供者使用同一檔案系統和核心。遠端組合替換這三個提供者，並在該環境中非同步解析限制。
- **策略隨呼叫傳遞。** `SandboxPolicy` 逐呼叫攜帶，絕不在提供者上固定：兩個消費方可以同時按不同策略隔離，獲批的升權重試只是用更寬策略發起的新呼叫。預設與解析是消費方顯式步驟。
- **故障關閉。** `confine()` 非同步返回用於強制執行限制的 argv，或以 `SandboxUnavailableError` 拒絕；絕不允許靜默無限制放行，功能探測用於仲裁多 runner 鏈。
- **統一的拒絕與升權詞彙。** 標記與提示文字以及嚴格更寬階梯都放在這裡，使 bash 與 fs 家族不會漂移。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SandboxProvider` 服務、模式/強制執行/策略型別、故障關閉錯誤 |
| [`src/escalation.ts`](src/escalation.ts) | 升權詞彙：更寬模式階梯、參數驗證、拒絕與提示標記、審批編排 |
| [`src/roots.ts`](src/roots.ts) | 可寫根目錄推導，Seatbelt profile 與程序內 fs 柵欄共享 |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

### 升權編排

階梯是封閉表——`read-only` 可升權到 `workspace-write` 或 `danger-full-access`，`workspace-write` 只能升權到 `danger-full-access`——在執行時檢查，絕不寫入工具 schema，schema 的列舉保持封閉的目標詞彙。[`approveEscalation`](src/escalation.ts) 在請求重複目前模式時無需審批就返回該模式，拒絕更窄或不支援的目標，併為更寬模式請求審批。呼叫方先驗證 `sandbox_permissions`/`justification` 配對。

### 可寫根目錄

`workspace-write` 意味著「工作區根目錄加主機臨時區域」：`writableRoots` 以規範化方式推導該白名單，解析符號連結並去重，使 Seatbelt profile 與程序內 fs 柵欄授予完全相同的根目錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文件瞭解窮盡式約定，再看實作它的後端、消費方與策略來源。

- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——完整詞彙、逐呼叫策略與分類方言。
- [子程序沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——能力邊界、升權設計與延期階段。
- [本地沙箱後端](../sandbox-local/README.zh.md)——`ctx.sandbox` 背後的各平臺 runner。
- [Bash 沙箱執行器](../../shell/bash-sandbox/README.zh.md)——受限的 bash 消費方。
- [沙箱策略包](../sandbox-policy/README.zh.md)——逐呼叫模式與工作區根目錄的來源。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接的限制錯誤

#### 模型看到什麼

透過 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md) 和 [`dsh-tool-bash`](../../shell/tool-bash/README.zh.md)，請求的受限模式沒有可用後端時會產生錯誤碼 `SANDBOX_UNAVAILABLE` 及下方精確錯誤；執行期 runner 失敗會追加 ` Runner failure: <detail>`。

##### 精確錯誤

```markdown
sandbox mode "<mode>" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL restricted-token runner can start (Windows) — otherwise switch the consumer to danger-full-access.
```

#### Token 影響

條件性錯誤文字對該次呼叫可見，並保留在歷史中直到壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 升權請求與結果

#### 模型看到什麼

被拒絕的呼叫會呈現標記 `[sandbox: file access denied under <mode> mode]`，組合宣告升權能力時還會呈現提示 `[sandbox: escalation available — retry this exact <subject> once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`。重試攜帶 `sandbox_permissions` 與 `justification`；使用者的 `allowed-once`／`rejected`／`cancelled` 決定成為該呼叫的結果文字。

#### Token 影響

只有被拒絕呼叫的錯誤與任何升權結果文字可見；兩者都會保留在歷史中直到壓縮。

#### KV Cache 影響

僅追加；升權文字位於保留字首之後，不會使已快取條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時需要特別運維。它們是目前包約束，不是通用沙箱對比或任務積壓。

- **檔案操作是完整的策略詞彙**——該 seam 不表達網路、程序、系統呼叫、裝置或憑證限制。
- **只支援與主機共享檔案系統和核心的限制**——容器、microVM 與遠端執行需要替換能力實作，而不是在此新增提供者。
- **拒絕報告是一種 stderr 方言**——該 seam 返回後端簽名，而非型別化執行時拒絕通道，需要分類的消費方必須從子程序輸出推斷。
- **Runner 診斷使用帶內通道**——退出狀態與 stderr 證據無法證明匹配行由哪個程序寫入，因此故意模仿 runner 的受限子程序可能造成錯誤的可用性或診斷歸因；這無法繞過隔離，帶外 runner 狀態通道暫緩實作。
- **每個上下文只有一個提供者**——同時組合不同沙箱機制需要提供者級階梯或獨立 Cordis 上下文；呼叫方逐呼叫選擇策略，而非後端標識。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：未決方向與開放問題。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：消費方與環境

[沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)列出延期階段——可選的 `subagent-acp` 消費方（隔離子 agent（智慧代理），預設不隔離）與環境一致的能力組範例。兩者均未決定；該筆記列為延期的 Windows 鏈已透過 `sandbox-local` 的 ACL 受限權杖檔交付。

</details>
