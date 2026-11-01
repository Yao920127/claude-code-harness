---
description: "load_workspace_dependencies 工具：返回隨包附帶的 Python、Node.js 與 pnpm 的絕對路徑，payload 可原地使用或安裝到 Harness home。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workspace-dependencies

[English](README.md) | 中文

## 概述

自帶腳本執行時的部署（Desktop 的 primary runtime，或容器映像層）掛載本工具，讓 agent 詢問隨包的 Python、Node.js 與 pnpm 在哪裡，而不是自行尋找系統直譯器。工具返回絕對路徑與記錄的發行版版本，不改 `PATH`，不改包管理器設定。payload 或在首次呼叫時複製到 Harness home 下（Desktop），或原地使用（只讀載體）。

## 目錄

- [使用本包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

與工具註冊表一起掛載，給出 payload 目錄。設定驗證在啟用前要求非空 `source` 並拒絕空 `root`；兩條路徑都必須為絕對路徑。內建 Office skills（`@deepseek-ai/dsh-skill-office`）按名字引用本工具取預設直譯器。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-tool-workspace-dependencies'
  config:
    source: /path/to/primary-runtime
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `source` | 必填 | 含 `runtime.json` 與 `dependencies/` 的 payload 絕對目錄。 |
| `root` | 未設定 | Harness home 下的絕對安裝目錄。設定時首次呼叫把 payload 複製過去，`runtime.json` 不變則複用；未設定時驗證後原地使用，不複製。 |

### payload 佈局

`runtime.json` 記錄 `desktopVersion`、`platform`（`win32`、`darwin` 或 `linux`）、`arch`、可選的 `payloadDigest`、頂層 `python` 與可選的 `node`/`pnpm` 版本，以及完整的 `pythonPackages` 分發包版本表。宣告 pnpm 時必須同時宣告 Node.js。numpy、pandas 等 Python 庫只出現在 `pythonPackages` 中。條目位於 `dependencies/`：`python/bin/python3`（Windows 為 `python/python.exe`）及其下的 `site-packages`；宣告瞭才有的 `node/bin/node`、`node/node_modules` 與 `pnpm/bin/pnpm.mjs`。平臺或架構與目前程序不符的清單被拒絕。

打包的 `sdk` profile 預設使用隨包 Python 和 Office skills；`DSH_PRIMARY_RUNTIME` 覆蓋資源位置，空值表示停用。沒有載體預設路徑的原始碼啟動仍需顯式啟用。獨立選擇 skills 的方式見[執行時設定](../../../python/sdk-runtime/README.zh.md)。缺少 skill 資源會產生啟動警告；無效或不完整的外部執行時 payload 在首次工具呼叫時失敗。profile 設定變更需要重新啟動 SDK 程序。

### 建置載體 payload

在已安裝依賴的儲存庫 checkout 中執行 `CI=true pnpm run prepare:primary-runtime --target linux-x64 --output /tmp/dsh-office`，會生成 `primary-runtime/` 和 `office-skills/`。[共享下載鎖](../../../scripts/primary-runtime/lock.json)還覆蓋 `linux-arm64`、`mac-arm64`、`mac-x64` 和 `win-x64`。`--python-only` 省略 Node.js 和 pnpm；`--cache` 選擇經過雜湊驗證的歸檔快取。入口僅對本機目標執行直譯器與 Office 讀寫檢查。跨目標建置必須在部署前到目標主機執行這些檢查。

容器可將這兩個目錄複製到不可變映像層，並將 `DSH_PRIMARY_RUNTIME` 設為 `primary-runtime/` 的絕對路徑。SDK 原位查詢該 payload。Desktop 使用同一建置器，並保留 Harness-home 安裝與簽名檢查。

-----

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

`readPrimaryRuntime` 與建置冒煙檢查共用 `parsePrimaryRuntime`。它驗證扁平清單，拒絕歸一化後重名的分發包。舊 `components` 中繼資料在記憶體中歸一化，並保留舊格式的一致性驗證；舊分發包版本表缺失時轉換為空表。混用頂層與舊元件版本欄位會被拒絕。讀取不改寫中繼資料，歸一化後等價的清單可複用已安裝產物。`workspaceDependencyPaths` 推導各平臺的條目路徑。`installPrimaryRuntime` 複製到暫存目錄、要求宣告的直譯器和腳本為檔案、庫路徑為目錄、再換入正式位置，失敗時保留舊樹；`resolvePrimaryRuntime` 做同樣的驗證但不複製。工具在外掛生命週期內記住首次成功的結果。

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 清單驗證、路徑推導、原地與安裝兩種準備方式、工具註冊。 |
| — | 不釋出執行時不變數伴隨入口：每次準備都驗證 payload 清單，工具註冊表負責註冊生命週期。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [Office skills](../skill-office/README.zh.md)——呼叫本工具取直譯器的工作流。
- [工具註冊表](../../core/tools/README.zh.md)——註冊與 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

模型看到生成的 [`load_workspace_dependencies` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workspace-dependencies)。

#### Token 影響

工具可見的每個請求固定一份 schema 開銷；描述裡列出了隨包的 Office 庫，模型不必先載入 skill 就能選擇直譯器。

#### KV 快取影響

工具定義與可見性不變時字首穩定。

### 工具結果

#### 模型看到什麼

一個 JSON 物件：絕對路徑 `python` 與 `pythonPackages`、來自 `runtime.json` 的 `pythonDistributions`，以及 payload 宣告瞭才有的 `node`、`nodePackages` 與 `pnpm`。重複呼叫返回同一物件。

#### Token 影響

每次呼叫幾百個字元，以路徑為主。

#### KV 快取影響

作為工具結果追加進輪次歷史；不增加提示詞分割槽。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- Linux 目標需要 glibc；尚未鎖定 musl payload。
- Windows 上原地使用的 payload 須在載體裡已可執行；原地模式不修復權限。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

包歸屬與載體選擇記錄在[共享執行時 Agent Note](../../../.agents/notes/implemented/architecture/2026-09-17-shared-office-runtime.zh.md) 中。

</details>
