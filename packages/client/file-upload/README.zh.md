---
description: "按 Session 定址上傳瀏覽器檔案，提供流式接收、進度、取消和供後續 prompt 使用的暫存憑證。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-file-upload

[English](README.md) | 中文

## 概述

本包讓瀏覽器功能為一個 Session 儲存 `Blob`、精確位元組或 `ReadableStream<Uint8Array>`，並取得供後續 prompt 使用的不透明憑證。普通服務頁面傳送 Blob 和 stream 請求體時，不會在頁面執行緒聚合全部位元組；Host 位於其他執行上下文中的頁面會在 Cordis 啟動前提供 Fetch 形式的載體。呼叫方可以觀察已消費位元組並取消活動操作。stream 請求體只能消費一次，跨 Worker 邊界時會轉移所有權。精確位元組使用生成的 Remote。

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

在注入 `fileUpload` 的消費方之前掛載本包，再呼叫 `ctx.fileUpload.upload(sessionId, body, name, signal, onProgress)`。Session 標識同時用於定址原始路由和生成的 Remote 後備；呼叫方不組裝這兩種請求。

```yaml
- id: file-upload
  name: '@deepseek-ai/dsh-client-file-upload'
```

本包沒有 Cordis 設定欄位。`Blob` 在專用 Worker 內透過 XMLHttpRequest 傳送，因此服務可以報告瀏覽器上傳進度，並在瀏覽器提供總量時一併報告。`ReadableStream` 會轉移給該 Worker，再增量傳入 Fetch；進度只報告已消費位元組，不包含總量。`AbortSignal` 會終止專用 Worker，或傳遞給頁面自己提供的載體。精確位元組使用生成的 Remote。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

Client 外掛提供 `ctx.fileUpload`。其 `upload()` 方法接收所屬 Session 標識，組裝原始路由請求，併為精確位元組呼叫生成的 Remote。提供者只讀取一次可選的 Cordis 啟動前 `__DSH_FILE_UPLOAD__` 掛鉤。沒有該掛鉤時，每個 Blob 或 stream 請求擁有一個短期 Worker，並在完成、失敗或取消後釋放。存在該掛鉤時，服務透過頁面自己提供的 Fetch 載體傳送請求體；Web Worker runtime 會透過請求幀轉移 stream 請求體，再以帶背壓的分片形式交給 Host HTTP bridge。

Host 外掛提供 `ctx.fileUploads`。它擁有經過認證的流式路由、編碼 Remote 後備、命令憑證解析器與暫存憑證生命週期；編碼准入、附件錯誤識別與位元組儲存仍由 `ctx.attachments` 提供。憑證表以接收方 Agent 的 Session 物件為鍵。Session Controller 註冊可恢復休眠普通 Agent 的解析器，並在 prompt 准入時消費憑證。Prompt 投遞透過可釋放事務持有每個憑證繫結。成功投遞提交事務前，釋放會恢復原繫結；提交後，佇列或歷史觀察會退休該憑證。

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 流式路由、附件服務准入與按 Agent scope 管理的憑證生命週期 |
| [`src/types.ts`](src/types.ts) | 編碼請求、憑證與持久結果型別 |
| [`src/client/contract.ts`](src/client/contract.ts) | Client 上傳、進度與頁面掛鉤型別 |
| [`src/client/runtime.ts`](src/client/runtime.ts) | 專用 Worker 與頁面自有載體實作 |
| [`src/client/index.ts`](src/client/index.ts) | Client 外掛註冊與 `ctx.fileUpload` 宣告 |

</details>

**執行時不變式：** 不釋出伴生入口。每個上傳憑證只屬於一個準確的 Session，每個請求只使用一個已選定載體。載體不支援的 stream 會在傳送請求體前失敗。

-----

<a id="further-exploration"></a>
## 進一步探索

- [Connection](../connection/README.zh.md)——認證 RPC、Host 精確路由與 connection generation。
- [Session Controller](../../api/session-controller/README.zh.md)——消費暫存憑證的 prompt 准入。
- [Web Worker runtime](../../experimental/webworker-runtime/README.zh.md)——頁面到 Host Worker 的請求隧道。
- [用戶端組地圖](../README.zh.md)——瀏覽器服務與 UI 功能包。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包只傳輸瀏覽器請求體，不提供模型輸入。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制適用於傳輸操作本身。

- **上傳不能斷點續傳**：失敗或取消後的重試會從第一個位元組開始。
- **stream 請求體只能使用一次**：轉移 `ReadableStream` 會鎖定呼叫方的物件，因此重試必須重新建立 stream。
- **stream 進度沒有總量**：stream API 不攜帶位元組長度，因此呼叫方只能收到已消費位元組數。
- **瀏覽器 Worker 必須自包含**：其原始碼由函式字串生成。如果實作需要執行時 import，就必須遷移為由 tsdown 打包的獨立 Worker 入口。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
