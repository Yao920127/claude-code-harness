---
description: "在 Web 侧栏底部显示 Claude Code 登录账号的五小时与每周方案用量。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-claude-code-usage

[English](README.md) | 中文

## 概述

不必离开应用即可查看 Claude 方案还剩多少。侧栏底部为每个方案窗口（五小时、每周，以及按模型的每周窗口）显示一条进度条，标出仍可使用的比例；悬停可查看已用比例与重置时间。数据来自 Host 回合所用的 Claude Code 登录。

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

用量卡片位于「设置」上方。每一行标出窗口名称，以进度条显示已用比例，并印出剩余比例；达到 80% 以上的进度条会变红。悬停某一行可查看已用比例与重置时间。刷新按钮会再次询问 Claude Code。页面加载时以及窗口重新可见时，卡片都会读取用量。在收起的侧栏轨道上，它显示第一个窗口的剩余比例，悬停文字列出所有窗口。没有方案限制的登录（例如 API key）会显示不适用方案限制；读取失败时显示错误，直到下次读取。

CCH bundle 会插入此插件。它需要 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md#plan-usage) 的 `claudeCodeUsage` Remote，该路由也决定一次读取可供所有窗口使用多久。

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

插件占用 [ui-sidebar](../ui-sidebar/README.zh.md) 的 `sidebar.footer.action` 座。`UsageSource` 拥有卡片状态：同一时间只有一次 Remote 读取有效，较新的读取会取代仍在进行的较旧读取，刷新期间继续显示已有的回答。插件会等到 `remote.claudeCodeUsage` 命名空间挂载后才进行首次读取。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Claude Code 模型路由](../../llm/llm-claude-code/README.zh.md)
- [侧栏](../ui-sidebar/README.zh.md)

<a id="model-experience"></a>
## 模型体验

无，本包只显示账号用量，不增加模型输入。

#### KV 缓存影响

无；用量读取不会进入模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- Claude Code 把其用量请求标为实验性；若 Claude Code 版本改变它，卡片可能停止工作，直到路由跟进。
- 卡片不会定时刷新；它在加载时、窗口可见时以及收到请求时读取。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

不发布运行时不变量伴生。卡片只显示一次 Remote 回答，没有第二个观测可与之比较。

</details>
