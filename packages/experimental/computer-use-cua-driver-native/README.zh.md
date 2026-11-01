---
description: "透過原生 npm SDK 執行 Cua Driver 的電腦操作工具，持久化截圖，並明確主機桌面權限要求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-computer-use-cua-driver-native

[English](README.md) | 中文

## 概述

使用 Cua Driver 檢查和操作桌面視窗，無需安裝其獨立 CLI 或應用。原生 npm 依賴在 DSH 主機程序內執行，提供 Cua Driver 自己的工具。截圖透過持久化附件傳給支援影象的模型。此實驗性軟體包會發布到 npm，需要啟動主機的桌面權限，並且必須在組合設定中顯式啟用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已經提供工具註冊表和系統提示詞的組合中掛載此提供者。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-computer-use'
- name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
```

此提供者沒有設定欄位。它載入 [package.json](package.json) 宣告的確切 Cua Driver npm 版本，並採用其程序內預設設定。原生模組匯入、執行時初始化、目錄格式、工具重名或電腦操作註冊衝突會使啟用失敗，並復原所擁有的資源。註冊的提供者名稱為 `cua-driver-native`。

掛載附件儲存並使用明確宣告支援影象輸入的模型路由，才能接收截圖。[MCP 結果介面卡](../../mcp/mcp-client/README.zh.md) 負責影象接納和診斷行為；模型無法接收影象時，程式呼叫方仍保留規範原始結果。呼叫採用 Cua Driver 上游的工具參數和結果。

### 主機要求

原生依賴透過 npm 可選依賴提供各平臺二進位制檔案，因此必須保留可選依賴安裝。請向啟動 DSH 的應用授予桌面權限；此提供者既不安裝獨立持有權限的應用，也不更改作業系統授權。原生執行時與主機共享程序，因此原生崩潰可能終止該程序。如果需要由獨立的 Cua Driver 應用持有權限並執行操作，請使用[已安裝的 MCP 提供者](../computer-use-cua-driver-mcp/README.zh.md)。

### 驗證已安裝的 SDK

在儲存庫根目錄執行這項顯式啟用的檢查，驗證已安裝的原生依賴。它發現工具、透過 `prompt: false` 讀取權限狀態，並驗證解除安裝；它不截圖、不傳送輸入，也不請求作業系統權限。清除 `NODE_USE_ENV_PROXY` 可防止 Node 在測試初始化之前採用啟動 shell 的代理設定。

```sh
env -u NODE_USE_ENV_PROXY DSH_COMPUTER_USE_NATIVE_E2E=1 node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts packages/experimental/computer-use-cua-driver-native/tests/native.e2e.ts
```

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部——點選展開</summary>

此提供者在載入原生程式碼前佔用共享電腦操作註冊名額。子外掛擁有目錄發現、模型工具、指導文字和原生執行時。父外掛保留註冊名額，直到子外掛解除安裝完成工具移除、中斷原生呼叫和影象能力准入、等待呼叫結束及原生關閉。取消不會撤銷已經傳給應用的輸入。

| 檔案 | 職責 |
|---|---|
| [src/index.ts](src/index.ts) | 原生執行時所有權、目錄驗證、工具註冊和提供者指導文字 |
| — | 不釋出執行時不變數伴隨模組；資源所有權沒有可獨立觀測並比較的狀態。 |

工具定義複用現有 MCP 結果介面卡。Cua Driver 的 JSON 目錄決定 schema，其原始結果提供規範文字、結構化輸出和影象位元組。電腦操作服務只儲存提供者名稱並保證獨佔註冊。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [電腦操作服務](../../computer-use/computer-use/README.zh.md)——獨佔的具名註冊。
- [MCP 用戶端](../../mcp/mcp-client/README.zh.md)——共享結果與影象投影。
- [Cua Driver SDK](https://cua.ai/docs/reference/cua-driver/sdk-reference)——上游執行時 API 和主機能力。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

在原生工具掛載期間，此提供者加入以下電腦操作指導文字。

##### 原生 Cua Driver 指導文字

```markdown
Cua Driver native computer-use tools operate the host desktop. Discover the exact app and window, then get a fresh window snapshot before acting. Use element_token from that snapshot, or coordinates from its screenshot. A new snapshot of that window invalidates its earlier element tokens. Select either target or the legacy pid/window_id fields; do not combine them.

Prefer background delivery. A refusal does not authorize a foreground retry. Verify the requested outcome from fresh state after an action; a delivered click alone does not prove the outcome. After cancellation, inspect current state before retrying because completed input is not rolled back. Other sessions and applications may change the same desktop.

On macOS, cursor-overlay operations may return facility_unavailable even when screenshots and input work.
```

#### Token 影響

提供者掛載期間，這段固定指導文字增加系統提示詞 token。上游指導資源不會自動載入。

#### KV Cache 影響

指導文字不變時，其重複提示詞字首保持穩定。掛載、移除或編輯它會改變此字首，並可能減少快取複用。

### 發現的 Cua Driver 工具與結果

#### 模型看到什麼

工具名稱使用 `cua_driver_native__` 字首並附加上游名稱，保留上游描述和輸入 schema。上游工具拒絕轉為工具錯誤。支援的截圖作為持久化影象引用出現在結果文字旁；程式呼叫方仍可讀取規範原始結果。

#### Token 影響

發現的目錄為每個請求加入工具定義。無障礙樹、結果文字和獲准接納的截圖增加每次呼叫的上下文。原始 base64 保留在執行期間的規範值中，不複製到模型歷史。

#### KV Cache 影響

目錄不變時，工具定義字首保持穩定。工具結果追加到 Session 歷史。替換提供者或其目錄會改變模型可見工具，並可能減少字首複用。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

此軟體包保留上游驅動的平臺和應用限制。

- **主機權限與圖形工作階段**——npm 安裝不會授予桌面存取權限或建立圖形工作階段。
- **原生游標覆蓋層**——無介面的 macOS Node 主機可能對覆蓋層操作返回 `facility_unavailable`，同時截圖和後臺輸入仍可用。
- **共享桌面**——此提供者不為某個 Session 預留視窗或完整工作流。其他呼叫方和應用可以在兩次呼叫之間更改同一桌面。
- **取消**——被取消的呼叫可能已經傳入輸入；重試前必須檢查新狀態。解除安裝時提供者等待 SDK 關閉，但不承諾復原原生操作。
- **關閉失敗**——如果原生關閉失敗，註冊名額保持佔用。掛載其他電腦操作提供者之前必須重新啟動主機。
- **實驗性發布**——工具 schema 跟隨鎖定的上游 SDK，不作 DSH 穩定性承諾。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
