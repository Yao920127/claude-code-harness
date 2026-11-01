---
description: "用於外掛即時設定的 schema 派生表單。"
kind: "package-group"
---

# settings/——外掛設定表單

[English](README.md) | 中文

## 概述

透過各外掛 Config schema 派生的表單編輯即時設定。目前 profile patch 儲存編輯，Loader 應用更改。外掛讀取自己的 volatile 引用。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

<a id="packages"></a>
## 包

包 README 負責表單行為；設定參考負責其型別。

| 包 | 用途 | ctx 鍵 |
|---|---|---|
| [`settings`](settings/README.zh.md) | Config 投影及帶修訂號的表單編輯 | `settings` |

<a id="related-documentation"></a>
## 相關文件

- [設定參考](../../docs/subsystems/settings.zh.md)——描述符與編輯。
- [設定編輯器](../boot/config-editor/README.zh.md)——profile 持久化。
- [Volatile 設定](../../vendor/loader/README.md)——無需重新掛載的更新。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
