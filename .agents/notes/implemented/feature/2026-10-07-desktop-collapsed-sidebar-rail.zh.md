# Agent Note：所有桌面平台都保留收起后的侧栏轨道

Status: implemented

[English](2026-10-07-desktop-collapsed-sidebar-rail.md) | 中文

## Problem

在 macOS 与 Windows 桌面上，收起左侧边栏会留下一个零宽度的列。插件、任务、Workspace、用量与设置入口随之消失，用户在重新打开侧边栏之前无法得知这些功能存在；只有普通 Web 构建保留 56px 图标轨道。macOS 还需要一个单独的窗口 chrome 座来放置重新打开与 New Session 控件，使 darwin 的收起成为第三套需要维护的布局。

## Decision

所有平台在侧边栏收起时都保留 56px 轨道。`computeColumns`（ui-layout `columns.ts`）对收起的侧边栏总是预留 `SIDEBAR_COLLAPSED`，不再接收收起宽度参数。

- **macOS。** hiddenInset 红绿灯横跨 x 12–68，比轨道更宽，因此轨道的控件从红绿灯下方开始。ui-sidebar 的 darwin 规则以 `--dsh-sidebar-rail-chrome`（44px；窗口全屏隐藏红绿灯时为 18px）为收起的根元素加上顶部内边距，把顶部条向上延伸覆盖该带状区域，作为承载展开按钮的轨道 `data-window-drag` 行，并把空的 logo 行折叠掉。对话标题行从中间列起始 20px 处开始，已越过红绿灯，无需额外的行内避让。
- **Windows。** 展开按钮与 New Session 固定在标题栏行中；标题栏下方收起的轨道保留面板、浏览与底部控件。
- **移除框架窗口 chrome 座。** 删除 `shell.leading` root slot、其 `HeaderLeadingControls` 占用者、`--dsh-frame-leading-clearance` 变量，以及对话标题行依据它的内边距（预稳定 API：更新所有消费方，不保留兼容层）。轨道自身的展开按钮与 New Session 按钮服务于所有主面板。

### 被取代的设计

[macOS 隐藏标题栏决策](2026-09-13-macos-hidden-titlebar-vibrancy.zh.md)让 darwin 的列整列隐藏，并拒绝保留轨道，理由是悬浮红绿灯下方的轨道会让窗口角落的 chrome 加倍，并占用收起本来要腾出的宽度。随后的一项架构决策加入了框架持有的 `shell.leading` 座。其动机是：重新打开控件最初位于只有 Conversation 才有的标题座中，因此选中其他任何主面板（插件管理器、未来的全局面板）时，收起的窗口完全没有重新打开控件，而每个面板都要重复座位标记、拖拽区域扣除与红绿灯几何。一个只在 darwin 列隐藏时挂载的框架座让这一保证成为结构性的。它为对话标题行发布 `--dsh-frame-leading-clearance`（160px，全屏时 84px），让内容避开红绿灯与座上的两个控件。该设计还拒绝了用 CSS 控制可见性（在所有平台上留下无用 DOM 与 no-drag 扣除），也拒绝了让每个消费方硬编码避让值（会与座的真实带宽脱节）。

现在轨道为每个主面板提供同样的重新打开与 New Session 控件，因此既不存在逐面板的问题，也不再需要解决该问题的座。

## Alternatives considered

**保留整列隐藏，并加一个悬停才显示的轨道。** 平时入口仍然不可见，而这正是本次变更要解决的可发现性问题。

**在轨道旁保留 `shell.leading`。** 该座会在窗口角落重复轨道的展开按钮与 New Session 按钮。

**保留 Windows 的零宽度收起。** Windows 会成为唯一一个收起后隐藏所有侧边栏入口的桌面平台。

## Consequences

收起后的窗口在所有平台上都为轨道占用 56px；macOS 的全宽收起不复存在。在 macOS 上，红绿灯覆盖轨道顶部 44px 的带状区域，该区域是窗口拖拽行而非控件。今后若某个平台需要整列隐藏，出于上述理由，必须为所有主面板重新提供一个框架持有的重新打开座。

`shell.leading` 已不存在于 ui-layout 的 slot 声明、ui-sidebar 的注册与生成的客户端 slot 目录中。ui-layout app-frame 规格测试确认 darwin 与 Windows 标题栏下都保留 56px 轨道且不渲染 leading 座，其 apply 规格测试确认 `shell.leading` 未被声明。Web e2e 窗口拖拽规格测试确认 darwin 轨道的展开按钮位于 56px 列内且在红绿灯下方、其上方的轨道条可拖拽、按钮可点击；sessionless-header 规格测试在所有平台上都从轨道重新打开。这些规格测试并未运行真实的 macOS 与 Windows 窗口 chrome。
