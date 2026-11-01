# Agent Note: Issue 策略的選擇性求值

Status: implemented

[English](2026-09-07-selective-issue-policy-evaluation.md) | 中文

## 問題

資訊型 Issue 引用提供背景，解決型引用則帶有 Priority 義務。兩者都要求 Project 存取，會讓無關的看板設定或 App 可用性阻止僅提供背景的 PR（Pull Request）。在確定強制範圍之前讀取被引用 Issue，也會為不可能因策略而失敗的 PR 消耗憑證與 API 請求。

生命週期事件有獨立成本：批准、評論、推送、標籤變更或指派變更不一定需要執行 Project 狀態交接。為已知無操作的事件分配 runner，會佔用容量而不改變 Issue。

## 決策

[Issue policy](../../../../.github/workflows/issue-policy.yml)保留必需 job 與受信任的預設分支實作。強制範圍判定先於引用讀取與 Project App token 建立：草稿 PR、Bot/App 作者，以及既無評審請求也無已提交評審的人類 PR 均不需要策略驗證。

工作流在呼叫命令前檢查受信任檢出中的選擇性預檢能力標記。缺少標記的檢出對人類 PR 執行完整舊版驗證，並保留舊版 Bot/App 豁免。這支援 PR 工作流 YAML 與缺少預檢功能的預設分支程式碼配合執行；執行錯誤不會觸發退回。

強制範圍內的 PR 透過儲存庫 REST 讀取解析引用。資訊型引用無需 Project 存取即可證明 Issue 身份。只有解決型引用指向的實際 Issue 需要讀取 Project Priority；PR 編號既不能滿足 Issue 引用要求，也不會引發 Project 查詢。[所屬參考文件](../../../../.github/issue-management/README.zh.md)定義中繼資料驗證與失敗行為。

[Issue lifecycle](../../../../.github/workflows/issue-lifecycle.yml)訂閱與狀態相關的 PR 事件，並過濾僅標題編輯。它不訂閱 PR 推送、PR 標籤變更或 Issue 指派變更。job 條件在 runner 分配前排除 approved/commented 評審。請求修改的評審保留其狀態命令。

本排程決策部分取代[事件驅動評審狀態](2026-08-10-event-directed-pr-review-status.zh.md)中無操作 job 的排程方式，但不取代交接語義或人工狀態歸屬保護。[Project 區域性規劃欄位](2026-09-02-project-local-issue-planning-fields.zh.md)仍擁有對每個被引用 Issue（包括資訊型引用）僅在 PR 開啟時、僅對空值初始化 Start Date 的規則。驗證讀取豁免不豁免該生命週期 mutation。

## 考慮過的替代方案

**讀取每個被引用 Issue 的 Project 欄位。** 資訊型引用不約束 Priority，因此這些查詢只增加失敗依賴，不貢獻驗證結果。

**為批准與評論保留成功的無操作生命週期 job。** 這可以保持綠色 job 展示，卻會為沒有生命週期命令的事件分配 runner。生命週期與保留的必需策略 job 相互獨立。

**刪除必需策略 job 或重新設計檢查權威來源。** 選擇性讀取和生命週期排程可以減少可避免的工作，無需改變 GitHub 期待的必需檢查。檢查權威來源的重新設計不屬於本決策。

## 影響

僅含資訊型引用的驗證需要儲存庫存取，但不需要 Project 憑證。解決型驗證在所需 Project 讀取或欄位檢查失敗時仍會失敗。預檢與最終驗證各自讀取即時 REST 狀態，重複儲存庫請求而不快取結論。避免 Project 讀取與 token 建立不保證減少 API 請求總數。必需策略 job 仍分配 runner；它並非零成本的必需檢查。

維護者手動管理 Project 自定義 Priority 欄位。原生 Issue 欄位的 skill 指引不會更新該值。不提供 Priority 同步或欄位遷移，也不改變[不檢查展示形式的策略](2026-09-03-semantic-issue-templates-and-policy.zh.md)。

被省略的生命週期事件不能修復過時的 Project 狀態。事件重放和並行寫入仍有生命週期與規劃欄位文件記錄的競態。實際 Actions 分鐘節省與 GitHub App 實際存取權限需要運營觀察，不能從模擬 API 測試推斷。

## 驗證

[策略測試](../../../../.github/issue-management/policy.test.mjs)驗證早期豁免、僅使用 REST 的資訊型引用、實際 Issue 過濾、解決型 Priority 讀取及失敗，以及生命週期命令選擇。[工作流測試](../../../../scripts/ci-workflow.spec.ts)驗證 Project token 條件、保留的必需 job、精簡後的訂閱及 runner 級生命週期過濾。本地 fixture 不能證明實際 webhook 交付或計費結果。
