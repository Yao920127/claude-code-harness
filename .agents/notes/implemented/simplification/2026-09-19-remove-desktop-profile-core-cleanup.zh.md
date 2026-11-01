# Agent Note: 移除 Desktop 生產啟動前的核心包清理

Status: implemented

[English](2026-09-19-remove-desktop-profile-core-cleanup.md) | 中文

## Problem

2026-09-15 起，生產版 Desktop 在啟動 Host 前按執行時描述符列出的包名清理 profile：刪除 `$DSH_HOME/profiles/desktop/node_modules` 裡的同名條目，剪掉 manifest 對這些名字的依賴宣告與 pnpm overrides，包狀態變化時丟棄鎖檔案，並按 `desktop-runtime-state.json` 記錄一次性移除開發期連結。它針對兩類殘留：更早的 Desktop 曾把核心包做成本地 tarball 用 pnpm 裝進 profile 並寫入宣告、overrides 與鎖檔案；Link 後端的開發模式曾把安裝閉包投影進同一個 profile 的 `node_modules`。在最近者優先的解析下，這些副本會壓過應用自帶的執行時，把舊 Web 前端與新外掛組合在一起。

這兩類殘留只存在於內部開發與測試機器上，Desktop 沒有對外發布過。執行時隨應用打包後，新 profile 不再包含核心包；[Link 後端刪除](../architecture/2026-09-19-profile-resolution-lookup-order.zh.md)後，開發模式不再向 profile 寫任何連結。清理每次生產啟動都要重跑，並與下一次 pnpm 操作按保留的依賴重新安裝形成拉鋸。

## Decision

刪除 `apps/desktop/src/profile-core-cleanup.ts`、`apps/desktop/src/profile-packages.ts` 及其兩個 spec。`DesktopProjectManager.applyRelease` 驗證執行時描述符、遷移 profile 設定、建立 profile 檔案，並透過共享的 `removeLinkProjections` 刪除 Link 後端啟動寫下的投影；除此之外，生產與開發啟動都不改動 profile 的 `node_modules`、manifest、overrides、鎖檔案與 `desktop-runtime-state.json`。

profile 內的解析按[查詢順序 Note](../architecture/2026-09-19-profile-resolution-lookup-order.zh.md)：profile 自己 `node_modules` 裡的包最近者優先，本體包名在 `$DSH_HOME/profiles/node_modules` 的位置由 generation 佔據。裝進 profile 的包若在 `dependencies` 裡宣告瞭 `@deepseek-ai/*`，pnpm 會把副本裝進 profile，這些副本按其自身版本執行。官方包只把純函式包放在 `dependencies`，帶模組級身份的包一律宣告為 peer；第三方外掛把身份敏感的 dsh 包寫成實依賴，是該外掛自身的打包選擇。

放棄的能力：舊版 Desktop 裝進 profile 的核心包副本及其宣告需要手工刪除一次；`desktop-runtime-state.json` 不再被讀取或刪除。Link 後端寫下的投影由共享的 profile 載入一次性刪除，見[查詢順序 Note](../architecture/2026-09-19-profile-resolution-lookup-order.zh.md)。

重新引入的條件：外部使用者的 profile 曾被某個釋出版 Desktop 寫入核心包副本，或官方包改變依賴宣告約定，使 profile 內出現與執行時爭搶身份的副本。

## Alternatives considered

**保留原清理。** 它服務的殘留不再產生，卻在每次生產啟動刪除目錄、剪宣告並丟棄鎖檔案，與隨後的 pnpm 操作反覆拉鋸。

**只刪除 profile `node_modules` 裡的同名目錄，不動宣告與鎖檔案。** 2026-09-15 的決策已經否決：pnpm 會按保留的宣告與 overrides 重灌相同的舊包。

**讓 generation 中的 `@deepseek-ai/*` 條目絕對優先於 profile 內的同名副本。** 這會覆蓋外掛自帶的版本，是解析規則的新決策，不在移除清理的範圍內。

**只在安裝器中清理。** 2026-09-15 的決策已經否決：遺漏其他 profile，也管不到安裝後重新產生的副本。

## Verification

- [project-manager.spec.ts](../../../../apps/desktop/tests/project-manager.spec.ts) 斷言一次啟動準備後，profile 裡已安裝的核心包目錄、第三方外掛目錄、manifest 宣告、`desktop-runtime-state.json` 與鎖檔案逐位元組不變。
- 儲存庫中不再有 `cleanProfileCorePackages`、`migrateDesktopProfileLinks`、`CLEAN_PROFILE_CORE_PACKAGES` 與 `DESKTOP_PROFILE_STATE` 的引用。

## Consequences

買到的：生產啟動不再寫 profile，沒有臨時啟用開關，Desktop 與 CLI 對 profile 內副本採用同一套規則。付出的：舊版 Desktop 裝進 profile 的核心包副本靠手工清理；第三方外掛以實依賴帶進 profile 的 dsh 副本按其自身版本執行。
