# Agent Note: minimal profile 使用裸執行時

Status: implemented

[English](2026-08-11-minimal-profiles-bare-two-tool-runtime.md) | 中文

## 問題

Web `minimal` preset 與獨立 JSON-RPC minimal 組合對外提供持久 `bash` 和 `str_replace_editor`，但支撐服務與目標訓練執行時不一致。兩者都掛載上下文壓縮，而 Web preset 繼承主機的沙箱檔案系統，JSON-RPC 組合則掛載 `fs-sandbox` 和檔案系統策略。因此，長工作階段可能替換歷史記錄，編輯器也會宣告並實施裸本地參考執行時並不具備的檔案系統策略。

兩條啟動路徑的設定所有者也不同。Web 在已執行的主機上掛載逐 agent preset，Python SDK 則初始化一個完整的 stdio JSON-RPC 子程序。將二者視為可互換的同一個 Cordis leaf 會掩蓋生命週期差異，而且 SDK 範例沒有透過環境選擇模型或系統提示詞的入口。

## 決策

隨附 Web minimal preset 對外提供持久 `bash`；獨立 profile 在 Linux／macOS 上提供持久 `bash`，在 Windows 上提供 `pwsh`。兩者都不掛載上下文壓縮或檔案系統提供者，併為新建工作階段抑制每個 `dsh-system-prompt` runtime-context 貢獻。[僅持久 shell 決策](../simplification/2026-09-03-minimal-profiles-persistent-shell-only.zh.md)從兩份組合中移除了編輯器及其原本除此之外無人使用的 `fs-local` 提供者。Web preset 的 persona 繼續採用較早的 [minimal preset 組合決策](../../archived/bug-fix/2026-08-10-minimal-preset-owns-rl-composition.md)所擁有的固定 complete 提示詞，並僅為該 agent 作用域實施 runtime-context 抑制。獨立 spine 將同一設定轉發給其程序擁有的 system-prompt 服務。Web 主機保留沙箱與批准服務；獨立 profile 掛載 danger-full-access 沙箱策略，不掛載批准服務。兩者都不貢獻面向模型的策略上下文。

獨立的 [`@deepseek-ai/dsh-sdk-minimal` 組合包](../../../../packages/bundle/sdk-minimal/README.zh.md)仍是 `dsh --profile sdk-minimal` 後面的完整 JSON-RPC 程序組合。它掛載 SDK 啟動與 JSON-RPC 服務、按平臺選擇的持久 shell 所需的本地 PTY 和子程序服務、該 shell 的工具消費方，以及位於 `$DSH_HOME/sessions` 的未壓縮 JSONL 持久化。它不掛載 `token-meter`、`compaction-basic`、`fs-local`、`fs-sandbox`、`fs-observation-policy` 或檔案系統工具。持久 shell 消費該 profile 的 danger-full-access 沙箱策略。[docs/architecture.md](../../../../docs/architecture.zh.md) 負責該組合包的位置及其與 `dsh-base` 的分離。

`DSH_SYSTEM_PROMPT` 選擇獨立組合的 persona，`DSH_CONTEXT_WINDOW` 為沒有確切目錄中繼資料的模型提供後備容量。SDK 用戶端的 JSON-RPC `initialize` 請求是唯一執行時模型選擇。[`minimal.py`](../../../../python/sdk/examples/minimal.py)可以只把 `DSH_MODEL` 讀作命令的預設 `model` 參數；顯式 `--model` 不需要匹配的子程序環境值。端點與憑證變數繼續由 DeepSeek 介面卡現有的環境解析路徑持有。

## 驗證

Web 回放會啟動完整 Web 主機，透過 preset 服務建立 agent，並斷言不存在作用域檔案系統或壓縮服務、沒有追加 system-prompt 擁有的 runtime-context 訊息，而且組裝請求只包含固定提示詞與持久 Bash。隨後，它透過真實作用域服務執行持久 Bash。

SDK keyless 原始碼測試啟動真實 `dsh --profile sdk-minimal`，使用環境選擇的提示詞完成一個回合，並斷言生成的單組合包 manifest。Python SDK 打包執行時快照固定組裝提示詞、精確單工具目錄，並固定不存在任何 system-prompt 所擁有的 runtime-context 訊息。打包執行時覆蓋會透過每種可用載體，使用環境選擇的模型、模型容量和提示詞值初始化獨立 profile，然後執行所選持久 shell。Cordis 驗證會檢查兩份設定能否解析宣告的外掛和設定欄位。

## 考慮過的替代方案

**以較高閾值保留 `compaction-basic`。** 不予採用，因為即便提供者在短測試中未觸發，較長工作階段仍允許替換歷史記錄，而且 minimal 組合仍會依賴模型容量中繼資料與 token meter。

**移除編輯器後保留 `fs-local`。** 不予採用，因為兩份 minimal 組合都沒有其他檔案系統消費方。保留該提供者只會擴大執行時清單，不會新增模型可見能力。

**為 Web 與 Python SDK 啟動使用同一個 Cordis leaf。** 不予採用，因為 Web preset 向現有多工作階段主機貢獻 agent 作用域服務，而 Python SDK 必須啟動包含 JSON-RPC 伺服器及其程序級依賴的完整程序。

**把請求模型映像到 `DSH_MODEL`。** 不予採用，因為直接介面卡接受不在建議目錄中的模型 id，併為它們解析後備上下文中繼資料。映像會為同一項選擇製造兩個輸入；SDK 初始化請求具有權威，`DSH_MODEL` 只保留為 `minimal.py` 的便捷預設值。

## 後果

Minimal 工作階段不會摘要或替換較早歷史，也不會新增 runtime-context 快照；呼叫方必須讓工作階段輪次保持在所選模型的上下文容量內，且不得依賴模型可見的常駐沙箱或批准策略說明。兩條啟動路徑共享單工具、無檔案系統、無上下文與無壓縮保證，同時保留適合各自所有者的不同提示詞和模型設定。Python SDK 路徑只透過內建 `dsh` stdio JSON-RPC profile 通訊。
