---
description: "用于 Web 客户端的 Claude 品牌占位者、页面图标以及 Claude 配色与字体，面向通过 harness 使用 Claude Code 的用户，以及替换品牌呈现的维护者。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-ui-brand-claude

[English](README.md) | 中文

## 概述

安装这个 Profile Bundle，即可以 Claude 标记与 Claude Code Harness 文字标识取代外壳的鱼形标记。它占用侧边栏的标记与名称 slot，以及空白会话主视觉的标记与文字标识 slot，在加载期间把页面图标指向 Claude 标记，并套用 Claude 的配色与字体。为通过 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md) 与 Claude Code 对话的 Profile 选择本包；Claude 标记是 Anthropic 的商标，因此提供给他人的部署需要取得 Anthropic 的许可才能显示。

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

把本包安装进 Profile，然后重启该 Profile。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-client-ui-brand-claude
```

Bundle 补丁插入一个浏览器行 `ui-brand-claude`。侧边栏在 Claude Code Harness 名称旁显示 Claude 标记，侧边栏窄于名称宽度时以省略号截断而不换行；新 Session 主视觉以 Claude 衬线展示字体把同一名称显示为文字标识，旁边是 Claude 标记；浏览器分页以 Claude 标记作为图标。移除本包后，下次启动 Profile 时每个位置都会回到之前的占位者。在 `official` 构建中不要同时挂载 [`dsh-client-ui-brand-official`](../ui-brand-official/README.zh.md)，因为两者占用相同的单一占位侧边栏 slot。

加载期间，本包还会按 Claude 的设计为整个 Web 客户端换装：奶油色画布与暖色深色表面、珊瑚色的主要按钮、开关、链接与焦点环、Inter 正文字体，以及用于主视觉标语与 Markdown h1 至 h3 标题的 EB Garamond。设置 → 外观仍然选择浅色、深色或跟随系统，Claude 配色随之切换。中文等非拉丁文字保留平台字体。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[`src/client/index.ts`](src/client/index.ts) 注册 `brand.claude` 词典，把两个侧边栏 slot 作为一组感知声明的注册集合填充，并把 `conversation.hero.brand.mark`（取代宿主所请求尺寸的 44px 标记）与 `conversation.hero.brand.headline`（翻译后的名称，以主视觉文字标识呈现）作为第二组填充。页面图标 effect 把每个 `link[rel~="icon"]` 的 `href` 改写为该标记的 SVG data URL，并在卸载时还原每个原先的 `href`；没有 document 的运行会跳过此步。[`src/client/mark.ts`](src/client/mark.ts) 保存标记的路径与颜色，[`src/client/Brand.tsx`](src/client/Brand.tsx) 渲染标记、主视觉标记与文字标识，以及侧边栏名称——它用自己的 CSS class 截断而不是换行进入侧边栏的固定高度行。node 半侧是空的 Loader 席位。

[`src/client/theme.ts`](src/client/theme.ts) 把 Claude 取值作为一个 `ctx.theme.overrideTokens` 层保存，每个 token 各有浅色与深色取值。它以暖色中性色替换共享的 `neutral-bluish` 色阶，以珊瑚色替换 `deepseek` 强调色阶，因此直接读取这些色阶的组件样式会与别名一起变化；它还设置品牌、链接、表面与字体 token。卸载时移除该层。[`src/fonts/fonts.css`](src/fonts/fonts.css) 以 data URI 内嵌同目录下 Inter 与 EB Garamond 的拉丁子集，因为客户端 bundle 把样式表内联为文本，而宿主不提供插件字体文件；一个测试会把内嵌字节与 `.woff2` 文件比对。Desktop 欢迎窗口改为复制 `eb-garamond-latin.woff2`，因为其内容安全策略会阻止 data URI 字体。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染它们的回退内容。
- [ui-conversation](../ui-conversation/README.zh.md)——在主视觉中声明 `conversation.hero.brand.mark` 与 `conversation.hero.brand.headline`。
- [dsh-llm-claude-code](../../llm/llm-claude-code/README.zh.md)——本品牌所搭配的 Claude Code 模型路由。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **浏览器标题独立设置**——`DSH_CLIENT_TITLE` 在构建时选择标题文字，而不是通过 UI slot。
- **服务器提供的图标文件不变**——页面图标在客户端加载后才改变；应用 manifest 与服务器发送的图标文件仍是之前的标记。
- **字体覆盖范围**——内嵌字体只覆盖拉丁文字；正文与衬线标题字体栈中的中日韩文字都回退到平台字体。

- **商标**——Claude 标记属于 Anthropic；在提供给他人的部署中显示它需要取得 Anthropic 的许可。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套模块。除了会还原的图标链接外，本包不保留可变状态，其 slot 占位者、主题层与字体样式表通过插件 effect 安装与离开。
