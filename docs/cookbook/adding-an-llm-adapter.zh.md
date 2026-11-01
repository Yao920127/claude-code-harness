# 實操手冊：新增 LLM（大語言模型）介面卡

[English](adding-an-llm-adapter.md) | 中文

如何接入一個新的模型提供者。參考實作：`packages/llm/llm-deepseek`（直接 HTTP，SSE（Server-Sent Events）由 `eventsource-parser` 分幀）與 `packages/llm/llm-pi-ai`（封裝 LLM 庫）。請先閱讀 `packages/llm/llm/src/types.ts` 中的 `StreamChunk` 文件——它記錄了兩個介面卡都經過驗證的協定約定。

## 基本形態

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

註冊基於副作用，可安全支援 HMR（熱模組替換）；每個提供者路由僅對應一個介面卡，重複註冊會丟擲異常，多路由註冊要麼全部成功，要麼全部失敗。`options.provider` 用於選擇介面卡，`options.model` 是提供者模型 ID，因此動態模型目錄介面卡無需重新設定生命週期即可提供新模型。金鑰採用 Cordis 原生方式管理：schemastery Config 帶環境變數退回，透過 cordis.yml 的 `!!js process.env.MY_KEY` 注入。切勿在程式碼中讀取自行約定的金鑰檔案。

## 協定義務（兩個實作共同驗證的約定）

- 在 `finish` **之前**發出 `usage`；`finish` 之後**不再發出任何內容**。穩健做法：緩衝 finish/usage 直到提供者的流結束標記，再統一 flush（可處理提供者在末尾傳送僅含 usage 的分片的情況）。
- 工具呼叫的 `arguments` 全程為原始 JSON 字串；流式片段以 `argumentsDelta` 傳送。如果你的提供者返回已解析的物件，請在 `block-end` 時重新 stringify。
- 按首次出現的流順序分配塊 `index`；同一個塊的每次 delta 複用該 index。
- 錯誤有且僅有兩條合法路徑：從 `stream()` **丟擲**（傳輸與協定故障——使用帶穩定 code 的 `LlmError`），或以 `finish {kind: 'error' | 'aborted'}` 結束流（提供者帶內故障）。消費方兩者都處理；按故障類別選擇路徑並加以文件化。
- 遵守 `options.signal`（將其傳遞給 fetch 或你的 SDK）。
- 如果 `GenerateOptions` 中某個欄位你的提供者無法支援（例如提供者不支援 stop sequences 時收到 `stop` 列表）：丟擲 `LlmError(..., 'UNSUPPORTED_OPTION')`，而非靜默丟棄。
- 如果提供者在後續呼叫中需要回應 ID、簽名或其他原生中繼資料，請將其最小無損 JSON 投影作為 `finish.replayState` 發出。重建歷史時驗證該狀態。只有歷史提供者路由和目標提供者路由目前由完全相同的介面卡實例擁有時，`LlmRuntime` 才會傳遞該狀態；由介面卡決定同模型、跨模型或跨提供者恢復是否合法。狀態缺失時，切勿僅根據提供者/模型名稱推斷原生回放。

提供者特有的思考模式開關仍放在介面卡的 Config 中。確切模型中繼資料使用一處提供者無關的能力 seam：實作 `resolveModel()`，返回提供者/模型身份以及可選的 `context` 和 `reasoning` 欄位；僅當存在設定指定的預設值時才宣告 `defaultEffort`；遵守解析模型時傳入的可選 `AbortSignal`。推理（reasoning）強度是由介面卡對映到提供者請求的有序不透明 ID。請保留介面卡給出的權威可選列表，包括介面卡在支援時定義的 `off`；不得暴露最終協定值的具體拼寫，也不得自動調整不支援的值。ID 無需與其協定表示相同。

## 實作結構

讓協定格式（wire format）型別、請求序列化、傳輸解析、分片轉換和介面卡類分別承擔獨立職責；[`llm-deepseek`](../../packages/llm/llm-deepseek/README.zh.md) 是參考佈局。

## 驗證

遵循[儲存庫測試策略](../testing.zh.md)，該策略負責介面卡覆蓋、真實提供者檢查和已釋出入口要求。
