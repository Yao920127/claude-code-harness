# Agent Note: 僅透過檔案系統提供者讀取指令檔案

Status: proposed

[English](2026-09-19-provider-only-instruction-reads.md) | 中文

## 問題

[指令發現](../../../../packages/context/agent-instructions/src/files.ts)為中繼資料探測、根標記發現和有界讀取維護了提供者與直接 Node 兩條路徑。`nodeStatFile`、`nodeTextChunks` 和可選的提供者/目標欄位支援後者。匯出的 `discoverBaselineInstructionFiles` 包裝函式選擇該路徑；`loadBaselineInstructions` 則允許呼叫方透過省略提供者來使用它。

儲存庫中的每個生產呼叫方都傳入提供者。[外掛](../../../../packages/context/agent-instructions/src/index.ts)讀取 `ctx.get('fs')`，缺失時直接返回；[協調邏輯](../../../../packages/context/agent-instructions/src/state.ts)要求傳入 `FileSystem`。直接 Node 路徑的消費方都是測試。因此，維護兩條路徑增加了獨立的錯誤與取消覆蓋，卻沒有服務於已交付的產品路徑。

## 提案

在整個發現與載入鏈結中要求傳入 `FileSystem`，包括兩個匯出的包裝函式和 `findProjectRoot`。移除 `nodeStatFile`、`nodeTextChunks`、僅供 Node 使用的路徑缺失分類、`existsAsMarker` 的 Node 分支以及 `statFile` 選擇器。提供者發現過程給出必需的目標；有界讀取透過 `streamText` 消費這些目標。

保留外掛缺少提供者時不執行操作的行為，以及純函式 `renderAgentInstructions` API。保留候選優先順序、原始檔與渲染輸出的位元組預算、取消、符號連結跟隨和錯誤語義：候選不可用不能表示應移除已有內容，根標記失敗仍是錯誤。獨立的 `skill-filesystem` 所有者保留其現有的無提供者行為。

讓直接呼叫輔助函式的測試改用顯式管理生命週期的本地或受控提供者。[測試套件](../../../../packages/context/agent-instructions/tests/agent-instructions.spec.ts)已經掛載了這兩類實作。保留獨有斷言，把重複的 Node mock 情境合併到提供者覆蓋中。預計在更新簽名和文件之前刪除約 50–65 行生產原始碼，另加冗餘測試機制；實施時測量實際減少量。

[符號連結決策](../../implemented/feature/2026-07-21-follow-instruction-symlinks.zh.md)所接受的行為繼續存在，因此該說明保持現行狀態。實施時，更新其中對兩種實作的引用和[包 README](../../../../packages/context/agent-instructions/README.zh.md)，包括雙語對側。[已歸檔的工作區上下文說明](../../archived/feature/2026-06-24-workspace-context.md)保持凍結；本提案不附帶任何既有說明變更。

## 備選方案

**保留無提供者的便利匯出。** 它們讓外部呼叫方無需建構提供方便可載入指令，但也要求保留生產路徑不使用的第二套 I/O 實作。本提案有意放棄這種便利；儲存庫搜尋不能確定外部無人使用。

**隱式建構本地提供者。** 這會保留省略參數的呼叫方式，卻隱藏檔案系統選擇和生命週期歸屬。呼叫方應傳入它們打算使用的實作。

## 驗收標準

- 本所有者的發現/讀取輔助函式要求提供者，且不含直接 Node I/O 退回；無提供者的外掛組合仍不載入任何內容。
- 針對性測試保留符號連結、缺失/不可用、標記錯誤、預算、取消、恢復、巢狀存取和壓縮（compaction）後恢復的行為。
- 工作區上下文恢復的程序預期輸出和 `ptc-workspace-context` 情境保持原有文字及事件順序。型別檢查、受影響建置和文件檢查透過。

## 風險

省略提供者的外部呼叫方面臨有意的穩定前 API 變更。實施前確認這類需求。保留檔案系統擴充功能路徑，也不要用重新建立已移除退回的新便利包裝函式替換有用的提供者測試。
