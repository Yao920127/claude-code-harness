# 2. 生命週期與 effect

[English](02-lifecycle-and-effects.md) | 中文

Cordis 外掛可能因修改設定、熱過載、顯式資源釋放或所需服務消失而解除安裝。透過 Cordis API 建立的註冊屬於 effect，會在所屬外掛解除安裝時撤銷；在這些 API 之外管理的資源必須包裝在 `ctx.effect()` 中。

## Effect

對於 Cordis 尚未管理的資源，例如定時器、連線或 watcher，應將其包裝在 `ctx.effect()` 中並返回 disposer（資源釋放函式）：

建立 `lifecycle.ts`，將它放在 `tmp/cordis-tutorial` 中：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

讓 `cordis.yml` 指向該檔案：

```yaml
- name: './lifecycle.ts'
```

執行（`node --import tsx ../../vendor/cordis/bin.js`）後會得到：

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

請留意三點：

- `ctx.plugin(heartbeat)` 會把一個**來自程式碼**的函式掛載為外掛，這與 YAML loader 為每個設定項執行的操作相同。函式外掛不需要 `apply` 方法：Cordis 會直接呼叫該函式，其名稱只用於診斷。只有物件形態才要求 `apply` 方法，例如 `ctx.plugin({ apply(ctx) { /* ... */ } })`。呼叫會返回一個 **fiber**，即一個已載入外掛實例的執行時控制代碼。
- effect 主體在載入期間執行；它返回的 disposer 在解除安裝期間執行。對於生命週期與外掛一致的資源，你絕不需要自行呼叫 disposer。
- `fiber.dispose()` 會等該外掛的所有清理工作（包括非同步 disposer）完成後才結束，並遞迴解除安裝它掛載的所有子外掛。

## Fiber 狀態機

每個已載入外掛實例都擁有一個 fiber，並在以下狀態之間轉換：

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING**：已經宣告，但所需服務（第 3 章）尚不可用。
- **LOADING / ACTIVE**：`apply` 正在執行／已經完成。
- **FAILED**：`apply` 或設定驗證丟擲異常。
- **UNLOADING / DISPOSED**：disposer 正在執行／一切均已拆除。

你會在[第 6 章](06-composition-and-hmr.zh.md)再次遇到 PENDING，它通常就是「為什麼我的外掛沒有輸出」的答案。

## 已經屬於 effect 的操作

你很少需要親自編寫 `ctx.effect()`，因為內建註冊 API 本身已經是 effect：

- `ctx.on(event, listener)`：監聽器會在解除安裝時移除（[第 4 章](04-events.zh.md)）。
- `ctx.plugin(child)`：子外掛會隨父外掛一同 dispose（資源釋放）。
- 服務註冊屬於 effect。`ctx.tools.register(...)` 等 harness 註冊表也會把返回的 disposer 附著到呼叫外掛上，因此會自動撤銷（[第 7 章](07-into-the-harness.zh.md)）。

對於 Cordis 不管理的資源，應在 `ctx.effect()` 內取得它，並返回用於釋放資源的 disposer。此後 Cordis 會在解除安裝期間呼叫該釋放邏輯，熱過載時也不例外。

有一項順序注意事項：disposer 會按註冊順序的逆序啟動，但多個**非同步** disposer 會並行執行。如果拆除步驟必須按順序執行，請把它們放在同一個 disposer 中，並在其中依次等待每步完成。

下一章：[服務](03-services.zh.md)：外掛如何共享功能。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
