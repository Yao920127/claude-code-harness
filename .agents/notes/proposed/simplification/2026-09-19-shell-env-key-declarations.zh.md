# Agent Note: 讓 shell 環境宣告只負責鍵所有權

Status: proposed

[English](2026-09-19-shell-env-key-declarations.md) | 中文

## 問題

[shell 環境註冊表](../../../../packages/shell/shell-env/src/index.ts) 要求每個宣告變數提供描述，並暴露 `list()` 列舉它。執行時收集僅使用貢獻方身份、宣告鍵和解析後的值。[Bash](../../../../packages/shell/tool-bash/src/index.ts) 與 [PowerShell](../../../../packages/shell/tool-pwsh/src/index.ts) 呼叫 `collect`；[Web 組合包](../../../../packages/bundle/web-app/src/index.ts) 貢獻 `DSH_WEB_URL`。搜尋未發現 `list()` 的固定生產呼叫方或其描述的消費方。

但該方法可透過 [Cordis 檢查提供者](../../../../packages/extensions/tool-cordis/src/providers.ts) 發現，因此這是顯式 API 收縮，而非刪除不可達程式碼。[最初的身份與日誌位置記錄](../../archived/feature/2026-07-10-agent-session-identity-and-log-location.md) 預期它會服務於診斷以及未來提示/UI 消費方。目前 TODO 與 [README 限制](../../../../packages/shell/shell-env/README.zh.md) 仍描述一個未包含內建變數的不完整目錄。

## 提案

將貢獻方宣告表示為顯式只讀鍵集合。刪除描述物件、`BashEnvVariable`、`BashEnvVariableInfo`、`list()`、僅針對描述的驗證，以及完整目錄 TODO。同時更新 Web 貢獻方、README 配對與生成的服務/型別宣告。

保留 `register`、`collect`、保留鍵、所有權衝突、拒絕未宣告輸出、確定性的環境輸出和 effect 釋放。[PowerShell 對齊決策](../../implemented/feature/2026-08-02-pwsh-tool-bash-parity.zh.md) 繼續擁有共享註冊表及兩個 shell 消費方。提案刪除一個公共方法、兩個中繼資料型別及其驗證/列舉測試；在少量鍵成員判定適應前，已定位可刪除約 32 行原始碼。

## 考慮過的替代方案

**補完診斷目錄。** 這會在沒有明確目前產品需求的情況下增加內建中繼資料及消費能力。提案選擇放棄宣告式環境描述和列舉；實際 shell 環境值仍可透過執行獲得。

**刪除 `list()` 後保留描述。** 否決，因為描述將沒有剩餘讀取方，卻仍給每個貢獻方增加負擔。鍵所有權宣告應獨立於展示中繼資料保留。

## 驗收標準

- 實作前重新檢查固定呼叫方、記錄、通用檢查與目前產品要求；若已有實際診斷消費方需要，則保留 API。
- 貢獻方宣告鍵而無需描述物件。重複名稱、保留鍵、跨貢獻方衝突、未宣告輸出及釋放保持原有行為。
- Bash 與 PowerShell 獲得等價的環境對映，包括 Web URL 和 Session 身份；不改變金鑰處理或繼承環境策略。
- 執行註冊表、Web 貢獻方與 shell 整合測試；重新生成並驗證檢查目錄及受影響的檢查輸出記錄；更新兩個 README，執行 typecheck、doc-sync（文件同步門禁）和 lint。

## 風險

模型編寫的外掛與外部外掛已經能夠發現和呼叫 `list()`。它們會失去不執行解析器的列舉能力，並需要修改貢獻方宣告。只有預期的診斷能力仍無歸屬時，這種穩定前 API 損失才可接受；不能將 `collect()` 宣稱為等價診斷替代。
