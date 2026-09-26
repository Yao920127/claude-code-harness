---
description: "ctx.web 的 Claude Code 搜索提供方：已登录 Claude Code 的 Host 如何无需 API 密钥回答网页搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-claude-code

[English](README.md) | 中文

## 概述

借助 `dsh-web-search-claude-code`，harness 通过 Claude Code 内置的 `WebSearch` 工具回答网页搜索，使用 Host 自己的 Claude Code 登录而不是 API 密钥。每次搜索运行一次 Claude Code 查询，该查询唯一可用的工具是 `WebSearch`，其回答是列出所用页面的结构化输出。Host 已安装并登录 Claude Code 时选择它；CCH bundle 默认选择它。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已加载 web 与 subprocess 服务的组合中挂载本提供方；它以 `claude-code` 搜索提供方身份注册。用 web 服务的 `searchProvider` 或插件页的**搜索来源**页面选择它。

### 何时选择

希望由 Host 的 Claude Code 登录承担搜索费用、且未配置厂商密钥时选择本提供方。部署持有厂商 API 密钥，或运行环境中 Claude Code 未登录时，改用 [`dsh-web-search-vendors`](../web-search-vendors/README.zh.md) 中的提供方。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: claude-code
- name: '@deepseek-ai/dsh-web-search-claude-code'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `model` | 空 | Claude Code 模型；为空时使用 Host 的 Claude Code 设置所选的模型 |
| `maxTurns` | `4` | 一次搜索的最大 agent 轮数 |
| `env` | `{}` | 给 Claude Code 进程的额外环境变量 |
| `disposeGraceMs` | `3000` | 释放时强制结束进程树前的宽限时间 |

### 搜索返回什么

回答成为 `content`，每个列出的页面成为带 URL、标题与支持片段的来源。URL 无法解析或重复的来源会被丢弃；web 服务施加请求的 `maxResults`，提示词中也会写明该数量。

### 失败与恢复

非成功的结果、没有结果就结束的查询以及进程失败都以 `WEB_PROVIDER_ERROR` 失败；进程失败的消息会提示用户用 Claude Code CLI 登录。不含任何有效来源的输出同样失败。取消会停止查询并以 `WEB_ABORTED` 失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明提供方背后的设计决策；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

- **由官方产品执行搜索。** 提供方经由 Agent SDK 启动固定版本的 Claude Code CLI，而不是读取其保存的登录凭据，与 [Claude Code 模型路由](../../llm/llm-claude-code/README.zh.md)的立场相同。
- **只提供 `WebSearch`。** 查询限制工具列表且只允许该工具，因此搜索不能在 Host 的主目录中编辑文件或执行命令。
- **在进程边界校验。** 结构化输出在成为结果前逐字段检查。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema 与注册提供方 |
| [`src/provider.ts`](src/provider.ts) | 提供方：查询选项、进程所有权与结果校验 |
| — | 不发布运行时不变量伴随包；每次搜索自行拥有并释放其进程，因此不存在可能分歧的独立观察。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web 包地图](../README.zh.md)——每个搜索与抓取提供方及其职责。
- [dsh-subagent-claude-code](../../subagent/subagent-claude-code/README.zh.md)——本提供方复用的进程启动与所有权。
- [多厂商搜索决策](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.zh.md)——为什么在厂商提供方之外还有 Claude Code 搜索。

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由 `dsh-tool-web`：它保留本提供方受 `maxResults` 限制的回答文字、URL、标题与片段，或把 `Claude Code search failed: <error>. Sign in with the Claude Code CLI on the host, then retry.`、`Claude Code search ended without a result (<subtype>)`、`Claude Code search returned no web sources` 与 `Claude Code search aborted` 失败包在消费方的错误包装中。

#### KV Cache 影响

不直接造成失效；请求前缀的变化由上述消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **每次搜索都会启动一个 Claude Code 进程。** 搜索比直接调用 API 慢，并计入已登录账号的用量。
- **搜索请求不是 Session 事件。** 模型发送的查询与收到的结果保留在工具调用与工具结果中；Claude Code 不保留搜索的记录。
- **向托管部署的其他用户提供 Host 的登录需要 Anthropic 的批准**，与 Claude Code 模型路由相同。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作备注——点击展开</summary>

本开发备注是给维护者的工作背景：未决问题与尚未确定的方向。它明确不具权威性——已发布的行为、限制与理由位于上面各节及所链接的 Agent Note。

#### 后续：复用进程

长期存活的 Claude Code 进程可以省去每次搜索的启动时间，但需要自己的空闲与失败生命周期。

</details>
