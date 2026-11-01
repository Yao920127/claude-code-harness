# Agent Note: Session 重構常見問題

Status: proposed

[English](2026-09-10-session-refactor-faq.md) | 中文

## Problem

`LogicalSession`、service、storage、projection 與 query 容易被理解成重新命名或多餘層次。貢獻者需要短答案區分臨時命名、長期職責和目前 stack 狀態。

## Proposal

### 為什麼叫 `LogicalSession`？

第一，`Session` 已被現有具體類佔用。遷移期使用新名字避免抽象與相容實作衝突。儲存庫程式碼遷到 `LogicalSession`，外部開發者仍可使用 deprecated `Session`；移除相容入口後，再討論是否把 `LogicalSession` 改名回 `Session`。這不是目前階段的前置決定。

第二，`Logical` 命名的是工作階段的身份、事件、surface 與 append 同「儲存、列舉或釋出該工作階段」這些物理工作之間的分離。邏輯工作階段是消費方讀取與追加的物件；storage/query 可以在沒有 live 邏輯工作階段時處理 durable session 記錄。

### 具體 `Session` 是否立刻禁止？

不是。過渡期不推薦新程式碼依賴它。階段 1 明確保留公開類、`Session.create` 與 `Session.fromRestore`，相容現有外部呼叫方。儲存庫生產程式碼統一使用 `LogicalSession`；專門相容測試會保護 deprecated 入口，直至後續移除決策具備外部遷移證據與釋出邊界。

### `SessionService` 與 `SessionStorage` 有何不同？

`SessionService` 是邏輯工作階段入口和 live identity authority。`SessionStorage` 是物理持久化協定，負責 reader/writer、格式、遷移、租約與 I/O。應用功能向 service 要邏輯工作階段，不向 storage 要業務物件。

### Projection 在哪裡？

`SessionProjectionPort` 觀察規範事件併產生 title、summary、統計、列表中繼資料和搜尋文件等讀模型。Projection 可重建、不擁有 Session 寫入，也不能成為 durable source of truth。service 管理註冊、flush 與生命週期，使 live 和 cold 路徑共享語義。

### 為什麼沒有 `SessionSearch` 或 `SessionStats`？

`SessionQuery` 已覆蓋精確讀取、過濾、trace、全文檢索、列表中繼資料和統計讀取。搜尋索引與統計聚合是 query 背後的 projection/provider，不需要再增加兩個公共服務。

### 普通使用者需要遷移嗎？

階段 1–3 不改變磁碟格式或啟動方式，使用者無需手工遷移。受支援舊格式在首次開啟時由 format catalog 遷移；查詢索引等派生資料由系統重建。

### 目前完成到哪裡？

階段 1 建立公開邏輯工作階段介面；階段 2 集中服務所有權；階段 3 在階段 2 的基礎上分離儲存讀取器與寫入器。前三個階段的草稿已齊備，但階段 4–5 和記憶體 provider 抽取尚未完成。

### 我怎樣參與？

按[開發者遷移規則](2026-09-10-session-developer-transition.zh.md)的閱讀順序熟悉總覽、目標協定、目前子系統文件和實作階段。選擇一個明確消費方，把型別和入口遷到抽象，補合約測試，並避免同時改變生命週期或 durable format。

## Alternatives considered

**現在就把 `LogicalSession` 改名為 `Session`。** 拒絕，因為舊具體類仍在過渡期使用，會造成含義衝突並擴大 diff。

**把介面命名為 `SessionRuntime`。** 拒絕，因為[新增包指南](../../../../docs/cookbook/adding-a-package.zh.md)中的包命名錶把 `Runtime` 保留給執行即時工作並擁有分發、取消或操作生命週期的元件；該介面只持有一個工作階段的身份與日誌，不執行任何東西，這個名字會被讀作執行環境。

**把 FAQ 混入協定正文。** 拒絕，因為快速解釋命名與遷移狀態會掩蓋協定義務；FAQ 只導航到規範 owner。

## Acceptance criteria

- 新貢獻者能解釋邏輯工作階段、service、storage、projection 與 query 的不同責任。
- FAQ 清楚說明命名是過渡選擇，最終是否改回 `Session` 留待遷移完成後決定。
- 每個答案連結或服從一個規範 owner，不複製完整協定。

## Risks

FAQ 會隨 stack 推進過時。每個階段更新總覽狀態時必須同步檢查本頁；實作事實仍以目前 branch 的型別、測試和子系統文件為準。
