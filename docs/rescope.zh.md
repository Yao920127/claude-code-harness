# Vendored 包改名

[English](rescope.md) | 中文

Cordis 框架及其基礎庫以原始碼形式 vendored 在 [`vendor/`](../vendor/README.md) 下，並以 `@deepseek-ai` scope 釋出：每個 harness 包都把框架宣告為 peer dependency，釋出 harness 就會連帶釋出這一層，用上游名釋出等於在 registry 上佔用別人的名字。本頁是名字對映表；決策與影響見 [改名 Agent Note](../.agents/notes/archived/process/2026-08-10-vendor-package-rescope.md)，上游 commit 見 [`vendor/README.md`](../vendor/README.md)。

## 名字對映

| 目錄 | 上游名 | 釋出名 | 上游版本 | 角色 |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | 框架核心：`Context`、`Service`、`Fiber`、事件 |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | 框架與 Schemastery 共用的基礎工具 |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | 設定 schema（`Schema`），每個外掛的 `Config` 都基於它 |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | `cordis.yml` 裝載、外掛解析、repository 快取 |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 設定包含與 patch 疊加 |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 巢狀外掛分組 |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | `ctx` 上隨 disposal 回收的定時器 |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 外掛與設定的熱替換 |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 控制檯日誌匯出 |

子路徑匯出保持原路徑：`@cordisjs/plugin-loader/repository` 變成 `@deepseek-ai/cordis-plugin-loader/repository`。

## 改名不碰什麼

- **目錄名與上游原始碼版本。** `vendor/hmr/` 仍是 `vendor/hmr/`，清單表記錄的是所釘住原始碼快照的上游版本，因此清單讀作一份上游快照；而每個 vendored 包 `package.json` 自身的 `version` 欄位是 harness 釋出的清單版本，`pnpm run release:vendor` 會提升它，重新 sync 時會恢復成上游版本。
- **依賴 range。** 改名只修改依賴鍵，不改變範圍。Workspace 清單使用 `workspace:` 協定；[儲存庫規則](../AGENTS.md#conventions)區分精確的 DSH 引用與 vendor/native tilde 範圍。
- **Loader 的 `cordis:` 內建字首。** `cordis:include`、`cordis:group` 是協定字首，不是包名。
- **`cordis.yml` 設定文件家族**，包括 `*.cordis.yml`、`*.cordis.snapshot.yml`、`cordis.patch.yml`。
- **名字裡帶這個詞的 harness 包**，例如 `@deepseek-ai/dsh-tool-cordis`。
- **上游執行時識別符號**，例如 Schemastery 的 `Symbol.for('schemastery')` 及其 `vendor:` 中繼資料欄位。
- **`docs/` 之外的散文。** `vendor/*/README.md`、各包 README 與 Agent Note 保留寫作當時的名字；那裡的裸 `cordis` 也可能是 Python SDK 的選項名或某個 agent-preset 的 id。`docs/` 之內，散文與所有 Markdown 圍欄都跟著改。

## 你的程式碼要改什麼

| 位置 | 改前 | 改後 |
|---|---|---|
| 模組 import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| 型別事件宣告合併 | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| `package.json` 依賴鍵 | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| `cordis.yml` 外掛條目 | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## 施加、核驗與退回

上面這份對映由 [`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) 承載並執行改名，任何引用都不靠手改：

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

上游 sync 之後重跑它（[流程](../vendor/README.md)），並接上它列印的重生成：`pnpm install` 重生成 lockfile、`pnpm run gen-third-party-notices`、以及對它觸及的雙語對跑 `pnpm run verify-translation-pairing --write`。
