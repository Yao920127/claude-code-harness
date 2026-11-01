# 外掛設定

[English](config.md) | 中文

讓你的外掛接受使用者在 `cordis.yml` 中傳入的設定。

## 定義 Config 型別

在外掛中匯出一個 `Config` 型別和同名的 Schemastery schema；預設值直接寫在 schema 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

在 `scratch-plugin/cordis.yml` 新插入的本地外掛行中新增設定：

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

外掛載入時，Cordis 會透過匯出的 schema 驗證設定，並填充未提供欄位的預設值。不要匯出普通物件作為 `Config`，因為它不滿足 Cordis 要求的 Standard Schema 介面。

## Schema 驗證

對於需要嚴格驗證的情境，使用 Schemastery 定義 schema：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Schema 在外掛載入時執行驗證。如果設定不合法，外掛會載入失敗並給出明確錯誤資訊。

## 設計原則

### 無硬編碼可調參數

Harness 的約定：**凡是不同部署可能需要採用不同值的參數，都必須定義為設定欄位**。

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

檢驗標準：能否在 `cordis.yml` 中改變這個值，而不需要修改程式碼？

### 設定錯誤要響亮

在 schema 中表達自身完備的約束，使無效設定在外掛載入時失敗。對服務或已註冊資源的引用需要依賴注入；[服務教學](../framework/service.zh.md) 會介紹這項約定。

## 配合 HMR

設定變更會觸發外掛熱替換：修改 `cordis.yml` 中某個外掛的 `config` 後，框架會解除安裝舊實例並載入新實例。由於註冊都屬於 effect 並會自動清理，替換後不會保留舊實例的註冊。

## 下一步

- [打包與安裝外掛](./publish.zh.md) — 把外掛以可安裝檔的形式交付
- [外掛與生命週期](../framework/index.zh.md) — 深入瞭解外掛的完整生命週期
- [服務與依賴](../framework/service.zh.md) — 讓你的外掛對外提供服務
