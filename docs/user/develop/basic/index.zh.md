# 第一個外掛

[English](index.md) | 中文

本教學會建立一個最小的 Harness 外掛，並將其載入到 Web UI 中。請從已完成[從原始碼執行路徑](../../../../README.zh.md#run-from-source)的儲存庫檢出開始。

## 建立本地專案

在儲存庫根目錄建立本教學使用的臨時專案：

```sh
mkdir -p scratch-plugin/src
```

## 外掛是什麼

在 Harness 中，外掛是一個匯出 `apply` 函式的 TypeScript 模組。框架在載入時呼叫 `apply`，傳入一個 `ctx`（上下文物件），你透過 `ctx` 註冊能力：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

這就是完整設定。

## 建立外掛檔案

建立 `scratch-plugin/src/my-plugin.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## 註冊到 cordis.yml

在儲存庫根目錄執行 `pwd`，然後建立 `scratch-plugin/cordis.yml`，作為插入本地外掛的 Web 覆蓋層。請將下文的 `/absolute/path/to/deepseek-harness` 替換為命令列印的路徑：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

外掛路徑必須是絕對路徑。patch 檔案只貢獻設定，不會改變 loader 解析模組路徑時使用的 profile 目錄。

使用該覆蓋層啟動 Web UI：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

開啟 `http://127.0.0.1:3080`。啟動期間，終端會列印 `[hello-plugin] plugin loaded!`。

## 自動清理

透過 `ctx` 註冊的任何東西——事件監聽、工具、定時器——在外掛解除安裝時都會被自動清理。你不需要手動 removeListener 或 clearInterval。

如果你有需要手動清理的資源（比如一個網路連線），用 `ctx.effect()` 告訴框架怎麼清理：

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## 宣告依賴

如果你的外掛需要使用其他服務（如 `tools`、`llm`），需要宣告 `inject`：

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

框架會確保依賴的服務就緒後才載入你的外掛。

## 外掛的三種形態

除了函式形式，外掛還支援物件形式和類形式：

### 物件形式

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### 類形式

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

大多數情況下，函式形式足夠了。當外掛需要向其他外掛提供服務時，可使用類形式（見 [服務與依賴](../framework/service.zh.md)）。

## 下一步

- [開發一個工具](./tool.zh.md) — 瞭解工具定義 DSL
- [外掛設定](./config.zh.md) — 讓外掛接受使用者設定
- [Cordis 框架教學](../../../cordis-tutorial/index.zh.md) — 底層的外掛框架，在臨時目錄中動手建置，無需 API 金鑰
