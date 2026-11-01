---
description: "透過宣告式 preset 選擇 Agent 的工具、提示詞和技能。同一程序可以執行多種組合。設定失敗會顯示在列表中；現有 Agent 保留已經使用的組合。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-preset-registry

[English](README.md) | 中文

## 概述

透過宣告式 preset 選擇 Agent 的工具、提示詞和技能。同一程序可以執行多種組合。設定失敗會顯示在列表中；現有 Agent 保留已經使用的組合。

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

### 最小設定

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `default` | 必填 | 未顯式指定時使用的 preset ID |

Web 內建定義來自 `dsh-web-app` bundle。定義使用普通外掛行；註冊表不掃描目錄，也不接受 preset 路徑。`agent-preset-registry` 條目的 volatile 欄位 `selectedDefault` 保留使用者預設值，新工作階段優先使用它而不是部署 `default`。profile patch 仍可能帶有已廢棄的 `modeSelectionEnabled` 欄位；註冊表未宣告該欄位，既不讀取也不重寫它。

註冊表不寫入任何宣告。`read` Remote 把一條宣告的子外掛列表按 entry-list YAML 方言（含 `!!js` 條件）渲染回來，供用戶端展示 preset 的組成；沒有任何介面接受 YAML 寫回。新建 preset 或覆蓋內建 preset 都是 bundle 補丁：插入一行 `@deepseek-ai/dsh-agent-preset`，或按該行 id 寫覆蓋補丁，再用 `plugin_manager` 安裝到 profile；創造模式在對話中編寫這類 bundle。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

每個宣告在啟動時建立註冊表擁有的 scope 和記憶體 Loader 樹。更新或移除宣告會讓舊代際退役；Agent、子 Agent 和臨時歷史讀取各自持有引用，最後一個引用釋放後才銷燬外掛樹。外掛註冊繼承 preset scope，Agent scope 的父連結決定可見性；Agent loop 仍由主機共享。

啟用審計檢查匯入失敗、缺失服務和向全域洩漏的服務。匯入失敗、啟用失敗和洩漏會拒絕掛載。等待 Host 服務的行保持掛載，每次讀取和繫結都在 Host Loader 樹結算後重新審計，因此啟動順序不決定結果。失敗只停用該定義的新繫結。工作階段日誌儲存 preset ID 和空白工作階段的切換記錄；重新啟動恢復使用該 ID 的目前定義，缺失時拒絕恢復。

| 檔案 | 職責 |
|---|---|
| [index.ts](src/index.ts) | 註冊、代際與 Agent 繫結 |
| [mount.ts](src/mount.ts) | 隔離外掛樹與啟用審計 |

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Scope](../../core/scope/README.zh.md) — 註冊隔離。
- [Agent](../../core/agent/README.zh.md) — 工作階段執行時。
- [Cordis](../../../docs/cordis-primer.zh.md) — 外掛設定與生命週期。

<a id="model-experience"></a>
## 模型體驗

### Preset 選擇

#### 模型看到的內容

沒有直接內容：所選 preset 的 `plugins` 擁有模型可見的工具和提示詞片段。

#### Token 影響

本包自身沒有；每個掛載的 `plugins` 行宣告自己的工具和片段。

#### KV Cache effect

已有 Agent 保留外掛和提示詞。新 Agent 從目前定義建置字首。

## 已知限制與待辦

<a id="known-limitations-and-deferred-work"></a>

- preset 不是安全沙箱：YAML 及外掛可以執行 Host 程式碼。使用者覆蓋替換完整子外掛列表，不自動合併內建列表的未來更新。程序退出後不儲存舊代際的外掛實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>

**執行時不變數：** companion 檢查掛載後洩漏到全域的服務，以及模型請求前尚未繫結 preset 的 Agent。
