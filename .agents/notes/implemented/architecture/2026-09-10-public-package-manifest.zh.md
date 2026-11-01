# Agent Note: 公共 package manifest 欄位

Status: implemented

[English](2026-09-10-public-package-manifest.md) | 中文

## 問題

外掛作者需要從統一的公共匯入路徑取得 npm 身份、執行時要求和 DSH 宣告。內部映像打包、Session 目錄和生成的代理中繼資料不定義社群外掛擴充功能點。將這些欄位一起暴露，會讓外部作者誤以為內部機制也可供使用。

## 決策

[`DshPackageManifest`](../../../../packages/util/package-manifest/src/types.ts) 描述 DSH 使用的 package.json 欄位，其中 `name` 和 `version` 必填。其可選的 `dsh` 成員使用 `DshManifest` 描述公共組合與作者中繼資料。該型別只選取所需 npm 欄位，不是完整的 package.json schema（模式）。App-boot 透過 `Partial` 適應無需釋出身份的本地 profile。

執行時要求位於頂層 `engines`：`dsh`、`node` 和 `npm` 均為可選版本字串，也允許其他 engine 名稱。`dsh.manifestVersion` 標識宣告格式 `1`。目前安裝器和載入器不強制檢查格式與 DSH 相容性宣告。

映像打包器擁有 `configTrees`，工作區目錄生成器擁有 Session 遷移宣告。這些內部工具仍可讀取既有磁碟欄位，但公共 manifest 型別不暴露這些欄位。此範圍細化了[共享宣告歸屬決策](2026-09-05-package-manifest-types.zh.md)，後者的包位置與依賴規則仍然有效。

各消費方負責 JSON 解析、欄位驗證、預設值解析和執行時資料適應。介面不會驗證已解析的 JSON。只有多個消費方需要相同驗證或歸一化時，helper 才屬於共享包；重複屬性存取的 getter 不提供共享策略。

## 考慮過的替代方案

**將內部中繼資料保留在公共宣告中。** 僅限工作區的遷移目錄和實驗性映像打包器，不會因為其中繼資料可被發現就提供公共外掛行為。

**將 DSH 相容性放在 `dsh.engines` 下。** [VS Code](https://code.visualstudio.com/api/references/extension-manifest) 將主機要求放在頂層 `engines.vscode`。頂層 `engines.dsh` 讓作者在同一位置宣告執行時要求；自定義鍵的檢查仍由 DSH 負責。

**僅用 peer dependency 宣告主機要求。** Peer dependency 約束已安裝的 npm 包，包括 CLI 包 `@deepseek-ai/dsh`。外掛位於獨立 profile 專案時，它們無法標識目前執行的 DSH 程序。

**透過統一的強制解析器解析所有領域。** 現有讀取方消費不同欄位子集，並各自擁有錯誤與預設值。合併它們會讓用戶端讀取方驗證無關的 profile 宣告。公共型別保持獨立於檔案系統存取和解析策略。

## 後果

外部作者獲得完整的包級宣告和更小的 DSH 作者 API。已移除內部型別的消費方必須使用各自負責的實作。打包器與儲存庫目錄不再依賴公共宣告包；app-boot 保留生產依賴，因為其釋出的 profile 型別引用該包。

編譯器和建置後的 NodeNext 匯入檢查驗證包身份必填、部分 profile、頂層 engine 宣告，以及公共 API 不含內部欄位。現有 profile、打包器和 Session 目錄測試繼續覆蓋其接受的檔案與畸形宣告。Session 格式、外掛載入規則和模型可見行為均不改變。
