---
description: "將測試二進位制上傳與人工授權的固定 feed 釋出分離，用於 Windows 安裝版更新驗收。"
---

# 測試更新上傳與釋出

[English](README.md) | 中文

## 摘要

上傳兩個已驗證版本而不公佈版本 2，待操作者啟動已安裝的版本 1 後才釋出版本 2 的固定 feed。預設命令檢查本地物料，不讀取憑證或聯網。實際 COS 寫入需要另行獲得人工授權並驗證。

## 目錄

- [前提條件](#prerequisites)
- [人工操作順序](#sequence)
- [證據與恢復](#evidence)
- [開發備註](#dev-note)

<a id="prerequisites"></a>

## 前提條件

完成[演練指南](../README.zh.md)中的兩個安裝檔驗證。保留透過的 `verification/check-*/result.json` 回執及未修改物料。釋出工具將回執與目前安裝檔、blockmap、feed 和清單位元組重新核對。它絕不簽名或安裝任何檔案。

現有 `.env.windows` 載入器提供 `DSH_DESKTOP_AUTO_UPDATE_ENV=test`、`DOWNLOAD_TEST_ORIGIN=https://download-test.deepseek.com`、`DOWNLOAD_TEST_COS_BUCKET=bj-toc-download-test-1320056602` 及 `DOWNLOAD_TEST_COS_SECRET_ID` / `DOWNLOAD_TEST_COS_SECRET_KEY`。只有這兩個上傳秘密進入 COS 使用者端；絕不放入命令或記錄。傳輸實作將請求限制在 test 儲存桶和獨立的 Windows 驗收路徑內。

二進位制上傳操作額外查詢儲存桶版本控制；查詢成功且既非啟用也非暫停狀態之前，它拒絕寫入。feed 釋出複用成功的二進位制上傳回執，不重複查詢桶設定或下載安裝檔。COS 文件說明 [`x-cos-forbid-overwrite`](https://cloud.tencent.cn/document/product/436/7749) 無法保護開啟版本控制的儲存桶中的物件。查詢被拒絕僅意味著該設定未知，不能證明上傳被拒絕。

所有機器只使用一個釋出者。本地 `publication.lock` 排除共享物料目錄的重疊操作，不限制其他機器。版本 2 釋出在替換前檢查現有版本 1 feed；該讀取與寫入不是原子的比較並交換操作。其他釋出者不得並行寫入同一個 feed。

<a id="sequence"></a>

## 人工操作順序

以下是待人工執行的步驟，不是已完成的遠端驗收。在儲存庫根目錄使用保留的清單、準確版本及匹配的驗包回執執行。不加 `--execute` 時，兩個命令都只列印本地計劃，不傳送請求：

```powershell
node --import tsx apps/desktop/scripts/publish-installed-update.ts upload-binaries "<run.json>" "<version>" "<verification/result.json>"
node --import tsx apps/desktop/scripts/publish-installed-update.ts publish-feed "<run.json>" "<version>" "<verification/result.json>"
```

1. 先在本地檢查兩個版本。每次單獨授權上傳後，給 `upload-binaries` 加上 `--execute`，在互動終端輸入 `UPLOAD <version> <run-id>`。上傳安裝檔和 blockmap 絕不釋出 feed。已存在且匹配的二進位制僅回讀、不覆蓋；位元組不符立即停止。
2. 保持固定 feed 不存在。安裝版本 1 並透過安裝後的快捷方式啟動，確認顯示版本和日誌中的 `workspace-ready`。授權任何 feed 寫入前，先完成演練指南中的 404 情境。保持版本 1 執行。
3. 給版本 1 的 `publish-feed` 加上 `--execute`，輸入 `PUBLISH <version> <run-id>` 授權釋出。其二進位制必須已存在並透過公網回讀。初始 feed 必須不存在，或包含完全一致的版本 1 位元組。完整回讀 feed 後，在仍執行的版本 1 應用內完成同版本情境；保留證據，另行授權後才釋出版本 2。
4. 使用下述命令及其準確確認授權版本 2 釋出。提供原安裝應用的 `dsh-update-qualification/<run-id>/journals` 目錄。要求啟動證據及符合預期的舊 feed。操作者獨立核對安裝路徑及版本 1 仍在執行。

```powershell
node --import tsx apps/desktop/scripts/publish-installed-update.ts publish-feed "<run.json>" "<version-2>" "<version-2-verification/result.json>" --journals "<journal-directory>" --execute
```

釋出和公網回讀成功後，才繼續演練指南。工具使用固定公網 URL，不加破快取參數，上傳時設定 `Cache-Control: no-store`，並驗證返回位元組及雜湊。二進位制上傳保留完整公網回讀。feed 釋出僅在遠端讀取 feed，要求本批次 `publication-records/operation-*` 下存在成功的 `upload-binaries` 結果，且其本地計劃完全匹配；回執缺失、失敗或不匹配時停止釋出。釋出結果記錄複用回執的路徑及回執／計劃雜湊。這證明此前分發成功，不證明不可變物件持續可用；不得刪除或替換這些物件。SDK 寫入沒有自動重試。

<a id="evidence"></a>

## 證據與恢復

每次操作保留 `publication-records/operation-*`：計劃、帶時間戳的階段、最終結果，以及適用時的 feed 原文。記錄包含可安全保留的請求 ID 和可用 HTTP 狀態，不含原始 SDK 錯誤或認證頭。失敗即停止後續寫入；超時不能證明伺服器拒絕了此前寫入。保留記錄和遠端物件，檢查最後階段及真實遠端狀態，另行確認後才執行下一次操作。

按準確 API 診斷 `403 AccessDenied`：`GetBucketVersioning`、`GetObject` 與 `PutObject` 需要不同權限。要求擴權或修改 CDN 設定前，先對照保留的成功記錄，並用目前憑證檢查失敗操作。沒有嘗試上傳時，不能把新增設定查詢失敗報告為上傳失敗。讀取成功也不能證明目前寫入權限；優先審查不必要的新增前置檢查，而不是擴大最小權限上傳身份的授權。

人工請求的後續操作驗證已匹配物件，不重寫它們。`alreadyPublished: true` 表示核對已存在的目標 feed，不是一次新發布；釋出時間使用原操作證據。非預期 feed 位元組會使操作停止，包括嘗試用版本 1 替換版本 2。崩潰可能留下 `publication.lock`；確認沒有釋出者執行並保留失敗記錄後，才由操作者移除這個準確的空目錄。絕不為了繞過活躍釋出者而刪除鎖。

qualification COS 版本查詢的總截止時間為 30 秒，物件讀取與 PUT 的總截止時間為 15 分鐘。到期會中止底層 HTTP 請求，並在釋放操作鎖前等待請求關閉；持續傳輸不會延長時限。

<a id="dev-note"></a>

## 開發備註

順序測試使用記憶體儲存替身；傳輸測試使用替代 HTTP 處理器執行真實 SDK 序列化。兩者均不能證明 COS 寫入已驗收。2026-09-14，目前憑證讀取保留的 test 探針返回 HTTP 200 且 SHA-512 匹配，而 `GetBucketVersioning` 返回 403；沒有嘗試 PUT。另一次 2026-09-11 探針已驗證 test 上傳、固定 feed 重新整理和 updater 下載。TODO：在不削弱名稱空間隔離、完整性檢查與失敗即停的前提下審查額外的桶設定前置條件；本次文件糾正並未實作移除該條件。

隨後經操作者授權的批次 `installed-update-r5dYNH` 在 `.desktop-build/qualification/` 下保留 `object-overwrite-probe/result.json` 和 `binary-upload/result.json`。新建 49 位元組測試物件成功；再次攜帶禁止覆蓋參數 PUT 相同位元組時返回 `409 FileAlreadyExists`，源站及公網雜湊保持不變。限定本批次的純二進位制驅動隨後使用相同請求頭上傳兩個簽名安裝檔及其 blockmap，重新核對驗包回執，並驗證全部四個完整公網回應。記錄包含四次成功的新物件 PUT，沒有重試、feed 或設定寫入，探針保持保留。對獨立 feed URL 的 HEAD 觀測返回 404。本次人工操作以觀測到的物件級防覆蓋行為替代桶設定查詢；上方通用 CLI 的前置條件未修改。這些回執證明測試物件已分發，不證明 feed 釋出、安裝後啟動或已安裝版本升級。
