# Agent Note: 單檔案可執行的 SDK 執行時分發（single-exe）

Status: implemented

[English](2026-07-10-single-file-executable-sdk-runtime-distribution.md) | 中文

## 問題

DeepSeek Harness 需要為 Python 庫專門提供一種無需安裝 Node、可直接在目標平臺執行的 SDK 分發形態：一個單檔案可執行程式（下稱 exe），透過 stdio 提供 JSON-RPC 對外服務介面（`HarnessSdkJsonRpcServer`，Python SDK 的對端），且實際啟動的外掛與設定完全由 exe 外部輸入的 `cordis.yml` 決定。

- 與 Python SDK 通訊的 JSON-RPC 協定已經過驗證
- 需要提供一種讓 `cordis.yml` 載入所有外掛（ES 模組）的標準方式
- 分發物要自帶 Node 執行時，並支援本地原始碼連結的除錯模式

## 決策

### 打包路線：@yao-pkg/pkg 的 `--sea` 模式

exe 使用 [@yao-pkg/pkg](https://github.com/yao-pkg/pkg)（vercel/pkg 歸檔後的活躍維護 fork）的 **`--sea`（enhanced SEA）模式**打包。相比 Node 原生 SEA，pkg 在其上增加 `/snapshot` 虛擬檔案系統（VFS）與執行時模組掛鉤，將 ESM 入口原樣交給 Node 預設的 ESM loader，不依賴任何 ESM→CJS 轉譯。
> 實測（macos-arm64、node24 建置目標、pkg 6.21.0）：VFS 內裸包名 ESM 動態 `import()`（含頂層 `await`）、CJS 互操作、`node:sqlite`、集合外包名明確報錯、VFS 外磁碟 ESM `import()` 全部透過，`import.meta.url` 原樣為 `file:///snapshot/...`。

`--sea` 要求建置目標 ≥ node22，exe 統一以 node24 為建置目標；每次 pkg 呼叫只打包一個建置目標，多平臺各呼叫一次。

`@yao-pkg/pkg` 是精確釘版的根 `devDependency`，經 `pnpm exec pkg` 呼叫，並以 [`patches/@yao-pkg__pkg@6.21.0.patch`](../../../../patches/@yao-pkg__pkg@6.21.0.patch) 移除 SEA bootstrap 中的 `patchChildProcess` 呼叫。未打補丁時，pkg 會把 spawn 的 `node` 命令——包括 `-c`/`/c` 標誌後的命令串，恰是 Bash 工具的 `bash -c` 形態——改寫為 exe 自身，並向每個子程序環境注入 `PKG_EXECPATH`，模型下發的 `node --version` 會靜默啟動 dsh CLI；Node 自身的 SEA 層沒有這種改寫，且 SEA 二進位制永遠啟動內嵌應用、無法充當純 Node。移除該呼叫後，子程序像普通程序一樣經 PATH 解析 `node`（無 Node 的機器如實報 command not found），子程序環境不再出現 `PKG_EXECPATH`，以 `process.execPath` 絕對路徑 spawn 的重入不受影響，worker 執行緒本來就未應用該掛鉤，`process.pkg` 側車選擇也不受影響。

同一補丁還把 SEA bootstrap 的原生外掛解包改成原子寫入。VFS 內的外掛首次 `dlopen` 時，pkg 的 `patchDlopen` 會把該外掛所在的包目錄整棵拷到 `$PKG_NATIVE_CACHE_PATH/pkg/<.node 檔案的 sha256>/`（預設 `~/.cache/pkg/...`），這是同一個 exe 的所有並行程序共用的按使用者目錄；上游用 `writeFileSync` 直接寫目標路徑，會把另一個程序可能已經對映的檔案截斷，並讓該程序的 `existsSync`/雜湊比對讀到寫了一半的檔案。因此並行首次啟動在 Linux 上以 SIGBUS 崩潰，在 macOS 上對 sharp 的 libvips 報 `ERR_DLOPEN_FAILED: Library not loaded`（#4664）。補丁讓三處寫入都經過同目錄臨時檔案加 `renameSync`，於是快取路徑要麼不存在、要麼完整，每個程序都在載入前走完自己的複製，相同內容的並行 rename 不需要鎖。快取位置、雜湊鍵與逐檔案比對均未改變，透過 `PKG_NATIVE_CACHE_PATH` 按實例隔離快取的消費方照常工作；worker 執行緒只定義該掛鉤而從不安裝。 實測（linux-x64、node24 建置目標、pkg 6.21.0，一個載入 sharp 及其 18 MB libvips 庫的探針，16 個程序對同一個空快取並行首次啟動，跑五輪）：改動前 80 個程序中 39 個以 SIGBUS 崩潰，改動後 80 個全部正常，且無殘留臨時檔案。

術語提醒：pkg 的 `/snapshot` VFS 與本儲存庫測試體系的「快照」（ACP（Agent Client Protocol）回放預期輸出、`$DSH_SNAPSHOT`）無關，本文用「VFS」指前者。

### 對外服務介面是 dsh 應用中的外掛

確定性服務介面由打包後的 `dsh` 應用選擇為外掛：

- [`packages/sdk/server`](../../../../packages/sdk/server/README.zh.md)（`@deepseek-ai/dsh-sdk-jsonrpc-server`）：純協定外掛；執行 `apply` 時，在程序 stdio 上掛載 `HarnessSdkJsonRpcServer` 與按行分隔的 JSON-RPC 傳輸層，資源釋放走 `ctx.effect()`。是否提供服務由 `cordis.yml` 決定；未掛載該外掛的設定會啟動一個不提供此服務的合法程序。協定級退出歸外掛所有（應答並確保 `shutdown` 回應傳送完畢後，對根執行時執行 dispose（資源釋放），讓待處理的持久化操作完成，再呼叫 `exit(0)`；HMR（熱模組替換）式解除安裝只停止服務，不退出程序）。
- [`apps/cli`](../../../../apps/cli/README.zh.md)（`@deepseek-ai/dsh`）：打包後的應用入口；其 `sdk` profile 掛載 `dsh-sdk-jsonrpc-server`，CLI 負責環境分層、profile 組合、stdin／signal 關閉與程序退出。

Python 用戶端提供顯式 Harness home，並選擇 `sdk` profile 與有序 patch 檔案。缺失 home、profile、bundle 或 server 設定項都會明確失敗；不存在外部完整設定退回。[docs/architecture.md](../../../../docs/architecture.zh.md)負責該應用介面。

### 外掛解析：VFS 裝載真實包樹，閉包 manifest（中繼資料清單）就是部署根目錄

exe 的 VFS 內是**建置產物形態的真實包樹**（各包的 `lib/` + 真實 `node_modules`）。打包專用 JSON-RPC 入口會向 app-boot 的根 Include 提供自身已安裝 harness 的基準位置：相對外掛說明符從外部設定目錄解析，裸包名則從 VFS 解析，因此位於另一個 Node 專案內的設定無法遮蔽已打包的外掛集合。普通開發 bin 仍由設定專案提供裸包。打包入口中的裸包名從該入口在 VFS 內的位置沿 `node_modules` 向上解析，自然落在 VFS 內。封閉集不需要白名單程式碼——VFS 中安裝了什麼，集合中就有什麼；`import()` 集合外的名稱會失敗。

部署根目錄是 [`python/sdk-runtime/package.json`](../../../../python/sdk-runtime/package.json)（`dsh-python-runtime-closure`，pnpm 工作區成員、零程式碼純依賴 manifest），也是「exe 安裝哪些外掛」與「Python 執行時分發什麼」的統一真源。向 exe 新增外掛，就是在 manifest 中增加一行依賴後重新打包。[`scripts/verify-runtime-closure.ts`](../../../../scripts/verify-runtime-closure.ts) 讀取每個已釋出的 `packages/bundle/web-app/cordis.patch.yml*/agent.cordis.yml`，針對 `python/sdk-runtime/platforms.json` 中的每個目標解析比較 `process.platform` 的 `disabled` 條件，並要求該目標啟用的每個工作區外掛都透過顯式的 `workspace:` 依賴列在執行時根目錄。它還遍歷該 manifest 覆蓋的全部工作區包，要求每個非可選的工作區對等依賴（peer dependency）都顯式列出，並報告“preset 或引用包 → 缺失依賴”的完整鏈結；無法識別的平臺條件會保持啟用，避免因不支援的表示式遺漏外掛。`pnpm run hygiene`、CI 靜態檢查與 single-exe 建置都會在打包前執行該門禁。部署還會依據各包的 `files` 欄位打包，因此 tsdown 拆出的共享分片必須被 `files` 覆蓋。

部署根目錄顯式包含 `@deepseek-ai/dsh-mcp-client`，將其作為自定義設定可用的外掛，即使隨附 preset 均未掛載該外掛。外部設定因此可以連線由使用者提供的 stdio 與 Streamable HTTP MCP server 並註冊其工具；分發物不包含這些 server。可選資源服務提供 MCP Resources；MCP Prompts 仍不受支援。可執行程式與已安裝 wheel 包的冒煙測試會啟動臨時 stdio server，發現其工具，並完成一次由模型請求的呼叫。

[Office kit](2026-09-14-independent-libreoffice-kit.zh.md) 及其已安裝依賴樹位於 `<executable-stem>-office/node_modules`，保留完整包內容與輔助程式權限。頂層 `pkg.ignore` 從 SEA 歸檔排除 kit 包，包括依賴 `files` 欄位選中的資源；與其他使用方共享的小型依賴仍可在 VFS 中使用。Python 私有 bootstrap 使用 Node `registerHooks` 從真實目錄解析 kit 入口及其包清單。因此原生可執行程式與 URL Worker 保留普通檔案路徑，無需修改 kit 或公開 CLI。必需包缺失或已安裝檔缺少清單會使複製失敗；未安裝的可選包保留 kit 自身的引擎選擇規則。

### 建置流水線與產物

[`scripts/build-exe-for-python-sdk.ts`](../../../../scripts/build-exe-for-python-sdk.ts)：執行時閉包驗證 → `pnpm run build` →（清空後）`pnpm --filter dsh-python-runtime-closure deploy --legacy --prod --config.allow-unused-patches=true --config.node-linker=hoisted --config.auto-install-peers=false --config.link-workspace-packages=true` **直接寫入** `python/sdk-runtime/src/deepseek_harness_runtime/runtime/node/`，其中包含作為載體根目錄 `runtime-bootstrap.mjs` 的 [`python/sdk-runtime/runtime-bootstrap.mjs`](../../../../python/sdk-runtime/runtime-bootstrap.mjs) → 恢復 legacy deploy 遺漏的直接工作區包，並拒絕剩餘的 manifest 缺口 → 將暫存依賴中的符號連結替換為目標檔案內容，刪除包管理器的 `.bin` 連結，並在仍有任何符號連結時失敗 → 驗證已部署的 bootstrap，並注入以該檔案為 bin 的 pkg 設定及覆蓋動態讀取 profile、bundle、前端、preset、原生庫與設定檔的 assets → 暫存目標平臺的 `node-pty` addon → 每個建置目標呼叫一次 `pkg --sea` → 將 `deepseek-harness-sdk-runtime-<platform>-<arch>` 寫入 `dist-exe/`，並將它與對應目標的 Office 目錄一同拷回執行時目錄。該 bootstrap 由 Python runtime 擁有；普通啟動時它呼叫公開 CLI export，而提供者私有選擇會分派到同一個 `@deepseek-ai/dsh-subprocess-local/runner` 核心，不改變 CLI 語法，也不增加另一個可執行檔案；[原生 containment 決策](2026-08-28-subprocess-native-containment.zh.md)負責這條私有路徑。Linux CI 會在匹配的 manylinux 2.28 容器中重新建置 `pty.node`，因為 legacy deploy 會遺漏這一安裝副作用。每個目標都會把對應的原生 `@vscode/ripgrep` 二進位制複製到可執行檔案旁，作為必需的 `-rg` 伴隨檔案；pkg 執行時透過 `process.pkg` 選擇該伴隨檔案，普通 Node 執行則直接使用 `@vscode/ripgrep`。macOS 使用對應目標的預建置產物，並額外生成所需的 `-spawn-helper`。部署標誌都有實測依據：未啟用 `inject-workspace-packages` 時必須使用 `--legacy`；`hoisted` 為 pkg 提供穩定的單實例佈局，再由顯式物化步驟消除符號連結；關閉對等依賴自動安裝可防止未宣告的對等依賴擴大閉包；`link-workspace-packages` 選擇直接工作區依賴。[`pnpm-workspace.yaml`](../../../../pnpm-workspace.yaml) 將傳遞的 `@deepseek-ai/cosmokit` 與 `@deepseek-ai/schemastery` semver 請求覆蓋到固定的 vendor 原始碼，使 legacy deploy 不會從註冊表解析這些未釋出名稱。 生產部署允許未使用的工作區補丁，因為開發工具可能不屬於執行時閉包；閉包內包的補丁應用失敗仍會中止部署。工作區安裝繼續嚴格驗證未使用的補丁。

CI 使用 [`.github/workflows/build-exe-for-python-sdk.yml`](../../../../.github/workflows/build-exe-for-python-sdk.yml)：[安裝後 wheel 包驗證](../testing/2026-08-23-installed-python-wheel-black-box-ci.zh.md)在拉取請求上執行 Linux/Windows x64，在 master 推送上執行 Linux ARM64 與兩種 macOS 架構。[公開發布工作流](../../archived/process/2026-08-11-python-publication-workflow.md)呼叫它建置全部五個目標；`workflow_dispatch` 仍可選擇部分目標。linux-x64、linux-arm64（`ubuntu-24.04-arm`）、macos-arm64、macos-x64（`macos-15-intel`）與 win-x64（`windows-2025`）分別進行原生建置，並在適用平臺快取 `~/.pkg-cache`；macOS 的 ad-hoc 簽名由 pkg 處理。每個平臺都把釋出形態的 SDK wheel 包與執行時 wheel 包安裝到 checkout 外的乾淨 venv，證明包與可執行檔案來源，再透過公開 SDK 與直接 NDJSON JSON-RPC 執行完整 keyless 情境。可信拉取請求與 master 推送還會在各自選定的目標上執行真實 DeepSeek 雙輪工具冒煙測試；fork 與 Dependabot head 不會獲得金鑰。Linux 會檢查可執行檔案和原生 addon 各自的 GLIBC 依賴，並額外執行 manylinux 2.28 冒煙測試；macOS 則檢查 runtime、ripgrep 與 PTY helper 的架構，並驗證三個載荷的部署目標都符合 wheel 包標籤。完整建置五個目標時保留 6 個產物，每個產物只含一個釋出檔案：平臺無關的 SDK wheel 包與 5 個原生執行時 wheel 包；手動選擇部分目標時保留 SDK wheel 與所選執行時 wheel。裸 exe 與原始碼包只作為測試中間輸入。[`python/sdk-runtime` README](../../../../python/sdk-runtime/README.zh.md)負責 Windows 目標及對 Windows arm64 的明確排除。

### Python SDK 分發：雙載體，exe 用於生產，`node` 用於開發

Python SDK 位於 [`python/`](../../../../python/README.zh.md)：`python/sdk` 是用戶端，`python/sdk-runtime` 是執行時載體包。執行時包的資料目錄包含建置注入的平臺可執行檔案及其必需的 `-rg` 伴隨檔案、`-office/` 目錄和可選的 macOS helper，以及供儲存庫開發使用的建置注入 `runtime/node/` 閉包樹。`resolve_bundled_launch_args()` 預設選擇可執行檔案；顯式設定 `DSH_RUNTIME_MODE=node` 會在系統 Node 22.19 或更高版本上執行 `runtime/node/node_modules/@deepseek-ai/dsh/lib/bin.js`。node 載體從不進入 wheel 分發，兩種載體都不使用檢入的完整 `cordis.yml`。

[`scripts/build-python-release.py`](../../../../scripts/build-python-release.py) 從儲存庫根目錄的 `package.json` 讀取權威的 `X.Y.Z` 或預釋出版本，把預釋出版本轉換為 PEP 440 寫法，並以該 wheel 包版本暫存兩個包，讓 `deepseek-harness-sdk` 精確依賴匹配版本的 `deepseek-harness-runtime-bin`。可選的 `python-v<repository-version>` 釋出標籤只是一項一致性斷言，與儲存庫版本不同時會被拒絕；原始碼 `pyproject.toml` 中的開發佔位版本從不決定釋出版本。暫存過程還會把儲存庫許可證放入兩個 wheel 包，並把第三方宣告放入內建執行時 wheel 包。SDK 是 `py3-none-any` wheel 包；每個只提供 wheel 包的執行時包都包含一個 exe、其 Office 目錄及架構匹配的 ripgrep 伴隨檔案，macOS wheel 包還包含與其架構匹配的 spawn helper。執行時 wheel 包使用 `py3-none-manylinux_2_28_x86_64`、`py3-none-manylinux_2_28_aarch64`、`py3-none-macosx_14_0_arm64`、`py3-none-macosx_14_0_x86_64` 或 `py3-none-win_amd64`；Hatch 掛鉤拒絕 sdist、通用標籤、混合平臺載荷、伴隨檔案缺失或多餘，以及不支援的平臺。兩個 macOS 標籤都會特意宣告保守的 14.0 安裝下限：打包後的 Node 24 可執行檔案宣告 macOS 13.5，x64 PTY helper 宣告 10.7，但釋出驗證只按照 14.0 wheel 宣告證明完整載荷，不會把各元件實測的最低版本承諾為受支援主機。兩個 macOS wheel 包仍按架構分別釋出，不釋出 universal2 wheel 包。

Python 用戶端使用所選 profile（預設 `sdk`）、有序 patch 檔案和顯式 Harness home 啟動打包後的 `dsh` 命令。Profile 負責 JSON-RPC 服務和應用組合；缺失 home、profile、bundle、patch 或 server 設定項都會失敗，不存在外部完整設定退回。

### 命名血統

`dsh-python-runtime-closure` 是私有部署 manifest，`deepseek-harness-sdk-runtime-<platform>-<arch>` 是可執行檔案族。協定欄位 `serverInfo.name` 是 `deepseek-harness-sdk-runtime`；Python 分發包名是 `deepseek-harness-sdk` / `deepseek-harness-runtime-bin`，匯入模組名是 `deepseek_harness` / `deepseek_harness_runtime`。

## 打包後的工作流與程式碼執行

`dsh-workflow-ptc` 透過 `dsh-ptc-runtime-node` 傳送自包含 guest 程式。共享提供者透過可執行檔案的私有 Node bootstrap 分派啟動受管子程序，並使用專用控制通道；不需要獨立的工作流 worker 資源。[沙箱 Node 決策](2026-09-11-sandboxed-node-ptc-runtime.zh.md)負責程序與策略生命週期，[工作流沙箱複用](2026-09-13-workflow-ptc-sandbox-reuse.zh.md)負責工作流介面卡。

## 測試

驗證面分三層。機制層：`--sea` 鏈結的實測結論內嵌在「決策」各節（VFS 內 ESM 動態 `import()`、單一 Cordis 實例、明確報錯的設定鏈結、`node:sqlite`、macOS ad-hoc 簽名可執行）。SDK 層：完整的無金鑰 pytest 套件以 mock 執行時對端覆蓋用戶端協定、子程序清理、絕對 `cwd` 傳遞、雙載體啟動與載體解析；根 CI 在 Python 3.10 上執行全部案例。端到端層：每個平臺建置都會把兩個 wheel 包安裝進 checkout 外的乾淨 venv，證明版本相同以及已安裝模組／可執行檔案的位置，再透過預設 SDK 路徑、自定義設定、儲存庫內建的獨立 minimal 組合和直接二進位制協定，對 mock 端點完成輪次，並驗證最終文字與 JSONL。minimal 執行會斷言其精確系統提示詞與單個 shell 工具目錄，並跨呼叫保留 shell 狀態。自定義設定還會透過共享的打包後 Node 程序 bootstrap 執行 `run_code` 和不啟動 agent 的 `workflow`。檔案系統搜尋情境要求模型透過目標平臺的 `-rg` 伴隨檔案呼叫 `glob` 與 `grep`。spawn-node 情境驅動平臺 shell 工具執行以 `node` 開頭的命令，要求工具結果給出機器自身的 Node 版本且子程序環境中無 `PKG_EXECPATH`，把打包執行時釘死在「pkg 升級重錄 child_process 補丁也不得迴歸」的行為上。MCP 情境會啟動臨時外部 stdio server，刻意延遲首次 `tools/list` 回應，隨後立即啟動第一個 SDK 提示詞；該提示詞必須看到並呼叫已發現的工具，從而證明 `initialize` 是真正以 Loader 外掛樹完全穩定為準的就緒邊界，而不是依賴定時 sleep。同一項安裝後執行還會經 Python SDK 比較一組檢入的 exe 專用快照：無金鑰腳本化模型掛載一個會註冊工具的 Cordis 外掛，從 `run_code` 呼叫該工具，執行一個直接 spawn 的 subagent 和一個會透過 spawn 啟動第二個 subagent 的工作流，隨後解除安裝該外掛。該 fixture（測試前置資料）會顯式停用組合包中未使用的 Bash 和本地 skill（技能）發現，使其工具集不依賴儲存庫外部狀態；比較時會規範化 SDK 結果與通知流，以及父工作階段和兩個子工作階段 JSONL 日誌中不透明的訊息、agent、工作流執行與工作階段 ID。可信拉取請求會增加真實提供者雙輪檔案寫入／讀取，並要求外部位元組、工具呼叫、已完成原因與持久化日誌一致。該 harness 與 ACP 的 `pnpm run test:snapshot` 保持獨立，因為二者的協定和建置產物不同。

手工驅動注意：`bin` 將 stdin EOF 視為「用戶端已離開」並立即 dispose，生命週期較短的管道會中止進行中的輪次——管道驅動必須保持 stdin 開啟，直到輪次結束。

安裝後 wheel 的 `sdk-office` 情境會將目標的完整載荷複製到私有臨時目錄，要求僅存在一個目標後端（使用已宣告的原生目標，未宣告原生目標時使用 WASM），並透過隨附 SDK profile 使用該引擎轉換一次 DOCX。它檢查 kit 模組確實解析到遷移後的目錄、轉換報告預期後端，且輸出包含 PDF 位元組。wheel 驗證會檢查宣告的引擎資源與原生輔助程式執行位；CI 上傳已完成的 wheel，因此巢狀輔助程式權限保留在 ZIP 歸檔中。

## 曾考慮的替代方案

**裸用 Node 原生 SEA。** 注入的主腳本必須是 CJS 單檔案，blob 內沒有檔案系統與模組解析，因此動態 `import()` 無法解析裸包名；只能把外掛靜態編譯進主腳本並手工註冊。這會繞過標準模組解析並硬編碼外掛集合，與「設定決定一切」相悖。最終路線實際是「官方 SEA 基礎 + pkg 的 VFS/模組掛鉤層」；否決的是裸用方式，而不是 SEA 本身。

**pkg 標準模式。** PoC 證明該模式不可行，而非權衡後放棄：它透過 esbuild 將 ESM 轉為 CJS + V8 位元組碼，但執行時 VM 編譯沒有接入動態 `import()` 回呼，任何 `import()` 都會丟擲 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`，`--options experimental-require-module` 也無效；此外，它依賴社群補丁版 Node 二進位制（macos-arm64 沒有預編譯版本，現場從原始碼編譯約需 10 分鐘）。該模式不適用於本儲存庫架構。

**每包 ESM→CJS 預打包進 VFS。** 保持真實解析語義、只降級模組格式的折中；`--sea` 直接透過實測，這層建置複雜度無需引入。

**讓 jsonrpc-agent 承擔完整閉包依賴。** 應用入口將宣告 53 個以上自身並不 `import()` 的依賴，使「打包 manifest」偽裝成真實依賴關係，還會迫使 `constraints` 為其增加 `cordis-in-dependencies` 與 `files` 萬用字元兩個例外。將閉包 manifest 放在 Python 側的 manifest 包後，`constraints` 不需要任何例外，`bin` 也能保持與 acp-agent 同構的正常包形狀。

**開放外掛集（從磁碟載入使用者外掛）。** 交付的集合是封閉的；PoC 同時證實，可以透過 `ctx.baseUrl` 相對路徑通道從 VFS 外的磁碟 `import()` ESM。該能力列為後續演進，屆時還需解決外部外掛與 exe 內 Cordis 實例的共享問題。

## 後果

**買到的**：受支援目標無需依賴系統 Node.js；外掛語義與原始碼執行嚴格一致（同一棵真實包樹，無轉譯、無註冊表）；對外服務介面、外掛集與設定全部收斂到 `cordis.yml` 和一份依賴 manifest 這兩個真源；exe 與 `node` 雙載體使用同一棵樹和相同語義，開發驗證無需等待打包；官方 Node 二進位制消除了補丁版二進位制的供應鏈顧慮。

**付出的**：大型 Office 引擎資源保留在 SEA 歸檔之外，可執行檔案必須與必需的伴隨檔案一起遷移；原始碼原樣進入分發物（沒有位元組碼混淆；閉源分發訴求需要另行評估）；pkg 的 VFS/模組掛鉤層仍由社群維護（`@yao-pkg/pkg` 為精確釘版、帶 pnpm 補丁的根 devDependency，升級需重錄補丁，屬顯式改動）；`--sea` 每個建置目標呼叫一次（與 CI 每個平臺一個任務相匹配，本地多平臺建置序列執行）。
