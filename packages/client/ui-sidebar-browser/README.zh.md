---
description: "右侧 Sidebar 浏览器 tab：在 sandbox 中访问 HTTP(S) 页面，包括 loopback 服务。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-browser

[English](README.md) | 中文

## 概述

在独立的右侧 Sidebar tab 中浏览 HTTP(S) 页面，包括 loopback 服务。Web 使用 iframe 和应用维护的 history；Desktop 使用 Electron `<webview>`、原生导航 history 和保活页面。本包不会向被访问内容注入 Electron 或 Node 能力。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Browser 在 Web profile 中默认禁用，在 Desktop 中默认启用。Web 用户可通过 profile patch 启用随附条目。可以从右侧 Sidebar guide 打开 **浏览器**并输入 HTTP(S) URL 或搜索关键词。Chat 的[链接偏好](../ui-chat/README.zh.md)选择**应用内侧边栏**时，HTTP(S) 链接会在此打开。不带 scheme 的主机名会补全为 HTTPS。不带 scheme 且包含空白、或主机名既无点也无端口且不是 `localhost` 的输入视为搜索：`youtube` 会搜索，而 `youtube.com` 与 `localhost:3000` 会导航。公共目标与 loopback 目标使用相同的默认 sandbox。每次 guide 操作或委托到此的消息链接操作都会创建一个新的 Browser tab。

在 Desktop 上，工具栏的 **网站登录** 菜单提供 **使用 Google 登录**，它会打开独立的 Google 登录窗口；Google 回到账号页面后窗口关闭、tab 重新加载，此后每个 Browser tab 都保持登录，应用重启后也一样。**清除登录资料** 会清除所有网站的 cookie 与存储并重新加载 tab。Agent 在 Browser 中打开的页面带着同样的登录状态加载；Agent 的浏览器工具只能打开地址，无法读取页面内容。

### 何时选择

当 Web 页面需要保留在当前 Session 旁时，选择 Browser。本地文件使用 [Document Preview](../ui-sidebar-documentpreview/README.zh.md)；站点拒绝 iframe 嵌入或需要本包不授予的浏览器 capability 时，使用明确的外部浏览器操作。

### 最小配置

`searchUrl` 是关键词使用的 HTTPS 搜索地址，`%s` 接收编码后的查询；默认是 Google 搜索，修改后即时生效。`homeUrl` 是新 tab 既没有自己的地址、也没有可恢复的已保存页面时打开的 HTTPS 页面；默认是 `https://www.google.com`，设为空值则不打开页面。Web profile 通过其 profile patch 启用随附条目，也可在其中设置搜索地址：

```yaml
- id: ui-sidebar-browser
  disabled: false
  config:
    searchUrl: https://duckduckgo.com/?q=%s
```

Client 插件可以调用 `ctx.sidebarRight.openTab('browser', { params: { url } })` 打开 tab。可选 URL 会在导航前接受与地址栏输入相同的校验。

Host 调用方（例如 Agent 工具）用 `ctx.sidebarBrowser.open(sessionId, url)` 为用户打开页面：每个已连接的应用窗口都会在该 Session 中新开一个 Browser tab，调用返回收到请求的窗口数，0 表示没有窗口连接。请求只在实时生效；之后才连接的窗口不会重放它们。[右侧 Sidebar 页面](../../../docs/subsystems/sidebar-right.zh.md#agent-open-requests)说明了这个通道。

命令 `browser.new` 在焦点停靠分栏打开独立浏览器页，替换开始页并保留已有内容页。从聊天区或浮动内容页触发时，使用活动停靠分栏。桌面默认键在 macOS 上为 Cmd+T，在 Windows 上为 Ctrl+T；Windows 和 macOS Web 使用[快捷键服务的平台默认值](../shortcuts/README.zh.md)；Linux Web 默认不绑定此命令。开始页按钮使用蓝色地球图标，并在按钮内显示有效快捷键，不额外弹出重复提示。

工具栏提供后退、前进、刷新、前往和在系统浏览器中打开。Web 还提供逐 tab sandbox 开关；关闭它是临时选择，并会显示警告。Desktop 显示观察到的页面标题。重启后，Browser 展示保存的标题和 URL；只有点击恢复或刷新才打开该地址。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

### 协议策略

地址解析器接受 HTTP 与 HTTPS，包括 loopback 目标。`file:` URL、脚本/data/blob 输入、内嵌凭据、DSH 应用自身 origin 和畸形地址会被拒绝。本地文件由 Document Preview 负责渲染。地址栏与 typed-open 输入先经过关键词规则；搜索目标是配置的搜索地址，按同一策略解析，并以查询作为标题。Host 尚未报告搜索地址时输入的关键词会以可修正的提示被拒绝。页面发起的打开请求从不变成搜索。

### Iframe 载体

Web 默认使用 `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"`。frame 没有直接的下载或顶层导航 flag。popup 会脱离 sandbox；在 Web 中，逃逸的 popup 会保留 opener，并可以导航顶层应用。被访问的 origin 可以使用自身 Cookie 与 Web storage，但跨域目标无法读取 DSH DOM、storage 或 API 响应。iframe 不发送 referrer，也不添加包自有的 Permissions Policy，因此浏览器默认策略与用户授权生效。toolbar 可以为当前 tab occurrence 移除 sandbox；该选择不持久化。未受 sandbox 约束的页面可以按浏览器 activation 规则导航顶层应用，并使用下载、模态对话框和输入锁定。本包不代理或探测远程页面。

Web 记录 toolbar 提交和 typed tab 打开。导航状态机把每个受控 revision 的第一次 iframe load 视为已知，把后续 load 视为页面已经变化到不可读取 URL 的证据。进入 unknown 状态后，地址会显示标记，后退、前进和外部打开会禁用，刷新则返回最后一个受控 URL。body 重挂载时会重新加载应用最后已知的 URL，并且仅在尚无受控目标时使用可选初始 URL。不产生 iframe load 的 History API 与 fragment 变化仍不可见。iframe `error` event 会显示临时加载失败 notice，直到下一个受控加载，但不会改变 URL history。

### Controller

每个 tab 的 `BrowserController` 负责地址校验、命令和显式恢复。`BrowserFrame` 提供与载体无关的导航状态；`IframeImpl` 使用 `BrowserNavigation`，`ElectronWebViewImpl` 观察 Chromium history。`BrowserPresentation` 负责 DOM 的物理挂载。Slot injection 提供 `useBrowserState` 和普通 callback，React body 不接收 provider 对象或 observable。

Desktop 主进程批准 guest 租约，并执行挂载、导航和权限策略。preload 只暴露限定范围的 Browser 操作。共享声明通过标准 `/types` 出口配合 `import type` 引入；Host 与 Client 使用独立 tsconfig 编译。Desktop Browser tab 声明 `keepMounted`，Sidebar 因而在切 tab、切 Session、收起与浮动期间保留其 DOM。

页面刷新快捷键调用工具栏使用的同一重载操作。其 Tooltip 和 ARIA 组合随有效绑定更新。Desktop 通过所属窗口路由已批准 guest 中的有效快捷键；获焦 webview 必须仍持有该 guest 的租约。Web 保留浏览器专用组合。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [右侧 Sidebar](../../../docs/subsystems/sidebar-right.zh.md)——tab composition、导航与生命周期。
- [Document Preview](../ui-sidebar-documentpreview/README.zh.md)——本地源码、Markdown、图片、HTML 与 PDF 渲染。
- [Sidebar Browser 决策](../../../.agents/notes/implemented/feature/2026-09-16-sidebar-browser.zh.md)——iframe 行为与 controller 所有权。
- [Desktop Browser 决策](../../../.agents/notes/implemented/feature/2026-09-20-desktop-browser-webview.zh.md)——webview 租约与手动恢复。
- [共享持久登录决策](../../../.agents/notes/implemented/feature/2026-10-07-desktop-browser-shared-sign-in.zh.md)——单一持久分区与 Google 登录窗口。

-----

<a id="model-experience"></a>
## 模型体验

无。Browser tab 是用户侧呈现状态，不注册工具、prompt section 或 Session event。调用 `ctx.sidebarBrowser.open` 的 Agent 工具自行说明其模型可见内容。

#### KV Cache 影响

无；浏览内容不进入模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

隔离策略有意放弃部分浏览器兼容性：

- 很多站点拒绝 iframe 嵌入，或需要默认 sandbox 不向 frame 授予的下载与顶层导航。HTTPS 应用还可能按 mixed-content 策略阻止公共 HTTP 页面。关闭 sandbox 会用自身限制换取兼容性，但不会绕过 mixed-content 或 private-network 策略。未受 sandbox 约束的 frame 可以按浏览器 activation 规则导航顶层应用，并使用下载、模态对话框和输入锁定。该模式不会按 Browser tab 隔离被访问 origin 的 Cookie，也无法阻止 iframe 内页面自行选择后续 URL。
- 在 Web 中，逃逸出 sandbox 的 popup 会保留 opener，并可以通过该链导航顶层应用。Desktop 会单独处理 popup 创建。
- 后续 iframe load 能表明发生了导航，但无法给出新的跨域 URL。History API 与 fragment 变化可能仍不可见；状态变成 unknown 后，Web 的后退与前进不可用。
- 出于安全原因，浏览器会隐藏很多 iframe 失败：DNS、TLS、mixed-content、CSP 与 `X-Frame-Options` 失败可能触发 `load`，也可能不提供可操作 event，而不是触发 `error`。加载失败 notice 只能作为 best-effort 提示。
- 只要 tab 仍在 Sidebar 布局中，保存的标题和 URL 就会跨刷新与插件卸载保留。关闭 tab 会删除其检查点。重启恢复不恢复页面内存、未保存的表单或 Chromium history 栈。
- 本地文件会被拒绝，并继续由 Document Preview 负责。
- Google 与多数搜索引擎拒绝 iframe 嵌入，因此在 Web 中关键词搜索与默认的 Google 首页会保持空白：浏览器把被拒绝的 frame 报告为普通加载，所以不会出现失败提示。可在系统浏览器中打开，或使用由 `<webview>` 渲染的 Desktop。把 `searchUrl` 与 `homeUrl` 设为允许嵌入的网站可避免此问题。
- Desktop guest 在所有 Workspace 与 Session 之间共享同一个持久存储分区，因此 cookie 与 Web storage（包括登录状态）会跨应用重启保留，直到 **清除登录资料** 将其清除。该分区把 Electron 的 user agent 呈现为它所内嵌的 Chrome；Google 仍可能拒绝它判定为不安全的登录，此时登录会报告为没有完成。guest 权限、下载与原生 popup 均被拒绝；通过检查的 HTTP(S) popup 请求会打开 Sidebar tab。Host 地址过滤不是通用私网或 DNS-rebinding 防火墙。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布 companion。每个导航 provider 拥有自身的实时状态并直接发布检查点；UI 通过 controller 消费同一份 provider 状态。
