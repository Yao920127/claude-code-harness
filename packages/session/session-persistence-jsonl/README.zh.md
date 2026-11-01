---
description: "面向部署方與維護者的隨產品交付 JSONL 工作階段持久化後端說明，用於選擇、設定或排查帶可選 Zstandard 壓縮的逐工作階段持久日誌。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence-jsonl

[English](README.md) | 中文

## 概述

`dsh-session-persistence-jsonl` 把每個工作階段存為目前的僅追加 JSONL 日誌，並保留不可變的歷史格式 generation——預設以帶總和檢查碼的 Zstandard 幀儲存，停用壓縮時以換行分隔的原始文字行儲存。它透過持久化控制代碼提供目前邏輯 `SessionEvent` 流，因此格式遷移、壓縮、歷史解碼與崩潰恢復仍是儲存內部細節。當消費方需要按工作階段的磁碟檔案時選擇它；選擇 `compression: 'none'` 後日誌可作為純文字按行讀取。根目錄是唯一必填設定；永續性、延遲實體化、[受支援的歷史格式遷移](../session-format-catalog/README.zh.md)與撕裂尾部崩潰恢復都隨後端提供。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當組合需要由按工作階段檔案支撐的持久工作階段時掛載此後端。常用路徑是顯式的：載入工作階段服務、掛載後端，然後給出根目錄。

### 何時選擇

當消費方受益於每工作階段一份產物——導航、外部工具或可逐行讀取的原始日誌——時選擇此後端。它是唯一的第一方工作階段持久化提供者。後端把工作階段儲存在部署控制的根下：專案本地、共享、臨時或集中式。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: /absolute/path/to/session-logs
```

`root` 必填且無預設值：`process.cwd()` 預設值會隨程序 cwd 變更而分散工作階段檔案。現有根必須是可讀目錄；缺失根在第一次實體化時建立。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `root` | 必填 | 所有工作階段檔案的根目錄 |
| `compression` | `'zstd'` | 物理編碼：`'zstd'` 帶總和檢查碼幀，或 `'none'` 換行分隔 UTF-8 文字 |

即時事件的寫入批處理不是設定：批處理視窗是該 seam 在每個寫控制代碼內部的排程策略。

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-persistence-jsonl)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 磁碟佈局

每個工作階段在可讀專案目錄下獲得一個工作階段自有目錄。每個規範 generation 都以版本與檔名一致的物理 header 開始。目前格式為每個持久事件儲存一行；凍結的 v0 與 v1 reader 也能理解其歷史 packed Assistant delta 行。目前格式在 header 中儲存 `isSeeded`，並從最後一個帶標記的 `session/end-seed` 推導 inherited cut；歷史 codec 則轉換其數字 `seedLength`。格式 catalog 會在控制代碼暴露目前邏輯值之前完成該轉換。目前儲存記錄使用下文所述的無損來源序列表示：

```text
<root>/
  --<normalized-cwd>--/          # readable project directory (or _no-cwd/)
    <encoded-id>/                # session-owned directory
      session.jsonl.zstd         # released v0, compressed root
      session.v1.jsonl.zstd      # released v1, compressed root
      session.v2.jsonl.zstd      # released v2, compressed root
      session.v3.jsonl.zstd      # released v3/current, compressed root
      session.jsonl              # released v0, raw root
      session.v1.jsonl           # released v1, raw root
      session.v2.jsonl           # released v2, raw root
      session.v3.jsonl           # released v3/current, raw root; later versions use vN
```

工作階段 id 在使用前被單射轉義為一個安全路徑段（無遍歷、無衝突）。規範化 cwd 讓專案目錄保持可讀、便於導航；規範化相同的 cwd 字串共享專案目錄，而工作階段 id 仍選擇不同工作階段目錄。執行時操作選擇數值最高的規範 generation，格式拒絕診斷會點名該絕對路徑，讓操作者能找到建置拒絕解讀的原始日誌。

### 永續性與崩潰語義

工作階段延遲實體化：`create(header)` 不寫入任何內容並返回持有的寫控制代碼，控制代碼的第一次 `append` 透過無覆蓋釋出寫入並 `fsync` 編碼後的 header 與第一批——因此已建立但從未 append 的工作階段不留下任何磁碟內容，除非其所有者呼叫 `handle.flush()`，以無事件的單個 header 幀釋出它。後續每個批次追加行或一個壓縮幀，並在 append 完成前 `fsync`；捕捉到寫入或同步失敗時把檔案復原到之前的位元組長度。已提交事件絕不重寫。崩潰後，已儲存日誌保留被中斷的最終輪次——已提交字首中的每條記錄都保留下來，由執行恢復的讀方透過其寫控制代碼追加合成 closer。不完整的最終原始行會被丟棄。撕裂的最終 Zstandard 幀只貢獻其中完整解碼出的 JSONL 記錄；寫控制代碼會截掉撕裂位元組，並在第一次新批次之前持久重寫這些恢復出的記錄。完整已提交幀中的總和檢查碼、解壓或結構失敗以損壞拒絕。

目前代際掃描器在處理可恢復尾部之前，執行目前編解碼器所有者的結構准入檢查。已退役的必需 PTC 標籤與 `request/header.header.system` 即使出現在較早的畸形行之後也會導致檔案被拒絕；恢復絕不將它們作為普通損壞尾部資料截斷。

### 刪除工作階段

`delete(id)` 刪除該工作階段自有的目錄，包括所有保留的格式代與鎖檔案。它先在程序內宣告寫入權並取得跨程序租約，因此在任何寫入者持有該工作階段、或已建立的工作階段尚未寫入磁碟時，以 `SessionAlreadyOwnedError` 拒絕；持有租約時允許刪除目錄。共享同一專案目錄的其他工作階段（包括 fork）不受影響。

### 讀取日誌

`open(id, 'read'|'write')` 選擇最高規範 generation。目前格式輸入走普通快速路徑。對於歷史輸入，只讀 open 會單遍解碼並遷移源、驗證目前邏輯結果，然後在不釋出後繼的情況下返回。寫 open 會在可用時複用按 revision 為鍵的 preparation，否則執行同一套 preparation，再按有界分片編碼同目錄臨時檔案、在 Worker Thread 中驗證、複查源修訂，並在返回前以不覆蓋方式釋出目前後繼。源保持逐位元組不變。如果源在 preparation 後發生變化，該次寫 open 會失敗，已經返回給讀方的邏輯歷史不會被替換；後續寫 open 會針對新的 revision 重新執行 preparation。後端在 memo 化前凍結已解碼的 event graph，並在此時將其標記為 `shared-frozen`；每個巢狀物件和陣列都會凍結，控制代碼讀取和 slice 即使為空也保留該狀態。只有尚未實體化的 pending 空日誌報告 `detached`。`stat(id)` 與 `list()` 只選擇並轉換最高 generation 的 header，不讀取事件行，也不啟動遷移；快照攜帶所選檔案的 `sizeBytes` 與盡力而為的修訂號。目前格式修訂號標識該檔案；歷史格式修訂號還包含持久化根目錄中所選檔案的指紋，因此子日誌變化會使快取的邏輯事件失效。指紋只讀取檔案系統中繼資料；無關變化也會保守地使歷史修訂號失效。一次 `list()` 為其歷史條目共用一個全庫指紋。選擇 `compression: 'none'` 後，日誌是外部讀取方可直接消費的換行分隔文字；壓縮預設值必須經後端讀取。

歷史正文準備透過 [V3→V4](../session-format-v3-to-v4/README.zh.md) 補齊父目錄：從 header 找到候選直屬子 Session，透過歷史編解碼器逐個讀取其自身 descriptor，保留緊湊證據與來源修訂。此過程不準備子目錄，也不釋出子後繼。不可讀或不支援的 header（包括損壞的 Zstandard header 幀）不參與發現，也不出現在 `list()` 中。直接存取損壞的壓縮 header 仍會失敗；header 的 I/O 錯誤與取消錯誤繼續傳播。子日誌解碼或 descriptor 欄位失敗會產生帶子路徑的警告；父目錄沒有完整條目時，透過 `subagent/catalog` 保留 header 身份資訊。健康子項和已有父目錄項仍可使用。開啟損壞子 Session 時仍報告該子工作階段的錯誤。缺失、不支援或多個 descriptor 同樣生成模式未知的目錄項，不編造標籤。已釋出的未知條目仍可瀏覽；讀取子歷史時會重試實際日誌，並從有效 descriptor 確定模式。準備返回、複用與釋出前會重新檢查成員集合及已檢查來源的修訂，也包括讀取失敗的子日誌，使修復後的子日誌能夠使舊準備快取失效。來源變化時只讀開啟重試一次，寫開啟拒絕釋出。取消仍會中止操作。目前 V4 開啟跳過發現，並在暴露事件前驗證目錄欄位、唯一性及目前投遞迴屬。

歷史格式的 `stat` 與 `list` 修訂號需要與根目錄 Session 數量成正比的中繼資料工作。首次正文準備掃描所有所選 header 並解碼直屬子正文；複用準備快取仍掃描成員集合並檢查修訂。只讀存取從不釋出升級，因此冷程序與被淘汰的準備快取會重複這些工作。目前 V4 正文讀取和修訂號避開歷史全庫掃描。見[實測成本與診斷命令](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md#catalog-scan-measurements)。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明物理編碼與寫入路徑；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計理念

該後端擁有自己完整的儲存執行時（`src/storage.ts`）：`JsonlSessionHandle` 承載逐控制代碼修改鏈、帶固定批處理視窗與 single-flight 排空的已路由即時事件緩衝、單調讀取與冪等 close；一個 tracker 持有程序內單寫者認領、teardown 清掃所遍歷的開啟控制代碼集合，以及後端自己的工作階段監聽器所路由進的已建立但未實體化待定工作階段。歷史正文讀取共享每個 Session 唯一的一次 Decode/Migrate preparation，按 revision 為鍵的有界 memo 讓緊接的觀察到恢復交接複用該解析；backend 在 memo 化前只對每個 event graph 深度凍結一次，因此後續 handle read 無需複製或再次凍結。只有寫 open 才釋出準備好的後繼。本包有意只暴露預設外掛匯出與設定型別——具體類不是具名匯出，因此消費方只耦合 `ctx.sessionPersistence`，其可觀察行為由共享 seam 測試套件（`runPersistenceContract`/`runLiveWritePathContract`）釘住。物理修訂號組合 device、inode、size 與納秒時間戳，供準備快取、穩定讀取重試及釋出檢查使用。歷史格式的公開修訂號還加入所選路徑排序後及其物理修訂號的 SHA-256 指紋；鎖檔案與保留但未被選中的代際不參與計算。

### 物理編碼

預設產物是獨立 [Zstandard 幀](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.zh.md) 的標準拼接：一個僅包含 header 行的帶總和檢查碼幀，後跟每個持久 append 批次一個帶總和檢查碼幀，使用 Node 內建 Zstandard API 的預設壓縮級別（無級別開關）。目前格式為每個事件寫一行；`sourceEventSeqs` 使用無損儲存形式：至少包含三個序列號的連續段會變成 `[start, end]` 區間對，其他列表原樣保留；讀取時會展開回精確的記憶體陣列。歷史遷移會複用一個 Zstandard decoder，讓已解析行流經有狀態格式 Stage，並透過一個壓縮 context 以約 1 MiB 主執行緒分片流式寫入目前記錄，同時只保留最終目前事件、有界 decoder 狀態與必需的序號重對映表。列表只讀取並驗證 header 幀。`compression: 'none'` 保留相同的儲存形式邏輯行，但不使用幀壓縮。一個根只屬於一種編碼：啟動發現與定向查詢會拒絕使用另一字尾的 generation；格式遷移保留已設定編碼，而壓縮轉換、混合根退回與雙寫仍不受支援。凍結的 v0 與 v1 codec 僅為歷史 generation 保留 packed-row decoder。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、後端服務類與檔案儲存原語 |
| [`src/storage.ts`](src/storage.ts) | JSONL 控制代碼、已路由即時事件緩衝、程序內寫入者記帳、監聽器、teardown |
| [`src/format.ts`](src/format.ts) | 日誌路徑派生、header 編碼與目前記錄掃描 |
| [`src/generation.ts`](src/generation.ts) | 單遍歷史還原、有界 stage 編碼、源 revision 檢查與排他後繼釋出 |
| [`src/migration-verifier.ts`](src/migration-verifier.ts) | stage 與競爭 generation 驗證的 Worker 生命週期 |
| [`src/zstd.ts`](src/zstd.ts) | Zstandard 幀壓縮、解碼與幀掃描 |
| [`src/win32.ts`](src/win32.ts) | Windows write-through 釋出與目錄建立 |
| — | 不釋出執行時不變式伴生入口；身份在儲存層強制；持久化正確性依賴後端往返與崩潰尾部測試，本包不公開可持續觀察的程序內關係。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享持久化模型逐步進入同級後端與物理格式決策。

- [工作階段持久化子系統](../../../docs/subsystems/persistence.zh.md)——後端無關的服務語義與提供者關係。
- [工作階段持久化 seam](../session-persistence/README.zh.md)——本後端實作的服務約定。
- [專案工作階段目錄決策](../../../.agents/notes/implemented/architecture/2026-07-24-project-session-directories.zh.md)——專案與工作階段目錄佈局背後的取捨。
- [Zstandard JSONL 工作階段日誌](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.zh.md)——帶總和檢查碼幀編碼的理由。
- [已釋出 Session 格式遷移](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)——不可變 generation、相鄰遷移邊與釋出規則。

-----

<a id="model-experience"></a>
## 模型體驗

### 恢復的對話歷史

#### 模型看到什麼

JSONL 儲存不會向即時請求提供提示詞或 schema。載入會恢復已儲存的表層歷史，並保留之前的請求 header 用於重建；新 loop 組合目前 envelope。恢復會用 `TOOL_NOT_STARTED` 平衡沒有持久呼叫的 assistant 請求；持久呼叫無結果時則變為 `TOOL_OUTCOME_UNKNOWN`，它要求模型只重試只讀或冪等工作，並驗證可能的副作用或詢問使用者。嵌入式 Assistant stream 與僅日誌 attempt 不會重複生成訊息。

#### Token 影響

即時請求不新增 token。恢復後的 agent（智慧代理）會因保留的歷史、目前 envelope，以及每個中斷呼叫中以引用形式加入的修復結果文字而消耗 token。

#### KV Cache 影響

JSONL 儲存不修改即時請求字首。只有重建歷史、目前 envelope 與模型路由匹配時，恢復 loop 才能重用提供者快取；崩潰修復結果僅追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本後端何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **格式遷移保留已設定編碼，且只支援 catalog 中的鏈**——本 build 把受支援的歷史代遷移到目前格式；更改壓縮需要獨立根，保留的舊版本不提供自動 fallback 或 downgrade 支援。
- **平鋪檔案儲存佈局不載入**——載入前使用獨立根，或將預釋出產物移入專案/工作階段目錄佈局。
- **壓縮檔案不能直接按行讀取**——使用後端載入；或在寫入新根前選擇 `compression: 'none'`，供外部行讀取方使用。
- **不刪除工作階段檔案**——日誌在 `root` 下累積，直到外部移除；seam 無刪除介面。
- **每工作階段一個活動寫入方**——寫控制代碼認領在所屬後端實例內排除第二個寫入方，核心鎖（`session.lock` 上的非阻塞 `flock(2)`；Windows 上為由該路徑派生的命名核心訊號量，零檔案系統足跡）排除其他所有實例與程序；鎖在以寫模式開啟既有產物時立即取得，新建工作階段則僅在首次實體化寫入之前取得，因此未實體化的工作階段不留任何檔案系統足跡。崩潰持有者的鎖隨其程序消亡，工作階段立即可再寫入，而活著但卡死的持有者會阻塞寫入方直到其程序退出（POSIX 上刪除鎖檔案即放棄該排他；釋放本身從不刪除它）。諮詢式 `flock` 在部分網路檔案系統（NFSv3）上不可靠，Windows 訊號量名按登入工作階段隔離。
- **POSIX 實體化需要硬連結支援**——第一次 append 使用 `link()`，使同 id 競態失敗而不覆蓋已提交日誌；Windows 使用無替換 write-through rename。
- **POSIX 寫入需要匹配的預編譯系統 addon**——[`node-addon-system`](../../../native/system/README.zh.md) 提供非同步 flock，無須在使用者側編譯。addon 缺失時拒絕寫入所有權；Windows 保留其訊號量實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
