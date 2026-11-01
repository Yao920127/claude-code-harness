# Agent Note: 按包錨定的子系統頁面與精簡的分組 README

Status: implemented

[English](2026-08-03-package-anchored-subsystem-pages.md) | 中文

## 問題

[子系統目錄](../../archived/process/2026-06-20-core-data-structures-catalog.md)最初用主幹-vs-seam 規則界定首頁範圍：如果迴圈在每個輪次都持有、派生、流式傳輸或記錄某個型別，它就是「核心」。該規則選擇的是型別而非包，因此當目錄增長到四十多頁後，首頁變成了跨包大雜燴：LLM（大語言模型）對話詞彙排在 agent（智慧代理）約定之前，建立/所有權詞彙（`AgentHandle`、`CreateAgentOptions`、`ResumeAgentOptions`、`AgentFactory`）在目錄中無處記錄（生成器把它們豁免給了某個包 README），讀者無法根據型別所在位置預測哪一頁記錄它。與此同時，各包分組 README 沒有統一形狀——有的帶分節表格、遊離的設計短文，或本應屬於子系統頁面的尾部段落。

## 決策

每個 `docs/subsystems/` 頁面錨定到宣告其詞彙的包或包分組，頁面歸屬跟隨儲存庫佈局：[core.md](../../../../docs/subsystems/core.zh.md) 是 `packages/core` 的頁面（建立與所有權、`Agent` 控制代碼及其投遞/取消/攔截約定、指向該組專屬頁面的連結），[llm-streaming.md](../../../../docs/subsystems/llm-streaming.zh.md) 完整涵蓋 `packages/llm`，依此類推。全倉通用型別模式（`…Map → 派生聯合`、品牌化 id）保留在 core.md 一個明確標註的收尾小節中，而不是與包內容交錯。這在*頁面範圍界定規則*的意義上取代了主幹-vs-seam 規則；存活下來的放置啟發式更簡單：型別記錄在其宣告包對應的頁面，相關實作機制仍集中記錄在其所屬頁面。

生成簽名引用的每個型別都必須能在目錄中某處解析：agent 所有權詞彙從生成器的 `TYPE_LINK_EXEMPTIONS` 移入 `LINK_MAP → core.md`，因此豁免只留給確實僅用於服務內部或來自 vendored 程式碼的型別結構。每個貼上的宣告只有一個家（`SessionEvent` 位於 [session.md](../../../../docs/subsystems/session.zh.md)；core.md 概括並連結）。

每個 `packages/<group>/README.md` 配對都是統一形狀的精簡入口：一段先說明「為什麼」的介紹、一張包表格（包 / 角色 / ctx 鍵）、一個指向對應子系統頁面的收尾連結。未宣告獨立子系統參考資料的分組會在 `GROUPS_WITHOUT_SUBSYSTEM_PAGE` 中附上非空理由。如果承載關鍵資訊的正文超出這一結構所能容納的範圍，就將其遷移到對應的子系統頁面，而非刪除。

`verify-subsystem-pages` 同時從分組 README 和子包 manifest（中繼資料清單）發現分組。它會拒絕缺少分組 README、分組既沒有面向讀者且直接指向 `docs/subsystems/` 下某一個英文件案的連結也沒有顯式豁免、豁免為空或成為孤立項、已豁免分組新增連結，以及連結指向的頁面不存在；程式碼、註解、圖片、巢狀路徑和路徑穿越都不能滿足所有權宣告。該檢查作為獨立的 `doc-sync`（文件同步）葉節點執行，因此新增包分組時不能悄悄遺漏其文件擁有方。

[子系統 README](../../../../docs/subsystems/README.zh.md) 在中英文兩側索引目錄中的每一頁；`scripts/project-doc-site.spec.ts` 強制每個頁面對應一個表格行，因此新增或合併吸收的頁面無法悄悄缺席索引。

## 考慮過的替代方案

**保留主幹-vs-子系統界定規則。**它逐型別回答「這個型別是核心嗎？」，這正是首頁積累了四個包的型別、卻缺失 `packages/core/agent` 一半公開介面的原因。按儲存庫佈局進行預測的方案勝出。

**扁平的單文件目錄。**在[原目錄 Agent Note](../../archived/process/2026-06-20-core-data-structures-catalog.md) 中已被否決；增長到四十一頁證實了該結論。

**只在包 README 中記錄所有權詞彙（豁免的現狀）。**這讓 `AgentHandle` 與建立/恢復選項在自稱型別參考的目錄中不可見，生成的 `Types:` 頁尾也無法連結它們。

## 後果

- 哪一頁記錄某型別可由 `packages/<group>/` 預測；子系統 README 是由測試強制的完整索引。
- 每個包分組都會將其子系統擁有方或合理的缺席原因暴露給評審，且 `verify-subsystem-pages` 會拒絕未分類的新增項和陳舊豁免。
- 生成的簽名頁尾連結 agent 所有權詞彙，而不是靜默豁免。
- `verify-type-equiv` 的 1:1 manifest（中繼資料清單）保證每個貼上單一歸屬；重複的 `SessionEvent` 貼上已移除。
- [原目錄 Agent Note](../../archived/process/2026-06-20-core-data-structures-catalog.md) 仍擁有 `ts type-equiv` 漂移檢查機制；此處僅取代其頁面範圍界定規則。
