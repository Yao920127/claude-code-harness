# Agent Note: 將 Node 編譯快取重定向到資料卷 runner 臨時目錄

Status: implemented

[English](2026-08-28-ci-node-compile-cache-data-disk.md) | 中文

## 問題

自託管 Linux CI 虛擬機器（`vm-backup` 池，32 個 runner 實例共宿一機）的根分割槽 inode 正在耗盡。issue #3134 的殘留（`/tmp/dsh-*`）是來源之一；第二個、更大的來源是 Node.js 模組編譯快取。CI 工具鏈中的工具顯式呼叫 `module.enableCompileCache()`：pnpm 11.7.0 在入口（`bin/pnpm.mjs` 中的 `module.enableCompileCache?.()`）每次呼叫都啟用快取，TypeScript 在 `tsc`/`tsserver` 中啟用；vitest 轉發該 API 但自身不啟用。每次這樣的呼叫都把序列化 V8 位元組碼快取寫到 `os.tmpdir()/node-compile-cache`。在共享虛擬機器上即根分割槽的 `/tmp`：2026-08-28 實測為 **697,389 個 inode、9.2 GB**，其中 34,110 個檔案不足 1 小時——快取每次 CI 執行都在增長且從不清理，即使 `dsh-*` 殘留被控制，根分割槽 3,276,800 個 inode 仍趨向耗盡。

## 決策

每個可能執行在 `vm-backup` 池的 Linux lane（`ci.yml` static/coverage/snapshots——預設 hosted，僅 `DSH_CI_FAILOVER_LINUX=selfhosted` 時自託管；`ci-master.yml` serial standby——始終自託管）都把 `NODE_COMPILE_CACHE` 重定向到 per-runner 資料卷臨時目錄 `${{ runner.temp }}/node-compile-cache`。`runner.temp` 在 `/data_local`（1 TB，inode 用量約 1%）上，per-runner（`_workNN/_temp`），因此快取不再消耗根分割槽 inode。

重定向是在 `actions/checkout` 之後的一個 step，把 `NODE_COMPILE_CACHE=${{ runner.temp }}/node-compile-cache` 寫入 `$GITHUB_ENV`，因此 lane 中後續每個 step——`pnpm/action-setup`、store 路徑探測、安裝、Playwright 安裝和測試門禁——都會繼承該變數。必須用注入而非 job 級 env：`runner` 上下文在 job 級 `env` 不可用（與早前 TMPDIR 工作相同的約束）；而僅給門禁 step 設 step 級 env 會讓更早的 pnpm 呼叫繼續寫根分割槽 `/tmp`。sandbox（bwrap/Landlock）未授權 `runner.temp` 路徑的受限子程序會繼承該變數但**靜默跳過快取**——已在虛擬機器上驗證：`NODE_COMPILE_CACHE` 指向 bwrap 內未授權路徑時，`node` 正常執行（exit 0），與 `mkdtemp` 的只讀檔案系統硬失敗不同。編譯快取按設計是盡力而為；寫失敗只是快取未命中，不是崩潰。

## 驗證

- VM 探針：`NODE_COMPILE_CACHE=/data_local/ci/compile-cache-probe node -e 'require("node:fs")'` 在資料盤寫出了 `v22.23.2-x64-*` 快取子目錄（位置切換生效）。
- VM 探針（bwrap）：`NODE_COMPILE_CACHE` 指向 bwrap profile 未授權的路徑時，`node` 正常執行（exit 0）——快取寫失敗被容忍。
- `scripts/ci-workflow.spec.ts` 斷言每個 Linux lane 都在 `pnpm/action-setup` 之前把 `NODE_COMPILE_CACHE=${{ runner.temp }}/node-compile-cache`（`$GITHUB_ENV` 的 `KEY=VALUE` 行）注入 `$GITHUB_ENV`；位置斷言在注入移出首次 pnpm 呼叫之後時會失敗。
- CI lane：三個必需的 Linux job（預設 hosted，`DSH_CI_FAILOVER_LINUX` 時自託管 `vm-backup`）會在新 env 下跑完整套件；快取處理迴歸會表現為 lane 失敗。

## 備選方案

### 為什麼不徹底停用編譯快取？

`NODE_DISABLE_COMPILE_CACHE=1` 會立即停止根分割槽增長，但會放棄每次執行的啟動加速，而快取是 Node 正當有用的特性（由 pnpm 和 TypeScript 顯式啟用）。重定向在保留收益的同時把成本移出受限分割槽。

### 為什麼不把 `node-compile-cache` 納入 `dsh-*` 清理？

CI 清理（殘留清理改動中新增）針對測試殘留；編譯快取是快取而非殘留。每次執行刪掉它會丟棄快取本要提供的加速。重定向是結構性修復：快取的增長移到為它準備的捲上。

### 為什麼不用 job 級 env 或只給門禁 step 設 env？

`runner` 上下文只在 step 級 `env` 可用；job 級 `env` 會求值為空字串（GitHub contexts-availability），靜默讓快取留在根分割槽。只給門禁 step 設 step 級 env 也只覆蓋那一個 step：lane 中更早的每次 pnpm 呼叫（setup、store 路徑探測、安裝）仍會寫根分割槽 `/tmp`。在 checkout 與 `pnpm/action-setup` 之間的 step 注入 `$GITHUB_ENV`，使變數在 lane 首次 pnpm 呼叫之前生效，一個 step 即可覆蓋整條 lane。

## 後果

- **買到**：Node 編譯快取不再消耗根分割槽 inode；該來源的 inode 壓力被移除且不損失快取的啟動收益。快取現在位於資料捲上的 per-runner `_workNN/_temp`。
- **代價**：快取在 `runner.temp` 累積，而 runner 不會在 job 之間清空它（早前實測）——但在資料卷（inode 用量約 1%）上無礙。
- **代價**：沒有 `runner.temp` 授權的受限子程序會為其自身的 `node` 呼叫跳過快取；這是快取未命中而非失敗，符合 Node 的盡力而為契約。
- **代價**：改動只涉及 CI 設定；本地開發保持預設 `os.tmpdir()` 位置。
