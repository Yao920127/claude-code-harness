# 後端續聊基準

[English](README.md) | 中文

## 概述

在不使用網路服務或所記錄的使用者資料的情況下，測量長曆史請求處理、冷啟動的工具密集型續聊和重複發現非活動 fork 子工作階段。SDK 變體透過已釋出 sdk-minimal profile 和顯式 editor patch 執行 100 個輪次和 800 次真實檔案讀取；其他案例隔離後端服務成本。所有案例均不渲染瀏覽器。

## 目錄

- [執行](#run)
- [測量](#measurements)
- [開發備註](#dev-note)

<a id="run"></a>

## 執行

在儲存庫根目錄使用 `pnpm run build:bench` 建置庫和 worker，然後執行 `pnpm exec vitest run --config vitest.bench.config.ts benchmarks/agent-continuation/agent-continuation.bench.ts`。不要讓計時執行與建置或其他基準重疊。

測試報告全部五個新程序樣本、CPU 型號、可用並行度、平臺／架構和 Node/V8 版本，並約束經審查的中位數預算。目錄和工具續聊案例均使用標準託管 CI 的 900 ms 期望值與 1.25× 餘量（1,125 ms）；請求歷史使用單獨審查的 297 ms 託管上限（[證據](../../.agents/notes/implemented/simplification/2026-09-06-agent-request-freeze-evidence.zh.md)），SDK 續聊使用參考機器縮放。worker 失敗時報告退出狀態、訊號、超時和 stderr；失敗時也會刪除臨時根目錄。必需基準通道自動發現此檔案。

<a id="measurements"></a>

## 測量

[workload.ts](workload.ts) 負責定義合成維度。其目前代歷史在首個步驟的使用者輸入之前保留空 system 頭節點，因此續聊提示詞會替換該頭節點而不移動歷史訊息。[Agent Note](../../.agents/notes/implemented/testing/2026-09-06-backend-continuation-performance.zh.md) 負責說明計時終點、校準證據、記憶體解釋和排除項。模型介面卡不執行提供者序列化或網路呼叫；整合案例透過真實工具執行流水線執行合成工具體，SDK profile 變體則執行真實檔案讀取。

## 開發備註

無。
