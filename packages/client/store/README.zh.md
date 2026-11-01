---
description: "具有顯式快照、訂閱與生命週期所有權的瀏覽器可觀察狀態儲存。"
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

[English](README.md) | 中文

## 概述

供 Client 控制器與 renderer 介面卡共用的不依賴 React 的 observable 和快照儲存基礎原語。本包負責同步與 animation-frame 釋出、基於 Immer 的更新、淺比較和可選的瀏覽器持久化；React 掛鉤的建構仍屬於 `@deepseek-ai/dsh-client-ui-renderer`。當 Client 狀態必須在不依賴 React 的情況下發布穩定快照時，請使用它。

## 目錄

- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包提供瀏覽器側狀態基礎原語，不註冊任何面向模型的內容。

#### KV Cache 影響

無；這些儲存既不組裝也不傳送模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **持久化僅限瀏覽器本地**——持久化儲存使用 `localStorage` 中的 JSON；非瀏覽器執行時會停用持久化，本包也不提供跨裝置同步。
- **Web 殼建置輸入**——靜態 ESM 為 Vite 保留第三方匯入；獨立消費方自行提供開發依賴（[依賴規則](../AGENTS.md#dependency-declaration)）。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只匯出庫引擎，不建立程序全域狀態；每個儲存實例由其所屬測試覆蓋。
