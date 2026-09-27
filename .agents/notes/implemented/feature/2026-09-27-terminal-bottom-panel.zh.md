# Agent Note: Terminal bottom panel

Status: implemented

[English](2026-09-27-terminal-bottom-panel.md) | 中文

## 问题

以右侧栏标签页打开的用户终端要与浏览器、文件和文档预览争用同一窗格，而终端放在对话记录旁边会让两者都变窄。用户期待编辑器的惯例：工作区下方的终端面板，隐藏时仍保留标签页和高度。

## 决定

终端位于对话内容下方的每 Session 面板中。`ui-conversation` 在 `main.conversation` 下声明会话作用域的 `conversation.panel.bottom` 位置，只在选中 Session 时渲染；该位置的占用者负责自己的高度，隐藏时不渲染任何内容。`ui-terminal-panel`（由 `ui-sidebar-terminal` 改名）占用该位置，并把 `terminal.toggle` 绑定到 Control+\`。右侧栏通过「开始」页上的**终端**卡片打开面板，该卡片在会话发送第一条消息前就会显示，而对话标题栏的工具区不会：`ui-terminal-panel` 注册携带该卡片的 `terminal` 页面类型，自行渲染卡片，使选取它时打开面板而不是页面，并让任何 `terminal` 页面（例如保存的布局恢复出的页面）打开面板后关闭自身。

`TerminalPanels` 管理每个 Session 的面板状态：显示或隐藏、高度以及标签页。标签页由面板内的 key 与全局唯一的内容身份组成。[Web 终端决策](2026-09-09-web-sidebar-terminal.zh.md)仍约束终端控制器：它把每个内容身份绑定到对应的 Host 终端，因此刷新后会重连同一进程。一个浏览器存储条目保存所有 Session 的面板，读取时会校验；结构无效的条目会丢弃全部面板，而不是采用其中一部分。启动时，所有 Session 已保存的标签页都会提供给控制器的窗口持有，包括尚未打开的 Session。快捷键作用于最后挂载的面板所属 Session，因为面板位置只存在于主对话中。移除 Session 会丢弃其面板。

## 考虑过的替代方案

**保留右侧栏标签页形式，并给侧栏增加底部停靠区。** 侧栏的停靠布局只有水平方向且作用于整个 Session；增加第二个方向会为一种页面类型改变其持久化布局格式与校验。

**在应用框架中渲染位于所有列下方的面板。** 终端属于 Session，而框架的 main slot 也承载没有 Session 的全局面板。对话的会话作用域提供 Session，并随 Session 一起消失。

**像侧栏布局一样按 Session key 分别持久化面板状态。** 窗口持有在启动时需要所有 Session 的标签页；单个条目只需读取一次，无需枚举存储 key。

## 影响

每个浏览器记住自己的面板；换用其他浏览器或清除存储后，所有面板都从隐藏且为空的状态开始，而 Host 终端仍受空闲回收约束。隐藏面板会保留进程；关闭最后一个标签页会隐藏面板。嵌入式对话不渲染该位置。由于该位置是 single 类型，将来如有第二个 `conversation.panel.bottom` 占用者，会取代终端面板。
