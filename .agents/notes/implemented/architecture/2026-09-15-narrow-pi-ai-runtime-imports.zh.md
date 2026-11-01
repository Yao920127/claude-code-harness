# Agent Note：收窄 pi-ai 執行時 import

Status: implemented

[English](2026-09-15-narrow-pi-ai-runtime-imports.md) | 中文

## 問題

基礎 bundle 會在沒有設定路由時掛載 `dsh-llm-pi-ai`，讓 Models 設定頁能夠提供 pi-ai provider。為了 model helper 而 import pi-ai 聚合入口還會求值其匯出的 TypeBox namespace，即使所有 Session 都使用 `dsh-llm-deepseek`，每次應用啟動也會額外載入數百個模組。

## 決策

`dsh-llm-pi-ai` 不再執行時 import pi-ai 聚合入口。Catalog 與登入中繼資料繼續使用 `providers/all`；協定實作繼續使用現有 `api/*.lazy` 入口；overflow 檢測使用 `utils/overflow`。包內 `models.ts` 提供介面卡所需的三個 model helper。Collection 來自 pi-ai 公開的 `builtinModels()` 實作，並在安裝路由 provider 前清空。Provider constructor 實作本介面卡傳入的靜態單協定分支。Reasoning level 選擇按照 pi-ai 的升級順序讀取其公開 `Model` 中繼資料。

聚合入口的 type-only import 會被 TypeScript 擦除，因此予以保留。建置產物的 import profile 會解析 153 個 pi-ai 模組，不包含 TypeBox 模組或 pi-ai 聚合入口。

## 考慮過的替代方案

- **給 pi-ai 增加 `models` export。** 拒絕，因為本包可以直接使用已經公開的 provider、API、utility 與 model metadata interface，無需修改上游 export map。
- **動態 import 聚合入口。** 拒絕，因為休眠介面卡不需要其中任何內容；完全排除該入口會直接刪除工作，而不是把工作移動到之後的操作。
- **複製 pi-ai 完整的 Models 實作。** 拒絕，因為 `builtinModels()` 已經返回包含其認證與儲存行為的上游實作。清空其中的 provider 可以保留該實作，無需維護 fork。

## 後果

應用仍會載入 `providers/all`，因此設定與授權介面保留完整的已安裝 provider 目錄。建置 adapter snapshot 時會短暫建構並清空內建 provider set，再安裝已解析的路由 provider。包內 provider constructor 只接受靜態 model 和一個協定實作；若要增加動態 model、filter 或多協定自定義路由，必須同時擴充功能該本地函式及其測試。
