---
description: "儲存目前 profile 設定，並透過 Loader 應用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-config-editor

[English](README.md) | 中文

## 概述

將外掛設定儲存到目前 profile 的 patch 並立即應用。寫入在改動磁碟前驗證完整候選值，並與 profile 更改及 HMR 序列執行。無效值和更高層覆蓋不會改動檔案。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

<a id="use-this-package"></a>
## 使用此包

在具有 Loader 和 `profileContext` 的 profile 應用中掛載此服務。它沒有設定欄位。

```yaml
- id: config-editor
  name: '@deepseek-ai/dsh-config-editor'
```

使用 [settings](../../settings/settings/README.zh.md) 提供只編輯即時欄位的表單。編輯完整設定的呼叫方可使用 `ctx.configEditor.edit()`；普通欄位保留 Loader 的正常生命週期。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

[編輯器](src/index.ts) 在派生候選設定前應用外部更改，與其他 profile 操作共同鎖定 profile manifest，並原子替換設定覆蓋項。它保留替換值以外的 YAML 註解和 `!!js` 表示式。應用失敗時恢復之前的文件並重新載入之前的 patch。

此包不釋出 invariant companion：編輯器不維護獨立設定投影。Loader 和持久化的 profile patch 擁有設定狀態。

</details>

<a id="further-exploration"></a>
## 進一步探索

- [Profile 載入](../app-boot/README.zh.md)——patch 組合。
- [HMR](../hmr/README.zh.md)——過載協調。
- [設定](../../settings/settings/README.zh.md)——schema 派生表單。

<a id="model-experience"></a>
## 模型體驗

透過面向模型的外掛讀取的設定值間接影響模型。

#### KV Cache 影響

改變請求字首的消費者決定快取影響。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 編輯寫入目前 profile patch。Home patch 和命令列 overlay 參與優先順序解析，但不作為寫入目標。
- 完整設定覆蓋保留普通欄位，但會在 profile 層固定其目前原始值。
- 僅可編輯 profile 根 Include 擁有且可唯一定位的條目。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
