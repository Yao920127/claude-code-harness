# Agent Note: 多厂商网页搜索

Status: implemented

[English](2026-09-26-multi-vendor-web-search.md) | 中文

## Problem

出厂组合只挂载需要 DeepSeek API 密钥的 DeepSeek 搜索提供方。通过 Claude Code 登录、没有 DeepSeek 密钥的 CCH 安装因此没有可用的 `web_search`，持有其他模型厂商密钥的用户也无法使用这些厂商的搜索。web 服务还只在启动时读取一次所选提供方，因此没有任何设置界面能切换提供方。

## Decision

两个提供方包加入 [web seam](../architecture/2026-06-24-web-capability-seam.zh.md)。[`dsh-web-search-claude-code`](../../../../packages/web/web-search-claude-code/README.zh.md) 每次搜索用 Host 的登录运行一次 Claude Code 查询，该查询唯一的工具是 `WebSearch`，回答是 JSON schema 结构化输出。[`dsh-web-search-vendors`](../../../../packages/web/web-search-vendors/README.zh.md) 注册 Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral 与 Z.AI 提供方，每个提供方在每次搜索时解析自己的凭据引用。Claude API 提供方使用官方 Anthropic SDK 与 `web_search` 服务端工具。

base bundle 在 DeepSeek 之外挂载各厂商提供方、Exa 与 Perplexity，并仍选择 DeepSeek。CCH bundle 挂载并选择 Claude Code 提供方。`dsh-web` 的 `searchProvider` 为 volatile，并在每次搜索时读取，因此插件页新增的**搜索来源**页面无需重启即可切换提供方，并通过凭据域保存所选提供方的密钥。

## Alternatives considered

**每个厂商一个包。** 七个包会重复同样的凭据、取消与错误处理，以及七组 README，而这些提供方的差异只有一个请求和一种映射。

**像 DeepSeek 一样把每个辅助厂商请求记为 Session 事件。** 每个厂商都会新增一种持久事件类型、持久化类型审查与 SDK 预期输出。模型可见的输入已是工具调用中的查询，模型可见的输出是工具结果；Perplexity 与 Exa 已遵循这一规则。

**纳入 Qwen、Groq 与 Kimi。** 它们的搜索响应没有文档说明的结构化来源列表，映射只能猜测字段，或只返回没有来源的回答文字。

**读取 Claude Code 保存的登录并直接调用 Messages API。** 这会绕过被借用登录的产品本身；[Claude Code 模型路由](2026-09-25-claude-code-model-route.zh.md)已否决同样的捷径。

## Consequences

选择一个未保存密钥的厂商会以写明引用的 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。设置页只知道各提供方出厂的密钥引用，因此修改某厂商 `apiKeyEnv` 的部署也必须在新引用下保存密钥。Claude Code 搜索每次都启动一个进程，并计入已登录账号的用量。各厂商的默认模型与端点属于组合配置。单元测试覆盖各厂商的请求与映射、凭据与取消失败、代理出口、Claude Code 查询选项与输出校验、提供方实时切换以及设置页；Loader 组合测试通过出厂 headless profile 选中这两类新提供方。
