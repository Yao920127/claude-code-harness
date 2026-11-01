---
description: "feedback 包組：關於工作階段與 assistant 訊息的使用者回饋，供使用者與維護者選擇、組合或排查回饋採集。"
kind: "package-group"
---

# feedback/：記錄的人類回饋

[English](README.md) | 中文

## 概述

feedback 組收集使用者對 harness 工作成果的意見：使用者可以提交一條關於整個工作階段的自由文字評價，也可以對單條 assistant 訊息評分或加備註。兩類回饋都不會到達模型——它們是關於輸出的訊號，絕不是輸入。使用者透過 `/feedback` 命令記錄工作階段評價；產品介面透過 `messageFeedback` 服務讀取和修改逐訊息評分。兩個包相互獨立：工作階段評價與逐訊息評分互不影響。本頁概述該包組；具體包級約定以各包 README 和[回饋子系統頁](../../docs/subsystems/feedback.zh.md)為準。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`command-feedback`](command-feedback/README.zh.md) | 工作階段級回饋：`/feedback` 命令、Web 彈出視窗背後的 `sessionFeedback` Remote，以及固定分類表，均無需模型輪次 |
| [`message-feedback`](message-feedback/README.zh.md) | 逐訊息評分、分類與備註，透過 `messageFeedback` 服務提供給產品介面 |

工作階段評價是單向訊號：在對話的任何時刻記錄它都是安全的，且絕不會改變模型看到的內容。在 feedback-gated 共享策略下，記錄工作階段評價會觸發放行，使該工作階段可供共享。

逐訊息評分與備註與工作階段一起儲存，重新啟動後依然存在，並且絕不會出現在模型歷史或遙測中。

<a id="related-documentation"></a>
## 相關文件

- [回饋子系統](../../docs/subsystems/feedback.zh.md)——message-feedback 的型別、服務約定與 Web 消費方。
- [工作階段遙測子系統](../../docs/subsystems/session-telemetry.zh.md)——`/feedback` 確認文字披露的共享策略。
- [匿名使用者身份](../identity/README.zh.md)——回饋確認文字中嵌入的 id，每個 harness home 各有一個。

<a id="dev-note"></a>
## 開發備註

無。
