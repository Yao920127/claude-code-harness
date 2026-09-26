# Agent Note: 永久默认工作区

Status: implemented

[English](2026-09-26-permanent-default-workspace.md) | 中文

## Problem

[首次使用默认工作区](2026-09-20-default-workspace.zh.md)只在不存在任何 Workspace 和 Session 历史时创建，删除其登记会永久停用它。已有 Session（包括没有工作目录的未分组 Session）的安装环境因此永远得不到默认工作区，输入框在每次发送第一条消息前都要求用户选择文件夹。用户需要一个始终可用、不会被误删的工作目录。

## Decision

[Workspace 注册表](../../../../packages/workspace/workspace/README.zh.md#first-use-workspace)保留一个永久默认工作区。`initializeDefault` 不再检查 Session 历史或其他登记：它返回已登记的默认工作区，并在磁盘上缺少其目录时重新创建；否则解析目录、创建目录并登记。已登记在该目录的 Workspace 会被采纳为默认工作区。旧版本已删除其登记的标记会被取代。`delete` 以 `WorkspaceDefaultUndeletableError` 拒绝删除默认工作区，[Host 控制器](../../../../packages/api/workspace-controller/README.zh.md#first-use-workspace)将其映射为 `workspace/default-undeletable`。

Host 控制器在启动时确保默认工作区存在，每个 `follow` 基线都会等这次尝试结束，因此浏览器的第一个视图就已列出默认工作区，启动恢复通过普通的工作区最近使用规则选中它。Remote `initializeDefault` 仍是两个基线都为空时浏览器采用的重试路径，如今这表示 Host 未能准备默认工作区。`WorkspaceView.isDefault` 标记该行，侧边栏在其菜单中省略删除。

不得在其账户的 Documents 下创建目录的 Host 可以用 `defaultWorkspace: false` 关闭默认工作区；该 Host 不做任何确保，`initializeDefault` 返回 `undefined`。`productDirectory` 配置存放 `default-workspace` 的 Documents 子目录，默认为 `deepseek-harness`；CCH bundle 设为 `claude-code-harness`。目录内容仍遵循[只删除元数据的删除策略](2026-07-27-workspace-registration-deletion.zh.md)，语言中立的名称与标题遵循[默认工作区命名](2026-09-23-language-neutral-default-workspace-naming.zh.md)。

## Alternatives considered

**保留首次使用资格，让用户自行添加文件夹。** 已有历史的安装环境仍会在没有工作目录的状态下启动，这正是被报告的问题。

**只在浏览器中隐藏删除。** 其他 Remote 客户端仍可删除该登记；由注册表拥有这一不变量，所有调用方都会遵守。

**让浏览器在每次启动时创建默认工作区。** 每个浏览器都会与 Host 竞争并重复查询 Documents，Host 查询失败后每个客户端还会各自重试。Host 端确保只在每次启动时运行一次，并让所有浏览器看到相同的基线。

**移除 Remote `initializeDefault`。** Host 无法准备目录时，浏览器将失去引导用户通过“选择工作区”选择文件夹的恢复提示。

## Consequences

在默认工作区登记之前，每次 Host 启动都会查询一次 Documents，此后最多执行一次 `mkdir`。查询缓慢时，第一个工作区基线最多延迟 `documentsLookupTimeoutMs`。已有安装环境在下次启动时获得默认工作区；之前的 Session 保留其记录的工作目录，位置不变。用户可以重命名默认工作区，但不能删除；仍可在产品之外删除其文件，下次启动会重新创建目录。注册表测试覆盖不依赖历史的创建、采纳、拒绝删除、目录重建与过期标记；控制器测试覆盖启动顺序、配置的产品目录与错误映射。
