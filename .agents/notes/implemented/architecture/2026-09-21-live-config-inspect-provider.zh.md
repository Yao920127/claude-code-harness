# Agent Note: 執行中外掛 Config 檢查取代 Host Builtin provider

Status: implemented

[English](2026-09-21-live-config-inspect-provider.md) | 中文

## Problem

創造模式的 agent 為已安裝外掛編寫 `config:` 行時，沒有任何執行時的 Config schema 來源。CLI 的 `--dump-config-schema` 參考在執行中的工作階段裡不可達，而 `Builtin` Host 檢查 provider 宣告的是模型已無法定義的動態 Host half 的沙箱符號。

## Decision

`@deepseek-ai/dsh-tool-cordis/host` 註冊 `Config` 檢查 provider，不再註冊 `Builtin` provider。`Config.listConfigs` 讀取執行中的 Loader 樹：無輸入時返回每個 entry 的 id、外掛名和 Config 狀態；給定 entry id 時，透過 app-boot 的投影器把該 entry 的原生 Schemastery Config 投影為一份自包含的 JSON Schema 文件。未啟用的 entry 報告 `inactive` 且不帶 schema。

provider 遍歷 `ctx.loader.entries()` 和每個 fiber 的執行時 Config，而不是執行免啟動的收集器，因為執行中的 profile 已持有收集器要安裝且禁止重疊的模組解析攔截。app-boot 為此匯出投影器、原生 schema 判定和共享的 `loaderExpression` 定義；CLI dump 保留其 profile 組合語義。

## Alternatives considered

**在 Host 內重跑 `generateConfigSchema`。** 它會在第二層攔截下重新匯入每個外掛模組，而收集器禁止在已安裝攔截時重疊，並且它描述的是 profile 檔案而非已掛載的樹。

**讓出貨的 skill 去執行 CLI dump。** 它需要 agent 的 shell 裡有 profile 名和 PATH 上的 `dsh` 可執行檔案，工作階段都不保證，而且輸出無界。

## Consequences

agent 可以在編寫 patch 前讀取已掛載外掛的 Config schema。執行時生成的 Agent preset 樹仍在 Loader 之外，不會被列出。Client 的 `Builtin` provider 不變：Client 外掛程式碼仍執行在它所描述的瀏覽器模組載入器中。
