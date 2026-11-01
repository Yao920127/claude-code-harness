# Agent Note: parent 自有的 subagent 目錄事件

Status: implemented

[English](2026-09-01-parent-owned-subagent-catalog.md) | 中文

## 問題

直接 child discovery 曾從全域 Session 語料與每個入選 child 的日誌重建目錄。建立過程已經知道直接 parent、child id、mode 與 label，因此儲存庫範圍列舉和 child 日誌讀取重複推導了已有歸屬的事實，並讓瀏覽器重新整理成本取決於無關 Session。

child descriptor 對恢復與 composition 仍然必要，但它不能作為 discovery 來源，因為讀取方必須先找到並開啟 child 才能讀取 descriptor。fork 還有獨立要求：從 parent 日誌播種的副本不能繼承原 Session 的 child。

## 決策

parent Session 的 required `subagent/catalog` 事件是直接 child discovery 的持久化權威。每個事件都是一條成功建立事實，包含 `childId`、`childCreatedAt`、mode 與按 mode 區分的 label。沒有本地 Session 的遠端 one-shot run 不進入該目錄。無效的自身 fact（包括不支援的 payload 版本）會使 projection 恢復失敗，因為靜默丟棄 required fact 會返回不完整的目錄。

建立只發布成功事實。one-shot run 在 provider 返回本地 child 後、run 到達呼叫方前追加目錄事件。continuable run 先准入初始 prompt，再追加目錄事件，最後返回 child id。准入或目錄追加失敗時，建立失敗並釋放 activation；不存在補償目錄事件或 rollback 協定。

child header 與 `subagent/descriptor` 繼續擁有恢復與 composition 權威。Activation 與精確 parent 關係繼續擁有授權與投遞權威。mode 與 label 只快照一次，同一份分離值寫入 parent catalog fact 與 child descriptor。

註冊的 `subagentCatalog` projection 物化 parent fact。它將儲存、追加、迭代和檢查點驗證交給 [`dsh-chunked-list`](../../../../packages/util/chunked-list/README.zh.md)，後者以每塊 64 項的持久 stack 儲存事實，因此 append 最多複製 head chunk，以有界 O(1) 工作完成。materialization 從舊到新存取 chunk，對 D 條事實以 O(D) 時間保留父目錄事件順序。並行建立按目錄成功追加的順序排列，與 child 時間戳和 id 無關。projection checkpoint 以 O(D) 克隆 state；projection-cache 繼續非同步寫入，並使用既有建立、turn-end 與 disposal 強制點。

工具庫擁有分塊佈局及其共享容量常數；目錄擁有事件驗證、fork 過濾和目錄行轉換。目錄 projection state 版本 2 儲存通用塊值，因此 projection registry 從 Session 事件重建不相容的快取。Session 事件載荷和公開目錄行保持各自格式。

fork 隔離使用 projection 初始化時提供的精確 `Session.inheritedEventCount`。fold 忽略該 offset 之前的 `subagent/catalog` 事件。state 儲存 inherited offset，但不儲存每條 event seq，因為接受判定已在 fold 時完成。

Headless 快照採集按父目錄順序分配同父子級的 fixture 角色，不依賴子級建立時間戳：provider 啟動可能在較新的 Session 之後釋出較舊的 Session。採集過程原樣保留每份日誌。

snapshot normalizer 會把 `childCreatedAt` 歸零，因為它來自 process clock。事件順序與來源事件引用保持不變：相鄰 fact 也可能來自順序建立，因此相鄰關係不能證明可交換性。

即使 replay 輸入保留歷史 Session generation，目前 writer 的快照預期也包含 catalog 事實。比較保留 catalog 及其來源事件引用；歷史 replay 檔案保持不變。

## 考慮過的替代方案

**扁平不可變陣列。** 用 `[...facts, fact]` append 會複製 D 個 fact，因此建立是 O(D)。修改共享陣列會違反 projection state ownership 與 checkpoint 安全。

**每 fact 一個 node 的 linked list。** 它提供 O(1) append 與 O(D) read，但持久 projection checkpoint 會形成 D 層 JSON 巢狀。每塊 64 項保留漸進複雜度，同時降低巢狀深度。

**獨立的 host state 觀察輸出。** 返回內部 projection state 會重複已有觀察結果機制，並複製與子級發現無關的狀態。目錄檢視透過既有的型別化 projection map 提供直接子級列表。

**持久 SQLite child index。** index 會為 parent Session 日誌中已有順序的 fact 增加另一套寫路徑、reconciliation protocol、schema 與 corruption surface。

**補償失敗事件。** 在初始 prompt 准入前記錄 catalog membership 會引入第二種 operation、配對規則、rollback 清理與 client reconciliation。把成功事實推遲到准入完成後即可刪除該協定。

## 後果

Session observation 與 client snapshot 透過 `projections.values.subagentCatalog` 暴露直接子級列表。目錄狀態變化時，projection change feed 釋出完整列表。每次 view 的成本為 O(D)，因此 D 次建立可能累計產生 O(D²) 的 view 工作量；這沿用現有 projection 機制。`listChildren()` 透過一次 live-preferred Session observation 讀取父 projection；後代列舉按目錄順序遞迴呼叫同一讀取函式。可達目錄事實提供身份和成員關係，無需全域 Session 掃描或獨立的子身份快取路徑。不可讀分支保留為診斷；未進入目錄的 Session 不在發現範圍內。[Web projection 消費決策](../simplification/2026-09-08-web-subagent-catalog-projections.zh.md) 說明瀏覽器載入與同步。

[建立中繼資料排除決策](../simplification/2026-09-16-subagent-catalog-membership-only.zh.md) 說明目錄事實為何不包含模型設定。
