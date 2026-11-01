# PR 預覽執行器規格

[English](README.md) | 中文

## 摘要

[預覽工作流](../workflows/build-preview-cloudflare.yml) 在標準 GitHub 託管 `ubuntu-24.04` 上建置 PR（Pull Request）預覽。執行器規格選擇比較完整作業成本，而非僅比較每分鐘價格或核心數。

## 目錄

- [比較要求](#comparison-requirements)
- [釋出語義](#publication-semantics)
- [開發備註](#dev-note)

<a id="comparison-requirements"></a>

## 比較要求

規格實驗保持檢出 SHA、鎖檔案、Node 與 pnpm 版本、工作區建置以及預覽/VFS 打包命令一致。每個執行器啟動時均無建置產物。冷安裝不恢復依賴快取，但 pnpm 引導安裝檔案可能已存在；熱安裝恢復同一個精確快取，不使用字首退回。記錄實際執行器映像、CPU、記憶體、磁碟、快取結果、各階段耗時、退出狀態與記憶體峰值。GNU time 最大 RSS 表示程式最大值，而非建置程式樹同時佔用的記憶體總量。

估算總計算費用時，將每個已完成作業的執行分鐘數向上取整，乘以對應執行器費率後求和。納入設定、快取恢復、清理、失敗及測量資料上傳的開銷。單獨報告快取預熱作業。排隊延遲屬於延遲觀測，不屬於作業執行時間。這些估算不是帳單總額；標準執行器的套餐內分鐘數及儲存另行計算。

僅建置的基準測試不部署、不存取 Cloudflare 憑證，也不釋出 PR 評論。其成本不能證明完整預覽釋出成本。在將部署延遲與受保護映像交付視為已驗證之前，須透過實際預覽工作流確認所選執行器。

<a id="publication-semantics"></a>

## 釋出語義

執行器選擇不改變 PR 事件、按 PR 取消、不可變安裝、只恢復的依賴快取、完整工作區建置、預覽打包、sourcemap 刪除，以及複製到部署根目錄的預覽頁面。Cloudflare 僅將建置站點上傳至 PR 分支別名。受保護映像檢查要求 HTTP 200、無傳輸內容編碼及 gzip 魔數字節；URL 評論保持冪等。Dependabot 與其他 PR 作者仍使用 GitHub 託管機器。

<a id="dev-note"></a>

## 開發備註

[執行器決策](../../.agents/notes/implemented/process/2026-09-06-preview-hosted-runner-sizing.zh.md) 記錄測量、成本估算及映像/CPU 差異。僅建置實驗不驗證生產部署。
