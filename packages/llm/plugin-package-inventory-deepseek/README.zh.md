---
description: "面向傳送官方 DeepSeek 請求的部署，說明活躍 Loader 包清單中繼資料。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-package-inventory-deepseek

[English](README.md) | 中文

## 概述

用於 DeepSeek 官方 LLM API 請求的完整活躍 Loader 外掛包清單。該函式外掛注入 Loader、存活 Agent 註冊表與 `ctx.deepseekLlmApiExtensions`，並擁有 `dsh_plugin_packages` 欄位。當官方 API 需要活動包清單進行請求診斷時，請啟用它。

## 目錄

- [設定](#configuration)
- [收集](#collection)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="configuration"></a>
## 設定

| 設定鍵 | 預設值 | 含義 |
|---|---:|---|
| `enabled` | `true` | 註冊 `dsh_plugin_packages` 貢獻。將其設為 `false` 可省略包中繼資料。 |

隨附 profile 使用該預設值，因此只要準備成功，每個 DeepSeek 官方請求都會攜帶包清單。

<a id="collection"></a>
## 收集

每次請求都會重讀主機 Loader 樹中的活躍非 group 設定項。存在可選 `ctx.agentPresets` 且 `sessionId` 解析到已加入 standing preset 的存活 Agent 時，該 preset 的獨立 Loader 樹也會加入同一次收集；未掛載該服務的部署只報告主機樹。只有根 fiber 處於 `ACTIVE` 且 Loader 有效狀態為啟用的設定項才會納入。

外掛在啟用時讀取一次可選的 `ctx.pluginPackages` 服務。隨附 app boot 會在 profile Loader 設定項之前掛載該服務，因此裸包和包子路徑的身份使用與其 import 相同的權威 runtime resolution，包括它未命中的情況，並且無需包匯出 `./package.json`。若該服務不存在，外掛會在整個生命週期中保留 Node 原生包搜尋，之後再掛載 resolver 也不會切換既有清單。因此，希望使用 runtime resolution 身份的底層嵌入方必須先掛載 `PluginPackages`，再掛載 Loader 設定項和本外掛。

每個普通設定項使用其所屬 Loader 樹的基址。standing preset 的根設定項使用主機基址，與 preset Loader 對裸包的顯式覆寫保持一致；巢狀 include 仍使用自身基址。相對與絕對模組會向上查詢最近的 manifest（中繼資料清單）；沒有 `name` 的 manifest 只標記鬆散模組，不貢獻包身份。具名包 manifest 還必須宣告非空 `version`，格式錯誤的包中繼資料會使請求準備失敗。系統使用與 locale 無關的比較按確切名稱／版本對去重並排序，同時存活的不同版本仍會分開保留。

版本 1 的 `dsh_plugin_packages` 欄位只包含 `{ name, version }` 對。系統會排除停用、pending、failed、disposed、unloading 狀態，結構性 `cordis:` 設定項，普通依賴，沒有所屬包身份的鬆散檔案，以程式設計方式掛載的子 fiber，以及記憶體動態外掛。

<a id="model-experience"></a>
## 模型體驗

### 包清單中繼資料

#### 模型看到的內容

無。`dsh_plugin_packages` 是位於模型訊息、系統提示詞與工具 schema 之外的提供者中繼資料。

#### Token 影響

模型輸入 token 為零；完整清單隻會增加 HTTP 請求位元組數。

#### KV Cache 影響

無；包生命週期變化不會改變模型可見字首。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **僅含 Loader 包來源**——以程式設計方式建立的子 fiber 與記憶體動態外掛沒有權威 NPM 名稱／版本來源，因此不在該清單內。
- **省略鬆散模組**——沒有具名且帶版本所屬 manifest 的相對檔案是外掛模組，不是外掛包。
- **原地替換包需要重新啟動**——manifest 身份會在程序存活期內快取。Loader 的啟用、停用、掛載、解除安裝與普通原始碼 HMR 仍會重新整理存活設定項集合，但在同一程序中把已掛載包的 manifest 替換為另一版本並不是受支援的升級路徑。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。每次請求直接讀取權威 Loader fiber 狀態與 package manifest，外掛不保留獨立可變 inventory。
