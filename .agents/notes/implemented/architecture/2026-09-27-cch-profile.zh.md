# Agent Note: cch profile

Status: implemented

[English](2026-09-27-cch-profile.md) | 中文

## 問題

CCH Desktop profile 組合 Claude Code 路由、Claude 品牌與繁體中文組合包，而 `dsh web` 啟動的是普通 `web` 範本。因此從原始碼執行 Web 應用的開發者看到的產品與 Desktop 不同。[應用啟動規則](../../../../docs/architecture.zh.md#application-launch)只允許 `dsh` profile 啟動受支援的 Node 應用。

## 決定

`@deepseek-ai/dsh-app-boot` 匯出 `CCH_PROFILE_BUNDLES`，並隨附使用該列表的 `cch` profile 範本；Desktop 專案管理器組合同一個常數，因此兩者不會分叉。CLI 安裝依賴四個 CCH 組合包，使該 profile 無需 profile 本地安裝即可解析它們。儲存庫的 `pnpm cch web` 腳本 `scripts/cch.mjs` 以 `--profile cch` 執行原始碼 launcher，並把後續參數交給 Web 應用；`start:web` 與 `dev:web` 啟動同一個 profile。`verify-application-entrypoints` 把 `cch` 腳本歸類為 dsh launcher 之上的包裝腳本。`verify-default-product-isolation` 會在範本以引用方式指名共享列表時讀取該列表。

## 考慮過的替代方案

**隨附全域 `cch` bin，用於開啟 Desktop 並轉發 `web`、`plugin` 與 `config`。** 它曾被實作後又移除：產品不提供終端命令，而第二個 bin 在沒有隨附使用方的情況下重複了 launcher 的語法。

**把 `web` 範本改為 CCH 組合包。** `web` 是上游 DeepSeek 組合，測試、WebWorker 預覽與其他 profile 都以它為基礎；獨立範本讓兩種組合同時可用。

## 影響

`cch` profile 是 `$DSH_HOME/profiles/cch` 下的普通 CLI profile，與 Desktop 的外掛安裝相互獨立，並與其他 CLI profile 共用工作階段與設定。`pnpm cch` 只接受 `web`。
