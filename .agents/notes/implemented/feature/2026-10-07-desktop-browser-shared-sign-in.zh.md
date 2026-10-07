# Agent Note：共享持久的 Desktop 浏览器登录

Status: implemented

[English](2026-10-07-desktop-browser-shared-sign-in.md) | 中文

## Problem

Desktop Browser guest 过去使用按 Workspace CWD 划分的随机、非持久分区。用户在一个 Workspace 登录 Google 后，到其他每个 Workspace 都要重新登录，每次应用重启后也要重新登录。Google 还会拒绝在 user agent 带有 Electron 的内嵌浏览器中登录，因此在 Browser tab 里登录可能直接失败。

## Decision

本记录取代[保留式 Desktop 浏览器 webview 决策](2026-09-20-desktop-browser-webview.zh.md)中关于存储归属的部分；其租约、呈现与 guest 策略决策继续有效。

- 每个 Desktop Browser guest 都使用同一个持久分区 `persist:dsh-sidebar-browser`（`apps/desktop/src/browser-guests.ts` 中的 `SIDEBAR_BROWSER_PARTITION`）。Cookie 与 Web storage 在所有 Workspace 与 Session 之间共享，并跨应用重启保留。bridge 的 `acquire()` 不再接收 Workspace 标识，Client 也不再解析它。
- 该分区沿用现有 guest 策略：拒绝权限、设备、屏幕捕获、下载与原生 popup，并取消发往 DSH Host 的请求。它的 user agent 去掉应用与 `Electron/` 产品标记，使页面看到的是内嵌的 Chrome。
- Browser 工具栏的 **网站登录** 菜单只在 Desktop 上出现，提供 **使用 Google 登录** 与 **清除登录资料**。登录会打开 `DesktopBrowserSignIn`（`apps/desktop/src/browser-sign-in.ts`）：一个使用同一分区的沙箱化 `BrowserWindow`，没有 preload、Node 集成、嵌套 webview 或 popup，只接受不带凭据的 HTTPS 导航。Google 在 `https://myaccount.google.com` 提交文档时窗口以 `signed-in` 结束，用户关闭窗口时以 `cancelled` 结束，加载失败、渲染进程崩溃或非 HTTPS 导航时以 `failed` 结束。清除会抹去该分区的存储数据与 HTTP 认证缓存。
- 在 `signed-in` 或清除之后，tab 会重新加载，让页面读取新的 cookie。

## Alternatives considered

**保留 Workspace 分区并改为持久化。** Google 登录只会落在一个 Workspace 中，用户必须对每个目录重复登录。用户要求的是一次登录、所有 Browser tab 都能使用。

**从用户已安装的 Chrome 配置文件导入 cookie。** Chrome 用系统钥匙串中的密钥加密 cookie 存储，其磁盘格式也会随版本改变。读取它需要钥匙串授权，会一次性把所有网站的会话交给应用，并且会在 Chrome 更新后失效。

**在 Browser tab 内登录。** Google 会拒绝内嵌 webview，而 tab 也无法可靠地检测流程结束并报告结果。

## Consequences

登录过一次的网站会在所有 Workspace 中保持登录，Workspace 之间的隔离因此消失。Agent 用浏览器工具打开的页面会带着这些登录状态加载；该工具只能打开地址、读不到任何内容，但如果某个页面在普通 GET 请求上就执行操作，它会以已登录用户的身份执行。**清除登录资料** 是让所有网站登出的唯一方式。

Google 仍可能拒绝它判定为不安全的登录；此时窗口永远不会到达账号页面，用户关闭窗口后会看到登录报告为没有完成。主进程单元测试在替换 Electron 的情况下覆盖了分区、user agent、清除以及窗口的每种结果；没有测试驱动真实的 Google 登录。
