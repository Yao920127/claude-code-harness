---
description: "schedule 包組：Host 擁有的定時提醒與任務管理。"
kind: "package-group"
---

# schedule/ — Host 擁有的提醒

[English](README.md) | 中文

## 概述

為對話建立一次性、固定速率、每日、每週或 cron 提醒，並在 Host 重新啟動後保留它們。無需開啟原 Session，即可檢視活動和已結束任務。使用 Schedule 建立和投遞提醒，使用可選的任務頁面跨 Session 檢視任務並確認刪除。到期提醒作為普通 follow-up 訊息進入原對話，而不是電子郵件、簡訊或推送通知。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

選擇此包進行持久提醒管理。

| 包 | 職責 |
|---|---|
| [`schedule/`](schedule/README.zh.md) | Host 擁有的提醒持久化、排程、查詢與顯式刪除 |

-----

<a id="related-documentation"></a>
## 相關文件

- [Schedule 子系統](../../docs/subsystems/schedule.zh.md)——任務記錄、最近一次回執、時間與投遞約定。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-schedule)——模型接收的 `schedule_create`／`schedule_list`／`schedule_update`／`schedule_delete` schema。
- [Schedule 使用者指南](../../docs/user/guide/schedule.zh.md)——啟用提醒並檢視活動或已結束任務。
- [Web 任務頁面與提醒目錄](../client/ui-schedule/README.zh.md)——在瀏覽器中查詢任務並確認刪除。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
