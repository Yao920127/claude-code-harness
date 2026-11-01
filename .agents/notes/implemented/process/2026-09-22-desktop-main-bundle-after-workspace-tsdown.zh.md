# Agent Note：Desktop 主程序在工作區 tsdown 階段之後再打 bundle

Status: implemented

[English](2026-09-22-desktop-main-bundle-after-workspace-tsdown.md) | 中文

## 問題

從全新 worktree 打出的 macOS Desktop 安裝檔啟動即崩：`ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-home-paths' imported from app.asar/lib/main.js`。打包日誌給出了原因：rolldown 報告了 `[UNRESOLVED_IMPORT] Could not resolve '@deepseek-ai/dsh-home-paths' … treating it as an external dependency`，`@deepseek-ai/dsh-app-boot` 與 `@deepseek-ai/dsh-deepseek-account` 也是同樣情況。這三個包是 `apps/desktop` 的工作區 devDependencies，主程序 bundle 必須把它們內聯，因為 electron-builder 只把清單中的 `dependencies` 複製進 `app.asar/node_modules`。

根 tsdown 設定並行建置所有匹配到的 workspace 成員（tsdown 0.22 對解析出的設定做 `Promise.all`，沒有任何依賴排序），而 `apps/desktop` 是其中一員。它的 bundle 透過這三個包的 `exports` 解析到 `lib/index.js`，而其他並行建置此時還沒有寫出這些檔案。在此前建置過的檢出目錄裡，陳舊的 `lib/` 產物存在，bundle 會把它們內聯，因此缺陷只在乾淨樹上出現；兩份設定裡的 `clean: false` 一直掩蓋著它。壞的 bundle 也更小（189 KB 而不是 315 KB），並且打包流程透過了所有已有檢查，因為執行時載荷 smoke 檢驗的是 dsh 執行時，不是 Electron 主程序。

## 決策

`apps/desktop` 退出根 tsdown 的 `workspace` 列表。根 `build:lib:host` 腳本先跑 Host tsdown 階段，再執行 `pnpm --filter @deepseek-ai/dsh-desktop run bundle`，讓主程序 bundle 解析的是已經存在的工作區 `lib/` 產物。該包自己的 `build` 腳本為本地使用保留同樣的先 `tsc -b` 再 `bundle` 的順序。單獨執行 Desktop 設定得到的產物與此前 workspace 模式下的產物逐位元組一致：該設定本來就是自足的，根設定的外掛沒有為它貢獻任何內容。

Desktop 設定同時斷言這次崩潰所違反的不變數。[`desktop-bundle-imports`](../../../../apps/desktop/scripts/desktop-bundle-imports.mjs) 是掛在每個 Desktop bundle 上的 rolldown 外掛，其 `moduleParsed` 掛鉤在某個模組以靜態 import、動態 `import()` 或 `require()` 匯入了打包應用無法解析的裸說明符時讓建置失敗：主程序 bundle 可以匯入 `electron`、Node 內建模組與清單的 `dependencies`；沙箱 preload 只能匯入 `electron`、`events`、`timers` 與 `url`，即 Electron 沙箱 `require` polyfill 能解析的模組。該掛鉤讀取每個模組的匯入記錄，其中外部匯入保留裸說明符、被打包的匯入帶有絕對 id；chunk 中繼資料（`imports`/`dynamicImports`）不包含外部的 `import()` 與 `require()` 目標，無法用於這項檢查。這項檢查陳述的是真正的要求而非症狀，因此它同樣拒絕被移出 `dependencies` 的工作區包或損壞的 `exports` 條目，且被拒絕的 bundle 不寫出任何產物。

## 備選方案

**把這三個包宣告為執行時 `dependencies`，讓 electron-builder 裝進 asar。** `@deepseek-ai/cordis` 與 `@deepseek-ai/dsh-api-gateway` 今天就是這樣進入 asar 的，這也消除了順序問題。但 `dsh-app-boot` 會把一棵很大的依賴樹帶進 `app.asar/node_modules`，與 packed dsh 執行時內已有的副本重複，並擴大執行時檔案策略必須篩查的載荷。

**透過 `inputOptions.onLog` 或 `failOnWarn` 讓 rolldown 的 `UNRESOLVED_IMPORT` warning 直接失敗。** 它只覆蓋未解析這一種情況，覆蓋不了被誤宣告為 devDependency 的依賴：產物存在時它會被解析並內聯，不存在時才留成外部匯入。打包匯入檢查用一條規則同時覆蓋兩者。

**按依賴圖給 workspace 建置排序。** tsdown 不提供這種排序，而其他每個成員要麼不從工作區內聯任何內容，要麼把已宣告的 `dependencies` 留成外部匯入，都不需要排序。為唯一需要它的包多加一步，比通用排程器更小。

## 後果

乾淨的檢出目錄（包括 CI 與全新 worktree）產出的 Desktop 主程序 bundle 與長期使用的檢出目錄一致。缺失或誤宣告的執行時匯入現在會讓 `pnpm run build` 和每條打包命令在簽名與公證耗時之前失敗，並報出匯入方模組與違規說明符。Host 建置多出一個序列步驟，在開發機上約一秒。`docs/development.md` 在根建置順序中列出了 desktop bundle 步驟，`scripts/wine-windows-gates.sh` 與之保持一致，匯入規則由 [Desktop README](../../../../apps/desktop/README.zh.md#bundled-workspace-dependencies) 負責。
