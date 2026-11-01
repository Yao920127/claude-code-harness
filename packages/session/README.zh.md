---
description: "持久工作階段資料平面的包對映：持久化 seam 及其後端、檢查點策略、投影、基於日誌的標題與外發工作階段遙測。"
kind: "package-group"
---

# session/ — 持久工作階段資料平面

[English](README.md) | 中文

## 概述

session 組讓對話持久儲存，恢復已釋出的日誌格式，並使已提交歷史在重新啟動後仍可用。儲存與檢查點包保護請求、工具副作用和已完成步驟；投影包生成用戶端可用的值；標題包為工作階段命名；遙測包上報活動。先使用隨產品交付的 JSONL 儲存，再新增檢查點，並僅按部署需要新增投影、標題策略或遙測。每個包 README 負責各自的保證與設定，同級查詢組則提供獨立的讀取和工具存取。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

本組分為四個家族：持久儲存（持久化 seam、後端、檢查點策略）、投影、標題與遙測。每個包 README 負責各自的約定與設定。

### 持久化

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-format/`](session-format/README.zh.md) | 純相鄰格式鏈與產物驗證庫 | 庫，不使用 ctx key |
| [`session-format-v0-to-v1/`](session-format-v0-to-v1/README.zh.md) | 凍結的 released-v0 解碼器，以及到 released v1 的恆等遷移 | 庫，不使用 ctx key |
| [`session-format-v1-to-v2/`](session-format-v1-to-v2/README.zh.md) | 凍結的 released-v1 解碼器，以及遷移到 released v2 時會改變基數的 Assistant 流遷移 | 庫，不使用 ctx key |
| [`session-format-v2-to-v3/`](session-format-v2-to-v3/README.zh.md) | 凍結的 V2 解碼器，以及遷入 V3 的系統提示詞、信封與 PTC 轉換 | 庫——無 ctx 鍵 |
| [`session-format-v3-to-v4/`](session-format-v3-to-v4/README.zh.md) | V3 恆等遷移與 V4 編解碼器，按 generation 驗證 delivery | 庫——無 ctx 鍵 |
| [`session-format-catalog/`](session-format-catalog/README.zh.md) | 自動生成的已交付相鄰遷移靜態目錄 | 庫，不使用 ctx key |
| [`session-persistence/`](session-persistence/README.zh.md) | 定義持久工作階段儲存服務，以及每個後端組合的共享寫入協調機制 | `ctx.sessionPersistence` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.zh.md) | 隨產品交付的後端：逐 Session 使用不可變規範 generation 檔名並排他釋出後繼；可選 Zstandard 壓縮 | 註冊到 `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.zh.md) | 讓模型請求、頂層工具副作用與已完成步驟在下一步動作前持久化 | 包裝 `ctx.llm` 與 `ctx.tools` |
| [`session-log-deepseek/`](session-log-deepseek/README.zh.md) | 把增量規範日誌作為可選的官方 DeepSeek 請求中繼資料上傳 | 貢獻 `dsh_session_log` |

### 投影

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-projection/`](session-projection/README.zh.md) | 定義並驅動把已提交事件摺疊為完整目前值的投影單元 | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.zh.md) | 持久化投影檢查點，使冷讀跳過全量日誌載入 | `ctx.sessionProjectionCache` |
| [`session-stats/`](session-stats/README.zh.md) | 透過 `sessionStats` 單元提供全日誌工作階段計數與牆鍾時間 | 註冊到 `ctx.sessionProjections` |
| [`session-turn-outline/`](session-turn-outline/README.zh.md) | 透過 `turnOutline` 單元提供全日誌輪次大綱（輪次、`turn/start` seq、提示詞預覽） | 註冊到 `ctx.sessionProjections` |

### 標題

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-title/`](session-title/README.zh.md) | 基於日誌的工作階段標題，帶確定性退回與一個可選提供者 | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.zh.md) | 供提供者包共享的模型標題生成策略 | 庫，不使用 ctx key |
| [`session-title-first-prompt-llm/`](session-title-first-prompt-llm/README.zh.md) | 根據第一條合格的人類訊息為工作階段生成標題 | 註冊到 `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`](session-title-all-prompts-llm/README.zh.md) | 根據所有合格的人類訊息為工作階段生成標題 | 註冊到 `ctx.sessionTitle` |

### 遙測

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-telemetry/`](session-telemetry/README.zh.md) | 捕捉工作階段活動並把記錄交給設定的上報後端 | `ctx.sessionTelemetry` |
| [`session-telemetry-otel/`](session-telemetry-otel/README.zh.md) | 透過 OpenTelemetry 日誌以 `FEEDBACK_ONLY` 或 `DISABLED` 模式投遞遙測 | 註冊到 `ctx.sessionTelemetry` |

同一時間只允許一個標題提供者註冊；未註冊時，標題服務保留其確定性退回。下面的子系統頁面是各家族後端無關的參考資料。

-----

<a id="related-documentation"></a>
## 相關文件

- [工作階段持久化子系統](../../docs/subsystems/persistence.zh.md)——後端無關的服務語義、flush 檢查點與崩潰恢復。
- [工作階段投影子系統](../../docs/subsystems/session-projection.zh.md)——投影單元約定與驅動語義。
- [工作階段標題子系統](../../docs/subsystems/session-title.zh.md)——標題資格、退回與提供者流程。
- [工作階段遙測子系統](../../docs/subsystems/session-telemetry.zh.md)——捕捉、脫敏與投遞模式。
- [工作階段子系統](../../docs/subsystems/session.zh.md)——本組每個包持久化或派生的即時事件日誌。

<a id="dev-note"></a>
## 開發備註

無。
