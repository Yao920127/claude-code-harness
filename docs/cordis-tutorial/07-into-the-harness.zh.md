# 7. 進入 harness

[English](07-into-the-harness.md) | 中文

本章會向 harness 的 `tools` 服務註冊一個可由模型呼叫的工具，透過 harness 工具流水線執行它，並觀察結果事件。整個範例無需金鑰，也不會呼叫模型。

## 工具外掛

建立 `greet-tool.ts`，將它放在 `tmp/cordis-tutorial` 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

這裡的每個模式都來自前幾章：`inject: ['tools']`（[第 3 章](03-services.zh.md)）會讓外掛等待工具註冊表就緒；`ctx.tools.register(...)` 會把註冊 disposer 附著到外掛（[第 2 章](02-lifecycle-and-effects.zh.md)），因此解除安裝時會登出工具。`defineTool` 將 `parameters` 規約轉換為向模型展示的 JSON Schema，推導 `args` 的型別，並在 `execute` 執行前驗證模型提供的參數。工具返回由 `output.schema` 宣告的規範值；`output.render` 則作為 Native renderer（原生渲染器），另行生成可持久化的結果內容。

## 觀察外掛

建立 `tool-logger.ts`。這是一個獨立外掛，透過 harness 的 `tools/result` 事件觀察應用中的每次工具呼叫：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

`import type {} from '@deepseek-ai/dsh-tools'` 行會引入該包的宣告合併，使 `'tools/result'` 及其 payload 具有型別。這與第 4 章匯入 `stats.ts` 的做法相同，只是擴充功能到了包級別。

## 組合並執行

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools` 會注入 `systemPrompt` 服務，因為工具需要向系統提示詞貢獻 schema，所以組合中也要列出該服務的提供者。缺少提供者時，工具外掛會像[第 6 章](06-composition-and-hmr.zh.md)所述那樣保持 PENDING。

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

logger 會先觸發：`tools/result` 在結果物化過程中發出，發生在 `execute` 向呼叫方返回的 promise 兌現之前。兩個外掛都不知道另一個外掛存在，它們由註冊表服務和事件連線。

## 從這裡走向完整 agent（智慧代理）

真實 agent 就是這套組合再加上更多外掛：LLM（大語言模型）介面卡、agent loop（智慧代理迴圈）、持久化和應用入口。對照 [base profile 層](../../packages/bundle/base/cordis.patch.yml)與 [headless 層](../../packages/bundle/headless/cordis.patch.yml)，你現在已經可以讀懂其中各項。透過一個小型 `--patch` overlay 加入 `greet-tool.ts` 即可。

後續可以閱讀：

- [建置工具](../user/develop/basic/tool.zh.md)：深入瞭解 `defineTool`，包括呈現和更豐富的 schema。
- [三層能力設計](../user/develop/practice/index.zh.md)：harness 如何組織可替換能力。
- [子系統頁面](../subsystems/core.zh.md)上生成的 `cordis-surface` 區塊：可以注入和監聽的所有內容，各在其所屬頁面上。
- [架構](../architecture.zh.md)：這些外掛所處的系統地圖。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
