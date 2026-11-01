---
description: "透過 Config 派生表單檢視和編輯外掛的即時設定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-settings

[English](README.md) | 中文

## 概述

編輯外掛透過 `.volatile()` 宣告的欄位，並檢視其實際值。表單以 profile 條目 id 標識外掛、保留秘密值，並拒絕過期寫入。更改透過目前 profile 的 Cordis patch 持久化。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

<a id="use-this-package"></a>
## 使用此包

將此外掛與 Loader 和 [config-editor](../../boot/config-editor/README.zh.md) 一起掛載。基礎組合包提供此組合。

```yaml
- id: settings
  name: '@deepseek-ai/dsh-settings'
```

此外掛沒有設定欄位。表單只展示活動且可唯一定位的 profile 條目中的 volatile 欄位。普通設定仍透過 Cordis 設定檔編輯。

Settings 啟動後、Loader 完成所有條目的載入時，早期版本留在 harness home 中的 `settings.yaml` 會被匯入一次：每個 section 寫入同名條目（`ui-developer-tools` → `ui-settings`、`ui-onboarding` → `ui-settings-general`、`shell` → 目前平臺的 shell 執行器條目），檔案在第一次寫入前改名為 `settings.yaml.imported`，被目前組合拒絕的 section 會記錄日誌並只保留在改名後的檔案中。

重置恢復 profile 覆蓋層以下的值，包括 schema 預設值。Home patch 和命令列 overlay 優先順序更高；表單寫入若會被它們覆蓋，則被拒絕。

每個表單報告 `autoGenerate`（預設開啟），供按 schema 生成頁面的用戶端使用；目前沒有已釋出的用戶端這樣做。自帶頁面的外掛在 `apply` 中於可選的 `ctx.inject(['settings'], ...)` 子級內以 effect 註冊 `configure({ auto: false }, ctx.fiber)`：子級指明策略所屬的外掛 fiber，遲載入或被替換的 Settings 服務也會採用該策略，業務外掛無需 Settings 即可執行。策略不移除設定讀寫。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

[表單投影](src/schema.ts) 去除執行時引用和普通欄位。[服務](src/index.ts) 提供帶修訂號的描述符，在委託持久化前按完整外掛 Config 驗證編輯。業務外掛直接讀取自己的 Config 引用。

秘密角色從實際值、繼承值、profile 覆蓋值和 schema 預設值中隱藏；使用者端接收存在性標記。路徑編輯保留使用者端未收到的欄位。此服務投影 Loader 設定，不維護獨立的權威值，因此不釋出 invariant companion。

</details>

<a id="further-exploration"></a>
## 進一步探索

- [設定參考](../../../docs/subsystems/settings.zh.md)——表單值與修改。
- [Volatile 設定](../../../vendor/loader/README.md)——引用生命週期與通知。
- [設定編輯器](../../boot/config-editor/README.zh.md)——持久化與過載順序。

<a id="model-experience"></a>
## 模型體驗

透過面向模型的外掛讀取的設定值間接影響模型。

#### KV Cache 影響

改變請求字首的消費者決定快取影響。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 巢狀 Include 獨立擁有設定，不能透過目前 profile 的表單編輯。
- 欄位重置恢復繼承值，不能刪除下層設定提供的值。取消設定陣列索引會移除該元素。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
