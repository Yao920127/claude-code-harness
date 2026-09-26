# Agent Note：以 Claude Code 作为模型路由

Status: implemented

[English](2026-09-25-claude-code-model-route.md) | 中文

## 问题

已登录 Claude Code 但没有模型 API 密钥的用户，无法在 harness Session 中与 Claude Code 对话。[一次性 Claude Code subagent](2026-08-04-claude-code-and-codex-subagent-backends.zh.md) 只把 Claude Code 作为 harness agent 的委派子任务运行，而父级仍需要一条模型路由，这样的用户并没有。harness 需要一种方式，让 Claude Code 本身成为 Session 的对话对象，同时保持 agent loop、Session 日志、模型选择和 preset 不变。

## 决定

[`@deepseek-ai/dsh-llm-claude-code`](../../../../packages/llm/llm-claude-code/README.zh.md) 在 `ctx.llm` 上注册 `claude-code` 提供方路由。一次模型调用会通过官方 Agent SDK 在 Session 工作区中运行一个完整的 Claude Code 回合，使用宿主机原生的 Claude 设置与登录；继承环境中的凭据类变量会被清除。loop 收到一条助手消息：Claude Code 的文本作为文本，思考作为推理内容，每个顶层原生工具调用一行推理内容。该消息不含工具调用，因此 loop 结束该步骤。

助手消息的 replay 状态保存带版本的游标：原生对话 id 与该回合最后一个顶层链条目。下一次请求从本构建可读取游标的最新助手消息处，用 `resume` 和 `resumeSessionAt` 续接，并只发送结尾的用户消息。原生记录缺少的消息——第一个 Claude Code 回合之前的全部消息，或之后由其他路由产生的回合——会在 `<conversation_history>` 块中引用一次。在持久消息自身的游标处续接，使重试、fork 和恢复的 Session 从 harness 日志继续，而不是从最新的原生条目继续。

本路由可在任何 agent preset 下运行。Claude Code 无法返回工具调用供 harness 执行，因此路由忽略 preset 的工具 schema，对话回合保留 Claude Code 自己的系统提示，并只发送由人撰写的用户文本：harness 系统提示与插件插入的 runtime-context 消息描述的是 Claude Code 不使用的 harness 工具与沙箱。模型选择器通过 `supportedModels()` 列出 Claude Code 为已登录账号报告的模型，此请求不会启动模型回合。宿主机 Claude 权限规则未决定的操作，会代表发起调用的 Agent 经由 `ctx.approval` 处理。路由默认不重试，因为失败的回合可能已经修改了文件。辅助调用（设置了 `purpose`）会连同其系统提示发送所有消息、从不续接，并以无工具、单回合且不持久化记录的方式运行。

路由复用 `dsh-subagent-claude-code` 中的 `ManagedClaudeCodeProcess` 与 `claudeSpawnSpec`，因此锁定版本的平台 CLI 在 `ctx.subprocess` 之下运行，进程树归属与 subagent 相同。

## 考虑过的替代方案

**按 preset 选择的第二个 agent driver。** `AgentRegistry` 只持有一个 factory，按 preset 路由需要修改核心。空白 Session 会通过 `recompose` 在同一个活动 Agent 上更换 preset，而一个 Agent 无法跨 driver 这样做。每个与 loop 耦合的插件也都需要第二套实现，否则会静默失效。

**在专用 Profile 中替换 agent loop。** Claude Code Session 将无法与其他路由共存，而读取 `turnBoundary` 与 inbox 等 loop 投影的 Web 界面也需要一个并行的生产者。

**通过进程内 MCP 服务器向 Claude Code 暴露 harness 工具。** Claude Code 会在模型调用内部执行这些工具，绕过 harness 工具管线、其审批，以及让工具效果可被模型看到并被记录的 `tool/*` 日志事件。

**直接用 Claude Code 存储的 OAuth token 调用 Messages API。** 这会绕过被借用登录的产品及其条款；本路由改为运行官方产品。

## 影响

- 使用 Claude Code 模型的 Session 不需要 API 密钥；缺少登录时以 `INVALID_CREDENTIAL` 失败，并附登录说明。
- Claude Code 自己的记录位于宿主机的 Claude 配置目录下，保存其模型所见的上下文；harness 日志保存渲染后的对话以及续接所需的游标。删除 Session 不会删除原生记录。
- 原生工具活动是显示文本，而不是 `tool/*` 事件，工具结果留在 Claude Code 内部。
- 本路由仅接受文本，禁用 `AskUserQuestion`，并把辅助调用的 `maxTokens` 视为参考值。
- 在托管部署中把宿主用户的 Claude Code 登录提供给其他用户，需要取得 Anthropic 的批准。
- 单元测试覆盖请求规划、replay 解析、流转换、审批结果、SDK 选项映射、取消与进程释放；Loader 组合测试在 headless profile 之上启动公开的 Bundle 补丁，且不启动 Claude Code。
