---
description: "面向使用者與維護者的共享模型標題生成策略說明，用於設定標題提供者或排查輔助 LLM 請求。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-title-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-llm` 使用一致的模型請求策略，根據選中的使用者訊息生成簡潔的工作階段標題。呼叫方選擇每次修訂包含哪些訊息，以及成對提供 `provider`／`model` 路由，還是使用目前工作階段記錄的路由。必填上限約束封裝後的輸入、生成輸出與端到端時長，呼叫方取消在整個流式處理期間持續生效。無效、空、遲到、包含工具呼叫或其他非純文字的結果會在替換標題前被拒絕。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

作為部署方，透過[首訊息](../session-title-first-prompt-llm/README.zh.md)或[全訊息](../session-title-all-prompts-llm/README.zh.md)提供者外掛設定此策略。作為提供者作者，透過共享輔助函式註冊，而不是手寫生成邏輯。

### 註冊提供者

提供者外掛呼叫 `registerSessionTitleLlmProvider(ctx, config, id, automatic, selectMessages)`；輔助函式驗證共享設定、在 `ctx.sessionTitle` 上註冊提供者，並讓每次生成都經過共享策略。兩個隨附外掛以各自的 `first-prompt` 與 `all-prompts` 節奏和訊息選擇器註冊；服務上的第二次註冊會立即丟擲。

### 路由與失敗約定

`provider` 與 `model` 覆蓋項都是可選的，但必須同時作為非空字串提供。如果沒有這一對取值，輔助函式使用目前工作階段已記錄 `request/header` 中捕捉的確切提供者／模型路由，因此在任何路由出現前顯式重新整理時必須提供覆蓋項。輔助函式在記錄或分發前，依據 `maxInputBytes` 檢查最終 JSON 封裝使用者提示詞的大小，而不是將其截斷，並在消費流期間與完成後重新檢查超時與呼叫方取消，因此即使攔截器或介面卡忽略 abort，也不能接受遲到的成功結果。格式錯誤或空輸出、工具呼叫與非 stop 結束原因都會拒絕；工作階段標題服務決定該拒絕屬於自動警告還是顯式呼叫方失敗。

### 設定

<a id="configuration"></a>

除成對的路由覆蓋項外，每個欄位都必填；庫不提供預設值。

| 鍵 | 預設值 | 含義 |
|---|---|---|
| `targetWords` | 必填 | 非 CJK 標題的目標詞數 |
| `targetCjkCharacters` | 必填 | 中文、日文或韓文標題的目標字元數 |
| `maxInputBytes` | 必填 | 最終 JSON 封裝使用者提示詞的 UTF-8 位元組上限 |
| `maxOutputTokens` | 必填 | 輔助生成的 token 上限 |
| `timeoutMs` | 必填 | 執行時定時器限制內的端到端時限 |
| `provider`, `model` | 可選 | 顯式路由；二者同時提供或同時省略 |

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋生成路徑；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一份共享策略讓提供者外掛無法漂移：設定驗證、路由解析、提示詞封裝、預算執行、取消與輸出驗證都在這裡，只以提供者的節奏與訊息選擇器為參數。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 設定 schema 與驗證、提供者註冊輔助、請求封裝、分發與輸出驗證 |

### 請求流程

生成在註冊時驗證一次設定；每次修訂把選中的訊息封裝為 JSON，依據 `maxInputBytes` 檢查封裝提示詞的 UTF-8 位元組數，解析路由（顯式對或已記錄 `request/header`），追加一條攜帶確切可分發請求的僅日誌 `session/title-llm-request` 事件，然後在組合的超時與取消截止時間內透過 `ctx.llm` 流式生成。分發的封套攜帶 `purpose: 'session-title'`，且有意不包含 agent loop 的程序本地請求身份；DeepSeek 介面卡根據該用途停用思考，使少量輸出預算全部用於可見標題文字，其他介面卡負責自身用途專用行為。輸出只組裝為文字塊；工具呼叫、格式錯誤或空輸出與非 stop 結束原因都會拒絕，後續模型失敗會保留請求記錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當生成策略不夠用時閱讀以下頁面。它們從它所插入的服務逐步進入消費它的提供者外掛。

- [工作階段標題服務](../session-title/README.zh.md)——標題服務、退回行為與提供者註冊約定。
- [工作階段標題子系統](../../../docs/subsystems/session-title.zh.md)——持久標題狀態與輔助請求記錄。
- [首訊息標題提供者](../session-title-first-prompt-llm/README.zh.md)——根據第一條符合條件的使用者訊息生成標題。
- [全訊息標題提供者](../session-title-all-prompts-llm/README.zh.md)——根據所有符合條件的使用者訊息生成標題。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助標題請求

#### 模型看到什麼

標題模型會收到固定系統指令，要求以輸入語言返回一個簡潔且無裝飾的標題；該指令包含所設定的詞數與 CJK 字元數目標。它唯一的使用者訊息包含一個 JSON 陣列，其中是精確選中的使用者訊息及其 seq。

#### Token 影響

輔助請求根據所選輸入大小與 `maxOutputTokens` 消耗 token。它與主 agent 請求相互獨立，不會向 agent 歷史增加標題文字或封裝內容。DeepSeek 標題呼叫會關閉思考；主對話保留自身設定的思考模式。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。輔助快取複用由提供者決定；固定指令可複用，而 JSON 訊息陣列會隨每次修訂變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義被接受的生成形態。它們是目前包約束。

- **僅文字輸出**——輔助函式只接受文字輸出並拒絕工具呼叫；不公開結構化輸出介面卡或提供者專用提示詞變體。
- **整體提示詞位元組上限**——它對整個封裝使用者提示詞強制執行位元組上限，而不是剪裁單條訊息或應用保留策略。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個無狀態 helper 會在 dispatch 前驗證並凍結每個輔助請求；deadline、stream、message seq、provider 與 model 由同步檢查和測試覆蓋。
