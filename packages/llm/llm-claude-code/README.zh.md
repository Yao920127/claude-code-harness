---
description: "面向希望在 harness 中直接使用已登录的 Claude Code、无需 API 密钥与 Claude Code 对话的用户，以及该路由维护者的 Claude Code 模型路由。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-llm-claude-code

[English](README.md) | 中文

## 概述

安装这个 Profile Bundle，即可在 harness Session 中与 Claude Code 对话，无需 API 密钥。它注册 `claude-code` 模型路由，其模型列表取自你的 Claude 账号。每次模型调用都会通过官方 Agent SDK 在 Session 工作区中运行一个完整的 Claude Code 回合，并使用宿主机本身的 Claude Code 登录；harness 显示回答、思考过程，以及 Claude Code 每运行一个工具就显示一行。想让 Claude Code 成为对话对象时选择本包；若要把一个任务委派给 Claude Code，则选择 [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.zh.md)。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 开始之前

在运行 harness 的机器上登录一次 Claude Code（运行 `claude`，然后执行 `/login`）。该路由通过 Agent SDK 锁定的平台 CLI 复用此登录；它从不读取、复制或修改已存储的凭据，并会从继承的环境中移除 `ANTHROPIC_API_KEY` 等凭据类变量。没有可用登录的回合会以 `INVALID_CREDENTIAL` 代码失败，消息中会说明如何登录。

### 安装 Bundle

把本包安装进目标 Profile，然后重启该 Profile。Bundle 会带入锁定版本的 Agent SDK、其平台 CLI 载荷，以及 [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.zh.md)——本路由复用其受管进程适配器。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code
dsh --profile <name>
```

Bundle 补丁插入一行 `llm-claude-code`。在 Web 应用中，于任何 agent preset 下在输入框的模型选择器里选择 Claude 模型；把它设为默认模型选择后，每个新 Session 都会以 Claude Code 开始。选择器列出 Claude Code 为你的账号报告的模型——例如 `Claude (Claude Code settings)`（不发送模型，由你的 Claude Code 设置决定，例如 `"model": "opus"`）、`Claude Sonnet 5` 以及 `Claude Fable 5.1`——并在选择器首次请求时从一个短暂的 Claude Code 进程读取该列表。设置项的说明写出账号的推荐模型，它只在没有设置选择模型时生效。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | `claude-code` | 注册到 `ctx.llm` 的路由名；每个挂载实例需要唯一值 |
| `displayName` | `Claude Code` | 模型选择器显示的路由名称 |
| `models` | 自动发现 | 可选模型；缺省或为空时列出账号的模型。id `default` 不发送模型，由你的 Claude 设置决定，其他 id 原样传给 Claude Code |
| `permissionMode` | `session` | `session` 跟随每个 Session 的权限预设；原生模式（`default`、`acceptEdits`、`auto`、`plan` 或 `bypassPermissions`）固定每个回合 |
| `env` | `{}` | 叠加在已清除凭据的父环境之上的显式环境 |
| `disposeGraceMs` | `3000` | 受管进程各终止层级之间的宽限时间 |
| `retryPolicy` | `{ mode: normal, maxRetries: 0 }` | 模型请求重试策略；默认从不重试，因为失败的回合可能已经修改了文件 |
| `commandRefreshMs` | `300000` | `/` 菜单列出 Claude Code 命令后，再次读取前等待的毫秒数 |
| `usageFreshMs` | `60000` | 一次方案用量读取在再次询问 Claude Code 前供应用窗口使用的毫秒数 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-claude-code)是每个可接受字段的完整来源。

### 权限

在默认的 `session` 设置下，每个回合的原生权限模式跟随 Session 的沙箱模式与审批策略。完全权限（`danger-full-access` 搭配 `never` 策略）以 `bypassPermissions` 运行 Claude Code，因为 `never` 策略会拒绝每一个提示；`workspace-write` 使用 `acceptEdits`，文件编辑无需询问即可进行；其他所有组合，以及没有沙箱或审批服务的组合，使用 `default`。Claude Code 先应用你的用户、项目和本地 Claude 权限规则。对于这些规则未决定的操作，路由会代表发起该回合模型调用的 Agent 向 `ctx.approval` 询问：Web 审批卡片显示原生提示标题，或工具名称及其命令、文件或 URL。`allowed-once` 允许这一次操作；其他所有结果都会拒绝，拒绝原因会传给 Claude Code。`bypassPermissions` 跳过所有检查，从不询问。

### 你的 Claude Code 命令与 skill

Claude Code 回合会加载你的用户、项目与本地 Claude 设置，因此你为 Claude Code 安装的 skill、自定义命令与插件命令在这里同样可用。组合挂载 `ctx.skills` 时，该路由会把 Session 工作区中 Claude Code 回合接受的每个命令列为用户可调用的 skill，于是 `/` 菜单会提供它。选择或输入 `/hello` 会把字面文本发送给 Claude Code，由 Claude Code 自行执行该命令；harness 不注入 skill 正文。名称不符合小写 kebab-case skill 语法的命令（例如带 `:` 的插件命令）不会出现在菜单中。同名的 harness 命令或 skill 优先。列出失败（例如安装未登录）时，这些命令在下次查询前不会出现；每次列出后经过 `commandRefreshMs` 会再次读取列表。

<a id="plan-usage"></a>
### 方案用量

`claudeCodeUsage` Remote 报告已登录账号的方案窗口（五小时、每周与按模型的每周窗口）及其用量与重置时间。一次读取在 `usageFreshMs` 内回答所有应用窗口；刷新会再次询问 Claude Code。API key 与第三方登录不报告方案窗口。该 Remote 读取 Claude Code 的实验性用量请求，其字段可能随 Claude Code 版本变化。

### 你会看到什么

助手消息包含作为推理内容的 Claude Code 思考过程、作为文本的回答，以及每个顶层工具调用一行形如 `Claude Code ran <tool>: <subject>` 的推理内容。Claude Code 一开始调用工具，该行就带着工具名称出现，因此整份文件写入这类较长的工具输入也能显示正在进行的工具；输入完整后再补上对象。失败的工具结果（包括权限拒绝）会增加一行形如 `Claude Code's <tool> failed: <错误的第一行>` 的内容。嵌套的 Claude Code subagent 通信、成功的工具结果、hooks 和状态消息都留在 Claude Code 内部。

当组合挂载了应用 Browser（`ctx.sidebarBrowser`）时，每个对话回合都会给 Claude Code 一个 `open_browser_tab` 工具。Claude Code 用它展示网页（例如本地开发服务器），页面会在该 Session 右侧 Sidebar 的新 Browser tab 中打开，而不是外部浏览器。该工具无需权限提示，只接受 http 和 https URL，没有应用窗口打开时回报失败。

### 失败与恢复

| 失败 | 代码 | 恢复方式 |
|---|---|---|
| 没有可用的 Claude Code 登录（HTTP 401 或 403） | `INVALID_CREDENTIAL` | 用 `claude` 和 `/login` 登录，然后重新发送 |
| Claude Code 速率限制 | `RATE_LIMIT` | 等待后重新发送 |
| 回合因 Claude Code 限制而停止 | `CLAUDE_CODE_LIMIT` | 发送范围更小的请求 |
| Claude Code 执行错误或其他 API 错误 | `CLAUDE_CODE_EXECUTION`、`CLAUDE_CODE_ERROR` | 阅读消息后重新发送 |
| 进程失败或缺少平台载荷 | `CLAUDE_CODE_PROCESS` | 连同可选依赖重新安装 Bundle |
| 请求中带有采样选项或图片 | `UNSUPPORTED_OPTION`、`UNSUPPORTED_CONTENT` | 发送不含采样覆盖的文本 |

取消 harness 回合会中止 Claude Code 回合，并等待其进程树退出。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

### 设计概念

- **一次模型调用就是一个 Claude Code 回合。** 该路由是普通的 `LlmAdapter`，因此 agent loop、Session 日志、模型选择和 preset 都无需改动；Claude Code 运行自己的工具，因此路由不向它提供 preset 的任何工具，loop 看到一条不含工具调用的助手消息并结束该步骤。
- **Claude Code 的记录保存其上下文。** harness 日志保存渲染后的对话；助手消息的 replay 状态保存原生对话 id 与最后一个链条目。下一次请求用 `resume` 和 `resumeSessionAt` 从该处精确续接，使重试、fork 和恢复的 Session 都从持久的 harness 消息继续，而不是从最新的原生条目继续。
- **原生设置保持权威。** 路由省略 `settingSources`，因此 Claude Code 会加载宿主机的用户、项目和本地设置、hooks 以及 `CLAUDE.md`，对话回合保留 Claude Code 自己的 `claude_code` 系统提示：harness 系统提示描述的是路由从不提供的 harness 工具。

### 源码地图

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema 与路由注册 |
| [`src/adapter.ts`](src/adapter.ts) | SDK 查询选项、回合生命周期与进程释放 |
| [`src/request.ts`](src/request.ts) | 请求校验、续接游标选择与提示渲染 |
| [`src/stream.ts`](src/stream.ts) | SDK 消息到流块的转换、用量与终止映射 |
| [`src/approval.ts`](src/approval.ts) | 基于 `ctx.approval` 的原生权限回调 |
| [`src/permissions.ts`](src/permissions.ts) | 由路由设置与 Session 权限旋钮得出的原生权限模式 |
| [`src/browser-tool.ts`](src/browser-tool.ts) | 在应用 Browser 中打开页面的进程内 MCP 工具 |
| [`src/commands.ts`](src/commands.ts) | 为 `/` 菜单列出 Claude Code 斜杠命令的 skill provider |
| [`src/usage.ts`](src/usage.ts) | 基于 Claude Code 用量请求的 `claudeCodeUsage` Remote |
| [`src/types.ts`](src/types.ts) | 用量 Remote 的线路类型 |
| [`src/replay.ts`](src/replay.ts) | 保存原生续接游标的带版本 replay 状态 |
| [`cordis.patch.yml`](cordis.patch.yml) | 插入路由的 Profile 补丁层 |

### 请求流程

`planTurn()` 拒绝 temperature、停止序列、推理强度、图片，以及对话请求中的 `maxTokens`，并忽略 harness 工具 schema。它找到本构建可读取 replay 状态的最新助手消息，并把其后结尾用户消息中由人撰写的文本作为提示发送；插件插入的用户消息（例如 runtime-context 快照）会被舍弃，除非结尾消息中没有其他内容。从该位置到结尾用户消息之间的消息——没有 replay 状态时则为全部消息——会在提示前的 `<conversation_history>` 块中引用一次。辅助调用（设置了 `purpose`，例如 Session 标题）发送所有消息、附加其系统提示、从不续接，并以无工具、单回合且不持久化原生记录的方式运行。[`src/models.ts`](src/models.ts) 为发现的模型命名：原生默认项以决定它的 Claude Code 设置命名，所有别名都保留在列表中。

adapter 从请求的 Session 解析工作区；请求未指定 Session 时则从发起调用的 Agent 解析，两者都没有工作区时，会在启动 Claude Code 之前以 `NO_WORKSPACE` 失败。SDK 的自定义 spawn 钩子把平台 CLI 置于 `ctx.subprocess` 之下；流的 `finally` 会关闭查询、终止受管范围，并等待整个进程树退出。

### 流转换

部分消息事件流式传输顶层文本和思考增量。顶层工具调用在 `content_block_start` 时以其名称开启一个推理块，累积其输入 JSON 增量，并在 `content_block_stop` 时补上对象；组装完成的助手消息只渲染未经流式传输的工具调用。顶层用户消息中带 `is_error` 的工具结果成为一个推理块，内容为结果的第一行文本，上限 200 个字符。最后一个顶层助手或用户链条目成为续接游标。用量取自回合中最后一次原生模型调用：输入 token 包含缓存读写，用以衡量 Claude Code 当前携带的上下文。SDK 结果成为唯一的终止 `finish` 块；没有可续接条目的成功结果视为失败。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [LLM 流式子系统](../../../docs/subsystems/llm-streaming.zh.md)——本路由实现的 adapter 契约、流块与 replay 状态。
- [审批子系统](../../../docs/subsystems/approval.zh.md)——权限回调使用的请求、结果与审计语义。
- [Claude Code subagent 提供方](../../subagent/subagent-claude-code/README.zh.md)——一次性委派的同类包，本路由复用其受管进程适配器。
- [添加 LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.zh.md)——每个 adapter 都要满足的协议义务。

<a id="model-experience"></a>
## 模型体验

### Claude Code 提示

#### 模型看到的内容

Claude Code 的模型看到 Claude Code 自己的 `claude_code` 系统提示、由 `resume` 恢复的原生记录，以及一个提示：结尾由人撰写的用户消息文本，以空行连接。原生记录缺少更早的消息时，提示以 `<conversation_history>` 块开头，每条含文本的早先消息对应一个 `<user>`、`<assistant>` 或 `<tool result>` 元素；助手工具调用渲染为 `[tool call <name>: <arguments>]`，推理内容被省略，插件插入的用户消息被舍弃。

#### Token 影响

每次请求加入结尾用户文本。引用历史块只在原生记录缺少该历史的请求中发送，其大小等于被引用消息的文本。harness 工具 schema 与 harness 系统提示不增加任何内容。Claude Code 自己的工具使用、压缩和系统提示所增加的 token 由 Claude Code 负责。

#### KV Cache 影响

续接的回合追加到原生记录，因此复用取决于 Claude Code 自身对其前缀的缓存。引用历史的请求会开始新的原生对话，并可能使早先原生前缀的复用失效。

### 应用浏览器工具

#### 模型看到的内容

当组合挂载了应用 Browser 时，对话回合会增加一个 MCP 服务器 `app_browser`，其中有一个始终加载的工具 `open_browser_tab(url)`，描述为 "Open an http or https URL in a new tab of the browser the user sees in the app."，并附带服务器说明："The user works in an app that has its own browser. To show the user a web page, including a local development server, call open_browser_tab with its http or https URL. Do not open an external browser, for example with the open, xdg-open, or start commands." 辅助调用两者都不会收到。

#### Token 影响

每个对话回合增加工具 schema 与说明，大小固定，与对话无关；每次调用增加其 URL 和一行结果。

#### KV Cache 影响

工具定义与说明在每个回合都相同，因此留在 Claude Code 可复用的前缀内；加入或移除应用 Browser 会让该前缀改变一次。

### Harness 历史

#### 模型看到的内容

之后在其他路由上的请求会把这些助手消息的文本与推理块——包括 `Claude Code ran <tool>: <subject>` 行——作为普通的 agent loop 历史接收。

#### Token 影响

保留的助手消息会因每个顶层工具调用增加一行短文本，并加上 Claude Code 的文本与思考内容。

#### KV Cache 影响

仅追加：每个回合在可复用前缀之后增加一条助手消息，不会改写任何早先历史。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **harness 工具不会被使用**——路由忽略 preset 的工具 schema；由 Claude Code 自己的工具、MCP 服务器和其设置中的技能取代。
- **仅支持文本输入**——图片附件会以 `UNSUPPORTED_CONTENT` 失败；路由向模型选择器声明仅接受文本输入。
- **应用浏览器工具只引导、不阻止**——其说明要求 Claude Code 不要启动外部浏览器，但只要 Session 权限允许，shell 的 `open` 命令仍可执行。
- **工具活动是一行文本**——顶层工具调用与失败结果渲染为推理行而非工具卡片，成功的工具结果留在 Claude Code 内部。
- **没有提问通道**——由于不存在 harness 提问桥接，`AskUserQuestion` 被禁用；Claude Code 改为在回答文本中提问。
- **辅助调用的输出上限仅供参考**——Session 标题或压缩调用的 `maxTokens` 会被接受，但由 Claude Code 执行自己的输出上限。
- **harness 压缩衡量的是另一份上下文**——preset 的压缩会通过单回合 Claude Code 调用总结 harness 历史；下一回合随后从该摘要开始新的原生对话，而 Claude Code 也会自行压缩其记录。
- **原生记录位于 Session 之外**——删除 harness Session 会把 Claude Code 的记录留在宿主机的 Claude 配置目录中，而原生记录被移除的请求会失败。
- **分发条款**——本路由使用宿主用户自己的 Claude Code 登录；在托管部署中把该登录提供给其他用户，需要取得 Anthropic 的批准。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

本开发备注是维护者的工作背景：尚未解决的问题与未定方向。它明确不具权威性——已交付的行为与限制以上方各节和包代码为准。

- **共享进程适配器**——本路由从 `dsh-subagent-claude-code` 导入 `ManagedClaudeCodeProcess` 与 `claudeSpawnSpec`；独立的 Claude Code 进程库可让本路由去掉该 peer 依赖。
- **更丰富的活动显示**——插件自有的内容块加上 Web Chat 节点渲染器，可以把 Claude Code 的工具调用与结果显示为卡片。

</details>

**运行时不变量：** 不发布配套模块。本路由不拥有任何可被独立观察推翻的关系；replay 校验与进程树静止由使用它们的操作内部强制执行。
