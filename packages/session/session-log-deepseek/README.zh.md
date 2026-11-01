---
description: "面向啟用官方 DeepSeek 請求中繼資料的部署，增量上傳規範工作階段日誌。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-deepseek

[English](README.md) | 中文

## 概述

用於 DeepSeek 官方 LLM（大語言模型）API 請求的增量規範工作階段日誌上傳。該函式外掛注入 `ctx.sessions` 與 `ctx.deepseekLlmApiExtensions`，並擁有 `dsh_session_log` 請求欄位以及用於派生接受水位的持久 `session-log-deepseek/delivery-accepted` 事件。僅當官方 API 不得接收工作階段日誌字尾時才停用它。

## 目錄

- [設定](#configuration)
- [請求欄位](#request-field)
- [接受與重試](#acceptance-and-retry)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="configuration"></a>
## 設定

| 設定鍵 | 預設值 | 含義 |
|---|---:|---|
| `enabled` | `true` | 註冊 `dsh_session_log` 貢獻。將其設為 `false` 可停止工作階段日誌上傳。 |
| `maxBytes` | 8 MiB | 單次請求攜帶的 `dsh_session_log` 欄位序列化後的最大 UTF-8 位元組數。 |

隨附 profile 會掛載該外掛，因此預設設定會註冊請求欄位並追加接受水位；overlay 可用 `enabled: false` 選擇退出。

<a id="request-field"></a>
## 請求欄位

對於攜帶存活 `sessionId` 的請求，外掛會摺疊該確切工作階段格式代的最大已接受水位，對 `Session.events` 取快照，併傳送水位之後能放進 `maxBytes` 的最長連續事件段。程序內 fold 會讓每條事件只被掃描一次並增量消費後續追加；重新啟動與 HMR（熱模組替換）會從持久日誌重建它。版本 1 欄位包含 `sessionFormatVersion`、原始工作階段 header（僅 seeded Session 攜帶 `seedLength`）、數值型 `afterSeq` 與 `throughSeq`，以及每個已轉換為原始數值 envelope 欄位的完整規範事件。只有記錄的工作階段 id 與格式代均匹配請求來源時水位才生效，因此 fork 工作階段會忽略從父工作階段繼承的水位。表層事件必須攜帶 `surfaceOp`，替換範圍使用數值型 `startSeq` 與 `endSeq`；僅 system、user 與 tool 事件可以攜帶 `sourceEventSeqs`。assistant 的提供者中繼資料保留在內嵌流中，只出現在日誌中的事件不攜帶這兩個中繼資料欄位。

`maxBytes` 按 UTF-8 位元組限制完整的序列化欄位，包括 header 與數值型 envelope 欄位。超過上限的積壓會分多次已接受的請求補傳，每次都從上一次的 `throughSeq` 之後繼續。第一條待發事件本身就超過上限時，請求會省略 `dsh_session_log`，外掛記錄一條告警，水位停在該事件之前，直到 `maxBytes` 能容納它。執行時根本無法序列化的超大事件也按同樣方式處理，且任何 `maxBytes` 都無法容納它。

<a id="acceptance-and-retry"></a>
## 接受與重試

DeepSeek 介面卡會在 HTTP 2xx 後、消費 SSE（Server-Sent Events）正文前呼叫已準備貢獻的 `accept()`。接受操作會追加 `session-log-deepseek/delivery-accepted`，其中包含已上傳的 `throughSeq` 與 `sessionFormatVersion`；省略格式欄位的記錄表示 v0。下一次請求再把該事件作為新字尾的一部分上傳。傳輸失敗、非 2xx 失敗，以及 DeepSeek 介面卡在擴充功能欄位序列化失敗後不帶擴充功能欄位發出的請求，都不會追加接受記錄，因此後續請求會重發不確定範圍。並行交付可能亂序得到接受；摺疊匹配記錄中最大的 `throughSeq` 可以防止遊標退回。

伺服器端接受後、持久化水位前發生崩潰，可能讓恢復後的程序重放已經接受的範圍。這是至少一次交付的失敗方向：不確定性會製造重複，絕不會跳過序列。普通工作階段檢查點策略會在下一個語義檢查點持久化水位；本外掛不執行獨立 I/O。

缺少存活工作階段的直接請求會省略 `dsh_session_log`。普通 agent（智慧代理）、壓縮（compaction）與工作階段標題呼叫都會攜帶存活工作階段 id。

<a id="model-experience"></a>
## 模型體驗

### 工作階段日誌中繼資料

#### 模型看到的內容

無。`dsh_session_log` 是 DeepSeek 請求中模型輸入欄位的同級欄位，不會插入 `messages`、系統提示詞或工具 schema。

#### Token 影響

模型輸入 token 為零；該欄位只會增加 HTTP 請求位元組數，且受 `maxBytes` 限制。

#### KV Cache 影響

無；模型可見請求字首保持不變。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **崩潰視窗重複**——2xx 後、接受水位持久化前程序終止，會在恢復時觸發保守重放。
- **缺少存活工作階段就沒有欄位**——直接呼叫或陳舊工作階段呼叫沒有可供快照的規範日誌；顯式缺失語義仍暫緩處理。
- **超限事件會讓上傳停住**——欄位單獨就超過 `maxBytes` 的事件不會傳送，後續事件也排在它後面，直到上限調高；根本無法序列化的事件會一直阻塞上傳。
- **提供者拒絕會讓請求失敗**——提供者因該欄位拒絕請求時，模型請求失敗，遊標保持不變，而非截斷日誌。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
