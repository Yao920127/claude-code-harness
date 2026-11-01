# Agent Note: 外掛自有的多語言展示元資訊

Status: implemented

[English](2026-09-18-localized-package-metadata.md) | 中文

## 問題

Plugin Manager 需要為已安裝的 bundle 與各個外掛展示可讀的標題和描述，包括尚未啟用的外掛。同一個 npm 包可以匯出多個用途不同的外掛，包級介紹無法分別描述它們。依賴啟用來註冊介紹，也會讓停用或載入失敗的外掛缺少展示文案。

## 決策

每個外掛從 `locale/en.json` 開始，在自己的 `locale/<language>.json` 資源中提供可選的 `meta.title` 與 `meta.description` 字串。這些字串直接提供展示標題和描述。locale 的其他頂級內容仍歸現有消費方所有，不進入元資訊回應。

```json
{
  "meta": {
    "title": "File Search",
    "description": "Search files in your workspace."
  }
}
```

資源地址歸 Cordis 設定中的外掛名所有。Node 模組解析透過適用的 profile 和包 exports 選擇檔案，不執行外掛程式碼：

| 外掛形式 | locale 資源 |
|---|---|
| npm 包 `my-plugins` | 請求 `my-plugins/locale/en.json`，由 `./locale/*.json` 匯出 |
| npm 子路徑 `my-plugins/search` | 請求 `my-plugins/search/locale/en.json`，由 `./search/locale/*.json` 匯出 |
| JavaScript 路徑 `./plugins/search.js` | 不查詢同級資源；設定中的路徑名作為標題的最終退回 |

locale 地址不從解析後的 JavaScript 檔名或所屬包目錄推導。檔案路徑與檔案 URL（包括 Windows 磁碟機代號路徑和 UNC 路徑）跳過資源解析，返回無元資訊；檔案地址本身不構成元資訊錯誤。它們既不提供同級 locale 元資訊，也不提供旁邊的包 manifest（中繼資料清單）。目錄範例、exports 宣告、釋出條目與作者驗證步驟由[新增包實操手冊](../../../../docs/cookbook/adding-a-package.zh.md#plugin-display-metadata)維護。

同一外掛的語言檔案放在同一目錄。Host 解析 `en.json`，從所在目錄發現語言檔名，再用同一外掛模組名與父 URL 解析各個資源。英文資源作為發現入口，但任何語言都可以省略任一展示欄位。語言標識不區分大小寫，重複標識拒絕。locale 中宣告的展示欄位必須是非空字串。

Host 讀取已安裝 bundle 及其宣告的外掛行，不 import 或啟用它們。Remote 攜帶兩個展示欄位的多語言值或純文字退回值。Client 在渲染時複用現有 locale 的語言選擇與退回鏈，不增加語言註冊、外掛級預設語言或另一套語言退回規則。

每個欄位先獨立退回，再按頁面規則格式化技術名稱：

| 欄位 | 現有 locale 語言退回鏈 | 同地址包欄位退回 | 最終退回 |
|---|---|---|---|
| 標題 | `meta.title` | `<外掛模組名>/package.json` 中非空的 `name` | Cordis 設定中的完整外掛名 |
| 描述 | `meta.description` | `<外掛模組名>/package.json` 中非空的 `description` | 不提供包描述 |

包欄位退回遵守資源 exports，並且仍屬於同一外掛地址，子路徑不繼承所屬包的介紹。欄位有其他語言譯文但沒有英文值時，Host 將包欄位或最終值放入英文退回位，保持現有 Client locale API 不變。資源不存在、未匯出或缺少欄位時使用上述退回；locale 欄位無效或檔案格式損壞時明確診斷，不靜默退回，同時保留管理操作。

外掛管理頁在已安裝 bundle 的卡片和詳情、元件列表、元件設定詳情中使用這些元資訊，保留完整技術名退回。設定中的外掛清單也使用它，包括預設內外掛，但會移除字面包名和模組名退回值的 npm scope 與 Cordis/DSH 字首。兩個頁面都原樣展示翻譯標題；完整模組名、條目 id、搜尋身份與操作目標保持不變。具體字首規則由[設定外掛清單 README](../../../../packages/client/ui-settings-plugin-inventory/README.zh.md#use-this-package)維護。

行設定頁僅在外掛沒有展示描述時使用註冊元件的 `summary` 檢視。組合包原始的 `description` 欄位仍供 Host 與模型消費方使用，不作為繞過資源 exports 的額外 UI 退回。這些規則只展示一份描述，同時保留無描述外掛的設定摘要。

停用外掛不需要啟用即可讀取。Install 介面仍使用 `pnpm view` 返回的 registry 資訊，不用 locale 元資訊替換。安裝前的 registry、Git 和 tarball 查詢不為翻譯讀取遠端包內容。模型工具結果保留現有包資訊，不攜帶供 UI 使用的多語言字典。Session 事件不變。

內建 bundle 的介紹放在其匯出的語言檔案中。beta 標記、頁面分組、設定槽歸屬與啟停目標保持原樣。外掛介紹和元件自身的互動文案各自保持所有權。

## 現有決策

[公共包宣告](../../implemented/architecture/2026-09-10-public-package-manifest.zh.md) 繼續約束 manifest 型別和讀取者的職責；[locale-owned UI copy](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md) 繼續約束元件文案和展示身份；[外掛設定頁](../../implemented/architecture/2026-09-16-plugin-configuration-on-the-plugins-page.zh.md) 繼續決定設定槽歸屬。外掛元資訊只擴充功能展示資料，不取代這些決策。

## 考慮過的替代方案

**在 Plugin Manager 中繼續維護內建包詞典。** 每增加一個包都需要修改管理器，而且外部外掛無法獨立提供翻譯。

**在 package.json 中宣告引用。** 將宣告重複放在 manifest 與 locale 檔案中，而且一份包級宣告無法區分包內匯出的外掛。

**從解析後的 JavaScript 檔案旁讀取 locale。** 建置工具可能把多個外掛入口放在同一目錄。資源 exports 讓各外掛的身份獨立於編譯產物佈局。

**由被展示外掛啟用時註冊文案。** 未啟用包、無 Client 半邊的包和載入失敗的包仍然需要可讀的介紹。

**增加 base.json 或包級 fallback。** 會與現有 locale 的英文後備和擴充功能語言退回鏈產生第二套規則。

**為安裝前預覽下載遠端包。** 擴大查詢成本及需要處理的包內容；本期只處理已經存在於本地的檔案。

## 驗證

- bundle、子外掛與只讀 inventory 展示本地元資訊；停用包不需要啟用即可讀取。
- 切換語言更新標題和描述；設定頁僅縮短字面技術名退回，不縮短翻譯標題，也不改變模組身份和操作目標。
- 直接元資訊、無關 locale 內容、缺失資源、損壞 JSON、缺失展示欄位及語言標識衝突均有針對性覆蓋。
- 同包的不同 exports，以及不同父目錄中的同名包，各自保持獨立元資訊，讀取不執行外掛入口。
- Windows 磁碟機代號路徑、UNC 路徑、相對與絕對檔案路徑及檔案 URL 均不呼叫資源解析，直接返回無元資訊。
- locale 資源或個別欄位缺失時，各欄位獨立退回到該外掛地址的包欄位，再退回到完整模組名且不顯示描述。
- 釋出檢查要求資源 exports 可解析且包含語言檔案，內建文案不在管理器和外掛中雙份維護。
- 管理工具保留現有模型輸出，安裝前查詢不增加包內容探查。
- 針對性測試以及完整 `pnpm run build` 透過。

## 影響

遺漏語言檔案或 exports 會使釋出後的元資訊不可用，因此驗證覆蓋解析與打包後的檔案。元資訊錯誤作為單外掛診斷呈現，不能讓整個管理頁失去修復入口；檔案診斷保留絕對路徑。展示元資訊按請求讀取，不設元資訊快取。查詢保留完整模組名及其解析父地址；只按包名快取無法區分匯出外掛或不同安裝目錄。
