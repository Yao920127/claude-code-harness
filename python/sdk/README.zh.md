# DeepSeek Harness Python SDK

[English](README.md) | 中文

用於透過 stdio 上按行分隔的 JSON-RPC 驅動 DeepSeek Harness 的 Python 子程序 SDK。安裝 `deepseek-harness-sdk` 時，會同時安裝目前平臺上版本完全相同的 `deepseek-harness-runtime-bin` wheel 包。

```sh
python -m pip install deepseek-harness-sdk
```

## 啟動執行時

Python SDK 沒有獨立的應用入口。它以 `--profile sdk` 啟動內建的 `dsh` CLI（命令列介面）；所選 profile 負責 JSON-RPC 伺服器、agent（智慧代理）組合、憑證、持久化、工具和關閉流程。

每次啟動都必須顯式指定 Harness home。請傳入 `dsh_home`，或在子程序環境中提供非空的 `DSH_HOME`。SDK 刻意不會發現 `~/.dsh`。

```py
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    cwd="/absolute/path/to/workspace",
    provider="deepseek-official",
    model="deepseek-v4-flash",
    reasoning_effort="max",
    max_tokens=49_152,
) as harness:
    result = harness.run("Say hi.", session_id="example-001")

print(result.final_response)
```

`DeepSeekHarness` 延遲啟動執行時，並在呼叫 `close()` 或退出上下文管理器前複用該程序。首次 profile 握手透過 `initialize_timeout_seconds` 使用獨立的 30 秒預設上限；普通輪次在未設定 `request_timeout_seconds` 時仍不設上限。超時診斷會指明所選 profile，幷包含保留的執行時診斷。`cwd` 是 agent workspace；`runtime_cwd` 獨立選擇子程序工作目錄。兩者都會在啟動前轉成絕對路徑。`provider`、`model`、可選的 `reasoning_effort` 和可選的正整數 `max_tokens` 透過 JSON-RPC 初始化傳送。`base_url` 與 `api_key` 會顯式覆蓋子程序環境中的 `DEEPSEEK_BASE_URL` 與 `DEEPSEEK_API_KEY`。

## 自定義外掛

持久自定義屬於 `dsh` profile。使用執行時 wheel 包提供的 `dsh` 命令初始化隨附的 SDK profile，並安裝外部 bundle：

```sh
export DSH_HOME=/absolute/path/to/isolated-dsh-home
dsh --profile sdk --dump-default-config >/dev/null
dsh plugin --profile sdk add file:/absolute/path/to/my-plugin-bundle
```

`file:` 形式會把本地 bundle 安裝到 profile 包樹中，使其 peer import 可以到達內建安裝後備。profile manifest（中繼資料清單）會記錄已安裝依賴與有序 bundle 層；`$DSH_HOME/profiles/sdk/cordis.patch.yml` 是持久使用者 patch。只有管理外部包時，`dsh plugin` 才需要 `pnpm`。執行 SDK 不需要系統 Node.js。

對於單次呼叫的變更，可傳入一個或多個 patch 檔案。它們會轉成絕對路徑，並在 profile 層與 home patch 層之後按順序傳給 CLI：

```py
with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    profile="sdk",
    patches=("/absolute/path/to/first.patch.yml", "/absolute/path/to/last.patch.yml"),
) as harness:
    result = harness.run("Make the requested code change.")
```

`profile` 可以選擇另一個已存在的 profile，但該組合必須保留 `@deepseek-ai/dsh-sdk-app` 或另一個 `@deepseek-ai/dsh-sdk-jsonrpc-server` 設定項。設定錯誤會在 CLI 啟動或 SDK 初始化時失敗；不存在完整設定退回。`dsh_bin` 可以選擇另一個 `dsh` 可執行程式，同時保持相同的 profile 語法。任意 argv 替換僅是內部 fake-runtime 測試介面卡，不屬於公開 API。

`provider` 選擇指定 Cordis 組合所註冊的提供者路由；`model` 是該介面卡解析出的模型 ID。`reasoning_effort` 是該確切路由可選的非空介面卡自有識別符號；省略時保留模型自身的預設值。`max_tokens` 是一個可選的正整數，用於限制根 agent 及其程序內後代在每次請求中輸出的 token 數量；省略該參數時，由提供者的預設行為決定輸出上限。缺少介面卡、模型不可用或推理強度不受支援時，初始化會在提示詞執行前拒絕。壓縮（compaction）摘要繼續使用壓縮外掛單獨設定的上限。內建預設組合註冊 `deepseek-official`。自定義組合可以掛載 `llm-pi-ai`，在其中設定各提供者專屬的憑證和端點，並選擇 pi-ai 已安裝 catalog 中存在的任意提供者／模型組合。

隨附的 `sdk-minimal` profile 是獨立顯式設定樹，而不是 `dsh-base` 上的 overlay。使用 `profile="sdk-minimal"` 選擇它；普通 `model` 參數是唯一執行時模型選擇，也適用於不在介面卡建議目錄中的模型 ID。它只提供按平臺選擇的持久 shell、本地執行與 JSONL 工作階段；檔案系統工具、設定、託管憑證、遙測、Web 工具與完整預設工具清單仍由獨立的完整 `sdk` 與 `web` profile 提供。

## 結果與通知

`Session.run()` 的活動區間從提示詞被持久 inbox 接收時開始，到整個 agent 下一次進入空閒狀態時結束，並返回 `RunResult(session_id, final_response, finish_reason, events, notifications)`。`final_response` 是該區間內根工作階段最後提交的助手文字。`finish_reason` 是最後一個根工作階段 `turn/end` 的 `kind`，例如 `completed`、`max-tokens` 或 `error`；沒有輪次結束時為 `None`。缺少字串 `data.reason.kind` 的 `turn/end` 違反協定，並會丟擲 `SdkProtocolError`。

`HarnessClient` 會在執行時程序的整個生命週期內保留已發現的 subagent 譜系。在 `Session.run()` 期間，`RunResult.notifications` 與 `on_notification` 按協定順序接收根工作階段和已知後代的通知。`RunResult.events` 只包含根工作階段事件，因此後代輸出不會替換根回應。底層 `session_prompt()` 會立即返回已排隊訊息的 id；繞過 `Session.run()` 的呼叫方自行負責後續活動邊界。

所選 home 儲存 profile、外掛與每個 profile 自有的持久資源。完整 `sdk` profile 使用其中的憑證、設定與工作階段儲存；`sdk-minimal` 只使用自己的 JSONL 工作階段儲存。需要隔離這些資源時應使用新的 home；獨立工作應使用新的工作階段 ID。同時複用 harness 與工作階段 ID 會延續持久對話和工作階段資源。

另見 [Python 教學](../../docs/user/guide/python-sdk.zh.md)、[可執行範例](examples/README.zh.md) 和 [執行時 wheel 包參考](../sdk-runtime/README.zh.md)。
