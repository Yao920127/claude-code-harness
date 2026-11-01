# Agent Note: Project 區域性 Issue 規劃欄位

Status: implemented

[English](2026-09-02-project-local-issue-planning-fields.md) | 中文

## 問題

Issue 生命週期工作流需要結構化規劃中繼資料，但組織 Issue 欄位使用的 GitHub App 權限獨立於組織 Project 權限。具有 Project 寫權限的工作流 token 可以讀取和更新 Project custom field，而 GitHub 會拒絕讀取 Issue 欄位，因此同時使用兩套儲存會讓同一策略依賴兩組獨立管理的權限。

Priority、影響面、解決代價和日期用於在 `DSH Issue Management` 中規劃工作。把這些值儲存在 Issue 上還會讓它們在該 Project 之外可見，但儲存庫沒有需要跨 Project 值的工作流。

## 決策

`DSH Issue Management` Project 使用 Project custom field 儲存 `Priority`、`Severity`、`Cost`、`Start Date` 和 `Target Date`。`Severity` 沿用組織欄位 `影響面` 的選項含義，`Cost` 沿用 `解決代價` 的選項含義。

儲存庫策略從設定的 Project 解析 `Priority` 和 `Start Date`。策略拒絕 Issue 欄位投影或錯誤的資料型別，從 Project item 讀取 Priority，並透過 `updateProjectV2ItemFieldValue` 寫入 Start Date。組織 Issue 欄位僅作為帶有 `Legacy ...` 字首的遷移源保留，儲存庫工作流不會讀取它們。

PR 策略工作流使用儲存庫 `GITHUB_TOKEN` 執行 REST Issue 和 PR 讀取，並使用僅有儲存庫 Issues 與組織 Projects 讀取權限的 GitHub App token 執行 ProjectV2 查詢。生命週期 mutation 繼續使用有寫權限的 App token。

Issue 生命週期工作流僅在 `pull_request.opened` 時初始化 `Start Date`。工作流讀取 PR 的即時正文，保留每個能解析為 Issue 的同儲存庫引用，把 `created_at` 按設定的 Project 時區轉換為日曆日期，確保 Issue 是 Project item，並僅在目前 Project 值為空時寫入日期。

[組織欄位實作](../../archived/process/2026-08-31-pr-opened-issue-start-dates.md)記錄了已被取代的跨 Project 所有權決策及其事件時機依據。由事件直接指定的 Status 轉換仍由[生命週期決策](2026-08-10-event-directed-pr-review-status.zh.md)負責。

## 驗證

[Issue 管理測試](../../../../.github/issue-management/policy.test.mjs)要求 Priority 和 Start Date 使用 Project custom field，證明儲存庫讀取與 Project 讀取使用不同憑證，覆蓋上海時區日期邊界、僅 opened 分派、空值寫入、已有值保留和 Project item 缺失，並固定 `updateProjectV2ItemFieldValue`。工作流測試固定 Project token 的只讀權限。刪除組織欄位前必須逐項比較所有舊欄位值與 Project 值，包括已歸檔的 Project item。

## 考慮過的替代方案

**保留組織 Issue 欄位。** 它們可以讓一個值在多個 Project 中可見，但工作流不需要該範圍，並且 GitHub App 還需要單獨的組織 Issue Fields 權限。

**同時寫入 Issue 和 Project 欄位。** 映像欄位保留跨 Project 可見性，但每個寫入方和人工編輯都可能產生偏差，並且還需要協調策略。

**處理每個已訂閱 PR 事件或覆蓋 Start Date。** 後續事件可以修復缺失日期，但會在工作開始後才賦值或替換人工計劃。因此初始化器保留僅 opened、僅空值的行為。

## 後果

規劃中繼資料限定在一個 Project 歸屬中。同一個 Issue 可以在另一個 Project 中使用不同的值，`DSH Issue Management` 之外的 Issue 沒有 Project 區域性規劃值。

GitHub App 透過 Project 權限而不是組織 Issue Fields 權限存取策略中繼資料。欄位改名或型別變化會讓工作流失敗，而不會退回到舊欄位。

空值讀取使通常的重試保持冪等。Project 欄位更新沒有比較並設定前提，因此同時引用同一個 Issue 的 PR 可能都會觀察到空的 Start Date，最後一次 mutation 可能勝出。
