---
description: "迴圈衛生 guard 家族的包對映：建議性重複工具提醒與單次工具呼叫超時策略，供選擇或組合 guard 的使用者與維護者閱讀。"
kind: "package-group"
---

# guard/：迴圈衛生 guard 家族

[English](README.md) | 中文

## 概述

`guard/` 組透過監視兩種常見失敗模式來保持 agent loop（智慧代理迴圈）高效。`repeat-tool-reminder` 會在模型重複完全相同的工具呼叫時提醒它改變方法或結束任務，讓卡住的迴圈不再浪費時間和 token。`timeout-policy` 為宣告瞭限時的工具呼叫設定時間上限，讓掛起的呼叫向模型返回清晰的超時錯誤，而不是拖住整個工作階段。兩者都在 `dsh` 基礎組合包中預設啟用；組合可以調優或移除它們。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

兩個小外掛分別覆蓋兩種模式；下文每個 README 都說明何時保留、調優或移除它。

| 包 | 提供什麼 |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.zh.md) | 在模型重複完全相同的工具呼叫時提醒它，使其改變方法或結束任務 |
| [`timeout-policy/`](timeout-policy/README.zh.md) | 為宣告瞭限時的工具呼叫設定超時，讓模型得到清晰錯誤而不是無限等待 |

-----

<a id="related-documentation"></a>
## 相關文件

先從工具子系統參考瞭解工具呼叫流水線，再看重複提醒的設定與策略背後的超時庫決策。

- [工具子系統參考](../../docs/subsystems/tools.zh.md)——兩個 guard 都依賴的工具呼叫流水線與決策。
- [生成設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)——重複呼叫提醒的每個受支援欄位。
- [超時截止時間庫 Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——`timeout-policy` 所執行的時序／終止拆分。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
