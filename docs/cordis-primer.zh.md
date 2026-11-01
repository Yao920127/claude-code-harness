# Cordis 入門

[English](cordis-primer.md) | 中文

Cordis 是 DeepSeek Harness 底層以 vendor 方式引入的外掛框架。本文介紹 harness 外掛作者在閱讀[子系統頁面](subsystems/core.zh.md)上生成的服務/事件參考之前需要了解的 Cordis 核心概念；[Cordis 教學](cordis-tutorial/index.zh.md)則透過實踐逐一講解這些概念。vendor 原始碼與同步流程見 [vendor/README.md](../vendor/README.md)。

## 五個核心概念

- **外掛是實作 Service 的物件。** 它可以是一個帶有可選 `inject` 和 `apply(ctx)` 欄位的函式，也可以是一個 `Service` 子類，其生命週期由 Cordis 掛載到目前上下文中。
- **上下文是服務的容器。** 一個服務佔據一個穩定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`）；其他外掛透過 key 查詢服務，而非匯入具體實作。
- **透過 `inject` 宣告服務依賴。** 外掛宣告所需的服務後，會等待這些服務就緒才啟動；載入順序透過服務依賴表達，而非手動編排啟動序列。
- **型別化事件用於通訊。** 服務透過 TypeScript 宣告合併註冊事件名，然後以 `emit`、`waterfall`（瀑布式事件）、`parallel`、`serial` 或 `bail` 方式分發，分別對應監聽者觀察、包裝、並行扇出、按序執行或停在首個 bail 值。
- **註冊是可逆的副作用。** 提示詞片段、工具 schema、介面卡、提供者和監聽器透過 `ctx.effect()` 或 `ctx.on()` 安裝，reload 和 teardown 時會按預期撤銷。

<a id="dispatch-modes"></a>

## 分發模式

每個事件具有以下分發模式之一，且只能透過對應方法分發。

| 模式 | 是否 await？ | 分發順序 | 是否有回傳值？ |
|---|---|---|---|
| `emit` | 否 | 監聽器按註冊順序觀察 | 否 |
| `waterfall` | 否 | 監聽器按註冊順序觀察 | 是 |
| `parallel` | 是 | 所有監聽器並行觀察事件 | 否 |
| `serial` | 是 | 監聽器按註冊順序觀察 | 是 |
| `bail` | 否 | 監聽器按註冊順序觀察，直到某個監聽器返回 bail 值 | 是 |

分發模式是事件公開約定的一部分。新的 harness 事件透過 `@mode` 標籤記錄模式，以便生成的目錄可以將宣告與分發呼叫點做交叉驗證。

<a id="cordis-waterfall-semantics"></a>

## Cordis Waterfall 語義

`ctx.waterfall` 是環繞中介軟體。監聽器接收 `(...args, next)`。呼叫 `next()` 會執行下游監聽器；下游回傳值透過 `next()` 返回目前包裝層，可由該層包裝後繼續向外返回。不呼叫 `next()` 直接返回則短路。

協作式監聽器通常修改一個共享的請求或決策物件，然後委託。監聽器也可以選擇完全替換結果，下游監聽器將只看到替換後的結果。僅當監聽器必須在普通註冊之前執行時才使用 `prepend: true`。

對於單決策事件，短路是設計意圖。策略監聽器在擁有決策權時可以不呼叫 `next()` 直接返回，而僅做標註或觀察的監聽器則必須委託。

<a id="loader-configuration"></a>

## Loader 設定

`@deepseek-ai/cordis-plugin-include` 將 `!!js` 解析為表示式節點。Loader 在宣告的注入啟用後，基於該外掛上下文（`ctx.serviceName`）插值條目的 `config`，並在每次掛載決策時基於 loader 上下文插值其 `disabled` 欄位；Include 會保留巢狀行表示式，直到目標行啟用。其餘條目中繼資料保持字面值。由環境選擇外掛時，請使用 overlay。

## 實踐規則

將行為封裝為外掛：工具流水線事件屬於 `ctx.tools`，模型流式輸出屬於 `ctx.llm`，即時 agent（智慧代理）協調屬於 `ctx.agents`。攔截和策略優先使用事件；直接能力呼叫優先使用服務方法。

每個註冊都應有對應的 disposer（資源釋放函式）：要麼從 `ctx.effect()` 返回一個，要麼使用 Cordis 提供的輔助方法自動處理。如果 teardown 順序有要求，請將相關工作放在同一個 effect 中，以確保資源按預期順序釋放。
