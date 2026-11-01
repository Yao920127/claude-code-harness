---
description: "在 Web 側欄底部顯示 Claude Code 登入帳號的五小時與每週方案用量。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-claude-code-usage

[English](README.md) | 中文

## 概述

不必離開應用即可檢視 Claude 方案還剩多少。側欄底部為每個方案視窗（五小時、每週，以及按模型的每週視窗）顯示一條彩色進度條，標出已用或剩餘的比例；懸停可檢視已用比例與重置時間。資料來自 Host 回合所用的 Claude Code 登入；沒有 Claude 方案時卡片會隱藏。

## 目錄

- [使用此包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

用量卡片位於「設定」上方。每一行標出視窗名稱，並在進度條上方印出比例。標題欄的「已用 / 剩餘」開關決定數值與進度條顯示已用還是剩餘比例；此瀏覽器會把選擇儲存在 localStorage。兩種顯示下，已用低於 50% 時進度條為綠色，從 50% 起為橙色，從 80% 起為紅色。懸停某一行可檢視已用比例與重置時間。重新整理按鈕會再次詢問 Claude Code。頁面載入時以及視窗重新可見時，卡片都會讀取用量。在收起的側欄軌道上，它顯示第一個視窗所選的比例，懸停文字列出所有視窗。讀取到方案視窗之前不顯示任何內容：沒有 Claude 方案的登入（例如 API key）、未安裝或未登入的 Claude Code，以及讀取中或讀取失敗時，側欄底部都保持不變。

CCH bundle 會插入此外掛。它需要 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md#plan-usage) 的 `claudeCodeUsage` Remote，該路由也決定一次讀取可供所有視窗使用多久。

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

外掛佔用 [ui-sidebar](../ui-sidebar/README.zh.md) 的 `sidebar.footer.action` 座。`UsageSource` 擁有卡片狀態：同一時間只有一次 Remote 讀取有效，較新的讀取會取代仍在進行的較舊讀取，重新整理期間繼續顯示已有的回答。外掛會等到 `remote.claudeCodeUsage` 名稱空間掛載後才進行首次讀取。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Claude Code 模型路由](../../llm/llm-claude-code/README.zh.md)
- [側欄](../ui-sidebar/README.zh.md)

<a id="model-experience"></a>
## 模型體驗

無，本包只顯示帳號用量，不增加模型輸入。

#### KV 快取影響

無；用量讀取不會進入模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- Claude Code 把其用量請求標為實驗性；若 Claude Code 版本改變它，卡片可能停止工作，直到路由跟進。
- 卡片不會定時重新整理；它在載入時、視窗可見時以及收到請求時讀取。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

不釋出執行時不變數伴生。卡片只顯示一次 Remote 回答，沒有第二個觀測可與之比較。

</details>
