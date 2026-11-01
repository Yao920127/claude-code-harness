---
description: "在一個實驗性組合包中啟用團隊協作、工具與 Web 成員和任務看板。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-team-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team-profile` 讓 [Agent Teams](../agent-team/README.zh.md) 的團隊協作、工具和 Web 介面透過一個組合包啟用。開啟後可委派 teammate，並在 Web 中檢視成員、任務看板和成員工作階段。普通 subagent 委派及名稱重疊的全域 child control 會被停用；Workflow 仍可建立 fresh 子代理。本包隨 dsh 安裝提供，預設關閉，可在外掛頁開啟或新增到已初始化的 profile。

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

### 安裝到 profile

將本包新增到已初始化的 profile，然後執行一個要求 Lead 委派工作的任務：

```sh
dsh plugin --profile headless add @deepseek-ai/dsh-experimental-agent-team-profile
dsh --profile headless "Use Agent Teams to split this task between two teammates, wait, and summarize."
```

profile 必須已經包含 `@deepseek-ai/dsh-base`，本層會使用其中的 Subagent 服務與提供者設定行。執行 `dsh plugin --profile <name> remove @deepseek-ai/dsh-experimental-agent-team-profile` 移除本包時，bundle 也會從 profile 的有序層列表中移除。

在 Web 或 Desktop 的外掛頁開啟「智慧代理團隊」，即可同時啟用工具與介面。CLI 的 Web profile 也可使用以下命令：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile
```

已有 profile 的 `package.json` 中，`dsh.profile.bundles` 應只保留 `@deepseek-ai/dsh-experimental-agent-team-profile`，刪除獨立的 `@deepseek-ai/dsh-experimental-agent-team-web-profile` 條目。使用者 patch 中的 `ui-agent-team` 設定仍然有效。

### 獲得的功能

本層會新增 Agent Teams domain，以及 Team-scoped 建立、roster、訊息、interrupt、等待與任務板工具。直接委派使用支援 fresh 和 fork 上下文的 `spawn_teammate`。`subagent`、`subagent_fork` 工具和名稱重疊的全域 child control 均被停用。Workflow 保留 base profile 的 `spawn` 提供者，底層 Subagent 服務和兩個提供者仍供 teammate 與 workflow 使用。

在 Web 和 Desktop 工作階段中，[Team UI](../client-ui-agent-team/README.zh.md) 顯示成員列表與共享任務看板，並可開啟成員工作階段。同一個組合包開關控制工具與瀏覽器 UI。外掛頁透過組合包的 `package.json.icon` 宣告讀取其[圖示](icon.svg)，組合包停用時也會顯示。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包的執行時內容是 [`cordis.patch.yml`](cordis.patch.yml)。在 `dsh-base` 之後應用時，patch 會停用 `tool-subagent-control`、`tool-subagent-list-agents`、`tool-subagent` 和 `tool-subagent-fork`，並以顯式 provider 和限制插入 Team 服務、工具和 UI 行。UI 外掛的 Host 入口不執行邏輯；只有 Web 用戶端載入器會掛載其瀏覽器入口，因此 headless 無需啟動 Web 服務。

| 檔案 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 疊加在 `dsh-base` 之上的有序 patch |
| [`src/index.ts`](src/index.ts) | 空模組入口；patch 是執行時內容 |
| — | 不釋出執行時不變式伴生入口；本包只攜帶靜態 profile patch。Team 服務與工具各自持有其可變關係，UI 包持有其可釋放的 slot 註冊。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [實驗性包](../README.zh.md)——孵化狀態與釋出規則。
- [Agent Teams service](../agent-team/README.zh.md)——持久 roster、訊息與任務板行為。
- [Agent Teams 工具](../tool-agent-team/README.zh.md)——Team-scoped 模型工具表層。
- [Agent Teams 瀏覽器 UI](../client-ui-agent-team/README.zh.md)——成員列表、任務看板與成員工作階段導航。
- [Base bundle](../../bundle/base/README.zh.md)——本 patch 擴充功能的 profile 層。

-----

<a id="model-experience"></a>
## 模型體驗

### Team 策略與工具

#### 模型會看到什麼

Team 策略與 schema 由 [`@deepseek-ai/dsh-experimental-tool-agent-team`](../tool-agent-team/README.zh.md) 所有。本 bundle 只改變 composition：Team-scoped `list_agents`、`send_message` 與 `interrupt_agent` 會替代已停用的全域 continuable-child control。`spawn_teammate` 是直接委派工具。Workflow 的 `agent()` 呼叫建立 fresh 一次性子代理；其提示詞必須包含任務所需的上下文。

#### Token 影響

本 bundle 會加入 `@deepseek-ai/dsh-experimental-tool-agent-team` 描述的 Team 策略與工具 schema；它自身不增加提示詞文字。

#### KV Cache 影響

只要 bundle patch、Team identity 與設定的工具 schema 不變，本 bundle 的 composition 就保持字首穩定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅顯式啟用**——本包隨安裝提供但預設關閉；隨附 CLI、Web、SDK、ACP 與 Python profile 都不會啟用它。
- **Workflow 子代理工具**——[Team 工具可見性限制](../tool-agent-team/README.zh.md#known-limitations-and-deferred-work)也適用於 workflow 子代理。
- **共享 checkout**——所有 teammate 都觀察同一個工作目錄；本 bundle 不提供 worktree 隔離或檔案系統鎖。
- **預設內的子代理控制元件**——Web 預設仍可在預設作用域掛載 continuable Subagent 控制元件；頂層組合包不會替換這些註冊。
- **需要 base profile**——本 patch 依賴 `dsh-base` 提供的設定行 id 與 Subagent 提供者；它不是獨立 profile。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
