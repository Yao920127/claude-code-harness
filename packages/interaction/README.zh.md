---
description: "人機協作能力族的包對映：斜槓命令、一次性審批、權限預設，以及讓執行中的 agent（智慧代理）暫停等待人類決定的問答 seam。"
kind: "package-group"
---

# interaction/：人機協作平面

[English](README.md) | 中文

## 概述

`interaction/` 組覆蓋使用者引導執行中 agent 的各種方式。斜槓命令適合無需模型往返的即時操作；一次性審批用於敏感操作；權限預設可以同時選擇沙箱與審批行為；當 agent 需要資訊或決定時，它還可以向使用者提問。互動式應用向使用者提供這些能力；自動化則透過 ACP（Agent Client Protocol）處理自己的審批。下方包對映說明了每項能力的區別，並連結其完整行為與設定。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

每個包的完整約定以其 README 和對應的子系統參考為準。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`commands/`](commands/README.zh.md) | 讓使用者輸入斜槓命令，直接針對 agent 執行，無需模型往返 | `ctx.commands` |
| [`user-approval/`](user-approval/README.zh.md) | 向組合後的應答者徵求一次性允許／拒絕決定；若未獲得決定，則預設拒絕 | `ctx.approval` |
| [`permission-presets/`](permission-presets/README.zh.md) | 把沙箱模式與審批策略捆綁為一個面向使用者的權限選擇器 | `ctx.permissionPresets` |
| [`user-questions/`](user-questions/README.zh.md) | 定義經過驗證的問題 schema 與作用域 answerer waterfall，agent 可暫停等待 | `ctx.userQuestions` |
| [`tool-ask-user/`](tool-ask-user/README.zh.md) | 暴露 `ask_user_question` 工具，讓模型可以向使用者提問並請求其作出決定 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享詞彙，再看相鄰的自動化與組合面。

- [命令子系統](../../docs/subsystems/commands.zh.md)——命令註冊表語義與 `ctx.commands` 的 Cordis 介面面。
- [審批子系統](../../docs/subsystems/approval.zh.md)——請求／結果詞彙、應答者瀑布與按工作階段策略。
- [權限預設子系統](../../docs/subsystems/permission-presets.zh.md)——預設表與旋鈕寫穿。
- [使用者互動子系統](../../docs/subsystems/user-questions.zh.md)——問題詞彙、answerer waterfall 與呈現意圖。
- [ACP 組](../acp/README.zh.md)——僅自動化的傳輸，為其自有 agent 回答審批請求。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
