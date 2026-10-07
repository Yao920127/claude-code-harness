# Agent Note: cch profile

Status: implemented

[English](2026-09-27-cch-profile.md) | 中文

## 问题

CCH Desktop profile 组合 Claude Code 路由、Claude 品牌与繁体中文组合包，而 `dsh web` 启动的是普通 `web` 模板。因此从源码运行 Web 应用的开发者看到的产品与 Desktop 不同。[应用启动规则](../../../../docs/architecture.zh.md#application-launch)只允许 `dsh` profile 启动受支持的 Node 应用。

## 决定

`@deepseek-ai/dsh-app-boot` 导出 `CCH_PROFILE_BUNDLES`，并随附使用该列表的 `cch` profile 模板；Desktop 项目管理器组合同一个常量，因此两者不会分叉。CLI 安装依赖四个 CCH 组合包，使该 profile 无需 profile 本地安装即可解析它们。仓库的 `pnpm cch web` 脚本 `scripts/cch.mjs` 以 `--profile cch` 运行源码 launcher，并把后续参数交给 Web 应用；`start:web` 与 `dev:web` 启动同一个 profile。`verify-application-entrypoints` 把 `cch` 脚本归类为 dsh launcher 之上的包装脚本。`verify-default-product-isolation` 会在模板以引用方式指名共享列表时读取该列表。

## 考虑过的替代方案

**随附全局 `cch` bin，用于打开 Desktop 并转发 `web`、`plugin` 与 `config`。** 它曾被实现后又移除：产品不提供终端命令，而第二个 bin 在没有随附使用方的情况下重复了 launcher 的语法。

**把 `web` 模板改为 CCH 组合包。** `web` 是上游 DeepSeek 组合，测试、WebWorker 预览与其他 profile 都以它为基础；独立模板让两种组合同时可用。

## 影响

`cch` profile 是 `$DSH_HOME/profiles/cch` 下的普通 CLI profile，与 Desktop 的插件安装相互独立，并与其他 CLI profile 共用会话与设置。`pnpm cch` 只接受 `web`。
