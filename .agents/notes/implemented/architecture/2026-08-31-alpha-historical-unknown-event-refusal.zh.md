# Agent Note: Alpha Session 遷移拒絕所有未知歷史事件

Status: implemented

[English](2026-08-31-alpha-historical-unknown-event-refusal.md) | 中文

## 問題

同版本 Session 讀取只有在 producer 把信封標記為 `ignorable: true` 時，才可以安全跳過未知事件。保持基數的遷移有更嚴格義務：它必須證明每個保留 payload 在目標代際中仍具備正確語義。未知 JSON payload 可能包含編譯期品牌無法發現的 Session 序號、生命週期事實或模型可見狀態。

靜默複製這類事件，會在後續遷移邊改變事件位置時留下陳舊數字引用。靜默省略它會丟失持久資料。保留精確且不可變的 v0 generation 不能讓任何一種轉換後的 v1 結果變得無損。

## 決策

Alpha v0-to-v1 遷移邊擁有凍結且完整的已釋出 v0 事件與 payload 清單。它在目標 staging 前拒絕每個未知歷史事件型別，包括標記了 `ignorable: true` 的事件；除明確分類為 owner 不透明 JSON 的欄位外，它也拒絕已知 payload 的意外成員。可合併擴充功能的巢狀判別欄位同樣屬於這項顯式策略：未知 content-block type、message-source kind、assistant finish-reason kind 與 turn-ending reason kind 會作為 owner 不透明 JSON 保留，已知分支則接受結構驗證。診斷會點名事件型別、序號和保持不變的源 generation。

該規則只適用於跨越歷史格式遷移邊。普通目前格式讀取保留既有信封行為：未知必需事件被拒絕，帶 `ignorable: true` 的未知事件仍可讀取。因此原生目前格式的外部事件繼續使用既有同版本擴充功能 seam，但不會自動獲得未來格式遷移能力。

每個第一方源事件型別都在遷移邊包中擁有可執行 disposition 與目標 validator。catalog 在建置時靜態確定且與 profile 無關，因此 producer 外掛是否掛載不會改變舊產物能否遷移。

## 後果

某些由儲存庫外資訊型外掛產生的 v0 Session 可能拒絕 alpha 遷移，即使 v0 codec 能解碼它們。拒絕不會發布後繼，因此無字尾 v0 路徑、位元組與 inode 仍然權威且不變。操作者可以從診斷識別阻塞型別，並完整存取其原始文字。

社群回饋將決定下一步策略。後續版本可以新增顯式外部 owner 遷移介面、在保留精確源代際時允許省略明確 ignorable 的歷史事件，或繼續嚴格拒絕。Alpha 標記不預先承諾任何選項。

`SessionSeq` 與 `SessionLogOffset` 讓已知第一方數字欄位可審計，但無法分類未知 runtime 物件中的數字。因此遷移規則不能根據沒有識別到品牌欄位來推斷安全。

本記錄僅在歷史格式遷移方面取代 [保留可忽略外部 Session 事件](2026-08-30-retain-ignorable-external-session-events.zh.md)。原決定對同版本 append 與 reload 仍然有效。

## 考慮過的替代方案

- **逐字複製未知 ignorable 事件**——保留位元組，但不能證明不透明數字或生命週期事實在結構遷移後仍有效。
- **丟棄未知 ignorable 事件**——讓遷移保持可用，但不再無損，並讓該標記授權刪除資料。
- **在未知 JSON 中搜尋類似數字欄位的名稱**——啟發式無法建立語義身份，還會製造虛假信心。
- **動態詢問已掛載外掛**——讓遷移可用性取決於某個部署組合，並在缺席 producer 能掛載前失敗。
- **等到第一條結構遷移邊再拒絕**——會讓 v1 包含從未建立安全解釋的歷史值；恆等演練正是把策略變成可執行規則的時點。
