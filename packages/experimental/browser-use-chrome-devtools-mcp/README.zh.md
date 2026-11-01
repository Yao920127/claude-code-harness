---
description: "透過 Chrome DevTools MCP 操作 Chromium，為每個活動 Session 保持獨立瀏覽器狀態。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp

[English](README.md) | 中文

## 概述

透過 Chrome DevTools MCP 的上游工具檢查網頁並操作 Chromium。提供者在 Session 建立或恢復完成前初始化其 MCP 連線，並跨輪次保留連線。可以啟動獨立瀏覽器，也可以讓一個 Session 接入已有瀏覽器，使用其現有標籤頁和登入狀態。本包以實驗狀態釋出，僅在顯式掛載後啟用。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與待辦事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在建立或恢復 Session 前，將以下條目掛載到已提供 Agent、工具和系統提示詞的 profile 組合中。載入或重新載入此提供者不會接管已經活動的 Session。瀏覽器安裝遵循上游執行時；使用 `executablePath` 選擇已有 Chromium 安裝。

```yaml
- name: '@deepseek-ai/dsh-browser-use'
- name: '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp'
  config:
    mode: launch
    headless: true
```

使用 `mode: attach`，並在 `endpoint` 中設定 HTTP(S) 除錯 URL 或 WS(S) 瀏覽器端點，即可操作已有瀏覽器。新的活動 Session 在初始化時佔用附加連線，並持續保留直到解除安裝。如果連線已被佔用，本次啟用不使用該瀏覽器，但繼續執行，後續輪次不會重試。連線釋放後，新建立或恢復的啟用可以取得它。其他 Session 的直接呼叫會失敗。清理只斷開連線，保留外部瀏覽器及其頁面。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `mode` | 必填 | `launch` 或 `attach`，在本次提供者啟用期間固定 |
| `headless` | `true` | 啟動時不顯示視窗 |
| `executablePath` | 上游發現 | 啟動使用的 Chromium 可執行檔案 |
| `endpoint` | attach 時必填 | 已有瀏覽器除錯端點 |
| `toolCallTimeoutMs` | MCP 用戶端預設值 | 單次呼叫超時，單位為毫秒 |

[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-browser-use-chrome-devtools-mcp)列出接受的欄位。瀏覽器模式由 profile 或 preset 選擇。

為整個程序設定系統提示詞的 `toolOrder` 時，將瀏覽器工具留在 `<unlisted-tools>` 中。顯式列出瀏覽器工具名稱可能導致未獲得瀏覽器連線的 Session 無法組裝提示詞。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

提供者解析固定版本 npm 包的可執行入口，並使用目前 Node 啟動。服務程序之前可能執行臨時協定探測程序。[共享執行時](../browser-use-runtime/README.zh.md)負責等待 Agent 初始化、逐 Session 序列執行與清理；[MCP 用戶端](../../mcp/mcp-client/README.zh.md)負責傳輸、發現和結果投影。提供者不維護獨立的連線觀測，因此不釋出執行時不變數配套入口。

只要活動 Session 保持連線，瀏覽器狀態就會跨輪次保留。銷燬會等待伺服器關閉，再釋放資源。重新載入後恢復 Session 會建立新的瀏覽器執行狀態；已儲存的對話歷史不會還原 Cookie 或頁面。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [瀏覽器使用](../../../docs/subsystems/browser-use.zh.md) — 提供者選擇與 Session 所有權。
- [瀏覽器使用服務](../../browser-use/browser-use/README.zh.md) — 提供者獨佔註冊。
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — 上游安裝與瀏覽器行為。

-----

<a id="model-experience"></a>
## 模型體驗

### 瀏覽器工具與截圖

#### 模型可見內容

工具以 `mcp__chrome-devtools-mcp__<tool>` 命名，保留上游描述和 JSON schema。文字與截圖透過常規工具結果流程進入 Session 日誌。截圖需要附件儲存及支援圖片輸入的模型路由；其他路由會收到 MCP 圖片診斷。MCP 用戶端還提供資源工具和註明伺服器來源的指導。只有目前 Session 擁有連線後才顯示瀏覽器指導；針對該伺服器的資源請求執行相同的所有權檢查。

#### Token 影響

工具目錄、資源工具和伺服器指導會增加工具定義與提示詞文字。呼叫會向 Session 歷史加入參數、文字和獲准輸入的圖片。內聯圖片位元組不進入模型可見歷史。

#### KV Cache 影響

不變的工具目錄會保留工具定義字首。結果追加到歷史；更換提供者或目錄可能降低字首複用率。

## 已知限制與待辦事項

<a id="known-limitations-and-deferred-work"></a>

本整合保留固定版本伺服器的瀏覽器與工具限制。

- 僅支援 Chromium；不可選擇 Firefox 或 WebKit。
- 啟動失敗或取消會拒絕 Session 建立或恢復，並觸發用戶端清理。斷開的用戶端不會重試；修復原因後，建立新 Session，或解除安裝並恢復已有 Session。
- 連線獨佔僅在此提供者實例內有效。其他程序與瀏覽器使用者仍可修改相同頁面。
- 共享資源伺服器目錄可以顯示繼承的伺服器名稱，但不會授予對其他 Session 瀏覽器的存取權限。
- 取消不會撤銷已傳送給瀏覽器的導航、點選或其他操作。
- 工具 schema 跟隨固定的實驗依賴版本，不承諾 DSH 穩定性。
- 使用統計已停用。包括效能工具在內的其他功能保留其上游行為。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
