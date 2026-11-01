---
description: "面向替換僅安全上下文可用的 crypto.randomUUID 呼叫的維護者，說明跨執行時 UUID 生成。"
kind: "package-library"
---

# dsh-util-crypto

[English](README.md) | 中文

## 概述

零依賴、可在瀏覽器使用的 UUID 與位元組編碼輔助函式。UUID 鑄造基於 `crypto.getRandomValues`——所有釋出上下文都提供的那個隨機原語。`crypto.randomUUID` 是安全上下文限定的 Web API：經普通 HTTP 在區域網地址上提供的頁面或 worker（瀏覽器預覽部署）根本沒有這個方法，必須在那裡執行的程式碼不能調它。全倉 `no-restricted-properties` lint 規則把 `crypto.randomUUID` 的呼叫者指到這裡；只跑在 Node 的程式碼從 `node:crypto` 匯入 `randomUUID` 維持原樣。

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

-----

<a id="api"></a>
## API

```ts
import { bytesToBase64, randomUUID, type Uuid } from '@deepseek-ai/dsh-util-crypto'
```

| 匯出 | 角色 |
|---|---|
| `bytesToBase64(data)` | 以有界分片把位元組陣列編碼為標準 base64。 |
| `randomUUID()` | 隨機 RFC 9562 v4 UUID 字串，由 `crypto.getRandomValues` 鑄造。可原位替換 `crypto.randomUUID()`。 |
| `Uuid` | 五段式 UUID 字串型別，與 `crypto.randomUUID` 宣告的返回形狀一致。 |

<a id="model-experience"></a>
## 模型體驗

間接地，經由用它鑄造請求、工作階段與附件識別符號的消費方，這些識別符號均不作為語義內容進入提示詞。

#### KV Cache 影響

無直接失效；鑄造識別符號的消費方自行負責其請求變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅 v4**——不提供其他 UUID 版本、名稱空間或解析；需要更多能力的消費方應引入真正的 UUID 依賴。
- **唯一性是機率性的**——122 位隨機，與 `crypto.randomUUID` 同級保證；此處不做碰撞檢測。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個純工具不持有事件流或可變執行時資料；其值運算由單元測試覆蓋。
