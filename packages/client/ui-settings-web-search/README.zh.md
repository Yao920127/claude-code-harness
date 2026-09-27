---
description: "dsh Web 客户端插件页上的搜索来源设置页：由哪个提供方回答网页搜索，以及它读取的密钥。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search

[English](README.md) | 中文

## 概述

在侧栏打开**插件**，在官方分组里选择**搜索来源**，即可选择由哪个提供方回答网页搜索，并保存该提供方读取的密钥。页面暂存输入、只在保存时写入；密钥通过凭据域写入而不进设置文件，其明文从不出现在任何响应里。页面只在 Host 服务 `web` 命名空间期间存在。

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

**搜索来源**页面列出每个出厂提供方；第一个选项恢复为组合默认值，被覆盖的选择带**已覆盖**标签和**恢复默认**。读取已保存密钥的提供方会显示按该提供方出厂引用（例如 `OPENAI_API_KEY`）寻址的 **API Key** 控件，一次保存同时写入选择与密钥。密钥每次加载都是空的，只报告是否已配置；留空保存等于保留现有密钥，而当凭据不能从这里写入时该控件会被禁用。Exa 与 Perplexity 从启动环境读取密钥，页面会说明这一点；Claude Code 使用 Host 的登录，无需密钥。点击**保存**之前不会写入任何内容；离开页面即丢弃草稿。选择从下一次搜索起生效。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧通过 `ctx.configForms.get` 绑定 `web` 命名空间，用 `ui-primitives` 的共享 `SettingsFormModel` 在 `SearchProviderCardController` 里维护暂存表单。它暂存 `searchProvider`，并把生效提供方的密钥作为表单里唯一的密文控件，其引用取自 `search-providers.ts` 中的出厂提供方表：写入走该引用下的 `remote.credentials.set`，是否成功由 `remote.credentials.describe` 回读判定；请求途中引用已变化时，回答会被丢弃。scope 变化时、以及 Host 对所监视引用发出 `credentials/reference-updated` 时，控制器都会重读凭据，因为在模型页写入的密钥不会改变任何设置节。页面通过 `ctx.configForms.whileServed` 把 `SearchProviderCard` 注册进插件页的 `plugins.item` slot。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md)——插件页以及本页注册进去的 `plugins.item` slot。
- [ui-settings](../ui-settings/README.zh.md)——本页依赖的设置 scope 与"命名空间被服务期间"的监视。
- [ui-primitives](../ui-primitives/README.zh.md)——本页渲染的设置表单模型与字段。
- [credentials](../../credentials/README.zh.md)——密钥写入所经的凭据引用 seam。
- [web](../../web/web/README.zh.md)——注册 `web` 命名空间并选择搜索提供方的 web 服务。

-----

<a id="model-experience"></a>
## 模型体验

无，本包是浏览器侧的设置界面，不注册任何模型面。

#### KV 缓存影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **提供方专属字段**——各提供方自己的命名空间（例如 `web-search-deepseek` 中 DeepSeek 提供方的接口地址与单次请求搜索次数）保持组合值，需在 `cordis.yml` 中修改；本页只编辑提供方选择及其密钥。
- **运行时不变量：**不发布伴生。本页没有自己拥有的关系：它显示的内容派生自设置镜像与凭据域，它写入的内容由 Host 校验。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
