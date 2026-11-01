# Python SDK 範例

[English](README.md) | 中文

基於唯一應用啟動器 `dsh --profile sdk-minimal` 的可執行 Python SDK 範例。Python 用戶端負責 JSON-RPC stdio；profile 負責 agent（智慧代理）組合、持久化、執行策略與外掛。

## 執行極簡 agent

安裝 `deepseek-harness-sdk`、匯出模型憑證，然後提供隔離的 Harness home 與 workspace：

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
python python/sdk/examples/minimal.py \
  --dsh-home /absolute/path/to/example-dsh-home \
  --workspace /absolute/path/to/disposable-workspace \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

如需使用相容代理，請設定 `DEEPSEEK_BASE_URL`；可透過 `DSH_MODEL` 設定腳本的預設模型，透過 `DSH_SYSTEM_PROMPT` 指定部署角色設定。`--model` 是唯一執行時模型選擇，不要求匹配的環境變數；`--profile` 可以選擇另一個提供 SDK 服務的 profile。所選 home 儲存生成的 `sdk-minimal` profile，並在 `sessions/` 下儲存未壓縮 JSONL 工作階段日誌；腳本絕不會隱式讀取 `~/.dsh`。

隨附的 [`@deepseek-ai/dsh-sdk-minimal` 組合包](../../../packages/bundle/sdk-minimal/README.zh.md) 是該模式完整且顯式的 Cordis 設定樹。它只暴露：

- Linux／macOS 上所有者作用域內的持久 `bash`，或 Windows 上的 `pwsh`

該組合包不包含 `dsh-base`，因此每一個新增設定項都是顯式 profile 變更。執行時上下文、檔案系統工具、本地指令發現、壓縮（compaction）、設定、託管憑證、遙測、Web 工具、subagent 與完整預設工具清單均不存在。設定樹保留 SDK 啟動與 JSON-RPC 服務、一個由環境設定的 DeepSeek 介面卡、本地執行和 JSONL 持久化。

持久 PTY 可以修改執行時程序可存取的任何路徑，因此只應在一次性 checkout 或容器中使用。

## 新增外掛

對同一個顯式 home 使用執行時 wheel 包提供的 `dsh` 命令，以進行持久 profile 變更：

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

在該命令中使用 `sdk-minimal` 可擴充功能本範例，使用 `sdk` 則擴充功能基於完整 base 的 SDK profile。Python 呼叫也可以在 `patches=(...)` 中傳入更多絕對 patch 路徑；後面的檔案優先。所選 profile 必須保留 `@deepseek-ai/dsh-sdk-app` 或另一個 JSON-RPC server 設定項。該範例不接受完整 Cordis 檔案或任意程序 argv。

同一個執行時 wheel 包還打包了供直接 CLI（命令列介面）使用的 `web` profile 及其前端產物：`dsh web` 會啟動這個獨立應用。Python SDK 用戶端不能選擇 `web`，因為其中沒有 JSON-RPC 伺服器設定項。

另見 [Python SDK 教學](../../../docs/user/guide/python-sdk.zh.md) 與 [SDK 參考](../README.zh.md)。
