# Agent Note: 釋出所有目前實驗性包

Status: implemented

[English](2026-09-12-publish-all-experimental-packages.md) | 中文

## 問題

使用者需要透過 npm 使用 Auto review、Inspector、CPython PTC 後端與瀏覽器 worker 庫，同時保留其實驗性 API 狀態。僅在原始碼 checkout 中測試，不能證明 tarball 包含已安裝消費方所需的執行時檔案與 import。

## 決策

`packages/experimental/` 下的所有目前包都透過 dsh 釋出系列與本地 npm baseline 釋出。各 manifest（中繼資料清單）省略 `private`，並設定 `publishConfig.access: public`。[釋出拒絕列表](2026-09-12-experimental-publication-denylist.zh.md)仍可用於未來的私有例外，但不包含任何目錄。實驗性 npm 名稱、顯式啟用組合、依賴隔離、相容性預期與支援限制保持不變。

Inspector tarball 包含 `lib/worker.js`，Host 入口透過相鄰 URL 啟動它。其建置產物測試先打包並解壓包，再啟動該 Worker。WebWorker 打包器透過執行時的公開庫入口匯入模組代理與替換包表；編譯後的 repository 分片不需要執行時 TypeScript 原始碼。其已打包消費方測試在普通 Node 下匯入兩個解壓後的 tarball，並在不使用這兩個包原始碼目錄的情況下掛載生成的基礎映像與資料疊加層。

CPython PTC 後端攜帶 Python 腳本，在 Unix 上仍需要受支援的外部直譯器。瀏覽器 worker 包提供已安裝庫 API；打包器的儲存庫 CLI（命令列介面）仍需要文件要求的已建置 checkout。釋出不會把這些包加入任何隨附 profile，也不會讓瀏覽器預覽成為產品啟動入口。

## 曾考慮的替代方案

**讓被排除的包繼續保持私有。** 即使所選組合顯式接受實驗性行為，使用者仍無法安裝使用。

**只修改 manifest 存取欄位。** Inspector 會遺漏其 Worker，編譯後的 WebWorker 打包器會匯入執行時 tarball 中不存在的原始檔。已打包消費方檢查必須覆蓋可能被原始碼測試掩蓋的執行時檔案。

**將這些包提升到產品組。** 安裝不需要移除實驗性 npm 名稱，也不需要接受穩定 owner 與支援義務。

## 後果

所有目前實驗性包都可由顯式消費方使用。釋出集合與包作者承擔完整公開產物的責任，同時保持預設產品組合隔離。空拒絕列表透過 fixture（測試前置資料）繼續驗證未來私有排除項。
