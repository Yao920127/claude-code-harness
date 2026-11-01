---
description: "在 Web 中選擇 Agent preset 和新任務預設值，檢視各模式的說明與宣告的設定。建立與修改引導至創造模式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

[English](README.md) | 中文

## 概述

在 Web 中選擇 Agent preset 和新任務預設值，檢視各模式的說明與宣告的設定。建立與修改引導至創造模式。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

設定頁顯示內建與自定義卡片分組、預設項高亮和點選卡片選擇；沒有 preset 的分組不顯示，但自定義分組會保留其創造入口。每張卡片都提供「檢視設定」，以只讀 YAML 開啟該 preset 宣告的外掛列表，使用 Loader 自己的方言（含 `!!js` 條件）；載入失敗的 preset 同樣可讀，因為其診斷資訊正指向這份 YAML。Escape 只關閉檢視器並將焦點還給卡片；離開設定頁會清空檢視器，遲到的讀取結果不會重新開啟它。本頁不編輯任何內容：創造入口啟動一個創造模式任務，以 bundle 形式建立或覆蓋 preset；當 `cordis` preset 在列表中且存在工作階段流程時提供。

通用設定中的程式碼工作工具決定能否選擇模式：關閉後新工作階段選擇器消失、卡片拒絕選擇，而已儲存的預設值繼續用於新任務。選擇健康定義作為預設值也會同步目前新任務頁面的空白工作階段。Creator 入口開啟一個使用 `cordis` preset 的新任務。

已知的內建預設提供只讀的模式說明與使用範例對話方塊。各頁籤保留各自的滾動位置；關閉後焦點回到開啟它的操作。幫助不會改變新任務預設值。預設徽標取代卡片的分組徽標，預設 id 顯示在標題旁。指南文案與範例歸本包所有。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

`agentPresets/list` 提供列表並標記目前預設值，`agentPresets/read` 為檢視器提供一條宣告的 YAML；預設值的修改寫入 `agent-preset-registry` settings 名稱空間。選擇器、空白工作階段同步和只讀工作階段標籤使用記錄的 preset 標識。連線重置和設定更新會重新整理列表。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Scope](../../core/scope/README.zh.md) — 註冊隔離。
- [Agent](../../core/agent/README.zh.md) — 工作階段執行時。
- [Cordis](../../../docs/cordis-primer.zh.md) — 外掛設定與生命週期。

<a id="model-experience"></a>
## 模型體驗

透過選定的 preset 間接影響模型，其外掛擁有模型可見能力。

#### KV Cache effect

選擇變更隻影響之後的任務，已有外掛與提示詞保持不變。

## 已知限制與待辦

<a id="known-limitations-and-deferred-work"></a>

- Web 不建立也不編輯 preset：設定檢視器是隻讀的；透過創造模式安裝的 bundle 宣告新 preset，或按行 id 覆蓋內建 preset，覆蓋會替換整個子外掛列表。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出 companion；狀態由 Host 註冊表擁有，用戶端展示與選擇行為由元件測試驗證。
