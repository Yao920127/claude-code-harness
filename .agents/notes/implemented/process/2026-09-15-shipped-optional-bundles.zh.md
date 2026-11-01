# Agent Note: Ship optional bundles with the installation

Status: implemented

[English](2026-09-15-shipped-optional-bundles.md) | 中文

## 問題

Web 外掛頁只管理使用者裝進 profile 的組合包。像 Agent Teams 這樣的官方實驗層，使用者得先去 npm 找到包名並按名安裝才能開啟；而[預設產品隔離](2026-09-12-default-product-experimental-isolation.zh.md)又把所有實驗包擋在安裝的執行時依賴之外，所以隨 dsh 一起交付的東西沒有辦法把它提供出來。

## 決策

啟動器在 `OPTIONAL_BUNDLES`（`packages/boot/app-boot/src/profile.ts`，與 profile 範本並列）裡點名安裝隨附、供使用者開啟的組合包。每一個都必須是 `apps/cli` 宣告瞭 `dsh.bundle.patch` 的執行時依賴，且不被任何隨附 profile 範本選中。外掛管理器的 `listBundles` 把這類組合包報告為 `optional`：選中前保持關閉、永不可解除安裝、像其他安裝提供的組合包一樣從安裝目錄解析。Web 外掛頁以可選組合包開啟「官方」分組，屬於 beta 功能的帶 beta 標籤，排在 profile 自己已安裝的組合包之前。

預設產品隔離的規則保持不變，只宣告一個例外：可選組合包的依賴圖在預設產品之外。靜態門禁跳過從 `@deepseek-ai/dsh` 到列表中組合包的 `dependencies` 邊，仍然拒絕執行時 import、隨附組合、preset 或預設範本對它的引用，拒絕列表沒有點名的實驗依賴，也拒絕不是執行時依賴或不是組合包的列表項。workspace 約束檢查接受同樣的 `dependencies` 邊而不接受其他執行時依賴段；釋出時的 packed-install 檢查對已安裝入口包跳過這些邊，並要求列表中的每個組合包都已安裝。

[單組合包決策](../architecture/2026-09-18-agent-teams-single-bundle.zh.md)將兩個 Agent Teams 選項替換為一個 `@deepseek-ai/dsh-experimental-agent-team-profile` 選項。本記錄保留由安裝方決定可選組合包的策略；[實驗能力的可選 bundle 決策](../architecture/2026-09-21-experimental-capabilities-as-optional-bundles.zh.md)列出目前名單以及每一項攜帶的顯示中繼資料。

## 考慮過的替代方案

**可安裝官方組合包目錄。** 頁面按需提供從註冊表安裝的包名。安裝本身不變，但開啟那一刻需要網路，並且每次釋出都要釘一個版本。

**組合包自身的標記。** `dsh.bundle.optional` 宣告會讓任何已釋出的組合包都能自稱隨安裝提供；由啟動器自己的列表來決定，選擇權留在產品手裡。

**放在安裝 manifest 裡的列表。** `apps/cli/package.json` 的 `dsh.optionalBundles` 是最初的形式；維護者把產品決定放在程式碼裡，列表有型別、只讀一次，管理器與門禁共用。

## 影響

可選組合包隨產品一起下載，選中前保持不活動；執行時隔離 smoke 在預設組合中仍觀察不到任何實驗模組。開啟一個可選 Web 層會透過即時用戶端模組圖載入它的用戶端外掛。
