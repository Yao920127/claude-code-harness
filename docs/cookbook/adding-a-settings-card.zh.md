# 實踐指南：即時設定表單

[English](adding-a-settings-card.md) | 中文

在外掛 Config schema 中宣告即時欄位，並透過產品所屬的設定卡片提供編輯入口。匯出的 `Config` 介面描述外掛收到的值，包括每個 `Volatile<T>` 引用。

## 1. 宣告即時欄位

```ts
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export interface Config {
  endpoint: Volatile<string | undefined>
  retries: Volatile<number>
}

export const Config = z.object({
  endpoint: z.string().volatile(),
  retries: z.number().step(1).min(0).default(3).volatile(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.on('loader/volatile-update', () => {
    ctx.logger.info('Retry limit: %d', config.retries.get())
  })
}
```

在操作開始時讀取 `.get()`。需要一致快照的請求一次性捕捉所需值。使用 `.check()` 進行跨欄位 Config 驗證；這些檢查在持久化前由 Host 執行，不進入序列化的表單 schema。

## 2. 組合外掛

為每個實例分配唯一的 profile 條目 id。基礎組合包掛載 settings 和 config-editor。自定義 profile 掛載這些服務前，請閱讀相應包的 README。

`role('secret')` 阻止值進入表單回應。對於憑證域管理的值，使用憑證引用。普通欄位不進入設定 schema。

## 3. 驗證編輯

在外掛頁面修改欄位並儲存。驗證 profile patch、消費者下一次操作、外掛實例標識不變，以及重新啟動後的恢復。提交無效值，並確認檔案和即時值均未改變。

自定義外掛頁面從 Plugins 頁面所有者接收 `form.state` 和 `form.mutate(operations, expectedRevision)`。Host 驗證完整 Config，並透過 ConfigEditor 和 volatile HMR 應用修改。[外掛設定包](../../packages/client/ui-settings-plugins/README.zh.md) 提供現有卡片範例。

## 4. 向其他外掛的頁面貢獻內容

對某個不屬於自己的組合包、行或官方外掛有話要說的外掛，註冊進 `plugins.detail.actions`（頁頭的控制元件）、`plugins.detail.badge`（標題旁的標籤）或 `plugins.detail.section`（頁面自身內容之下的區塊）。每個條目都以頁面的 `subject` 渲染——`{ kind: 'bundle', pkg }`、`{ kind: 'row', pkg, row }` 或 `{ kind: 'item', id }`——對無話可說的 subject 返回 null：

```tsx ignore-check
ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({
  name: 'plugins.detail.badge',
  id: 'acme-update',
  locale: 'acmeUpdate',
}, ({ t, subject }) => subject.kind === 'bundle' && hasUpdate(subject.pkg) ? <Tag tone="info">{t('update')}</Tag> : null))
```

## 5. 瀏覽器半側掛在哪裡

瀏覽器半側由[用戶端模組系統](../../packages/client/modules)送到頁面：它掃描已啟用的 Loader 條目，找出宣告瞭 `dsh.client` 的包，送出每個包建置好的 `./client` 匯出——但它只把一個包的半側掛在說明符恰為裸包名的那一行上。從子路徑匯出掛載的行永遠不帶半側，因此把一個包拆成多行的組合包，其半側留在根行上，它註冊的每個頁面都隨根行關閉而消失。需要在其他行關閉時仍保留頁面的子外掛，應作為獨立的包釋出。

建置出的 `./client` 檔案必須是用戶端模組系統的 lazy-CJS factory 格式：一段腳本，向頁面的模組載入器登記包名和一個 `factory(require)`，見[用戶端模組系統的 README](../../packages/client/modules/README.zh.md)。生成它的 `clientBundle` tsdown 預設位於 `packages/client/tsdown.client.ts`，而不在任何已釋出的包裡，因此儲存庫之外的包要自己復刻這一步建置。

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings"] } }
}
```

內建名稱空間的伴生包就是同樣的瀏覽器半側放在一個純用戶端包裡，主機 `apply` 為空，列入 Web 組合的外掛花名冊（[`packages/bundle/web-app/cordis.patch.yml`](../../packages/bundle/web-app/cordis.patch.yml)），並透過 `ctx.configForms.whileServed` 註冊進 `plugins.item`，頁面因此恰好在 Host 服務該名稱空間期間存在。
