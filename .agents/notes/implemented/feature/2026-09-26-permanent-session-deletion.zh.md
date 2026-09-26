# Agent Note: 永久删除 Session

Status: implemented

[English](2026-09-26-permanent-session-deletion.md) | 中文

## Problem

归档只隐藏 Session，仍保留其日志、投影缓存行与 Workspace 归属条目，因此用户不再需要的对话仍占用磁盘且可被恢复。用户需要从侧边栏永久删除对话，包括它启动的子代理的记录。

## Decision

`SessionPersistence.delete(id)` 属于持久化 Service Definition。[JSONL 后端](../../../../packages/session/session-persistence-jsonl/README.zh.md)在进程内并通过跨进程租约声明写入权后，删除该会话自有的目录及所有保留的格式代；因此有写入者持有或已创建尚未落盘的会话会以 `SessionAlreadyOwnedError` 被拒绝。

[Session 控制器](../../../../packages/api/session-controller/README.zh.md)提供 `session.delete`。它以 `stopActivity` 归档该 Session，通过现有的归档准入停止运行中的轮次、任务、子代理与提醒，并拦截它们引发的所有唤醒。随后它通过创建或恢复该 Agent 时保留的句柄释放活跃 Agent。它先从最深处删除 subagent 来源的后代，最后删除该 Session；对每一个，它删除已存储日志，通过 `sessionProjectionCache.forget` 删除投影缓存行，通过 `workspaceRegistry.forgetSession` 删除 Workspace 归属、归档与置顶条目，最后发出 `api-session/removed`。subagent 拥有的 Session 不能单独删除。

Web 侧边栏新增一个破坏性的“删除会话”行，排在所有插件行之后，打开一个写明该 Session 名称的确认对话框。确认时，若该 Session 是当前选中项，会先离开它。

## Alternatives considered

**只删除列表条目并保留文件。** 归档已经能隐藏 Session；再增加一种隐藏状态既不释放磁盘空间，也不会删除用户要求删除的记录。

**连同来源删除 fork。** Fork 的日志保存复制的前缀，是独立的对话；删除它会移除用户没有选中的历史。

**删除溢出输出与附件。** Fork 会继续读取从来源继承的溢出定位符，附件按内容跨 Session 去重且没有引用计数，因此按 Session 删除可能破坏其他 Session。溢出保留期与带外维护仍是它们的清理途径。

**不停止工作直接删除。** 运行中的轮次、任务或提醒可能在文件删除后继续追加或唤醒该 Session。

## Consequences

删除无法撤销。已删除 Session 的溢出输出文件与按内容寻址的附件会保留，直到各自的保留期或维护将其移除；Host 的 Claude 配置目录下 Claude Code 的原生记录也不会被删除。活跃 Agent 由其他所有者创建的 Session 会被拒绝而不会被删除。后端测试覆盖目录删除、所有权拒绝与取消；控制器测试覆盖顺序、后代、冷 Session 与错误映射；客户端测试覆盖确认对话框、列表移除与离开当前 Session。
