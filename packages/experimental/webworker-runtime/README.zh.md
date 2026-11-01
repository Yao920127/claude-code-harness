---
description: "面向建置或排查實驗性 Web 預覽執行時的維護者，說明瀏覽器 worker 中的 harness 託管。"
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-runtime`

[English](README.md) | 中文

## 概述

瀏覽器 worker 主機：整棵 harness 外掛樹跑在一個 dedicated Web Worker 裡，用於預覽部署與打包迴歸（[實驗組](../README.zh.md)）。worker 邊下載邊解壓打包好的 VFS 映像並掛載進記憶體，經 CommonJS 包裝載入器裝載模組，並透過一條講純 HTTP 的 postMessage 隧道服務頁面。當預覽需要在沒有 Node 主機的環境中執行已打包 harness 時，請使用它。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

公開 npm 包在根入口匯出執行時庫，透過 `./worker` 提供自包含的瀏覽器 Worker，透過 `./client` 提供頁面聯結器。部署方透過 [打包器](../webworker-packer/README.zh.md) 單獨提供和託管 VFS 映像；安裝此庫不會增加 profile 層。根入口還匯出打包器所用的模組代理表與替換表。

一條 tsdown 管線產出三個建置產物；另有一層由原始碼維護的程序實作：

- **`lib/index.js`（裝配庫）**——`createWorkerHost`/`startWorkerHost` 掛載基礎映像和按序排列的資料 overlays（`storage/`）、安裝模組載入器（`module-system/`）與 `process` shim、經映像自帶的 `dsh-app-boot` 啟動外掛樹，並把服務 seam 交給隧道。Overlay 只能替換 `home/` 與 `workspace/` 下的檔案，不能替換基礎 manifest、設定或模組。映像佈局契約（`image-layout.ts`：虛擬根、config/manifest 路徑、空目錄、`lowered` 包裝契約門）與 packer 共享。Worker 為 `home/profiles/preview/` 下可編輯的 profile 提供 `profileContext`：打包行初始化其插入 patch，ConfigEditor 將覆蓋值持久化到該 VFS patch。ConfigEditor 協調每次寫入，Loader 提交即時值；包管理和 Node 模組 HMR 保持停用。部署 overlay 保持 JSONL 工作階段日誌為明文，preset 根指向映像內 `config/agent-presets`。設定修改在目前 Worker 生命週期內有效。預設宣告包含在組合後的設定中。
- **`lib/worker.js`（worker 束）**——裝配庫加本包的 Node 相容層，合成一個自含 ES module。模組代理表（`module-proxies.ts`）是唯一平臺叉口：`node:*` 內建走 VFS、隧道和瀏覽器原語，瀏覽器做不到的走結構化 stub（呼叫即在 console 報錯並丟擲），native/binary 包則替換執行後端。`node:module` 在映像 package 根之上提供 `createRequire().resolve` 與 `.resolve.paths()`，使未修改的包無需執行目標模組即可發現 manifest。`node:util` 的 JSON 資料比較器檢查可列舉的自有屬性，使 `__proto__` 等記錄欄位的准入判定與 Node 一致。全域 `process` shim 帶有包括 `title` 在內的 Node 環境識別欄位，避免 Worker 執行誤入僅適用於 DOM 的分支。pack 期解析器會把名稱靜態可知的模組請求報告給 packer 的可達性遍歷，其中包括透過 `node:module` 或 `module` 具名匯入在模組作用域直接發起的 `createRequire(import.meta.url)('pkg')` 呼叫。儲存、經 CommonJS 取得或另設基準的 `createRequire` 呼叫需要映像入口種子。VFS mutation 驅動 `node:fs` 的 callback、polling 和 promise watcher；開啟的 descriptor 在 rename、replacement 和 unlink 後仍保留檔案身份與存取模式，只要檔名仍指向該檔案，`FileHandle.stat({ bigint: true })` 報告的 device 與 inode 身份就與路徑 stat 相同，`FileHandle.chmod()` 則更新開啟檔案身份的權限；`readable-stream` 提供 `node:stream/promises` 的完成等待與管道方法，以及檔案流以及 Chokidar、readdirp 等未修改映像包所用的流狀態機。AsyncLocalStorage 經 pack 時降低注入的 snapshot/restore 面在 `await` 間攜帶同步棧因果。worker 不帶編譯器：packer 未降低的映像在掛載時被拒。回呼式 `fs.realpath.native` 別名在已掛載的 VFS 內解析路徑，並支援 `util.promisify`。
- **`src/shell/`（worker 自己的程序層）**——瀏覽器 worker 無法 fork，所以 `node:child_process` 不是 stub 而是實作：`spawn` 把命令放進它自己的 Web Worker——就是這同一個束，由首幀告訴它「你是 shell 程序」——並以 subprocess 服務消費的 `ChildProcess` 面報告結果。命令不佔主機執行緒，`SIGKILL` 不管它在幹什麼都能終止它，而它只能靠訊息觸達 VFS（由主機應答這些幀）。Worker 平臺 executable 在不替換 JavaScript 包、也不把具體實作耦合進 `node:child_process` 的情況下保持 Landlock 等 native 包協定；普通命令使用本包的求值器與 coreutils 命令表。語法來自 `@yarnpkg/parsers` 的 `parseShell`，而 `execSync`/`fork` 依然拒絕，因為它們需要真程序。
- **`lib/client.js`（頁面半）**——啟動分為相互獨立的兩段。`chooseWorkerHostSource({ image?, fixtureManifest? })` 可選地擁有 boot barrier 與 fixture manifest：沒有 `preview-fixture` 時停在來源選擇面板，合法 query 則直接選擇；兩條路徑都返回按序排列的 overlays。`connectWorkerHost(worker, { image?, overlays? })` 仍是公開的基礎執行態聯結器；呼叫方跳過選擇器時 overlay 列表為空。`apps/web` 呼叫這兩段並提供靜態打包的 Worker。開局 `init` 幀攜帶基礎映像與按序排列的 overlay URL，boot 載荷送達結構化 index 注入表，`applyIndexInjections` 在殼入口執行前逐行執行。腳本 preload 行只是提示，因此會被跳過：`/plugins` 資源只能經 tunnel 解析，`loadBundle` 會在首次需要時取得 combo、把僅 tunnel 可達的 sourcemap 內嵌為 Base64 data URL，再以 Blob 執行腳本。Tunnel 還暴露 fetch 形式的傳輸、獨立檔案上傳載體和 API 用戶端。請求幀透過結構化克隆保留 Blob 請求體，並轉移 `ReadableStream<Uint8Array>` 的所有權。Host Worker 將兩種請求體都逐塊送入路由，因此通用檔案上傳不會在任何瀏覽器執行緒建立完整位元組陣列。Remote 流的上行以 `stream-uplink-item` / `stream-uplink-end` 幀進入沒有上限的 `TunnelUplink`，`end` 之後到達的項被丟棄：頁面與其 worker 是同一個可信的同源邊界，Host 的 inbox 上限在此不適用。

驗收在 `apps/web/tests/preview-boot.e2e.ts`：靜態服務真實建置頁面，在 headless Chromium 裡驅動 pre-boot 選擇面板與 Worker 啟用。空白選擇驗證首次啟動；`vfs-example` overlay 提供普通 workspace 檔案與明文 persistence 產物，無需模型請求即可驗證 Workspace/Session 冷發現、工具呈現、subagent 導航和歷史分頁。[打包器](../webworker-packer/README.zh.md)在 Node 中根據已提交的歷史日誌準備目前代後繼檔案；這些源日誌在 overlay 中逐位元組保持不變。fixture 生成器負責驗收測試的目前投影快取。選擇面板為 WebFS 保留獨立的使用者授權來源；該 provider 不讀取內建 fixture。

[已建置 bundle 匯入檢查](tests/compile/transform-corpus-check.ts)在庫建置後檢查裸 Node 匯入。Dockkit 例外接受 Node 針對任意樣式表報告的未知 `.css` 副檔名錯誤，而不限定某一固定路徑；其他副檔名、錯誤碼或訊息，以及意外成功的豁免匯入，仍然報錯。參見 [樣式表豁免決策](../../../.agents/notes/implemented/bug-fix/2026-09-10-built-bundle-css-exemption.zh.md)。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包只在瀏覽器 worker 裡承載外掛樹並應答它的 `node:*` 呼叫；所有面向模型的註冊都屬於它啟動的那些外掛。

#### KV Cache 影響

無：本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **worker 組合寫明文工作階段日誌**（`compression: 'none'` boot patch）：不帶 Zstandard 編解碼器，匯出日誌是 `.jsonl`，不會是 `.jsonl.zstd`。
- **`node:dns/promises`、`node:vm`、`node:net`、`node:sqlite`、`node:worker_threads` 是結構化 stub**：每次呼叫在 console 報告拒絕並丟擲。需要原生 DNS、真程序或真 realm 隔離的行在此無法執行。
- **主機包管理命令不可用**：`execa` 明確報告 worker host 不支援該呼叫；預覽無法執行 pnpm 或安裝原生依賴。
- **PTC Node 程式不可用**：process shim 用 `/dsh/bin/node` 表示可執行檔案身份，使 provider 能夠啟用，但 Worker 既沒有 Node 可執行檔案，也沒有 `stripTypeScriptTypes`。程式執行會在啟動子程序前失敗。
- **Office 轉換需要 Node Host**：LibreOffice kit 的替代模組以 `unavailable` 拒絕建立轉換器。瀏覽器映像排除 kit 及其引擎依賴；Office 預覽提示轉換不可用。
- **檔案 watcher 只能觀察已掛載的 VFS**：映像 seed 不產生事件，VFS 也沒有符號連結或外部寫入方。`persistent`、`ref()` 和 `unref()` 保留 Node API，但瀏覽器沒有引用計數事件迴圈，因此這些介面不能控制 dedicated Worker 的生存期。
- **Worker confinement 是 VFS 邊界，不是核心 Landlock**：`read-only` 和 `workspace-write` 執行未經修改的 `@deepseek-ai/node-addon-system/landlock-run` JavaScript 與 launcher argv，程序層則實作邏輯 `landlock-run` 可執行檔案，並在 shell 的每次檔案系統請求上執行其授權。`full` 僅覆蓋 Worker 命令表和已掛載 VFS，不表示能夠執行任意 native 程序，也不表示 Linux 核心隔離。
- **worker 束釘住了 `@yarnpkg/parsers` 的包內路徑**——建置解析到該包自己的 `lib/shell.js` 而非包根，因為包根 barrel 還 re-export 了 Syml 解析器，會把 js-yaml 拖進一個從不解析該格式的束（約 175 kB，外加 worker 啟動時的模組體求值）。該路徑由包 manifest 派生，包內佈局一變即建置期失敗、不會靜默退回 barrel；升級這個依賴時須複核 shell 解析器是否仍在那裡。
- **這個 shell 不是 bash**：沒有迴圈、函式、`case`、作業控制或程序替換——語法止步於管道、`&&`/`||`、子 shell、group、重定向與展開。`&` 會就地把命令跑完，`sed` 只接受替換腳本，模式是 JavaScript 正則，命令表只有 coreutils（沒有 `git`，沒有網路工具）。
- **shell 程序沒有同步檔案面**：它靠訊息讀寫主機的 VFS，因為阻塞等待回幀需要 `SharedArrayBuffer`，而那要求 GitHub Pages 給不了的跨源隔離。因此目錄遍歷類命令每個條目一次往返，並行的兩條命令寫入可以交錯。
- **transport、worker-host、頁面半的覆蓋需要瀏覽器級 harness**——這些模組未達 per-file 覆蓋門；單測覆蓋 storage、ALS、transform 與 stub 契約。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是 Cordis 啟動前的平臺 glue；其啟動的產品樹執行各包自己的不變式，image 與 tunnel 約定在 boot 時失敗。
