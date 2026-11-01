# Agent Note：activity 觀察 seam（`ctx.activities`）與 Web 用戶端即時輸出流

狀態：implemented

Superseded：本文描述的獨立 seam 已折入 `ctx.jobs`，成為逐 job 的觀測 record——見 [jobs 吸收 record](../architecture/2026-09-01-jobs-absorb-activity-record.zh.md)；下文關於持久化與即時通道的分析仍然成立。

[English](2026-08-24-activity-observation-seam.md) | 中文

## 問題

shell、terminal 與 jobs 各層的增量讀取器全都是單讀者且消費型的：`ShellProcess.readOutput()`、`TerminalSendOperation.readOutput()` 與 `JobRegistry.read()` 返回即銷燬增量，因為預期讀者就是持有模型。[Web 後臺任務顯示](2026-08-08-web-background-job-display.zh.md)在這一前提下交付了 roster——其載體被測試釘死絕不呼叫 `ctx.jobs.read()`，否則瀏覽器讀取會無聲偷走模型 `job_output` 永遠看不到的位元組——並把輸出階段明確推遲給"一個獨立的非消費觀察 API"。於是人在 Web 用戶端只能看到後臺建置"在跑"，看不到一行輸出；腳本被告知用來敘述進度的 `workflow/log` / `workflow/phase` 事件更是全無消費者。

bash 之下的底座其實早有正確形態：`SubprocessOutputReader.readFrom(fromByte)` 是按 offset、明確非消費的，`bash-local` 在 shell seam 把它窄化成了單遊標對。

## 決策

新建能力 seam `packages/activity/`，作為非消費觀察面。**activity** 是一個可觀察的長時工作單元：一條 append-only 的有界輸出流加即時狀態。該 seam 是純觀察——不啟動、不取消任何工作，對模型不可見。模型可見事實原地不動（工具結果、`ctx.jobs` 遊標），"模型可見 ⟺ 已記錄"不變數不受影響；不裝該 seam 的組合只失去即時觀察。

- **`@deepseek-ai/dsh-activity`（Service Definition）**——`ctx.activities` 上的抽象 `ActivityRegistry`：`open(spec) → ActivityHandle { append, updateDetail, end }`、有柵欄的 `get`/`list`、按絕對 UTF-8 位元組 offset 的非消費 `read(id, from)`、owner 相對投遞的 `onActivitiesChanged`（roster）與 `onOutput`（推進訊號，只帶 id）。`ActivityCorrelation { callId?, jobId? }` 把行關聯到工具呼叫與 job。`pumpActivityOutput` 是 pull 型底座的共享泵。
- **`@deepseek-ai/dsh-activity-local`（Service Provider）**——每個 activity 一個記憶體 chunk 環。offset 跨淘汰穩定（`outputEarliest` 指明最老保留位元組；低於它的讀取是 `lossy` 而非錯誤）；單個超上限 chunk 保留 UTF-8 安全尾部並帶 `gapBefore`。設定 `retainBytes`（256 KiB）存活，結算時裁到 `settledRetainBytes`（16 KiB）。記錄存續期長於生產者 fiber；owner 銷燬強制終結並移除；`end` first-wins，end 後寫入記日誌後丟棄，生產者的收尾 flush 砸不掉自己的 teardown。
- **`@deepseek-ai/dsh-api-activity-controller`**——wire 層，取 workspace-controller 的形態：`activity.control` 流出一份 roster baseline 加按 owner 工作階段的整桶替換幀（jobs 幀的自愈語義）；`activity.observe({ activityId, from? })` 流出一幀 `opened` 錨點、合併的 `output` 幀（`flushMs` 視窗、`maxFrameBytes` 軟預算）、再在同一條流上發終態 `status` 後關閉——結算永遠不會與仍開著的輸出通道競態。重連以上一幀的 `next` 續傳。用戶端半區安裝 `ctx.activityFeed`（roster 映像 + 按引用計數的觀察流與有界渲染尾巴）。
- **`@deepseek-ai/dsh-client-ui-activity`**——工作階段頭部任務列表（[與 job 行合併](../../archived/feature/2026-08-25-unified-task-list.md)）；展開某行即把其觀察流開啟進 `TerminalBlock` 面板，收起即關——只有有人在看時輸出才流動。`TerminalBlock` 本身獲得即時渲染能力：running 且提供了 `output` 的塊在 running 狀態下顯示文字，而非歷史上的僅提示行畫面。

生產者一律經 `ctx.get('activities')` 盡力映像，絕不宣告 inject，一切觀察失敗只記日誌併吞掉——該 seam 嚴格可選，永遠不能破壞它所觀察的工作：

- `ShellProcess` 新增可選 `observed`——底座的非消費 offset 讀取器復出（bash-local 與 pwsh-local 返回 `handle.collected`；e2b subprocess provider 滿足同一契約）。`dsh-tool-bash` / `dsh-tool-pwsh` 在 `jobs.start()` 提交後開啟帶關聯的 activity，並以 `activityPollMs`（預設 150 ms）泵取 `observed`。
- `dsh-tool-workflow` 把每個被記錄的頂層執行映像為 push 形態的 `workflow` activity，讓此前無人消費的 `workflow/phase` / `workflow/log` 事件有了消費者。

### 為何不用持久工作階段事件、control 流或 jobs seam

同行產品收斂於同一切分（Codex 在 rollout policy 裡把所有 exec 輸出 delta 標為 "Transient, non-durable"；Claude Code 持久化檔案路徑而非 delta；Kimi 的信封有一等的 `volatile: true`；OpenCode V2 把 V1 逐 chunk 持久化 part 更新糾正為 "stream fragments are live-only"）。在本儲存庫持久路線還有具體的壞處：chunk-run 打包只認三種 `assistant/chunk` 形態，新輸出事件零壓縮；每事件一條未合併的 WebSocket 幀；重連缺口修復要重讀視窗——且 job 顯示 note 已否決過它（"spill 的存在就是為了讓超大工具輸出不進日誌"）。session control 流的整值幀對 roster 自愈、對流則是二次方開銷。擴 jobs seam 只覆蓋 jobs——workflow 敘述與未來的前臺流都覆蓋不到——還要重翻已定案的"生產者擁有自己的緩衝"；activity 面轉而複用底座既有的 offset。

### 兩套遊標制，各歸其位

模型保留消費遊標（`job_output` 語義不變，本次工作零 prompt/工具改動）；觀察者拿任意多讀者可共持的絕對 offset。這正是最強的同行正規化（Codex：模型用破壞性 drain，基礎設施用 seq 遊標讀取），也是 wire 路徑可證明"不偷位元組"的原因。

## 曾考慮的替代方案

**持久 `activity/output` 工作階段事件 + conversation node。** 回放免費，但上述日誌膨脹帳加上對每個 follower 的保留壓力否掉了它；transcript 側的持久故事仍是生產者的工具結果。

**給 `SessionControlFrame` 加輸出。** 少一條流，但整值語義會按 chunk 重發累計緩衝——恰好在會增長的資料上 O(n²)。

**訊號幀 + RPC 拉取。** subagent catalog 的形態；因 job 顯示 note 記錄的權威割裂機制而否決，且它在結算時刻失效得最難看（行還在跑、流已死）。

**在 jobs seam 內做觀察。** 一個整合點，但只對 jobs；前臺執行、terminal 與 workflow 敘述各需另一套機制，註冊表還得在生產者自己的緩衝旁再養一份。

## 測試

單測釘住註冊表（offset、淘汰、UTF-8 安全裁尾、lossy 讀取、first-wins 結算、owner 清理、scope 投遞、監聽容錯、HMR 可逆、帶行設定的 Loader 組合）、泵（節奏、每源遊標、lossy `gapBefore`、結算排幹、定時器衛生）、controller（baseline/桶幀、錨點/輸出/狀態排序、續傳、幀切分、有柵欄的有主讀取、abort）、用戶端模型與引用計數流，以及兩類生產者接入（bash 用真實子程序輸出，含"絕不偷模型遊標"斷言；pwsh 用腳本化讀取器；workflow 用事件驅動映像，含可選性承諾要求的 throwing-registry 容錯）。無鑰 web e2e 經完整組合驅動真實 `run_in_background` bash，釘住命令仍在執行時流式面板與註冊表 kill 後已結算面板的 ARIA golden。

## 後果

Web 用戶端在零模型面改動下獲得後臺 bash/pwsh 即時輸出與 workflow 敘述；任何外掛對著一個可選服務用三個呼叫（`open`/`append`/`end`）即可接入。代價是多一個 seam 家族與每生產者一個接入點；最初的雙頭部列表重複已折併為[單一任務列表](../../archived/feature/2026-08-25-unified-task-list.md)。暫緩項記錄在各包 README：前臺流式（需 shell seam 的 run/observe 變體）、terminal `pty-send` 觀察（需給 terminal 緩衝加非消費面）、人工 kill 控制元件（被 jobs `reported` 契約阻塞）、SDK/ACP 消費端、重新啟動後的持久回放。
