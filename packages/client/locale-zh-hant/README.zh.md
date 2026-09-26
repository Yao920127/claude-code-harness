---
description: "由简体中文文案转换而来、供 Web 客户端使用的繁体中文（台湾），面向阅读繁体中文的用户与该语言包的维护者。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-locale-zh-hant

[English](README.md) | 中文

## 概述

安装这个 Profile Bundle，即可用带台湾用语的繁体中文阅读 Web 客户端。它在「设置 → 通用 → 语言」中添加标为 繁體中文 的 `zh-TW` 语言。该语言不附带任何词典：所有文字都取自简体中文文案，并用 OpenCC 的简体转台湾用语转换，因此每个附带中文文案的包都会被覆盖，无需第二份翻译。

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

把本包安装进 Profile，重启该 Profile，然后在「设置 → 通用 → 语言」中选择 繁體中文。浏览器首个匹配的语言为 `zh-TW` 时会自动选中它。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-client-locale-zh-hant
```

Bundle 补丁插入一个浏览器行 `locale-zh-hant`。移除本包后，下次启动 Profile 时该语言会从选择器中移除，生效中的选择会回落到浏览器语言或默认语言。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[`src/client/index.ts`](src/client/index.ts) 通过 `ctx.locale.addLanguage()` 注册该语言，fallback 为 `zh`，并附带 `derive` 改写。locale 服务会让该语言从 fallback 链取得的每段文字都经过此改写，因此在本插件之前或之后注册的词典都会同样被转换。改写使用 `opencc-js/cn2t` 入口，参数为 `from: 'cn'` 与 `to: 'twp'`，并对每个转换结果做 memoization。node 半侧是空的 Loader 席位。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-client-locale](../locale/README.zh.md)——语言包、fallback 链，以及本包提供的 `derive` 改写。
- [OpenCC](https://github.com/BYVoid/OpenCC)——`opencc-js` 背后的转换词典。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **转换而非翻译**——措辞沿用简体中文文案；OpenCC 替换字形与常见台湾用语，但台湾译者会另行选择的说法仍保持转换结果。
- **仅限浏览器文案**——模型可见文字、Host 日志与文档保持原本撰写的语言。
- **bundle 体积**——简体转繁体词典会让本插件的浏览器 bundle 增加约 1 MB。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套模块。本包拥有一个语言注册，其生命周期即其插件 effect。
