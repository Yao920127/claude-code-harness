# Agent Note: Projection cache 只讀面按 lifecycle 身份匹配，用戶端 store 區分 cached 與 sequenced 行

Status: implemented

[English](2026-09-19-projection-cache-listing-identity-and-cached-rows.md) | 中文

## Problem

Host 程序重新啟動後，所有 fork 出來的工作階段（`SessionHeader.isSeeded === true`）在側邊欄列表裡沒有 title，`@` 引用補全只顯示工作階段 id，列表排序退化到建立時間。開啟一次之後恢復。2026-09-19 的一臺開發機上，241 條 projcache 記錄裡有 44 條 seeded，44 條的 `title` 行全部合法，列表一次都沒讀到。

這不是快取損壞，也不是版本失配。projcache 記錄的 domain version 是 7，`identity.formatVersion` 是 4，兩者分別是快取自身的磁碟格式代際和 fold 所依據的 Session 日誌格式代際，都是目前值。問題在讀取路徑。

### 機制

快取記錄（記錄格式與前代恢復見 [投影快取前代恢復與 Session 格式繫結](2026-09-02-projcache-cross-version-read-compat.zh.md)）繫結一份 lifecycle identity：`formatVersion + createdAt + cwd + isSeeded + inheritedEventCount`，`identityMatches` 做全等匹配。其中 `inheritedEventCount`（fork 繼承的事件字首長度，下稱 cut）從 #3346 起不再出現在邏輯 header 裡：header 只保留 `isSeeded` 這一位，精確 cut 跟隨正文。Session 格式 v2 起（#3398），物理 header 行也不再存 `seedLength`，reader 從正文裡 `session/end-seed {inherited: true}` 標記的 seq 推出 cut。

於是 header-only 的讀取拿不到 cut：JSONL 後端 `fromHeaderLine` 對 header-only 讀取硬編碼 `inheritedEventCount: 0`，`SessionPersistenceSnapshot` 只有 header、revision 和可選的 eventCount。Session 列表與引用消費者都因此加了同一個守衛：

| 消費者 | 守衛 | 後備 | 後果 |
|---|---|---|---|
| `packages/api/session-controller/src/list.ts` `projectionsFor` | `header.isSeeded ? undefined : cachedSnapshot(header, 0) ?? cachedPredecessorTitle(header, 0)` | 無 | 無 title，無 `sessionListMetadata`，blank 判定退到 `false`，排序退到 `createdAt` |
| `packages/context/session-reference/src/index.ts` `projectedLabels` | 同 | 無 | `@` 補全按 id 顯示，搜不到 title |

守衛存在時（#3346，2026-09-01），`list.ts` 還有 `probeSmallCold`：快取 miss 且日誌檔案不超過 `DEFAULT_COLD_BLANK_PROBE_MAX_BYTES = 1024` 位元組時讀正文補全。它的目的是識別 blank 工作階段，只覆蓋不到 1KB 的日誌，對正常 fork 從未生效。#3400（2026-09-03）刪掉它，列表回到純中繼資料加快取。#4320（2026-09-19）把 fork 變成一等功能（`packages/core/session/src/fork.ts`，任意 seq fork），每個 fork 都是 `isSeeded: true` 加精確 cut，seeded 工作階段數量從個位數變成幾十條，重新啟動後全部冷，問題集中顯形。

### 快取的兩種用途與驗證位置

`SessionProjectionCache` 的讀寫面和呼叫方：

| 面 | 對記錄做什麼 | 寫回 | 呼叫方 |
|---|---|---|---|
| `write(session)` | 三個強制點加節流寫 checkpoint | 有 | 快取內部監聽 |
| `hydratePrepared(session, events)` | 把 `rows` 當 fold 起點，從 `row.seq + 1` 繼續 apply，結果進 live cell | 後續 checkpoint 寫回 | `session-query/src/observation.ts` |
| `coldSnapshot(meta, cut, events)` | fold 起點加回寫 | 有 | 無生產呼叫方 |
| `cachedSnapshot(meta, cut, keys?)` | `viewCheckpoint`：每行過 `ver` 和 `stateSchema`，`view` 後返回 | 無 | `list.ts`、`session-reference` |
| `cachedPredecessorTitle(meta, cut)` | 同上，只看 `title`，允許更舊的 `formatVersion` | 無 | `list.ts` |

身份驗證全部在快取內部（`recordFor` → `identityMatches`；`viewCheckpoint` 逐行驗證 `ver` 與 schema）。`list.ts` 自己不驗證，只是給不出 cut 時不調。

spec.ts 與 README 描述身份檢查的目的時用的都是同一個動詞：防止 "seed state folded from an unrelated log"、"cannot seed the caller"。它防的是 fold 面。只讀面從未做過 seed。

### 用戶端 store 無法保證建連資料覆蓋提示

用戶端每個工作階段只有一個 `ProjectionValueStore`（`manager.projectionStores`；合併規則原記錄於 [Session observation 與 projection 所有的用戶端狀態](2026-08-25-session-observations-and-projection-owned-client-state.zh.md)），列表下發的 block、開啟工作階段的 history 首頁基線、control 基線、推送 frame、rename 結果全部寫進同一個物件，`useProjection` 讀的也是它。所有寫入者平等，只有一條 higher-seq-wins 規則：`apply` 在 `seq <= row.seq` 時丟棄新值，`seed` 清理沒帶的鍵時只清 `row.seq <= cut` 的行。一個 seq 相等或偏高的列表提示會在工作階段開啟後原樣留在格子裡。列表提示的 seq 來自磁碟記錄，crash-repair 截斷日誌後它可以數字上高於建連 cursor，而那正是快取錯、建連對的情形。對提示做 seq 比較是用錯了工具。

## Decision

### 快取分成兩個讀面，cut 只在 fold 面比對

| 面 | 身份 | 誰能提供 | 方法 |
|---|---|---|---|
| 只讀面 | lifecycle 身份：`formatVersion + createdAt + cwd + isSeeded`，全部來自 header | 任何 header-only 呼叫方 | `cachedSnapshot(header, keys?)`、`cachedPredecessorTitle(header)` |
| fold 面 | lifecycle 身份加 `inheritedEventCount` | 握有 Session 或正文的呼叫方 | `recordFor` 所服務的 `hydratePrepared`、`write`、`coldSnapshot` |

只讀面的兩個方法不再接受 cut 參數。`inheritedEventCount` 繼續寫入記錄，fold 面繼續全等比對它；"不同 fork cut 的記錄不能互相當種子"這條原始設計預期不變。

只讀面返回的 block 裡，`asOfSeq` 是所服務各行中最低的水位，也就是儲存記錄自己的位置。header 既作證不了 cut，也作證不了這個水位與目前日誌的可比性，所以可比性不由這個數字表達：Session list 給每條摘要的 `projections` block（`SessionProjectionHints`）加獨立欄位 `kind`，冷工作階段從 projcache 看出來的 block 標 `cached`，活工作階段由 Host live registry 算出的 block 標 `sequenced`。兩個欄位各管各的：`kind` 說明 `asOfSeq` 屬於哪個序列空間，`asOfSeq` 是那個空間裡的水位。

### 只讀面為什麼可以不比 cut

- 在同一個 `formatVersion` 下，一條日誌的 cut 由 `(id, createdAt, cwd, isSeeded)` 唯一決定：fork 建立時寫死，只有改變事件基數的格式遷移能改它，而那種遷移必然改 `formatVersion`。cut 是 lifecycle 的派生事實，不是獨立座標。
- 只讀面今天實際發生的是：unseeded 傳常數 0（建構上恆真），seeded 直接不調。cut 在只讀面上從未和任何真實事實比過。拿掉它，拒絕集合一個都不變：另一個 lifecycle 的記錄（四欄位任一不同）照樣被拒；unseeded 結果相同；seeded 從不可定址變成可定址。
- 只讀面沒有 seed、沒有寫回，輸出是儲存記錄的純函式，cut 不參與計算，也不流向任何地方。
- 唯一多出來的暴露面：一份四欄位全同、只有 cut 不同的記錄。系統自身產生不出它，只有手工複製工作階段目錄再改檔案才行。就算出現，後果是列表顯示它的值直到工作階段被開啟，仍然不進任何 fold。

### 消費者

| 位置 | 改法 |
|---|---|
| `list.ts` `projectionsFor` | 刪 `isSeeded` 分支和 `SessionLogOffset(0)`，冷工作階段統一 `cachedSnapshot(header) ?? cachedPredecessorTitle(header)` |
| `session-reference` `projectedLabels` | 同一症狀，同一改法 |

### 用戶端 store 區分 cached 與 sequenced 行

`ProjectionValueStore` 的行分兩類，按"這個值有沒有本連線可比的 seq"命名：

| 行 | 含義 | 攜帶 |
|---|---|---|
| `cached` | 從持久化 checkpoint 只讀看出來的值，沒有 Session 參與，seq 與本連線不可比 | 只有 `value` |
| `sequenced` | 本連線內由 Host 對該 Session 算出的值，seq 在同一空間可比 | `value` 加 `seq` |

規則：

| 寫入 | 遇到 `cached` 行 | 遇到 `sequenced` 行 |
|---|---|---|
| `applyCached(values)` | 覆蓋 | 忽略 |
| `seed(baseline)` | 整表丟棄 `cached` 行，再按 block 寫入；block 沒帶的鍵按 `seq <= cut` 清理 | higher-seq-wins |
| `apply(key, value, seq)` | 覆蓋 | higher-seq-wins |

seq 比較只在同一條 Host 連線內發生：`handleConnected` 先整表 `clear()`，再由列表重新寫 cached、開啟工作階段重新 seed。從 cached 到 sequenced 是無條件替換，不看 seq。

寫入口歸類：

| 入口 | 行型別 |
|---|---|
| `session.list` 回應裡每條摘要的 `projections` block（`manager.refreshList`） | 按 block 的 `kind`：冷工作階段 `cached`，活工作階段 `sequenced` |
| `api-session/added` 摘要的 `projections` block（`manager.handleSessionAdded`） | 按 block 的 `kind`；該摘要來自活工作階段，實際為 `sequenced` |
| history 首頁 `projections`（`session.ts` 的 `projections.seed`） | sequenced |
| control 基線，僅活工作階段（`manager.replaceControlBaseline`） | sequenced |
| `refreshProjections` 的 `session.projections` 結果（正文觀察） | sequenced |
| 推送 frame（`manager` 處理 `projection` frame） | sequenced |
| rename 成功後的 `title`（`session.ts`） | sequenced |

`seed` 與 `apply` 簽名不變。用戶端按 `kind` 分流：`sequenced` block 逐鍵 `apply`，`cached` block 走 `applyCached`，不讀它的 `asOfSeq`。

### 不動的部分

- Session 格式、物理 header 行、`fromHeaderLine`、persistence、`SessionPersistenceSnapshot`。
- hydration 與 checkpoint 寫路徑，`recordFor` 的五欄位全等。
- `coldSnapshot` 保留，不因沒有生產呼叫方而刪除。
- 老記錄（domain v4/v5，缺 `isSeeded` 與 `inheritedEventCount`）對 seeded 工作階段繼續 miss，等工作階段開啟後被 v7 記錄改寫。
- 列表下發全部帶 wire 檢視的行（`contextBreakdown`、`turnOutline` 等）這一點不在本次範圍。

### 最壞情形推演

1. 列表用了一份錯誤記錄，側邊欄顯示錯 title，格子裡是 cached 行。
2. 點進工作階段，首頁基線到達前一瞬仍是錯值。這是任何預填充都有的視窗。
3. 首頁基線 `seed`：所有 cached 行先被無條件丟棄，再按 block 寫入。錯值零殘留，與 seq 大小無關。
4. 之後列表重新整理，cached 寫入遇到 sequenced 行直接忽略，錯值不會被刷回來。

## Alternatives considered

**把 cut 寫回物理 header 行。** header-only 讀取能直接拿到 cut，只讀面無需改身份。代價是 Session 格式再升一版，V4 剛落實；並且要推翻 #3346"精確 cut 不偽裝成 body-free metadata"的決定。否決：不為此改 header。

**由 persistence 或 session-query 維護每個工作階段 cut 的索引。** 新增一套 durable 索引及其一致性維護，只為服務一個展示讀取。否決。

**恢復有界正文探測。** #3400 刪掉的 `probeSmallCold` 思路，或由用戶端對可見 seeded 工作階段非同步 `refreshProjections`。違背列表零 I/O 原則，且歷史閾值 1KB 說明它從未覆蓋過正常 fork。否決。

**只用 `asOfSeq: -1` 哨兵，不給 store 分層。** 伺服器端一處改動即可讓提示在 seq 規則下永遠落敗。但它靠約定成立：一旦提示 seq 與基線 cut 相等或偏高（crash-repair 截斷），`apply` 保留舊行，錯值存活到下一幀。使用者要求建連資料無條件覆蓋提示，規則要寫進 store 而不是靠 seq 約定模擬。

**用 `asOfSeq: -1` 表達 cached，用戶端按哨兵分流。** 只讀面統一輸出 `-1`，用戶端把所有列表 block 當 cached。否決：一個欄位同時承擔兩個含義，另一個含義只能靠約定推斷；活工作階段的列表 block 帶本連線可比的真實 seq，一律當 cached 就把它們也降級了，PR 評審復現了延遲到達、cut 更低的 control 基線覆蓋更新列表值的迴歸。改為獨立欄位 `kind`，`asOfSeq` 保持各自來源的水位。

**把 cut 從快取身份裡徹底刪掉。** fold 面需要它：`restore` 從快取行狀態繼續 apply，`schedule`、`subagentCatalog`、`permissions.seeded` 與 owned/inherited 歸屬都編碼了 cut，錯誤會被寫回並持久化。否決。

**行型別命名 `hint` / `authoritative`。** 說的是可信度，而規則依據的是 seq 可比性。改為 `cached` / `sequenced`，名字直接說明規則用到的性質。

## Consequences

買到的：

- 重新啟動後 fork 工作階段在側邊欄立即有 title、`sessionListMetadata`（blank、lastPromptAt）和其餘帶 wire 的快取值，排序按最後一次提問時間。
- `@` 補全對 fork 按 title 顯示和搜尋。
- 建連後的資料無條件替換列表提示，不再依賴 seq 大小。
- 快取身份的兩級含義有了名字：lifecycle 身份回答"是不是同一份日誌"，fold 身份回答"能不能當續算起點"。

付出的：

- `cachedSnapshot` 與 `cachedPredecessorTitle` 簽名變化，Session 列表與引用呼叫方使用僅需 header 的簽名。
- `SessionProjectionHints` 新增必填欄位 `kind`，所有產出列表摘要的地方和建構摘要的測試夾具都要帶上。
- 手工建構的同四欄位、不同 cut 的記錄會在列表上顯示到工作階段被開啟為止。
- 基線沒帶的鍵連提示一起清掉：某個 Host 未掛載 `schedule` 時，開啟工作階段後列表提示過的 schedule 標記消失。按"建連資料是真值"這是正確行為。
- 老記錄對 seeded 工作階段仍然 miss，直到開啟重寫。

## Testing

- `session-projection-cache/tests/cache.spec.ts`：seeded 冷 header 透過 `cachedSnapshot(header)` 取到全部版本匹配的行，`asOfSeq` 為行水位；unseeded header 對同一 id 的 seeded 記錄被拒；`coldSnapshot` 對 cut 一致的記錄從行續算、對 cut 不一致的記錄整段重新 fold，對 unseeded 且 cut 非 0 的呼叫拋錯；`cachedPredecessorTitle(header)` 對 seeded 的更舊 `formatVersion` 記錄只給 `title`；不同 watermark 的多行合成一個 block，`asOfSeq` 取最低行。
- `session-projection-cache/tests/fixtures.spec.ts`：歸檔的 v3 到 v6 記錄繼續只透出 predecessor title；無 lineage 欄位的歸檔對 seeded 呼叫方繼續 miss。
- `api/session-controller/tests/session-cold.host.spec.ts`：seeded 冷工作階段摘要攜帶 `kind: 'cached'`、`title` 與 `sessionListMetadata`，`updatedAt` 取 `lastPromptAt`，快取確實被查詢，正文沒有被讀。
- `api/session-controller/tests/session-projections.host.spec.ts`：用 `sessions.fork` 造一個真實 fork 並寫入 projcache，銷燬整個 Context 後在同一儲存根上重新啟動 Host，只憑 header 透過 `session.list` 讀到 `kind: 'cached'` 的 `title` 與 `sessionListMetadata`，`inspect` / `open` 一次都沒被呼叫。
- `api/session-controller/tests/projection-store.client.spec.ts`：`applyCached` 只填空位、不覆蓋 sequenced 行；任何 sequenced 寫入（包括 cursor `-1` 的 frame 和 cut 更低的基線）替換 cached 行；基線先丟棄全部 cached 行再清理沒帶的鍵；面訂閱在 cached 填充與丟棄時都收到通知。manager 路徑：`cached` 列表 block 的水位再高，也被 cut 更低的 control 基線替換，之後的列表重新整理拿不回來；`sequenced` 列表 block 按 higher-seq-wins，cut 更低的延遲基線既不覆蓋也不清掉它，更高 seq 的 frame 仍能推進它。
- `api/session-controller/tests/manager.client.spec.ts`：`api-session/added` 的 `cached` block 被同 cursor 的 control 基線替換；`cached` 列表 block 不覆蓋已有的 sequenced title。
- `api/session-controller/tests/inbox-projection.client.spec.ts`：不變，活工作階段的 `sequenced` 列表 block 仍壓過延遲到達、cut 更低的 control 基線。
- `context/session-reference/tests/session-reference.spec.ts`：seeded 冷工作階段按快取 title 標註並可按 title 搜到，沒有快取記錄的工作階段仍按 id 標註，兩者都不讀日誌。
