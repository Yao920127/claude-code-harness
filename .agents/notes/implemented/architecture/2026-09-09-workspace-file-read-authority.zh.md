# Agent Note: 工作區檔案讀取權限

Status: implemented

[English](2026-09-09-workspace-file-read-authority.md) | 中文

## Problem

Workspace Files 同時提供檔案內容與工作區導航。對所有操作應用工作區包含限制，會在 Session 檔案系統後端之上形成第二套讀取策略，並阻止使用者預覽同一 Session 在工作區外可讀的路徑。HTML 預覽還需要直接讀取相對 JavaScript 與樣式表檔案，包括含 `..` 的路徑，而啟用腳本的文件可以使用瀏覽器網路。

## Decision

`read`、`readBytes` 與 `stat` 繼承被定址 Session 的檔案系統後端讀取權限。工作區根是輸入相對路徑的基準，而不是讀取邊界；只要後端允許，就可以讀取絕對路徑和離開工作區的相對路徑。服務仍要求普通檔案、拒絕符號連結，並應用文字和位元組上限。

`list` 與 `changes` 仍限於工作區，因為它們暴露工作區導航和觀察，而不是讀取一個具名檔案。`list` 拒絕根外目錄，`changes` 透過後端的工作區包含判定過濾觀察。

帶 `baseFile` 的 `readBytes` 從基準檔案所在目錄解析相對路徑。因此，只要 Session 後端允許，`..` 路徑就可以讀取工作區外的 JavaScript 或 CSS。開啟[開發者工具](../feature/2026-09-17-developer-tools-settings.zh.md)時，Document Preview 把有界、靜態宣告的本地腳本與樣式表打包進帶 `sandbox="allow-scripts"` 的 HTML Blob iframe；不透明源阻止存取父應用，但瀏覽器保留正常網路存取。這種暴露是為渲染靜態生成 HTML 而有意接受的安全取捨。

[Workspace Files 服務](2026-09-05-workspace-files-service.zh.md)負責分頁、檔案檢查、列舉和觀察。[Document Preview](2026-09-08-document-preview-operations.zh.md)負責選擇要打包的關聯檔案及 iframe sandbox。

## Alternatives considered

**把所有操作限制在工作區內。** 這會讓預覽採用比 Session 檔案系統後端更窄的策略，阻止讀取明確定址的可讀檔案，並使位於外部資源旁的 HTML 無法渲染。操作本身代表工作區時，仍保留工作區包含限制。

**允許根外讀取，但阻斷 iframe 的全部網路。** 更嚴格的 CSP 可以降低資料外傳風險，但也會拒絕靜態 HTML 預覽有意保留的外部資源與網路行為。不透明 sandbox 保護父應用，但不承諾網路隔離。

## Consequences

持有有效 Session 檔案地址的呼叫方可以接收 Session 檔案系統後端允許讀取的每個普通檔案的位元組，包括工作區外檔案。開啟開發者工具時，預覽的 HTML 文件可以執行已打包的本地 JavaScript，並行起網路請求。工作區外檔案不會產生 `changes` 幀，因此其預覽需要顯式重新整理才能觀察更新。
