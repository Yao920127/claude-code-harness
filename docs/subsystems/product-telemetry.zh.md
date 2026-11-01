# 產品追蹤點

[English](product-telemetry.md) | 中文

[產品追蹤點外掛](../../packages/host/product-telemetry-otel/README.zh.md) 透過 OTLP/HTTP 傳送明確選定的分析事件。`productTelemetry` 服務僅負責提交；產品消費方決定事件發生時機與獲准採集的欄位。不自動採集 Session 資料或標識。

`ProductTelemetryRecord` 要求事件名稱、字串 body 和 Unix 毫秒時間戳。屬性接受字串、數字、布林標量，以及這些值組成的單層物件（`ProductTelemetryScalar`）。可選的嚴重程度使用 OTel 嚴重程度數字，預設為 INFO。記錄入隊時填寫觀測時間。

入隊同步完成，不代表送達確認。SDK 負責批次傳送與重試；傳送失敗會產生本地診斷。設定、退出和丟失限制見包 README。

## 記錄型別

```ts type-equiv
/** Scalar values accepted by the collector's Arrow attributes map. */
type ProductTelemetryScalar = string | number | boolean
```

```ts type-equiv
/** Explicitly selected analytics fields; object values may contain scalars only. */
interface ProductTelemetryRecord {
  /** Product/DA-owned event name. */
  eventName: string
  /** Human-readable summary; never a prompt, response, credential, or file contents. */
  body: string
  /** Event occurrence time in Unix milliseconds. Observation time is assigned on enqueue. */
  timestamp: number
  /** OTel severity; omitted values use INFO. */
  severityNumber?: SeverityNumber
  /** Business fields selected by the caller; no automatic device or account identity. */
  attributes?: Record<string, ProductTelemetryScalar | Record<string, ProductTelemetryScalar>>
}
```

Source: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxproducttelemetry--producttelemetry"></a>

### `ctx.productTelemetry` — `ProductTelemetry`

Host analytics sender. Mounting alone sends nothing; the owning fiber drains it on unload.

```ts cordis-catalog
/**
 * Enqueue one selected product event without waiting for network delivery.
 * Queue admission and shutdown completion are not collector or warehouse acknowledgements.
 * @param record - caller-owned event containing only approved analytics fields.
 */
emit(record: ProductTelemetryRecord): void
```

Source: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)
<!-- END GENERATED cordis-surface -->
