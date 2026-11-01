# 活躍 Assistant 重連基準

[English](README.md) | 中文

[reconnect.bench.client.ts](reconnect.bench.client.ts) 測量重連攜帶一個包含 100,000 個 delta、尚未完成的 reasoning 字首時，生產 Client 的摺疊成本。編譯後的私有介面卡呼叫 `ClientAssistantStream.replace()`，不增加產品匯出。三個全新的純 Node worker 在計時前合成緊湊基線；替換時間與強制 GC 後的保留堆分別執行中位數預算檢查。下一個稠密序號的即時 frame 仍須被接受。標準託管 CI 使用 50 ms 替換預期及共享的 1.25× 餘量（上限為 63 ms）；保留 heap 預算仍為 30 MiB。實測樣本和合成迴歸對照使用與 worker 判定相同的時間斷言。

透過 `pnpm run build:bench` 建置，再在 `vitest.bench.config.ts` 中選擇 `benchmarks/active-stream-reconnect`。這項針對 Node 的工作負載既不建置也不測量瀏覽器渲染。[前端效能預算](../../.agents/notes/implemented/testing/2026-09-06-frontend-performance-budgets.zh.md)記錄校準與排除項。
