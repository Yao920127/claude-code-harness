---
description: "在 Web 右侧栏提交、拉取与推送，无需 Git 命令；登录 GitHub 后可复制与发布仓库。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git

[English](README.md) | 中文

## 概述

无需记住 Git 命令即可保存与分享工作。右侧栏的**源代码管理**页面显示会话文件夹中的已更改文件，用一条信息暂存并提交它们，并与 GitHub 拉取、推送或同步。在**设置 → GitHub** 登录 GitHub 后，可以把自己的仓库复制为工作区，再从源代码管理页面发布新仓库。命令通过 Host 上安装的 `git` 与 GitHub CLI（`gh`）以你的系统用户身份运行。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

从右侧栏「开始」页打开**源代码管理**；其标签页显示分支图示。页面打开时、窗口重新获得焦点时以及按下刷新时，会读取包含会话文件夹的仓库。不在任何仓库内的文件夹会提供**初始化仓库**。

分支行显示当前分支（或分离的 HEAD），以及领先与落后上游的提交数。输入提交信息后选择**提交**；命令按钮平分所在行的宽度。也可以按 Command+Enter（Windows 与 Linux 为 Control+Enter）。没有暂存任何文件时，提交会包含全部更改；否则只提交已暂存的文件。**提交并推送**会在提交后推送。**拉取**快进到上游，**推送**推送分支并在第一次推送时把 `origin` 设为上游，**同步**会先拉取再推送。更改列表区分已暂存与未暂存的文件；`+` 与 `−` 暂存或取消暂存单个文件，列表标题可一次暂存或取消暂存全部。每个仓库同一时间只运行一个命令；失败时显示 Git 自己的信息，并且页面会重新读取仓库，因为推送失败前可能已经提交成功。

GitHub 登录位于设置的 **GitHub** 页面，使用 Host 的 GitHub CLI。**登录 GitHub** 会启动 CLI 的设备登录，打开 GitHub 的验证码页面并显示一次性验证码（CLI 也会把它复制到剪贴板）；页面每隔几秒检查一次，直到你完成授权。登录完成后还会让 Git 用同一凭据推送到 GitHub。在源代码管理页面，没有 `origin` 远程的仓库会在你登录后提供**发布到 GitHub**，以文件夹名称建立私有或公开仓库；未登录时则提示前往设置。设置页面在**我的 GitHub 项目**下列出你的仓库；**复制到本机**会把仓库复制到复制目录并加入工作区，已经复制到该处的仓库显示为已在本机。未安装 `gh` 时，设置页面会说明安装方法。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `git` | `git` | `git` 可执行文件名称或绝对路径 |
| `gh` | `gh` | GitHub CLI 可执行文件名称或绝对路径 |
| `searchPath` | `['/opt/homebrew/bin', '/usr/local/bin']` | 在 `PATH` 之后搜索的目录；从 Dock 启动的 Desktop 应用继承的 `PATH` 较短 |
| `cloneDirectory` | `~/github` | 仓库复制到的目录，每个仓库名称一个子目录 |
| `repositoryLimit` | `100` | 一次列出返回的最多仓库数 |
| `commandTimeoutMs` | `300000` | 单个命令被终止前可运行的毫秒数 |
| `loginTimeoutMs` | `900000` | GitHub 登录等待输入验证码的毫秒数 |
| `graceMs` | `3000` | 停止命令时各终止阶段之间的宽限时间 |
| `maxOutputBytes` | `4194304` | 单个命令输出流保留在内存中的最多字节数 |

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

Host 部分 `GitController` 提供 `git` Remote 命名空间。它从会话的实时或已保存标头解析文件夹，并通过 `ctx.subprocess` 以显式参数向量运行 `git` 与 `gh`，因此不会有用户文本被 shell 解释；凭据提示已关闭，因为没有人能回答它们。`git status --porcelain=v2 --branch -z` 提供分支与更改列表。复制的仓库通过可选的 `ctx.workspaceRegistry` 登记。同一时间只运行一个设备登录；其提示从 CLI 输出中解析，并在后台完成。

浏览器部分向 [ui-sidebar-right](../ui-sidebar-right/README.zh.md) 注册 `source-control` 页面类型、其标签页标题与「开始」页入口，并在 [ui-settings](../ui-settings/README.zh.md) 的 `settings.section` 座注册 `github` 页面。`SourceControl` 拥有每个会话的仓库状态与草稿信息，以及所有会话共享的一个 GitHub 状态。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [右侧栏](../ui-sidebar-right/README.zh.md)
- [Workspace 注册表](../../workspace/workspace/README.zh.md)
- [Subprocess](../../subprocess/subprocess/README.zh.md)

<a id="model-experience"></a>
## 模型体验

无，本包运行由用户发起的 Git 与 GitHub 命令，不增加模型输入。

#### KV 缓存影响

无；命令输出只到达浏览器。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 页面没有差异视图、分支切换、合并冲突处理或放弃更改操作；这些请使用终端。
- 拉取只支持快进；分叉的分支会显示 Git 的错误。
- GitHub 功能需要 Host 上的 GitHub CLI；通过 SSH 使用 Git 依赖 Host 的 SSH agent。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

不发布运行时不变量伴生。每个回答都从 Git 或 GitHub CLI 读取；插件不保留可供比较的第二个观测。

</details>
