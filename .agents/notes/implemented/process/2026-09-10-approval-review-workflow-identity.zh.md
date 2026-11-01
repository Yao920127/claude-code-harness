# Agent Note: 按檔案路徑識別審批評審工作流

Status: implemented

[English](2026-09-10-approval-review-workflow-identity.md) | 中文

## 問題

GitHub 可能用展開後的 `run-name` 填充工作流執行的 `name`。審批評審工作流在該標題中包含拉取請求編號，因此將 `workflow_run.name` 與靜態工作流名稱比較，會在重新整理審批狀態前拒絕有效的評審事件。

## 決策

[審批發布器](../../../../.github/review-ownership/check-approval.mjs) 按精確的 `workflow_run.path` 識別評審事件工作流。它還要求該執行由 `pull_request_review` 觸發且成功完成，從 `display_title` 解析拉取請求編號，驗證提供的拉取請求關聯，並在計算審批結果前將拉取請求目前的頭提交與已評審的頭提交進行比較。

## 考慮過的替代方案

**接受名稱字首。** 顯示名稱無法識別工作流檔案；另一個工作流可以使用相同的標題。

**刪除帶編號的執行標題。** 當 GitHub 返回空的 `pull_requests` 陣列時，標題提供拉取請求編號。刪除它需要另一種傳遞機制。

## 影響

執行標題的展開不會阻止審批重新整理，而非預期的工作流檔案仍無法透過驗證。移動評審事件工作流時，需要更新發布器預期的路徑。

[審批策略測試](../../../../.github/review-ownership/check-approval.test.mjs) 覆蓋帶編號的執行名稱、無效的來源路徑和事件、未成功的執行、無效標題以及已被替代的頭提交。[審批結果策略](2026-09-09-blocked-weighted-approvals-remain-pending.zh.md) 繼續負責待定與成功狀態的語義。
