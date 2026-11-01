# Agent Note: 極簡 profile 只提供持久 shell

Status: implemented

[English](2026-09-03-minimal-profiles-persistent-shell-only.md) | 中文

## 問題

隨附 Web `minimal` preset 與獨立 `sdk-minimal` profile 在持久 shell 之外還提供 `str_replace_editor`。Shell 已經可以檢查和修改檔案，editor 仍會為每個極簡模型請求增加第二種檔案修改介面及其完整 schema。它還要求掛載一個專用 `fs-local` 服務，而兩份極簡組合中的其他設定項都不使用該服務。

只使用持久 shell 可以為模型提供一致的檔案操作介面，並讓 harness 組合與這一介面保持一致。如果保留 editor 的掛載，只透過呈現層過濾隱藏它，那麼呈現設定變化時，該能力仍可能重新出現。

## 決策

隨附的極簡組合只提供一個按平臺選擇的持久 shell：Linux 與 macOS 使用 `bash`，Windows 使用 `pwsh`。兩份組合都不掛載 `@deepseek-ai/dsh-tool-str-replace-editor`、檔案系統工具或支撐 editor 的 `fs-local` 服務。固定的 complete persona、執行時上下文與 compaction 的缺失、shell 超時和各啟動路徑的主機服務保持不變。

獨立 editor 包仍可用於顯式自定義組合。受信任的使用者自定義 preset 或更高優先順序的 profile patch 必須將 editor 插入 Cordis tree，並在同一服務作用域內提供檔案系統後端；隨附的 `minimal` 與 `sdk-minimal` 預設組合不會插入它。[Python SDK 指南](../../../../docs/user/guide/python-sdk.zh.md#opt-in-to-str_replace_editor)提供可執行的 patch 範例。

共享的[持久 Bash 消費方](../../../../packages/shell/tool-bash-persistent/README.zh.md#model-experience)保留跨呼叫狀態，並採用單次 shell 的命令狀態文案。完成的命令追加 `[Command finished with exit code N]`，成功時也包含該標記；超時輸出包含 `[Command timed out or OOM]` 和 shell 重置說明。追加狀態標記前會移除輸出末尾的全部換行。兩份極簡 Bash 描述都說明網路存取取決於任務環境。使用該消費方的顯式組合共享相同的輸出行為。持久 Bash 和 PowerShell 在 shell 清理完成後才結束已取消命令，由現有 ToolRuntime 釋出 `ABORTED`，不把使用者取消物件轉成字串。排隊期間被取消的呼叫不傳送命令，執行或清理失敗仍保留各自的錯誤。

精確組合測試會斷言單工具清單以及 preset 內不存在檔案系統服務。`sdk-minimal` bundle 測試與建置後設定轉儲會斷言設定項和依賴 allowlist 都不含 `fs-local` 或 `dsh-tool-str-replace-editor`。Web 與打包 Python 的模型可見快照會固定單工具 schema 清單。SDK profile 冒煙測試會執行指南中的 editor patch，並驗證檔案建立和檢視。

本決策部分取代[極簡裸執行時](../feature/2026-08-11-minimal-profiles-bare-two-tool-runtime.zh.md)中的工具選擇，以及[base 編輯器決策](2026-09-05-base-default-file-editor.zh.md)中的極簡例外。這些 Agent Note 繼續負責提示詞所有權、無 compaction 行為和基於 base 的檔案編輯。[應用架構](../../../../docs/architecture.zh.md)負責 profile 啟動與 bundle 分層。

## 考慮過的替代方案

**保留 editor 設定項並隱藏其 schema。** 不予採用，因為呈現層或限制層會讓該能力繼續留在極簡組合中，並使其缺失依賴另一項設定。

**從發行物中刪除 editor 包。** 不予採用，因為顯式自定義組合仍是有效消費方。本需求只涉及兩份隨附的極簡預設組合。

**只在 `sdk-minimal` 中保留 editor。** 不予採用，因為兩條極簡路徑會向同類模型提供不同的工具約定，而且打包 SDK 路徑仍會承擔 schema 成本和未被其他設定項使用的檔案系統服務。

## 後果

極簡 agent 透過持久 shell 檢查和修改檔案。模型請求只攜帶一個工具 schema，組合不擁有檔案系統服務。editor 包和顯式 editor 組合仍然可用。Web 與 SDK 回放快照會同時固定持久 Bash 的狀態標記、shell 狀態和檔案操作結果。
