# Agent Note: 安裝後 Python wheel 黑盒拉取請求驗證

Status: implemented

[English](2026-08-23-installed-python-wheel-black-box-ci.md) | 中文

## Problem

Python SDK 單元測試驅動 fake peer，而打包執行時工作流可以在兩個 Python distribution 尚未生成時，用原始碼 SDK 驅動新建置的可執行檔案。乾淨虛擬環境只覆蓋預設與 MCP 情境，必需的拉取請求 CI 也只建置 Linux x64。因此，原始碼 checkout、editable install、不匹配的 SDK／執行時組合、損壞的原生 wheel 包、平臺相關閉包或真實提供者整合都可能繞過阻止合併的證據。

## Decision

### 安裝產物邊界

必需的 Python 執行時工作流先建置純 SDK wheel 包與各平臺執行時 wheel 包，再進行行為測試。每個原生目標都把這兩個本地檔案安裝進新的 Python 3.10 虛擬環境，切換到儲存庫外的臨時目錄，清除 `PYTHONPATH` 與 `DSH_RUNTIME_MODE`，並且只呼叫公開 Python 模組與打包後的可執行檔案。

黑盒測試會拒絕非 venv 程序、儲存庫內工作目錄、原始碼或 editable import、不相等的 distribution 版本、未精確固定執行時版本的 SDK 依賴、位於已安裝執行時包之外的可執行檔案，以及未出現在執行時 distribution 記錄中的可執行檔案。該來源驗證發生在首個 agent 請求之前，因此行為透過也不能掩蓋實際執行了錯誤程式碼。

### Keyless 行為

每個目標都會在安裝後執行完整的打包執行時情境。一個本地 SSE mock 模型提供確定性輸出，公開 SDK 則覆蓋預設 SDK profile、有序 patch overlay、透過 `dsh plugin` 安裝外部 bundle、持久 PTY 與 editor 行為、PTC Node 程式與 workflow 執行、基於 ripgrep 的搜尋、外部 stdio MCP 發現與執行、模型可見及持久化快照、Zstandard 持久化、直接 JSON-RPC 與關閉。Restart 快照針對同一持久化根目錄啟動兩個完整 SDK 執行時程序，並固定其彼此隔離的模型歷史、高層結果與獨立持久日誌。安裝後執行取代 wheel 建置前的原始碼 SDK 執行，因此可執行檔案與 wheel 包共同接受一次驗證，而不是維護兩套行為清單。

Linux 另外保留 manylinux 2.28 乾淨安裝冒煙測試與 GLIBC 檢查。macOS 保留部署目標與原生 helper 檢查。這些平臺約束補充共同黑盒行為，不能替代它。

### 真實 DeepSeek API

可信拉取請求與 master 推送會在各自選定的原生目標上執行第二項安裝後 wheel 檢查，並且只在預檢與 live 測試步驟中把 `DEEPSEEK_API_KEY_EXTERNAL` 對映進去。金鑰為空時預檢失敗，因此提供者測試不能透過自行 skip 產生假綠。該測試透過公開 SDK 存取 `https://api.deepseek.com`，要求模型透過目前平臺 shell 寫入內容精確的 sentinel 檔案，再在同一 session 的第二個輪次中讀取它，並驗證外部檔案行內容、最終回應、已完成的輪次結束原因、模型請求的工具呼叫，以及 session 日誌存在且採用 Zstandard framing。解碼後的記錄內容與已完成輪次的永續性是由 restart 快照負責的確定性 keyless 要求，不從壓縮後的 live 提供者位元組推斷。

Fork 與 Dependabot 拉取請求永遠不會獲得儲存庫金鑰。它們的原生 job 執行完整 keyless 路徑並跳過兩個帶金鑰的步驟；禁止使用 `pull_request_target`，因為它會讓不可信程式碼帶著金鑰執行。

### 必需目標

拉取請求的 `python-runtime` job 針對 Linux x64 與 Windows x64 呼叫可複用建置器；master 推送根據[僅 master 平臺策略](../process/2026-09-06-master-only-platform-ci.zh.md)選擇 Linux arm64 與兩種 macOS 架構。其聚合結果仍是 `all checks passed` 的依賴項，因此任一原生載體失敗、取消或缺失都會阻止必需判定透過。[sdk-runtime README](../../../../python/sdk-runtime/README.zh.md) 負責 Windows 目標及其 PowerShell 專屬極簡快照。

## Existing decisions and supersession

本決策取代已歸檔的[必需 Python 執行時拉取請求驗證](../../archived/testing/2026-08-12-required-python-runtime-pull-request-ci.md)中的單目標拓撲，同時保留真實可執行檔案、快照、wheel 包與乾淨安裝必須在各選定目標的檢查中相遇的要求。[docs/architecture.md](../../../../docs/architecture.zh.md) 負責啟動應用與自定義介面；[單檔案 Python SDK 執行時 distribution](../architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md)繼續負責 SEA 打包、原生 sidecar、wheel 包標籤與釋出產物。

## Alternatives considered

**只保留 Linux x64 必需載體。** 否決：五個已釋出目標的原生 addon、可執行檔案建置、wheel 包標籤與 helper 檔案不同。等到釋出時才發現問題，對每個 Python SDK 安裝都會按平臺選擇的產物而言太晚。

**在 wheel 建置前執行完整行為，並保留兩個很小的安裝後冒煙測試。** 否決：這隻能證明可執行檔案配合原始碼 import 工作，再透過 distribution 證明很少的行為。乾淨安裝環境是在同一批情境中驗證使用者實際安裝內容的更強位置。

**只使用 keyless 模型模擬。** 否決：本地 SSE endpoint 不能證明真實提供者的認證、請求相容性、流式輸出、工具呼叫解釋或完整輪次。

**透過 `pull_request_target` 向 fork 拉取請求暴露金鑰。** 否決：任意 fork 程式碼都可以竊取儲存庫金鑰。不可信 ref 缺少帶憑證證據是明確且保留安全性的結果；可信 head 與合併後提供者 CI 繼續提供 live 訊號。

## Consequences

每個拉取請求都會承擔兩個原生可執行檔案及 wheel 包建置，並執行確定性的安裝後產物情境。可信的同儲存庫拉取請求還會在每個目標上承擔一次雙輪 DeepSeek 任務。相應地，必需結果描述 Python 使用者實際安裝的檔案，在合併前證明選定載體，並且不能透過匯入 checkout 或靜默跳過真實提供者而透過。
