# Agent Note: 阻塞中的加權批准保持 pending

Status: implemented

[English](2026-09-09-blocked-weighted-approvals-remain-pending.md) | 中文

## 問題

`weighted approval` commit status 必須區分尚未滿足的合併條件與失敗的策略評估。具有寫權限的評審人所提交且仍然生效的 `CHANGES_REQUESTED` 評審會阻止 PR 滿足批准策略，但它是一種可撤銷的評審狀態，而不是評估故障。

為這種評審狀態釋出 `failure` 會混淆批准決策與 publisher 的健康狀態。它還會讓一個尚未滿足的策略條件區別於 draft PR 或批准點數不足；後兩種情況在貢獻者能夠解決問題期間會保持 pending。

## 決策

完成的加權批准評估會在 PR 為 draft、批准點數少於要求，或具有寫權限的評審人存在仍然生效的 `CHANGES_REQUESTED` 評審時釋出 `pending`。阻塞性評審的優先順序高於點數總和，因此即使計入的批准已經達到閾值，狀態仍保持 pending。

只有在 PR 已進入 ready 狀態、達到點數閾值且不存在阻塞性評審時，評估才釋出 `success`。獨立的 `weighted approval publisher` Actions job 報告評估和狀態釋出是否完成。評估故障會發布 `error` commit status，並使該 job 失敗。

## 驗證

[批准策略測試](../../../../.github/review-ownership/check-approval.test.mjs)鎖定已達到閾值但仍有 blocker 的情境，以及準確釋出的 `pending` payload。[工作流測試](../../../../scripts/ci-workflow.spec.ts)鎖定獨立的 publisher job 名稱。

## 考慮過的替代方案

**為阻塞性評審釋出 `failure`。** 該方案會在評審改變之前保持明顯的失敗狀態，但它會把尚未滿足且可撤銷的合併條件表示為故障，並混淆策略結果與 publisher 的健康狀態。

**允許批准點數覆蓋阻塞性評審。** 該方案會讓分數成為唯一的成功條件，但也允許在具有寫權限的評審人仍然有效地要求修改時釋出成功狀態。

## 後果

需要該狀態的分支規則會阻止 PR，因為 `pending` 不滿足必需狀態。貢獻者可以區分尚待處理的評審工作與失敗的批准評估，而 publisher job 和 `error` 狀態保留執行故障訊號。

消費方不會僅因存在阻塞性評審而收到失敗的 commit status。如果需要區分 blocker 與其他 pending 批准條件，它們必須檢查狀態描述或仍然生效的評審。
