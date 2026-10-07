# Agent Note：共享持久的 Desktop 浏览器登录

Status: implemented

[English](2026-10-07-desktop-browser-shared-sign-in.md) | 中文

## Problem

Desktop Browser guest 过去使用按 Workspace CWD 划分的随机、非持久分区。用户在一个 Workspace 登录某网站后，到其他每个 Workspace 都要重新登录，每次应用重启后也要重新登录。需求是让 Sidebar Browser 记住登录。

## Decision

本记录取代[保留式 Desktop 浏览器 webview 决策](2026-09-20-desktop-browser-webview.zh.md)中关于存储归属的部分；其租约、呈现与 guest 策略决策继续有效。

- 每个 Desktop Browser guest 都使用同一个持久分区 `persist:dsh-sidebar-browser`（`apps/desktop/src/browser-guests.ts` 中的 `SIDEBAR_BROWSER_PARTITION`）。Cookie 与 Web storage 在所有 Workspace 与 Session 之间共享，并跨应用重启保留。bridge 的 `acquire()` 不再接收 Workspace 标识，Client 也不再解析它。因此某个 tab 登录过的网站——任何允许内嵌浏览器登录的网站——会在每个 tab 中保持登录，重启后也一样，应用本身不处理任何登录凭据。
- 该分区沿用现有 guest 策略：拒绝权限、设备、屏幕捕获、下载与原生 popup，并取消发往 DSH Host 的请求。
- Browser 工具栏的 **登录资料** 菜单只在 Desktop 上出现，提供唯一一个破坏性项目 **清除登录资料**，它会清除该分区的存储数据与 HTTP 认证缓存并重新加载 tab。该项目放在菜单后面，使一次点击不会清空所有登录。

没有做任何 Google 专用登录。Google 拒绝在内嵌浏览器中登录，而绕过它的三种办法各自都被否决，因此 Google 账号类网站留给用户自己的系统浏览器处理。

## Alternatives considered

**保留 Workspace 分区并改为持久化。** 登录只会落在一个 Workspace 中，用户必须对每个目录重复登录。需求是一次登录、所有 Browser tab 都能使用。

**加一个 Google 登录窗口，把 Electron 伪装成普通 Chrome。** 曾经做过一个使用共享分区的沙箱化 `BrowserWindow`，并从 user agent 去掉应用与 `Electron/` 产品标记，之后又移除了。Google 仍然侦测到内嵌浏览器并拒绝，窗口始终到不了账号页面；为了骗过 Google 的内嵌浏览器检查而去掉 Electron 标记，是对一道刻意安全措施的检测规避，所以把它拿掉而非继续推进。

**从用户已安装的 Chrome 配置文件导入 cookie。** Chrome 用系统钥匙串中的密钥加密 cookie 存储，其磁盘格式也会随版本改变。读取它属于凭据提取工具，能对任何 Chrome 账号使用，需要钥匙串授权，会一次性把所有网站的会话交给应用；而且新版 Chrome 会把 Google 会话绑定到该设备的 Chrome，导入过来的会话可能根本无法使用。否决。

**在系统浏览器中打开 Google 登录。** 被用户否决，用户不希望应用打开 Chrome 或 Safari。因此 Google 账号类网站无法在 Sidebar Browser 中以登录状态使用；用户在自己的浏览器里登录它们。

## Consequences

允许内嵌登录的网站一旦登录，就会在所有 Workspace 中保持登录，Workspace 之间的隔离因此消失。Agent 用浏览器工具打开的页面会带着这些登录状态加载；该工具只能打开地址、读不到任何内容，但如果某个页面在普通 GET 请求上就执行操作，它会以已登录用户的身份执行。**清除登录资料** 是让所有网站登出的唯一方式。Google 账号类网站（以及任何拒绝内嵌浏览器登录的网站）完全无法在 Sidebar Browser 中登录。

主进程单元测试在替换 Electron 的情况下覆盖共享持久分区与清除；客户端测试覆盖清除菜单的成功与失败路径，以及它在 Web 上不出现。
