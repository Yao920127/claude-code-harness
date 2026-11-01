# Agent Note: 語義化 Issue template 與不檢查展示形式的 policy

Status: implemented

[English](2026-09-03-semantic-issue-templates-and-policy.md) | 中文

## 問題

Issue 與拉取請求（Pull Request，PR）template 把資訊收集問題與評審證據混在一起，並用 `details` 元素摺疊全部內容。未使用的 frontmatter 以及獨立的 Idea 和 Research template 增加了選擇，卻沒有改變儲存庫規劃這些工作的方式。

Issue policy 還把 Markdown 展示方式當成儲存庫 metadata。對 `details` 元素、50 單位可見正文、中文標題、標題 metadata 字首和正文 `Owner:` 行的要求會產生失敗，卻不能指出缺少了哪項語義決策。

## 決策

Issue template 只覆蓋 Bug、Feature 和 Task。Bug 收集摘要、復現方式、目前行為、預期行為和環境。Feature 收集動機和行為。Task 收集摘要和交付物。除非未來的決策為 Idea 與 Research 定義不同的生命週期行為，否則它們屬於 Task。

Issue template frontmatter 只含 `name`、`about` 和 `type`。Markdown 標題定義資訊層級，HTML 註解說明每個標題下應填寫的內容。

PR template 包含 `Motivation`、在 `Changes` 中相鄰排列的公共介面與行為變化佔位說明，以及直接展示每項測試方法並在區域性 `details` 元素中放置對應證明的 `Testing` 條目。

Issue policy 不檢查 `details` 展示形式、可見正文長度、標題語言、標題字首或正文 ownership 行。其他所有 policy 檢查、警告、生命週期操作、workflow 觸發條件和 PR 強制範圍豁免均保持既有行為。這項決策不增加 metadata 自動修復、Issue 分類、資料遷移或 workflow 能力。

## 驗證

[Issue 管理測試](../../../../.github/issue-management/policy.test.mjs)固定 template 清單與標題、PR 測試結構，並驗證僅展示形式不同的標題、正文和 assignee 狀態可以透過。

## 考慮過的替代方案

**保留 Idea 和 Research template。** 它們的表單沒有建立區別於 Task 的生命週期或 policy 行為，因此獨立入口只會增加選擇，而不能保留有意義的 Type 區別。

**把展示規則保留為警告。** 這些規則會讓原本可執行的 Issue 失敗，也不能確定需求工作、預期行為或交付物是否清晰。

**增加 metadata 自動修復或 Issue 分類。** 這些行為需要新的修改規則、權限、失敗處理和執行證據。它們應作為獨立決策，而不隨 policy 簡化一同引入。

## 後果

貢獻者會看到更短的表單，其標題分別對應 Issue 資訊收集和 PR 評審所需的資訊。Policy 失敗會繼續聚焦現有的語義 metadata 檢查。

Policy 不會改寫舊標籤、選擇缺失的 Issue Type、同步 Priority 或遷移現有儲存庫資料。這些操作未來如需自動化，必須單獨決策和評審。
