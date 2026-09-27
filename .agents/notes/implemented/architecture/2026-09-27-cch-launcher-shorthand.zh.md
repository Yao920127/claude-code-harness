# Agent Note: cch launcher shorthand

Status: implemented

[English](2026-09-27-cch-launcher-shorthand.md) | 中文

## 问题

CCH Desktop profile 组合 Claude Code 路由、Claude 品牌与繁体中文组合包，而 `dsh web` 启动的是普通 `web` 模板。因此从源码运行 Web 应用的开发者看到的产品与 Desktop 不同，而且没有 Claude Code Harness 的简短终端命令。[应用启动规则](../../../../docs/architecture.zh.md#application-launch)只允许 `dsh` profile 启动受支持的 Node 应用。

## 决定

`@deepseek-ai/dsh-app-boot` 导出 `CCH_PROFILE_BUNDLES`，并随附使用该列表的 `cch` profile 模板；Desktop 项目管理器组合同一个常量，因此两者不会分叉。`@deepseek-ai/dsh` 随附第二个 bin `cch`，把它的命令转换成针对 `cch` profile 的 `dsh` 调用：`cch web` 转为 `dsh --profile cch`，`cch plugin` 转为 `dsh plugin --profile cch`，`cch config` 转为配置 dump。两个入口共用一个分发模块，因此 `cch` 不增加任何启动行为。唯一的原生命令 `desktop`（也是默认命令）用 `open -a` 打开已安装的 Desktop 应用，因为 Desktop profile 由 Electron 应用持有，CLI 不得启动或管理它。根脚本 `cch`、`start:web` 与 `dev:web` 通过 `apps/cli/src/cch.ts` 启动，`verify-application-entrypoints` 对该 bin、其源码与 `cch` 脚本进行分类。

## 考虑过的替代方案

**只把 `cch` 做成 shell alias 或根脚本。** alias 只在单台机器上有效，根脚本只能在仓库内使用；bin 随 CLI 安装，并让 `pnpm cch` 与全局链接的 `cch` 使用同一套语法。

**由 `cch` 启动 Desktop profile。** Desktop profile 的包、锁与生命周期属于 Electron；从 CLI 启动它会与应用的 profile 锁竞争，并绕过其恢复流程。

**把 `web` 模板改为 CCH 组合包。** `web` 是上游 DeepSeek 组合，测试、WebWorker 预览与其他 profile 都以它为基础；独立模板让两种组合同时可用。

## 影响

`cch` 只在 macOS 上打开 Desktop；其他平台会输出提示，建议改用 `cch web`。`cch` profile 是 `$DSH_HOME/profiles/cch` 下的普通 CLI profile，与 Desktop 的插件安装相互独立，并与其他 CLI profile 共用会话与设置。CLI 安装现在依赖四个 CCH 组合包，使 `cch` 无需 profile 本地安装即可解析它们。
