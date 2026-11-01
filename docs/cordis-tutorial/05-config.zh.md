# 5. 設定

[English](05-config.md) | 中文

`cordis.yml` 中的每個 Cordis 設定項都可以攜帶 `config` 塊，外掛則宣告一個 schema，在執行 `apply` 前驗證該塊。錯誤設定會導致載入失敗，並給出準確的錯誤：外掛絕不會在設定不完整時啟動。

## 可設定外掛

建立 `config-demo.ts`，並將其放在 `tmp/cordis-tutorial` 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

匯出的 `Config` 既是 TypeScript 介面，也是同名的執行時 schema：消費方獲得型別，Cordis 獲得驗證器。本儲存庫使用 [Schemastery](https://github.com/shigma/schemastery) 定義 schema；Cordis 本身接受任意 [Standard Schema](https://standardschema.dev/) 驗證器，因此將普通物件匯出為 `Config` 無法工作。

對其進行設定：

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

執行：

```
Hello, alpha!
Hello, beta!
```

未提供 `greeting`，因此 schema 預設值會將其補齊：`apply` 始終會收到完整且經過驗證的設定。

## 明確報錯

現在向它傳入無效內容：

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

外掛的 fiber 進入 FAILED 狀態，本教學的啟動器列印錯誤後以狀態碼 1 退出。如果某個外掛的設定透過了 schema 驗證，但其中指定的資源或提供者不可用，該外掛也應當在能解析該引用時立即拒絕。

<a id="volatile-fields"></a>
## Volatile 欄位

對於外掛在每次操作中讀取的欄位，可以使用 `.volatile()`。欄位變化會更新穩定引用，無需重新掛載外掛。透過 `.get()` 讀取：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello').volatile(),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.on('loader/volatile-update', () => {
    console.log(config.greeting.get())
  })
}
```

直接呼叫 `Config(raw)` 也會返回引用。沒有預設值的可選欄位仍然具有引用；欄位預設時，`.get()` 返回 `undefined`。可以儲存引用，也可以在單次操作中儲存讀取值，包括跨越 `await`，但不能將該值用於後續操作。物件和陣列值是脫離輸入、遞迴凍結的普通資料快照；函式、類實例和迴圈引用會被拒絕。

Loader 比較原始設定時忽略 schema 宣告的 volatile 欄位。僅 volatile 變化會經目標外掛的 `internal/config` 掛鉤解析並驗證；當所有普通欄位的有效值仍然一致時，Loader 把新值提交到執行中的引用，並向所屬實例發出一次 `loader/volatile-update`，參數是以鍵陣列表示的變化路徑，不進入目標外掛的 `internal/update`。等值更新不通知。無效候選會記錄日誌，執行中的引用保持不變，直到下次啟用。普通欄位有效值變化（包括表示式求值結果變化）以及普通欄位同時變化時沿用原更新流程，舊引用不更新也不接收通知。Group/Include 仍分發子條目更新。直接 `fiber.update()`、程式碼替換和依賴替換保留原有生命週期；`noSave` 仍控制直接更新的持久化。通知使用普通 `emit`，不等待資源重新設定完成。

在固定物件路徑上宣告 volatile 欄位，或將整個物件、陣列標記為 volatile。陣列、字典、union 或 intersect 分支、lazy、transform 或另一個 volatile 值內部的獨立引用會被拒絕。設定檔儲存普通值；`simplify()` 會解包引用。序列化 schema 保留欄位型別、預設值、角色和 volatile 標記，供基於 schema 的表單使用。現有 settings 消費者繼續使用原有 settings 介面。

## 計算得到的設定值

本儲存庫使用的 loader 支援 `!!js` 標籤，用於必須在載入時計算的設定值：

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` 僅在 `config` 與條目 `disabled` 欄位內有效。`disabled: !!js ...` 在每次掛載決策時基於 loader 上下文求值（本儲存庫的擴充功能），可以按平臺或環境門控一行；其餘中繼資料（`name`、`id`、`inject` 等）保持靜態，其中的表示式是普通真值資料。詳見 [loader 設定](../cordis-primer.zh.md#loader-configuration)。

下一章：[組合與 HMR（熱模組替換）](06-composition-and-hmr.zh.md)：將 `cordis.yml` 視為應用。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
