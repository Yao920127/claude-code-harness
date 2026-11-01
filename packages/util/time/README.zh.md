---
description: "面向在協定邊界接收呼叫方所報時區的維護者，說明 IANA 時區驗證與規範化。"
kind: "package-library"
---

# dsh-util-time

[English](README.md) | 中文

## 概述

零依賴的時區詞彙，供接收呼叫方時區的協定邊界使用。`canonicalClientTimeZone` 只接受 `UTC` 或 IANA `Area/Location` 名稱，並回答該名稱在目前平臺上的規範拼寫，因此別名不會進入持久記錄：時區標識會儲存在訊息中，並由另一個程序稍後重新推導；別名在該程序中無法與規範名稱比較為相等。本庫只做驗證與規範化——不格式化任何時間，也不持有失敗詞彙，因為每個邊界拋自己的域碼。

## 目錄

- [使用本包](#use-this-package)
- [API](#api)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

它是**庫，不是服務也不是外掛**：無 `ctx`、不註冊任何東西、不持有狀態。

不釋出執行時不變數伴生入口；這個純工具不擁有事件流或可變執行時資料，時區規範化由單元測試驗證。

在接收時區的那個邊界上呼叫它，讓值在進入任何持久物之前先過一遍。不可用的名稱回答 `undefined`，由呼叫方丟擲自己的拒絕——Session 提示詞用 `session/invalid-time-zone`，subagent 續話用 `subagent/invalid-time-zone`。

-----

<a id="api"></a>
## API

```ts
import { canonicalClientTimeZone } from '@deepseek-ai/dsh-util-time'
```

| 匯出 | 職責 |
|---|---|
| `canonicalClientTimeZone(value)` | 對接受的時區回答規範的 `UTC` 或 IANA `Area/Location` 名稱；空串、帶空白、縮寫、單段或平臺不支援的名稱回答 `undefined`。 |

<a id="model-experience"></a>
## 模型體驗

間接影響，取決於把規範時區記到持久訊息上的那個消費方——`dsh-time-context` 據此渲染該輪模型可見的時區指令與時間戳。

#### KV Cache 影響

自身沒有。把時區派生文字注入請求的那個消費方，對該請求的快取行為負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **別名解析取決於執行時的 ICU 資料**——一個別名組規範化成哪個名稱由平臺回答，因此兩個跑在不同 Node 建置上的程序可能給出不同答案。
- **只做驗證**——不格式化、不做偏移運算、不推導 DST、不做時刻換算；需要這些的消費方直接用 `Intl`。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
