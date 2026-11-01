---
description: "在權威 Session 日誌中儲存已完成 assistant 訊息的評分、分類與備註。"
kind: "package-reference"
---

# @deepseek-ai/dsh-message-feedback

[English](README.md) | 中文

## 概述

本服務為已完成的 assistant 訊息記錄好評、差評、固定回饋分類表中的可選分類，以及可選的原樣備註。每次建立、編輯和刪除都由權威 Session 日誌儲存；`list`、`put` 和 `delete` 提供目前回饋，不會建構或喚醒 agent（智慧代理）。回饋僅寫入日誌，不進入模型歷史。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

<a id="use-this-package"></a>
## 使用本包

將 `dsh-message-feedback` 與 `sessions`、`sessionPersistence` 一起掛載。它不需要 storage-domain 服務。Web 組合提供瀏覽器消費方，並將備註上限設為 8192 位元組。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxNoteBytes` | 必填 | 單條可選備註的 UTF-8 位元組上限，必須為大於零的安全整數。 |

提交的備註必須包含非空白字元，且不超過設定的位元組上限。空白備註返回 `note-blank`；過長備註返回 `note-too-large`。透過驗證的文字會完整保留，包括首尾空白。省略備註會清除它。備註驗證先於 Session 查詢。提交的分類必須是[固定回饋分類](../command-feedback/README.zh.md#the-web-feedback-dialog)之一；Remote schema 拒絕其他值，省略分類會清除它。

### 讀取與修改回饋

| 操作 | 請求 | 成功 | 業務失敗 |
|---|---|---|---|
| `list` | Session id | 按建立順序返回目前條目 | Session 不存在 |
| `put` | Session、訊息、評分、可選備註、可選分類、預期版本 | 目前條目 | Session 或目標不存在、版本衝突、備註無效 |
| `delete` | Session、訊息、預期版本 | 條目不存在 | Session 不存在、版本衝突 |

建立時傳入 `ifVersion: null`；編輯或刪除時使用返回的版本。陳舊修改返回 `version-conflict` 及目前條目。每次實質 put 都生成新 token，並保留原始建立時間。重複已存評分、備註與分類的 put 是無變化操作：返回相同條目，不追加事件。刪除不存在的條目始終成功，不受所傳版本影響，也不追加事件。重新建立已刪除條目會產生新的建立時間和排序位置。

目標必須是由 append 來源事件產生的非空 assistant 訊息。使用者訊息、空 assistant 佔位及 replacement 來源訊息返回 `target-not-found`。回饋跨重新啟動保留；fork 即使繼承了包含父工作階段回饋的字首，初始時也沒有自有回饋。

<a id="understand-the-implementation"></a>
## 理解實作

### 權威日誌與永續性

`feedback/message-put` 儲存所屬 Session id 及完整條目，包括版本和時間戳。`feedback/message-delete` 儲存所屬 Session 和訊息 id。目前狀態從這些事件推導，忽略屬於其他 Session 的事件。持久化 payload 在使用前經過驗證。不存在第二個回饋儲存或快取。

活躍工作階段透過 `Session.append` 追加，並等待 `sessions.flush`，然後透過持久化讀控制代碼核實捕捉的日誌末端與 Session header，才會報告成功。冷工作階段修改在讀取、驗證、比較、追加、flush 和關閉期間持有持久化寫控制代碼。冷讀取使用讀控制代碼。兩條路徑都不會建構 Session 或追加生命週期事件。

每個 Session 的佇列在同一服務實例內序列化操作；持久化寫控制代碼排除其他冷寫入方。銷燬時停止接收操作並排空已接收操作，然後釋放服務。持久化故障會 reject，而非變成業務失敗。flush 失敗不會復原已接受的事件；呼叫方可以讀取並使用其版本重試。成功的無變化修改也會 flush 目前字首。

冷工作階段的實質修改在 flush 後發出 `feedback/committed` 通知，其中攜帶借用的只讀權威日誌字首；觀察方在轉移所有權前必須對其進行深複製。觀察方在寫入所有權釋放前完成，不得等待同一 Session 的其他回饋操作，也不能使已提交的修改失敗。活躍工作階段消費方觀察 `session/event`。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Remote 服務、payload 驗證、事件投影與持久化所有權 |
| [`src/types.ts`](src/types.ts) | 請求、結果和 Session 事件宣告；僅型別 |

不釋出執行時不變式伴生入口：服務直接從驗證後的權威事件推導回饋，不持有可獨立修改的投影。

各自的 API 見[回饋子系統](../../../docs/subsystems/feedback.zh.md)、[Session 持久化](../../../docs/subsystems/persistence.zh.md)和[瀏覽器消費方](../../client/ui-message-feedback/README.zh.md)。

<a id="model-experience"></a>
## 模型體驗

### 訊息回饋

#### 模型看到什麼

無。`feedback/message-put` 和 `feedback/message-delete` 不攜帶 surface 位置、工具、提示詞段落或模型可見上下文。日誌匯出與投遞策略由相應消費方負責。

#### Token 影響

為零。評分、備註和服務結果不進入模型請求。

#### KV Cache 影響

相互獨立。回饋不改變模型請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅日誌具有權威性：**不讀取或遷移現有 `message_feedback` 伴隨資料。這些檔案保持不變，但其回饋無法透過本服務存取。
- **刪除保留歷史：**delete 移除目前回饋，不會從僅追加日誌中清除更早的評分或備註；它不是隱私擦除操作。
- **寫入所有權：**另一個程序持有 Session 寫控制代碼時，冷工作階段修改會 reject。服務不會喚醒該所有者，也不協調跨程序 Remote 呼叫。
- **受信任呼叫方：**請求不包含經過認證的 actor 或審計身份。部署方必須保護 Host 閘道。
- **遙測匯出：**對於所有使用者和提供者，包括 `deepseek-official`，隨附 OTel 後端在 `FEEDBACK_ONLY` 模式下僅在新的顯式文字回饋、評分、備註或分類編輯、撤回後釋放完整權威日誌字首。字首包含上下文和原樣備註；後續記錄等待下一次回饋，`DISABLED` 阻止捕捉。部署方負責脫敏；見 [OTel 匯出策略](../../session/session-telemetry-otel/README.zh.md)。
- **掃描成本：**每次存取已有 Session 的 `list`、`put` 或 `delete` 都會掃描完整事件日誌來推導目前回饋；冷工作階段操作還會從持久化儲存讀取完整日誌。工作量隨 Session 歷史總量增長，而不只是回饋條目數。
- **保留量：**`maxNoteBytes` 只限制單條備註，不限制日誌總大小或變更次數。

<a id="dev-note"></a>
### 開發備註

[包測試](tests/message-feedback.spec.ts)覆蓋目前狀態與持久歷史語義；[Loader 組合](tests/loader-composition.spec.ts)驗證跨重新啟動的活躍和冷 JSONL 操作。
