---
description: "設定顯式產品使用事件、OTLP/HTTP 路由、批次傳送與退出等待上限。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-product-telemetry-otel

[English](README.md) | 中文

## 概述

將選定的產品使用事件傳送到 OTLP/HTTP 接收服務。事件包含名稱、字串摘要、發生時間，以及標量或單層物件屬性。掛載外掛不會自動採集資訊；應用需要顯式提交每個事件。傳送採用盡力而為方式，不代表資料已入倉。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Cordis 組合中掛載外掛並提供應用標識；需要時可覆蓋接收地址。內建 profile 不掛載本外掛。啟動器環境須將 `DSH_APP_VERSION` 設為執行中應用的釋出版本；缺少版本時 schema 會拒絕設定。

```yaml
- name: '@deepseek-ai/dsh-host-product-telemetry-otel'
  config:
    endpoint: https://dsh-otel-collector.deepseeksvc.com/v1/logs
    serviceName: deepseek-harness
    serviceVersion: !!js process.env.DSH_APP_VERSION
    compression: gzip
    scheduledDelayMillis: 30000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `endpoint` | `https://dsh-otel-collector.deepseeksvc.com/v1/logs` | 完整 HTTP(S) 日誌地址 |
| `serviceName`, `serviceVersion` | 必填 | OTel resource 中的應用標識 |
| `channel` | `dsh_otel_report` | 接收服務的 `x-channel` 請求頭 |
| `compression` | SDK 環境變數 | `gzip` 或 `none`；省略時遵循 OTel 壓縮環境變數 |
| `maxExportBatchSize`, `maxQueueSize` | `512`, `2048` | 記錄條數上限；批次大小不能超過佇列大小 |
| `scheduledDelayMillis` | `30000` | 不滿批次時的傳送間隔 |
| `timeoutMillis` | `15000` | Exporter HTTP 傳送與重試的超時時間 |
| `exportTimeoutMillis` | `20000` | Processor 批次匯出的超時時間 |
| `shutdownTimeoutMillis` | `21000` | 退出時的等待上限；超時會提示可能丟失資料 |

預設接收地址將顯式提交的事件傳送到生產產品 collector，測試和自定義部署必須覆蓋該地址。只向 collector 傳送 `x-channel` 和 SDK 協定請求頭，不繼承主機 OTel 請求頭或用戶端憑證。

30 秒間隔用於批次傳送產品事件；exporter 的 15 秒重試視窗位於 processor 的 20 秒批次期限內。外層 21 秒等待限制外掛解除安裝時間，包括 processor 期限未覆蓋的 SDK `forceFlush()`。collector 不可達時，解除安裝可能等待完整的 21 秒。2,048 條滿佇列需要四個 512 條批次，可能無法在期限前排空。要求更快退出的互動式應用組合應覆蓋這些時間設定；兩種設定都不保證送達。

消費方注入 `productTelemetry`，呼叫 `emit()` 提交明確選定的分析欄位。事件名稱與欄位含義由產品和資料分析負責人定義。外掛不讀取 Session、帳號、憑證或裝置標識。呼叫方必須排除提示詞、回答、檔案內容、憑證及其他未經批准的資料。

接收服務要求 body 為字串，attributes 的值為字串、數字、布林值或由這些標量組成的物件。呼叫方以毫秒提供發生時間；外掛填寫觀測時間，預設嚴重程度為 INFO。無效傳輸設定在啟用時報錯。傳送失敗產生本地警告，事件提交不等待網路。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

私有 OTel logger 將記錄交給 `BatchLogRecordProcessor`，再由 SDK HTTP delegate 和 JSON 日誌序列化器傳送。delegate 使用顯式請求頭和 HTTP agent，只有共享的超時與壓縮設定使用 SDK 環境變數解析。直接依賴的 `@opentelemetry/core` 與 `sdk-logs` 對齊為 2.9.0，使匯出結果列舉共享同一個 TypeScript 型別身份。SDK 負責佇列、臨時錯誤重試與壓縮；外掛解除安裝時在限定時間內傳送剩餘記錄。傳送完成結果單獨觀測，因為 SDK 在傳送被拒絕後仍可能正常完成退出。不安裝全域 OTel provider。

[`src/index.ts`](src/index.ts) 負責設定與提交。不釋出執行時不變數伴隨模組：本地沒有獨立的送達確認可與 SDK 佇列比較。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [產品追蹤點](../../../docs/subsystems/product-telemetry.zh.md)——消費方型別與服務參考。
- [工作階段上報](../../session/session-telemetry-otel/README.zh.md)——獨立的、由回饋授權的 Session 上報。
- [測試策略](../../../docs/testing.zh.md)——Loader 組合與網路測試夾具。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為外掛僅傳送顯式分析記錄，不提供模型上下文。

#### KV Cache 影響

無；提交事件不會改變模型請求。

## 已知限制與待辦工作

<a id="known-limitations-and-deferred-work"></a>

傳送和採集受以下能力限制。

- 呼叫方擁有事件選擇、渲染程序到主機的傳輸以及獲准使用的標識屬性。
- 佇列僅存在於記憶體；佇列溢位、網路故障和程序退出可能丟失事件。沒有持久發件箱或入倉確認。
- SDK 按記錄條數而非編碼位元組數分批。呼叫方必須確保記錄不超過接收服務的 4 MB 限制，並選擇接收服務適用的批次大小。
- 不自動脫敏呼叫方選擇的字串。本包不決定產品告知或同意策略。

<a id="dev-note"></a>
### 開發備註

無。
