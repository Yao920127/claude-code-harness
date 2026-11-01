---
description: "為開發和設定已安裝 Harness 外掛的 agent 提供只讀執行時 API 查詢。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-cordis

[English](README.md) | 中文

## 概述

編寫外掛程式碼前查詢 Host 和 Client 的執行時 API。創造模式同時提供這些只讀工具與 Plugin Manager，後者負責持久化 profile 變更。檢查註冊表由 Cordis host runner 提供；瀏覽器查詢需要已連線的頁面。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

創造模式包含這組工具。其他組合需要在主機組合裡、提供 `cordisInspect` 的 host runner 旁掛載一次 `@deepseek-ai/dsh-tool-cordis/host`，並在每個要暴露這些工具的 agent preset 裡掛載 `@deepseek-ai/dsh-tool-cordis`；僅有 preset 行不會註冊任何 Host provider。呼叫 `cordis_inspect_list` 發現 provider，再用 `cordis_inspect_query` 查詢其具體方法和型別。Host 的 `Config` provider 分頁列出執行中的 Loader entry（`offset`、最多 100 的 `limit`、可選的精確外掛 `name`；`total` 與 `nextOffset` 界定遍歷），每個 entry 帶 Loader id、patch 所定址的樹內 id 及其 Config 狀態（`schema`、`absent`、`unsupported`、group 與 include 載體為 `tree`、停用、未匯入或已銷燬的 entry 為 `inactive`），並把單個 entry 的原生 Config 投影為自包含的 JSON Schema 文件，同時在 profile 包查詢能解析時給出該 entry 的 `packageDir`，即包 README 與建置產物 `lib/` 所在目錄。透過 [Plugin Manager](../../boot/plugin-manager/README.zh.md) 安裝檔含外掛程式碼或 MCP 設定的組合包。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

Host provider 結合生成的 Service/Event 目錄、經 app-boot Config 投影器投影的執行中 Loader 樹，以及請求 agent 的工具註冊表。Client provider 透過現有檢查註冊表同步清單，並從已連線頁面回答查詢。主機入口持有 Host provider 的註冊，preset 行持有兩個工具，都透過 Cordis effect；註冊表拒絕重複的 provider id，所以 provider 按程序註冊一次而不是按 preset 註冊。檢查直接讀取 provider，不維護獨立執行時投影，因此不釋出不變式配套外掛。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Plugin Manager](../../boot/plugin-manager/README.zh.md) — 持久化組合包安裝和啟停。
- [Cordis host runner](../cordis-host-runner/README.zh.md) — 檢查註冊表和現有執行時消費者。

<a id="model-experience"></a>
## 模型體驗

### 執行時檢查

#### 模型所見

[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-cordis) 描述兩個只讀檢查工具。外掛不貢獻 system prompt 段落：工具描述已說明何時呼叫每個工具以及查詢不會呼叫業務方法。在 `cordis` preset 中，首輪 skill catalog 攜帶兩個隨附技能的描述，把外掛、MCP、組合編輯和未指定去向的視覺請求路由到覆蓋 Plugin Manager、MCP 設定、Client 打包和 slot 註冊的技能。查詢結果包含所請求的 API 宣告、目前工具 schema、帶 Config 狀態的執行中 entry 目錄，或單個 entry 投影后的 Config JSON Schema。

#### Token 影響

外掛可見時，只有兩個工具 schema 進入模型請求。查詢結果追加到轉錄中；精確查詢避免載入無關宣告。

#### KV Cache 影響

未改變的工具 schema 保持字首穩定。查詢結果追加到歷史中；啟用其他外掛可能改變後續工具 schema。

## 已知限制與待辦

<a id="known-limitations-and-deferred-work"></a>

- Client 查詢等待頁面回應或取消。檢查不能呼叫服務方法、設定外掛或執行生成程式碼。
- `Config.listConfigs` 只遍歷 profile 的 Loader 樹。Agent preset 的 `plugins` 列表掛載在獨立的 preset 樹中，所以只出現在 preset 宣告裡的外掛不會被列出，除非 profile 樹也掛載了它。

<a id="dev-note"></a>
### 開發備註

無。
