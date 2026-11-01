# Agent Note: PowerShell CI 完成訊號與 profile 預期

Status: implemented

[English](2026-09-07-pwsh-ci-observable-completion.md) | 中文

## Problem

託管 coverage 作業 (run 34033367752, job 101605386802) 因持久 PowerShell send 返回 `inferred_idle` 而非 `stdin_read` 判定失敗。輸出靜默是受支援的有界推斷，不是命令完成的證明。真實 shell 測試還在輸出中查詢被回顯命令本身包含的文字，無法獨立證明命令執行。

快照作業 (run 34033367752, job 101605386868) 在成功輸出 `PWSH_OK` 後仍拒絕兩個 PowerShell 情境。其 fixture 缺少 headless profile 的策略事件與執行時上下文訊息；prompt 和工具 schema pin 也描述了更早、更小的組合。沒有 PowerShell 的主機會跳過這些案例，無法發現此類漂移。

## Decision

[真實 shell 測試](../../../../packages/terminal/terminal-bash/tests/local.spec.ts) 接受兩種受支援的就緒層級，拒絕超時和退出結算，並在 scrollback 中觀察格式化的子程序輸出，證明環境持久化、目前目錄與憑證清理。預期文字不出現在提交的命令中。私有檔案屏障將執行阻塞到靜默結算之後，只有下一次 send 結算後才釋放，證明後續輸出仍可被觀察，而不延長生產時序。工作階段釋放先於私有測試目錄刪除。

[單次](../../../../snapshots/session/pwsh-tool-turn/snapshot.yml)與[持久](../../../../snapshots/session/persistent-pwsh-tool-turn/snapshot.yml) fixture 及其擁有的 header pin 使用真實 PowerShell 可執行檔案和已錄製模型回覆，經建置後的 headless profile 重新整理。策略事件和可用工具保留在預期中；工具結果與最終回覆仍為 `PWSH_OK` 和 `DONE`。

## Alternatives considered

- 增加靜默或前臺交接超時：這會改變延遲，卻無法讓精確就緒變得確定。[持久終端決策](../feature/2026-07-16-persistent-pty-sessions.zh.md) 保留精確與推斷兩種結果。
- 接受任一等待原因，但不觀察執行：回顯輸入與延遲命令可能讓測試錯誤透過。
- 過濾策略事件或停用繼承的 headless 工具：這會隱藏組合後的 profile，而非測試它。[快照語料決策](2026-08-24-session-log-snapshot-corpus.zh.md) 保持持久化輸出與 header pin 的權威性。

## Consequences

檔案屏障案例能確定性地拒絕僅接受精確就緒的斷言，修復後的測試則在推斷結算之後證明命令效果。此證據需要真實 PowerShell；本地跳過不算驗證。聚焦的建置後回放同時檢查 Session 輸出與 header pin，不改動 normalizer。生產終端行為、時序設定與 CI 路由均不變。
