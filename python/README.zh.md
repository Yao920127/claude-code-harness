# DeepSeek Harness Python SDK

[English](README.md) | 中文

用於以子程序方式驅動 DeepSeek Harness 的 Python 包。用戶端 SDK 透過 stdio 使用按行分隔的 JSON-RPC 與內建執行時通訊。

## 包

| 目錄 | 分發名／模組 | 職責 |
|---|---|---|
| [sdk](sdk/README.zh.md) | `deepseek-harness-sdk` / `deepseek_harness` | 高層輪次 API 與低層 JSON-RPC 用戶端 |
| [sdk-runtime](sdk-runtime/README.zh.md) | `deepseek-harness-runtime-bin` / `deepseek_harness_runtime` | 內建 `dsh` CLI（命令列介面）可執行程式與原生伴隨檔案 |

## 行為

除非呼叫方選擇另一個 `dsh` 可執行程式或 profile，否則 SDK 會啟動匹配的內建 `dsh --profile sdk` 執行時。可執行的極簡範例選擇隨附的獨立 `sdk-minimal` profile；同一執行時還會打包 `dsh web` 及其前端產物，供單獨透過 CLI 使用。每次啟動都要求顯式選擇 Harness home；Python 絕不會靜默讀取 `~/.dsh`。[SDK 參考](sdk/README.zh.md) 和 [執行時載體參考](sdk-runtime/README.zh.md) 定義執行時選擇、profile、patch 與外部外掛管理約定。

## 貢獻者工作流

[Python 貢獻者工作流](development.zh.md)介紹執行時產物建置、包驗證、原始碼模式開發和分發。
