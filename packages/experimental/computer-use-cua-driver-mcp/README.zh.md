---
description: "透過已安裝的 Cua Driver MCP 可執行程式和獨佔提供者註冊，設定實驗性本地計算機使用能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp

[English](README.md) | 中文

## 概述

讓模型透過已安裝的 Cua Driver 操作本地桌面。將本包與 computer-use 服務一同掛載，即可透過 MCP 提供驅動自身的工具描述、參數和結果。安裝和桌面權限由 Cua Driver 負責，預設不啟用任何驅動。提供者在連線和工具完成關閉前持續佔用計算機使用能力；並行 Session 由呼叫方自行協調。

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

當 Cua Driver 已在執行 DSH 的同一臺機器上安裝並設定好時，選擇此提供者。平臺設定以[上游安裝和權限指南](https://github.com/trycua/cua/blob/cua-driver-rs-v0.28.0/libs/cua-driver/README.md)為準。

### 最小設定

將以下條目加入已提供 tools 和 system-prompt 服務的組合。截圖還需要附件儲存，以及宣告支援影象輸入的模型路由。

```yaml
- name: '@deepseek-ai/dsh-computer-use'
- name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
  config:
    command: cua-driver
    args: [mcp]
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `command` | `cua-driver` | 已安裝的可執行程式路徑或 PATH 命令 |
| `args` | `[mcp]` | 不經過 shell、直接傳入的參數 |
| `toolCallTimeoutMs` | MCP 用戶端預設值 | 單次呼叫的超時覆蓋值，單位為毫秒 |
| `reconnect` | MCP 用戶端策略 | 可選的重連覆蓋設定 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-computer-use-cua-driver-mcp)列出了接受的欄位。超時和重連預設值由 [MCP 用戶端](../../mcp/mcp-client/README.zh.md)定義。

### 啟用與所有權

提供者在連線前以 `cua-driver-mcp` 註冊。第二個計算機使用提供者會啟用失敗，包括本包的另一個實例。初始化或首次工具發現失敗會使本條目啟用失敗，並在清理後釋放註冊。之後連線斷開時，MCP 用戶端重連或耗盡嘗試次數均保留註冊；解除安裝條目才會釋放註冊。

模型看到的工具使用固定的 `mcp__cua-driver-mcp__` 名稱空間。工具名稱、描述、輸入模式、規範結果和影象准入遵循現有 [MCP 橋接器](../../mcp/mcp-client/README.zh.md)。本包不額外提供 DSH 操作目錄或提供者選擇工具。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

[`src/index.ts`](src/index.ts) 將計算機使用註冊和所屬 MCP 子外掛歸入同一個有序副作用。子外掛完成清理後才執行註冊釋放函式，啟用失敗時也遵循這一順序。MCP 用戶端負責憑證過濾、子程序終止、工具同步、取消和持久化影象投影。

本包不釋出執行時不變數伴隨外掛：提供者沒有獨立的驅動狀態可與註冊比較，連線和工具代次由子外掛持有。

### 驗證已安裝的驅動

在儲存庫根目錄，用 Cua Driver 可執行程式的絕對路徑顯式啟用真實相容性測試。測試發現工具，以 `prompt: false` 呼叫 `check_permissions`，並驗證清理結果。在 macOS 上，`--direct` 使用啟動主機的權限在 MCP 程序中執行驅動；省略 `DSH_COMPUTER_USE_MCP_ARGS` 則使用預設的 `["mcp"]` 參數。

```sh
DSH_COMPUTER_USE_MCP_EXECUTABLE=/absolute/path/to/cua-driver \
DSH_COMPUTER_USE_MCP_ARGS='["mcp","--direct"]' \
pnpm run test:e2e packages/experimental/computer-use-cua-driver-mcp/tests/installed-driver.e2e.ts
```

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [計算機使用服務](../../computer-use/computer-use/README.zh.md) — 獨佔具名註冊。
- [MCP 用戶端](../../mcp/mcp-client/README.zh.md) — 協定發現、執行和影象行為。
- [Cua Driver](https://github.com/trycua/cua/blob/cua-driver-rs-v0.28.0/libs/cua-driver/README.md) — 上游可執行程式和平臺設定。

-----

<a id="model-experience"></a>
## 模型體驗

### Cua Driver 工具與截圖

#### 模型可見內容

已安裝驅動宣告的工具描述和輸入模式使用 `mcp__cua-driver-mcp__<tool>` 名稱呈現。成功呼叫保留有序文字和已准入截圖；不支援影象的路由會收到 MCP 橋接器的診斷文字。工具呼叫和投影后的結果透過正常執行流程進入 Session 日誌。

#### Token 影響

已註冊模式進入模型請求，工具參數、文字結果和已准入影象持續佔用上下文，直到壓縮。規範結果中的內聯影象位元組不會寫入 Session 事件；持久化附件引用標識模型可見影象。

#### KV 快取影響

工具發現結果不變時，工具定義字首保持穩定。目錄變化可能從第一個變化的模式開始使快取失效；追加的工具結果保留此前的請求字首。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

此提供者依賴已安裝的驅動及 MCP 橋接器支援的能力。

- 桌面存取需要完成上游安裝並取得平臺權限；外掛啟用本身不能證明每個桌面操作都已獲准。
- 多個 Session 共享一個桌面。一次執行一個計算機使用工作流，或在外部協調；註冊不會序列化 Session 的操作。
- 驅動升級可能改變發現的目錄。本提供者不支援執行時驅動切換、專用桌面權限介面或 DSH 操作抽象。
- 啟動時限及富結果限制遵循 [MCP 用戶端的限制](../../mcp/mcp-client/README.zh.md#known-limitations-and-deferred-work)。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
