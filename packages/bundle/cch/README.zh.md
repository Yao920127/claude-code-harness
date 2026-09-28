---
description: "CCH（Claude Code Harness）profile bundle：以 Claude Code 作为默认模型路由，搭配 Claude 品牌与繁体中文，面向组合 CCH profile 的用户与 CCH Desktop 构建的维护者。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-cch

[English](README.md) | 中文

## 概述

把 `dsh-cch` 叠加在 `dsh-base` 与 `dsh-web-app` 之后，即可让 profile 成为 CCH profile：新 Session 以 Claude Code 模型路由开始，该路由使用宿主机本身的 Claude Code 登录，DeepSeek 模型路由、DeepSeek 账号设置与 DeepSeek 官方品牌占位者不会挂载。本 bundle 依赖 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md)、[`dsh-client-locale-zh-hant`](../../client/locale-zh-hant/README.zh.md) 与 [`dsh-client-ui-brand-claude`](../../client/ui-brand-claude/README.zh.md)；请把这些 bundle 列在它之前。CCH Desktop 构建会在每个新 Desktop profile 中列出全部四个；随附的 `cch` CLI profile 组合同一列表，因此 `pnpm cch web` 提供的 Web 应用与 Desktop 显示的相同。

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

按以下顺序把四个 CCH bundle 安装进 Profile，然后重启：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code @deepseek-ai/dsh-client-locale-zh-hant @deepseek-ai/dsh-client-ui-brand-claude @deepseek-ai/dsh-cch
```

| 行 | 变更 |
|---|---|
| `agent-default-model` | 默认模型 `claude-code` / `default`，即你的 Claude Code 设置所选的模型 |
| `locale` | 介面语言 `zh-TW`（繁体中文），直到在设置中选择其他语言 |
| `llm-deepseek`、`llm-deepseek-account` | 禁用，使模型选择器只列出 Claude 模型 |
| `ui-brand-official` | 禁用，使 Claude 品牌在官方构建中占用侧边栏 |
| `ui-settings-account` | 禁用，使设置中不提供 DeepSeek 账号登录 |
| `workspace-controller` | 默认工作区位于账户主目录下的 `~/default-workspace` |
| `web-search-claude-code`（插入）、`web` | 网页搜索使用同一登录运行 Claude Code 的 `WebSearch`；插件页的**搜索来源**页面可选择其他提供方 |
| `ui-sidebar-browser` | 在每个 CCH profile 中启用，与 Desktop 相同 |

Web 应用保存到 profile 补丁中的个人设置会在本 bundle 之后生效，并覆盖这些行。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

本包的实质内容是 [`cordis.patch.yml`](cordis.patch.yml)，即针对 `dsh-base` 与 `dsh-web-app` 所插入行、以 id 定位的补丁列表；[`src/index.ts`](src/index.ts) 不带任何运行时 API。补丁会替换某行的完整配置，因此 `agent-default-model` 条目会重述完整的选择。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-llm-claude-code](../../llm/llm-claude-code/README.zh.md)——本 bundle 默认选择的 Claude Code 模型路由。
- [dsh-base](../base/README.zh.md)——本 bundle 所修补的核心行。

<a id="model-experience"></a>
## 模型体验

间接地，通过其所选的 Claude Code 模型路由，该路由负责其面向模型的行为。

#### KV Cache 影响

bundle 本身不增加任何请求前缀；所选路由负责任何缓存影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **既有 Desktop profile 保留原有 bundle 列表**——只有由 CCH 构建创建的 Desktop profile 才会列出 CCH bundle；较早的 profile 需要手动添加。
- **DeepSeek 路由仍然安装**——这些行只是被禁用而非移除，因此在 profile 补丁中重新启用某行即可恢复。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套模块。本 bundle 是补丁列表，不拥有任何运行时关系。
