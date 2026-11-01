# Agent Note: dsh 透過 tsx ESM 掛鉤原始碼啟動

Status: implemented

[English](2026-07-29-dsh-source-launch-tsx-esm.md) | 中文

> 取代[原生 TypeScript 原始碼啟動](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md)：Node 移除了該決策所依賴的能力。

## 問題

[已歸檔的原生原始碼啟動決策](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md)讓 `apps/cli/src/bin.ts` 在 `node --experimental-transform-types` 下執行，配合一個只做解析的 paths loader，由 Node 負責 TypeScript 轉換。Node 26.0.0 移除了 `--experimental-transform-types`（程序以 `bad option` 拒絕該 flag），只保留 strip 模式，而 strip 模式無法接受這個原始碼圖必需的語法：vendor Cordis 中的參數屬性（`constructor(private ctx: Context)`）、`vendor/hmr` 中的 `@Inject` 裝飾器，以及遍佈 `vendor/` 與 `packages/workflow` 的執行時 enum/namespace。儲存庫的 engines 範圍（`^22.19.0 || >=24.0.0`）包含 Node 26，因此原生啟動鏈在其上完全無法啟動——且沒有任何 CI 任務執行過真實啟動向量，這一不相容悄然釋出。

啟動延遲同樣是問題：off-thread 的 `module.register()` 掛鉤工作執行緒把每次解析都跨執行緒序列化（TUI 啟動期間約 440ms 的 `makeSyncRequest` 等待），而完整的 tsx 預設形態（`--import tsx`）會因其 CJS 掛鉤放大解析開銷而多花約 0.4s。

## 決策

`dsh` CLI（命令列介面）原始碼啟動執行 `node --import tsx/esm`：由 tsx 的 ESM-only 掛鉤同時負責 TypeScript 轉換與 tsconfig `paths` 投影。根目錄的 `dsh` 腳本直接從儲存庫根目錄使用同一啟動方式；產物生成是獨立操作，由[原始碼啟動與建置分離決策](../../archived/simplification/2026-08-12-separate-source-launch-from-build.md)規定。CJS 掛鉤保持關閉，因為 CLI 原始碼圖是純 ESM；實作時測得啟動至 TUI banner 耗時約 0.7s，對比完整 tsx 預設形態約 1.1s、已移除的原生鏈約 0.75s。

tsx 負責 workspace `paths` 對映，不檢查匯入方是否把每個包宣告為執行時依賴。宣告完整性由靜態門禁保障：設定的裸外掛走 `verify-cordis-config`，manifest（中繼資料清單）走 workspace constraints。已移除的儲存庫自有 paths loader 曾在執行時強制這些宣告，並發現過將 `@deepseek-ai/dsh-llm` 僅宣告在 devDependencies 中的 import；tsx 不提供這項檢查。

匯入方 URL 含有 `/node_modules/` 時，tsx 會跳過 paths 對映。因此，[runtime resolution](2026-09-09-profile-resolution-generations.zh.md)記錄宣告包的真實錨點，也覆蓋遞迴依賴。這讓 workspace fallback import 一致解析到 `src/`，避免混用建置後的 `lib/` 提供者與模組本地 Symbol 不同的原始碼呼叫方。沒有 workspace 對映的包仍使用普通匯出解析。

node-compat CI 矩陣在不執行 build 的情況下執行 `dsh-source-launch-smoke`（`apps/cli/tests/source-launch.compat.spec.ts`）：無金鑰啟動斷言必需 profile 的診斷，以及不混用 Tools/AgentLoop `src/` 與 `lib/` 實例的 profile 依賴解析。原始碼與建置入口測試共享普通目錄和 npm-link profile 案例；後者透過普通 Node 載入建置後的匯出。必跑的 build-backed smoke 還執行 `apps/cli/tests/profiles/headless/tests/source-tool.built.e2e.ts`：在 native addon 和生成的 typert 貢獻檔案就緒後，透過 tsx 檢查真實 headless 工具派發，同時仍要求核心 workspace 模組從原始碼載入。模組掛鉤或 TypeScript 處理的後續變化由這些真實入口檢查。

## 備選方案

**在 Node ≤25 保留原生鏈並按版本分叉。** 拒絕：兩套轉換語義（amaro 與 esbuild）在邊緣語法上會分歧，啟動器要加版本探測，node-compat 矩陣要覆蓋兩條路徑——為一個已經變動過的 experimental flag 付出沉重維護。而且 amaro 也不支援 `vendor/hmr` 使用的 `@Inject` 裝飾器，原生路徑本來就無法啟動隨附的預設 TUI 設定。

**把原始碼圖改成 erasable-only 以適應 Node 26 strip 模式。** 拒絕：參數屬性與值 namespace 遍佈 vendor 的 Cordis/cosmokit/loader/schemastery；改寫是無界 churn，且每次 vendor sync 都要重做。

**儲存庫自有的同執行緒 loader（`module.registerHooks()` 加 esbuild 或 `@swc/core` 轉換）。**不予採納：原型實測約 0.45s，而 esbuild 路徑缺少端到端驗證，SWC 在兩種裝飾器模式下都會因 `vendor/hmr` 的裝飾器與 namespace 合併失敗。該方案還會讓儲存庫負責轉換正確性和 tsx 已經提供的解析掛鉤。僅當實測約 0.3s 的差距成為實質成本時再重新考慮。

**Node 26 執行建置產物 `lib/`，24 保留原生。** 拒絕：在最新 Node 版本線上失去零建置開發迴圈，且混淆原始碼面與產物面。

## 結果

- 整個 engines 範圍（包括未來改變原生 TypeScript 支援的 Node 版本線）只有一個啟動向量；冒煙門禁按矩陣行強制執行。
- TypeScript 轉換重新委託給 tsx/esbuild，逆轉了前一篇 Agent Note「證明 Node 原生轉換可用」的目標；在 vendor 原始碼使用不可擦除語法且 Node 不再提供 transform 模式的情況下，該目標不可達。
- 原始碼啟動中的執行時依賴宣告強制不復存在；未宣告的 workspace import 現在只能透過靜態門禁或建置模式的解析失敗暴露。
- 每個 CLI 原始碼 profile 都使用相同的 ESM-only 掛鉤，包括 ACP（Agent Client Protocol）。該啟動方式存取的 workspace 執行時入口必須提供 ESM 匯出；啟動器不安裝 CJS TypeScript 轉換掛鉤。
