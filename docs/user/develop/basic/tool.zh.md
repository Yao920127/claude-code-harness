# 開發一個工具

[English](tool.md) | 中文

本教學會在 Web UI 中新增一個 `greet` 工具。請先完成[第一個外掛](./index.zh.md)，並保留其中的 `scratch-plugin` 目錄。

## 建立工具外掛

將 `scratch-plugin/src/my-plugin.ts` 替換為：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` 讓 Cordis 等待工具註冊表就緒。`defineTool` 根據 `parameters` 推導並驗證 `args`；`execute` 返回 `output.schema` 宣告的規範值，`output.render` 再將該值轉換為面向模型的內容。

## 執行並呼叫工具

如果開發命令未在執行，請重新啟動：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

開啟 `http://127.0.0.1:3080`，然後輸入：`Use the greet tool to greet Ada.` 模型可以呼叫 `greet`，並收到 `Hello, Ada!` 這一工具結果。

## 下一步

- [外掛設定](./config.zh.md) — 讓問候語可設定。
- [工具編寫參考](../../../cookbook/adding-a-tool.zh.md) — 查閱巢狀 schema、規範值、後臺工作、策略掛鉤、PTC mode 和 UI 卡片。
- [能力分層](../practice/index.zh.md) — 將可替換能力拆分為 Service Definition、Service Provider 和 Consumer 三類包。
