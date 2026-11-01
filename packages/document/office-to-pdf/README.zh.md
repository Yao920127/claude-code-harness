---
description: "透過獨立釋出的 LibreOffice kit 在 Host 轉換 Office 文件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-office-to-pdf

[English](README.md) | 中文

## 概述

在主機計算機上將 Office 文件轉換為 PDF。宣告瞭原生 LibreOffice 引擎的目標使用原生引擎，其餘目標使用 Node WASM。提供者支援 DOC、DOCX、XLS、XLSX、PPT 和 PPTX。OOXML 轉換返回缺失字型名稱；二進位制 Office 轉換返回空列表。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

[Web bundle](../../bundle/web-app/README.zh.md)以 `office-to-pdf` 條目掛載此提供者。獨立組合透過 `cordis.yml` 條目掛載 `@deepseek-ai/dsh-office-to-pdf`。

呼叫方透過 `ctx.officeToPdf.convert()` 提交已授權源的標識、版本、可選位元組數、延遲的有界讀取、Office 副檔名和排程優先順序。源版本變化會拒絕轉換。結果包含呼叫方擁有的 PDF 位元組、缺失字型、快取鍵和轉換 generation；設定替換後 generation 隨之改變。取消以原因為拒絕值，轉換失敗使用 `OfficeToPdfError`。

此 provider 依賴獨立釋出的 [`@deepseek-ai/libreoffice-kit`](https://github.com/deepseek-harness/libreoffice-kit/tree/main/packages/entry) npm API，kit 版本為 `0.1.1`。應用打包選擇 kit 的 `optionalDependencies` 中宣告的匹配原生包；目標沒有宣告原生包時選擇 WASM。已宣告的原生引擎缺失時拒絕打包，不會選擇 WASM。[平臺引擎決策](../../../.agents/notes/implemented/architecture/2026-09-15-platform-office-engines.zh.md)定義安裝與打包策略；[釋出歸屬決策](../../../.agents/notes/implemented/architecture/2026-09-14-independent-libreoffice-kit.zh.md)定義獨立 kit 與 Harness 各自的職責。

瀏覽器透過 `officeToPdf.render` Remote 方法請求 PDF，參數為 Session 標識、Office 路徑和優先順序。此入口使用 `workspaceFiles` 完成授權和源版本檢查，再透過 `fs.readBytes` 在轉換預留容量內讀取原始位元組。程序內 `convert()` 不要求這些服務。回應保留原始檔路徑與版本，透過二進位制 Remote 的 multipart 傳輸攜帶原生 PDF 位元組，並攜帶缺失字型和轉換 generation。`officeToPdf.generation` Remote 方法返回目前提供者 generation；`api/remotes` 負責掛載生成的 Client 描述符。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxConcurrentConversions` | `2` | 最大活躍轉換器數量；排隊呼叫仍可取消。 |
| `timeoutMs` | `60000` | 取得轉換器後的轉換期限。 |
| `maxInputBytes` | `52428800` | 最大源位元組數。 |
| `maxOutputBytes` | `104857600` | 最大完整 PDF 位元組數。 |
| `maxImageResolution` | `192` | 最大光柵影象 DPI；覆蓋 kit 的預設值 `144`。 |
| `fontFallbacks` | kit 預設值 | 有序字型族優先組；每組至少包含兩個含非空白字元的名稱。 |

[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-office-to-pdf)定義全部字型、歸檔和影象設定。`fontDirectories` 接受絕對目錄；省略時使用 kit 的平臺預設值。顯式 `fontFallbacks` 替換 kit 的預設分組。已安裝的請求字型仍優先使用，缺失字形仍可由其他系統字型提供。原生引擎可能在應用這些優先規則前選中已安裝的度量相容字型。

[有界轉換決策](../../../.agents/notes/implemented/architecture/2026-09-15-bounded-office-conversion.zh.md)說明佇列准入、快取限額與共享取消的設計依據。

提供者按轉換 generation、Office 副檔名和精確源位元組的 SHA-256 保留成功 PDF。有界的源版本索引在授權 stat 後避免重讀已知內容；內容標識也會在不同源路徑之間共享轉換。達到任一保留上限時，最近最少使用的 PDF 及其別名一同移除。不保留失敗或超過快取上限的結果。每個結果具有獨立的 PDF 與字型緩衝區。已就緒別名命中不佔用讀取方名額；同一源的最後一個讀取方離開時，立即釋放其在途定位資訊。源的最後一個讀取方取消後，再次開啟該源會重新讀取位元組，再按內容摘要共享轉換，即使其他源仍保持該轉換執行或其 PDF 已就緒。

准入在呼叫源讀取前限制排隊中繼資料、未完成讀取方、活動源位元組預留和轉換。未知源大小預留 `maxInputBytes`；已知大小預留 stat 位元組數。讀取收到該容量，最多額外讀取一個超限哨兵位元組。`maxSourceBytes` 必須覆蓋 `maxInputBytes`。最後一個讀取方額度預留給前臺。`maxBackgroundConversions` 設為零時，拒絕後臺讀取方加入排隊或執行中的工作；仍可命中已完成的別名快取。只要仍有前臺任務排隊，後臺任務就繼續等待，包括前臺正在等待源容量的情況。前臺加入會提升排隊預熱；最後一個前臺讀取方離開後，排隊任務恢復後臺優先順序，符合條件的工作可立即開始。前臺准入也可移除排隊推測工作。總並行大於一時，後臺並行為前臺保留一個槽位。正在執行的預熱即使被提權，也保留後臺准入槽位直至結束。最後一個讀取方取消共享工作。移除排隊的前臺阻塞任務後，其他符合條件的工作立即准入；實際讀取、轉換和清理完成前仍保留活動預留容量。

預設保留 8 個 PDF、128 MiB 和 64 個源別名，准入 32 個讀取方與 8 個排隊任務，最多預留 100 MiB 源位元組，並允許一個後臺轉換。這些限制約束擁有的請求和二進位制載荷，不約束引擎 RSS、multipart 封裝、呼叫方保留的結果或 PDF.js 頁面渲染。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節 — 點選展開</summary>

引擎中繼資料無效、必需資源缺失和轉換錯誤會拒絕請求，不會切換引擎。共享的 WASM 引擎使用 LibreOffice 的 CPU 影象過濾器。原生轉換使用獨立的平臺引擎。

每個並行槽按需建立並複用一個 kit 轉換器。提供者將已授權輸入寫入私有臨時目錄，讀取有大小上限的普通 PDF 檔案，並在完成前刪除目錄。取消已准入的讀取方不會阻塞後續排隊工作。讀取方取消只會釋放該讀取方；最後一個讀取方和提供者解除安裝會取消共享工作。解除安裝向未完成讀取方報告 `unavailable`，並等待轉換及轉換器清理結束。活躍操作和臨時目錄清理由同一生命週期負責，因此不釋出執行時不變數伴隨入口。

Remote 檔案讀取在查詢轉換快取前重新檢查內容讀取授權和源版本。延遲讀取在取得轉換容量後執行，並在讀取後驗證源版本。源讀取失敗直接傳遞；轉換失敗返回 `document-render/failed` 及分類原因，不暴露引擎診斷。解除安裝會取消並等待授權讀取、Remote 請求和轉換工作全部結束。

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [Office 轉 PDF](../../../docs/subsystems/office-to-pdf.zh.md) — 組合與輸入、結果所有權。
- [工作區檔案](../../api/workspace-files/README.zh.md) — Session 檔案授權與有界讀取。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為此包僅轉換位元組，不提供面向模型的工具、訊息或 Session 事件。

#### KV Cache effect

無；轉換不會建構或修改模型請求。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 轉換保真度和已安裝的原生/WASM 資產由 `@deepseek-ai/libreoffice-kit` 負責；此提供者不查詢系統 LibreOffice，也不在執行時下載引擎。
- `timeoutMs` 僅在 kit 開始轉換時計時，不限制佇列等待時間。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
