---
description: "透過作用域互動路徑回應 Host 權限請求的瀏覽器批准介面。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

[English](README.md) | 中文

## 概述

基於 Agent-scoped Remote Event waterfall 的瀏覽器審批介面。外掛透過 `ctx.uiSession` 釋出每個待處理請求、接管 Conversation composer、按需渲染關聯的 Tool 詳情，並將使用者決定返回給等待中的 Host 請求。當瀏覽器必須為等待中的 Host 操作收集批准時，請使用它。

## 目錄

- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

聚焦審批詳情區域後，Enter 批准，Esc 拒絕。外掛掛載期間，這兩個按鍵不能分配給可編輯快捷鍵。聚焦“拒絕”按鈕後，Enter 保留按鈕原生拒絕操作。輸入控制元件與輸入法候選保留各自的按鍵。鍵盤和指標操作共用同一待處理請求鎖；已撤銷或替換的請求不能再次作答，較早請求的失敗也不會解鎖替代請求。

<a id="model-experience"></a>
## 模型體驗

無，因為本包只在瀏覽器中呈現審批請求，不註冊任何面向模型的內容。

#### KV Cache 影響

無；審批請求和回應的呈現不會改變模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **面板只提供臨時決定**——它支援僅本次允許和拒絕；持久權限策略仍由 Host 側審批包擁有。請求方提供的在地化展示文案跟隨介面語言，不改寫審計原因，也不翻譯模型生成的文字。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。Remote listener 與臨時 Slot entry 由各自註冊表持有並觀察。
