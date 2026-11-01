---
description: "供需要不含共享 base bundle 的極簡跨平臺 coding agent（程式設計智慧代理）的使用者使用的獨立 SDK profile，預設提供一個 shell 工具。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-minimal`

[English](README.md) | 中文

## 概述

當 SDK 用戶端需要小型、顯式的 coding agent 執行時時，請使用 `dsh --profile sdk-minimal`。該 profile 預設只公佈按平臺選擇的持久 shell，把工作階段持久化為未壓縮 JSONL，並從 SDK 初始化請求選擇模型。它提供完整 Cordis 設定樹，並刻意排除 `dsh-base`、Web、settings、託管憑證、遙測、壓縮（compaction）、檔案系統工具、workspace 指令、skill（技能）、jobs 與 subagent。其 danger-full-access 策略允許 shell 修改程序可存取的任何路徑，因此只能配合隔離 workspace 使用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

直接啟動該 profile，或從 Python SDK 選擇它。提供顯式 `DSH_HOME`、使用一次性 workspace，並透過 `DEEPSEEK_API_KEY` 提供模型憑證。

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal
```

`DSH_CONTEXT_WINDOW` 為不在介面卡建議目錄中的模型設定後備容量。`DSH_SYSTEM_PROMPT` 替換預設 persona。SDK 初始化請求是唯一的模型選擇依據，並覆蓋環境預設值。

使用 `dsh plugin --profile sdk-minimal` 管理持久外部依賴。Profile、home 與有序 `--patch` 檔案可以替換完整預設設定樹中的設定項，或在該設定樹上方插入 bundle。隨附範本只在啟動時應用 patch。

該 profile 只掛載一套持久 shell：Linux 和 macOS 使用 Bash，Windows 使用 PowerShell。兩套設定都使用 300 秒超時與一個 agent 自有終端；另一平臺的設定項保持停用。

與其他隨附 profile 一樣，它統一掛載 [MCP 資源](../../mcp/mcp-resources/README.zh.md)一次。只需設定 [MCP 用戶端條目](../../mcp/mcp-client/README.zh.md)即可新增伺服器。其他提供者掛載的用戶端也屬於已設定狀態。呼叫方作用域中未設定伺服器時，MCP 不貢獻提示詞文字或工具，預設仍只有一個 shell 工具。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

該 bundle 的單個 insert 就是完整應用設定樹：SDK stdio 啟動與 JSON-RPC 服務、一個由環境設定的 DeepSeek 介面卡、顯式 agent 核心、按設定啟用的 MCP 資源工具、本地子程序執行、按平臺選擇的持久 shell PTY，以及位於 `$DSH_HOME/sessions` 的未壓縮 JSONL 持久化。它不繼承其他 bundle，因此每個額外設定項都是顯式 profile 變更。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 完整獨立 profile 設定樹及其環境預設值 |
| [`src/index.ts`](src/index.ts) | Bundle 包入口 |
| — | 不釋出執行時不變式伴生項；本包只是靜態 patch 列表載體，插入的各行分別擁有自己的執行時關係和不變式伴生項。 |
| [`tests/sdk-minimal.spec.ts`](tests/sdk-minimal.spec.ts) | 精確組合、profile 名稱與平臺選擇檢查 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Python SDK 範例](../../../python/sdk/examples/README.zh.md)——從 Python 啟動本 profile，並使用明確指定的 Harness home。
- [SDK 應用 bundle](../sdk-app/README.zh.md)——完整與極簡 SDK profile 複用的 JSON-RPC 應用層。
- [Base bundle](../base/README.zh.md)——本 profile 刻意省略的完整產品基礎。

-----

<a id="model-experience"></a>
## 模型體驗

### 極簡 coding agent 組合

#### 模型看到的內容

系統提示詞取 `DSH_SYSTEM_PROMPT`，未設定時使用 `You are a helpful software engineer assistant.`。未設定 MCP 伺服器時，對外公佈的唯一工具是 Linux/macOS 上 agent 所有的持久 `bash` 或 Windows 上的 `pwsh`；執行時上下文、檔案系統工具、workspace 指令、skill、jobs 控制、壓縮與 Harness 身份均不存在。

#### Token 影響

預設是一個穩定 persona 加一個工具 schema。已設定 MCP 伺服器會新增自己的工具、共享資源工具及可用的伺服器指令。工具結果與普通對話歷史隨工作階段增長。

#### KV Cache 影響

當 persona、平臺、提供者、模型與 bundle patch 棧固定時保持穩定。Profile 變更在下一個程序生效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **該組合刻意省略共享產品服務** — 需要 settings、託管憑證、策略預設、遙測、Web 工具或完整預設工具清單時，請選擇 `dsh --profile sdk`。
- **使用者 patch 可以擴充功能設定樹並破壞 stdout** — profile 自定義屬於受信任的應用組合；向 stdout 寫入普通文字的外掛會破壞 JSON-RPC 分幀。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>
