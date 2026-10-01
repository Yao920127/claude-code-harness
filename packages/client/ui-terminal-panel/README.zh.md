---
description: "在 Web 窗口底部可调整高度的面板中打开、切换和控制交互式 shell 标签页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-terminal-panel

[English](README.md) | 中文

## 概述

在窗口底部（对话与右侧栏下方）打开终端面板，在会话工作区运行命令。每个会话在刷新后保留自己的终端标签页、面板高度与显示状态。隐藏面板让命令继续运行，关闭终端标签页则请求结束进程。Tab 补全使用 shell 的配置。命令使用执行环境中系统用户的权限，独立于 Agent 权限；详见[用户终端执行](../../api/terminal-controller/README.zh.md#use-this-package)。

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

面板从左侧栏边缘延伸到窗口右边缘，因此左侧栏收起时它会变宽，并让对话与右侧栏各缩短其自身的高度。它只在对话是主面板时显示。面板隐藏时，对话右下角的终端按钮会把它显示出来；停靠的输入框占满对话宽度时，该按钮会隐藏。右侧栏全屏并遮住对话时，同一个按钮改为出现在窗口右下角，显示的面板则在右侧栏下方横跨整个窗口宽度。右侧栏「开始」页的**终端**卡片会打开其会话的面板，会话发送第一条消息之前也可使用：隐藏的面板会显示出来，若面板没有终端就用记住的可用 shell 打开一个；已显示的面板则再新增一个终端。「开始」页保持不变。`terminal.toggle` 命令显示和隐藏当前显示会话的面板；Desktop 以及 Windows、macOS Web 把它绑定到 Control+\`，Linux Web 默认不绑定，卡片会显示有效的键位。

最后一个标签页后面的 **+** 按钮用记住的 shell 再打开一个终端标签页。旁边的箭头打开已安装 shell 菜单；选择某项会记住它并打开该 shell。菜单打开时才执行发现，不会分配终端。查找失败时菜单提供重试。点击标签页，或聚焦后按 Enter 或空格键，即可切换终端。最右侧的箭头隐藏面板。拖动面板上边缘，或聚焦后按上、下方向键，即可调整高度。

双击终端标签页可重命名。当其他页面持有输入权时，**接管输入**会让当前连接可写。临时断开会保留屏幕并提供**重新连接**，不显示传输诊断。已退出的 shell 保持可见并显示退出码，同时提供**新建终端**，在原位置替换该标签页；它从不自动重启。已退出的终端计入会话上限；达到上限时请关闭不用的标签页。

关闭终端标签页会立即移除它，并在后台结束其进程；关闭最后一个标签页会隐藏面板。清理失败没有通知或手动重试操作；保存下来的未完成关闭请求会在 Client 插件启动时重试。隐藏面板以及切换标签页或会话都会保留进程。删除会话会丢弃其面板。

刷新后，每个会话的面板连同标签页一起恢复，每个终端都会重新连接到保存的 Host 身份。未出现在已保存面板中的 Host 终端不会自动重新打开，也没有 UI 恢复入口；它们仍受控制器的无人值守空闲回收以及会话/Host 释放约束。保存的进程缺失时，会显示本地化的不可用提示与**新建终端**；恢复过程从不自动创建替代终端。

终端背景、默认文字、光标和选区跟随 DSH 主题，包括系统偏好与主题 token 覆盖。切换主题会保留正在运行的 shell、输出以及应用 OSC 颜色覆盖。重置命令会把颜色恢复为当前 DSH 默认值。xterm 会把文字对比度调整到 4.5:1；光标相对其所在单元格背景至少保持 3:1 对比度，包括 Vim 配色方案。

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

本插件占用 [ui-layout](../ui-layout/README.zh.md#bottom-seat) 框架的 root 作用域 `shell.bottom` 座，面板在其中跟随通过 `ctx.uiSession` 选中的会话；它还占用对话的会话作用域 `conversation.panel.bottom` 位置，在其中渲染右下角按钮。它还向右侧栏注册 `terminal` 页面类型，把它的「开始」页卡片渲染进 `sidebar.right.tab.guide.entry`。`terminal` 侧栏页面（例如保存的布局恢复出的页面）会打开面板，并只关闭自身一次。`TerminalPanels` 管理每个会话的面板：是否显示、高度以及标签页；每个标签页由面板内的 key 与全局唯一的内容身份组成。一个浏览器存储条目保存所有会话的面板，读取时会校验；无效条目会让所有面板从空状态开始。底部座会记录它显示的会话，开关命令作用于最后记录的会话。

不依赖 React 的终端模型由 `api-terminal-controller` 负责；按 key 的框架 hook 暴露其状态。`ui-primitives` 的 Menu 与 Button 提供 shell 选择器和面板控件。面板显示期间每个标签页的屏幕都保持挂载，非活动屏幕只是隐藏，因此切换标签页会保留每个模拟器的输出。终端屏幕挂载时，主体才加载包内的 `client.terminal.js` 分块，让 xterm.js 与 FitAddon 不进入启动时的 `client.js`；随后由它们渲染屏幕并测量视口。输入（包括 Tab 与控制字符）原样传到 PTY。

终端控制器分别保存每个内容身份的 Host 关联，并负责内容恢复；本插件负责面板状态。恢复的视图不能分配替代进程。关闭或替换标签页会通过[终端控制器](../../api/terminal-controller/README.zh.md#understand-the-implementation)安排清理并同步返回。浏览器组件清理只会断开浏览器侧工作。

插件启动时，每个会话已保存的标签页都会保留匹配的 Host 身份，包括尚未打开的会话。该窗口持有独立于 React 挂载与屏幕订阅。移除最后一个匹配的标签页会释放它；隐藏面板不会。[终端控制器](../../api/terminal-controller/README.zh.md#use-this-package)负责无人值守的空闲回收与长命令保护。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Subprocess](../../subprocess/subprocess/README.zh.md)
- [对话](../../client/ui-conversation/README.zh.md)
- [Web 终端决策](../../../.agents/notes/implemented/feature/2026-09-09-web-sidebar-terminal.zh.md)

<a id="model-experience"></a>
## 模型体验

无，本包处理用户终端交互，不增加模型输入。

#### KV 缓存影响

无；终端输出只在浏览器与 Host 之间传输。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- shell 发现或原生 PTY 启动可能失败。标签页会报告失败，而不会启动另一个 shell。
- 补全菜单与行内建议取决于 shell 配置。Web UI 不提供独立的补全引擎。
- 应用 OSC 颜色覆盖由已挂载的渲染器保留；新打开的渲染器无法从 Host 屏幕快照恢复它们。
- 终端历史有上限。本功能不会把终端输出发送给 Agent，不支持并排拆分终端，也不会在 Host 重启后恢复进程。
- 面板状态保存在单个浏览器的存储中；换用其他浏览器或清除存储后，所有面板都从隐藏且为空的状态开始。
- 终端分块加载失败需要刷新页面，因为 React 会在页面生命周期内缓存被拒绝的懒加载导入。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

不发布运行时不变量伴生。终端元数据与屏幕更新由单一所有者排序；提供方不暴露可供比较的独立观测尺寸。

</details>
