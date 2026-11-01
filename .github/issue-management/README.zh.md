---
description: "面向儲存庫維護者的 Issue 策略強制範圍、Project 存取與生命週期事件參考。"
---

# Issue 管理

[English](README.md) | 中文

## 摘要

貢獻者可以引用 Issue 作為背景，而無需讓 PR（Pull Request）驗證依賴 Project 可用性。解決型引用還會強制檢查 Project Priority。必需的 `Issue policy` job 與獨立的生命週期工作流使用受信任的預設分支程式碼。

## 目錄

- [PR 策略](#pull-request-policy)
- [生命週期事件](#lifecycle-events)
- [設定與限制](#configuration-and-limitations)
- [模組歸屬](#module-ownership)
- [驗證](#verification)
- [開發備註](#dev-note)

-----

<a id="pull-request-policy"></a>
## PR 策略

[Issue policy](../workflows/issue-policy.yml)適用於已請求評審或已有評審、非草稿且由人類建立的 PR。豁免 PR 成功結束，不解析 Issue 引用、不簽發 Project App token，也不查詢 ProjectV2。工作流在昂貴讀取前根據儲存庫即時狀態判斷強制範圍；訂閱事件仍保留必需 job。最終驗證重新讀取即時狀態：預檢不是快取結論，也不是中繼資料編輯的豁免。

選擇性預檢要求受信任的檢出中存在 [selective-preflight.json](selective-preflight.json)。缺少該標記時，工作流保留舊版行為：人類 PR 取得 Project token 並執行完整舊版驗證；Bot/App PR 跳過兩者。受支援的預檢執行失敗時，job 失敗而不退回。

強制範圍內的 PR 至少需要一個同儲存庫 Issue 引用、恰好一個規範的 `kind/*`、至少一個 `area/*`，以及最多一個 `p0`–`p3` 標籤。不支援的 kind、退役別名和 `source/*` 標籤會使驗證失敗；[標籤分類](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.zh.md)定義其含義。

- 資訊型引用（如 `Refs #3624`）提供背景。驗證透過 REST 區分 Issue 與 PR 編號，不讀取這些引用的 Project 欄位。僅含資訊型引用的 PR 可以使用自己的 Priority，無需匹配所引用的 Issue。
- 解決型引用使用關閉關鍵詞，如 `Fixes #123`、`Closes #123` 或 `Resolves #123`。驗證期間只有解析為實際 Issue 的解決型引用需要讀取 Project。PR Priority 必須匹配被解決 Issue 中的最高 Priority；帶 Priority 標籤的解決型 PR 要求每個被解決 Issue 均有 Priority。若所有被解決 Issue 的 Priority 均為空，PR 可以省略 Priority。
- HTML 註解、程式碼圍欄或行內程式碼中的引用不計入。跨儲存庫引用與指向 PR 的引用不能滿足 Issue 引用要求。

REST 讀取使用儲存庫 `GITHUB_TOKEN`。Project 驗證使用獨立的 App token，具有 Issues 和組織 Projects 讀取權限。缺少所需 Project 存取權限或欄位設定無效時，驗證失敗，而不是繞過解決型 Issue 的 Priority 檢查。

-----

<a id="lifecycle-events"></a>
## 生命週期事件

[Issue lifecycle](../workflows/issue-lifecycle.yml)獨立於 PR 驗證強制範圍修改 Project 資料。PR 開啟、重新開啟和正文編輯可將解決型 Issue 推進至 `In progress`；僅編輯標題不會。請求評審以 `In review` 為目標。請求修改的評審以 `In progress` 為目標，並遵守[人工狀態歸屬與終態保護](../../.agents/notes/implemented/process/2026-08-10-event-directed-pr-review-status.zh.md)。

僅批准或僅評論的評審不分配生命週期 runner。PR 推送與標籤變更，以及 Issue 指派變更，不觸發生命週期工作。其他已訂閱的 Issue 事件維護 Project 歸屬、狀態及審計評論；精確訂閱列表由工作流定義。

PR 開啟時，工作流按設定時區中的 PR 建立日期，為每個被引用 Issue（包括資訊型引用）初始化空的 Project `Start Date`。此生命週期操作可以新增 Project 歸屬，並需要 Project 寫權限；資訊型引用的讀取豁免僅適用於 PR 驗證。[規劃欄位歸屬](../../.agents/notes/implemented/process/2026-09-02-project-local-issue-planning-fields.zh.md)定義日期保留規則。

-----

<a id="configuration-and-limitations"></a>
## 設定與限制

[config.json](config.json)選擇儲存庫、Project、欄位名、狀態、生命週期操作者和時區。策略讀取 Project 自定義單選 `Priority` 欄位，而非組織原生 Issue Priority 欄位。維護者手動設定 Project Priority；指引編輯原生 Issue 欄位的 skill 不會填充該值。Issue 審計先移除 PR 專用 kind 標籤和已停用的標籤別名，再驗證其餘中繼資料。不提供欄位遷移或 Priority 同步。

生命週期處理由事件驅動，不是協調器。被省略的事件不會修復 Project 狀態，並行 Project mutation 也沒有原子比較並交換保護。選擇性求值不重新設計必需檢查的權威來源，也不保證已測得的 Actions 分鐘節省。[選擇性求值決策](../../.agents/notes/implemented/process/2026-09-07-selective-issue-policy-evaluation.zh.md)記錄取捨。

-----

<a id="module-ownership"></a>
## 模組歸屬

維護者直接複用所屬模組；[policy.mjs](policy.mjs)僅負責讀取事件檔案、分派命令並報告命令失敗。

<details>
<summary>實作職責</summary>

[rules.mjs](rules.mjs)擁有純驗證、引用解析、狀態決策和日期轉換。[github.mjs](github.mjs)擁有憑證選擇、REST/GraphQL 傳輸、Issue/Project 讀取，以及 Project 歸屬與欄位寫入。

[pull-request.mjs](pull-request.mjs)組裝只讀 PR 快照，並執行策略預檢和驗證，包括其工作流輸出。[lifecycle.mjs](lifecycle.mjs)複用 PR 引用讀取器與共享規則，協調 Project mutation、Issue 標籤修復和審計評論。快照讀取器不修改 GitHub；共享傳輸也支援寫入，因此匯入該模組不會限制呼叫方權限。

</details>

-----

<a id="verification"></a>
## 驗證

在儲存庫根目錄執行聚焦的無金鑰策略測試：

```sh
node --test .github/issue-management/policy.test.mjs
```

[工作流測試](../../scripts/ci-workflow.spec.ts)驗證觸發器與權限宣告。本地測試不能證明 GitHub 實際事件交付、App 安裝存取權限或實際 runner 成本；儲存庫維護者在 Actions 中驗證這些內容。

-----

<a id="dev-note"></a>
## 開發備註

無。
