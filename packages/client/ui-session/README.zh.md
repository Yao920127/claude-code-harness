---
description: "面向 Session Controller 列表、互動狀態與逐工作階段上下文的 React 與 Slot 介面卡。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session

[English](README.md) | 中文

## 概述

使用本包可透過標準 Slot 掛鉤公開 Session catalog、retain 資訊與統一 UI 狀態。它按 `SessionBinding` 物化掛鉤和 prop，而 `SessionProvider` 可以繼承外圍 binding 或繫結顯式 `SessionReference`。它擁有程序本地的 pending-interaction 與完成提醒策略，但不擁有 Controller transport、歷史或 reference。

執行狀態來自 Host 列表基線或狀態事件。Subagent 目錄行和已保留子工作階段的 fallback 行不會建立執行狀態；主檢視引用仍會確認完成提醒。

## 目錄

- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包適應瀏覽器側 Session 狀態，不註冊任何面向模型的內容。

#### KV Cache 影響

無；Session selector 與 Slot scope 不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **Pending interaction 是程序本地投影**——瀏覽器重連後，所屬 Remote waterfall（瀑布式事件）必須重放仍未完成的請求。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。介面卡 materialization 路徑已經強制 Session 繫結一致。
