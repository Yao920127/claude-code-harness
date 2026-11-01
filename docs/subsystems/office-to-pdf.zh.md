# Office 轉 PDF

[English](office-to-pdf.md) | 中文

[document 包族](../../packages/document/README.zh.md) 在 Node 主機上將 Office 檔案轉換為 PDF。消費者負責原始檔讀取授權與展示；共享提供者負責轉換、有界准入和臨時 PDF 複用。此子系統不建立面向模型的工具或 Session 事件。

## 所有權

| 所有者 | 職責 |
|---|---|
| [office-to-pdf](../../packages/document/office-to-pdf/README.zh.md) | `ctx.officeToPdf`：共享 LibreOffice 轉換、有界准入和 PDF 快取 |
| [Web bundle](../../packages/bundle/web-app/README.zh.md) | 由主機消費者共享的單個可設定轉換提供者 |
| [Office 預覽 Client](../../packages/client/ui-sidebar-documentpreview/README.zh.md#office-preview) | Office 副檔名選擇、PDF 複用和缺失字型提示 |

## 請求和結果

[`OfficeToPdfRequest`](../../packages/document/office-to-pdf/src/types.ts)包含已授權的源鍵與版本、可選 stat 大小、延遲的 `read(signal, maxBytes)` 回呼、前臺或後臺優先順序以及 `OfficeExtension`：`doc`、`docx`、`xls`、`xlsx`、`ppt` 或 `pptx`。`OfficeToPdf.convert(request, signal?)` 返回一個完整 PDF 結果。取消遵循呼叫方和提供者生命週期；驗證、輸出和引擎失敗以分類的 `OfficeToPdfError` 拒絕。

`OfficeToPdfPriority` 對請求的預覽或 QA 使用 `foreground`，對推測工作使用 `background`。`OfficeSourceKey` 為呼叫方擁有的已授權源定位符增加品牌型別。`OfficeToPdfGeneration` 表示提供者生命週期，`OfficeToPdfKey` 表示其內容身份；消費者不解析這兩種不透明值。

| 結果欄位 | 含義 |
|---|---|
| `pdf` | 呼叫方擁有的 `Uint8Array`，包含完整 PDF |
| `missingFonts` | 本次轉換無法使用的文件請求字型名稱 |
| `cacheKey` | 不透明的轉換 generation 加副檔名與源內容身份 |
| `generation` | 提供者生命週期；替換後快取 PDF 不再可複用 |

提供者先准入延遲讀取，再分配原始檔位元組；按內容身份共享轉換，並在返回前刪除私有臨時目錄。返回的 PDF 位元組在提供者釋放後仍有效。原始檔和 PDF 位元組不會進入 Session 儲存。消費者可透過[工作區檔案](../../packages/api/workspace-files/README.zh.md)執行已授權的有界讀取。

## 預覽讀取

`RenderedDocumentBytes` 攜帶工作區檔案中繼資料、原生 PDF `data`、`missingFonts` 和 `generation`；轉換後的 PDF 附帶原始原始檔身份。

`officeToPdf.render` Remote 方法透過 Session 的[工作區檔案](../../packages/api/workspace-files/README.zh.md)服務檢查原始檔授權與版本。取得轉換容量後，`fs.readBytes` 在預留位元組容量內提供原始輸入；該讀取受 Office 輸入上限約束。二進位制 Remote 將 PDF 投影為 multipart 附件，並在 Client 恢復為由 `ArrayBuffer` 支撐的 `Uint8Array`。源存取失敗直接傳遞；大小和引擎失敗只暴露分類原因，不含診斷資訊。轉換不啟用 Agent 或追加事件。

`api/remotes` 掛載轉換服務生成的 Remote 描述符。共享文件預覽包使用完整位元組載入和現有 PDF.js Worker 註冊 Office 格式。每次預覽讀取都會重新檢查渲染 generation、原始檔授權和版本，再共享進行中的轉換或快取 PDF。連線重置和外掛解除安裝會取消請求並清空快取位元組。缺少服務時顯示在地化設定引導。

## 引擎選擇和限制

外部 [`@deepseek-ai/libreoffice-kit`](https://github.com/deepseek-harness/libreoffice-kit) Node API 選擇其預編譯引擎。kit 獨立維護版本和釋出流程，具體歸屬由[釋出歸屬決策](../../.agents/notes/implemented/architecture/2026-09-14-independent-libreoffice-kit.zh.md)定義。應用建置時安裝已釋出的 npm 包。應用打包要求目標已宣告的原生引擎；kit 未為該目標宣告原生引擎時使用 Node WASM。[平臺引擎決策](../../.agents/notes/implemented/architecture/2026-09-15-platform-office-engines.zh.md)定義安裝和打包規則。中繼資料無效、必需資源缺失和轉換錯誤都會拒絕請求，不切換引擎。轉換在 Host 使用磁碟輸入輸出路徑，不使用瀏覽器轉換引擎或字型 RPC。

[Host 提供者設定](../../packages/document/office-to-pdf/README.zh.md#use-this-package)負責並行、期限、輸入輸出上限、歸檔上限、影象解析度和字型存取。原生/WASM 實作和資產分發屬於 kit 工作區。系統 LibreOffice 探測、執行時引擎下載、持久 PDF 快取和麵向模型的渲染不屬於此提供者。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxofficetopdf--officetopdf"></a>

### `ctx.officeToPdf` — `OfficeToPdf`

A provider lifetime owns all converters, queued calls, and temporary files.

```ts cordis-catalog
/**
 * Convert Office bytes without modifying the source or writing Session events.
 * @param request - authorized metadata and deferred bounded source read.
 * @param signal - caller cancellation; provider disposal also stops active work.
 * @returns caller-owned PDF bytes after conversion and scratch cleanup settle; canceled readers reject independently.
 * @throws {OfficeToPdfError} Invalid input, unusable output, or engine failure; cancellation rejects with its reason.
 */
convert(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult>

/**
 * Read and convert one Office file using the Session's ordinary filesystem authorization.
 * @param workspaceFileScope - Session header lookup shared with workspaceFiles.
 * @param path - absolute or workspace-relative Office path.
 * @param priority - foreground preview or speculative background work.
 * @param signal - Remote cancellation; disposal also cancels outstanding reads and conversions.
 * @returns complete PDF bytes with original source identity and missing font families.
 */
@Remote async render( workspaceFileScope: WorkspaceFileScope, path: string, priority: OfficeToPdfPriority, signal: AbortSignal, ): Promise<RenderedDocumentBytes>

/**
 * Read the current rendering generation before reusing a Client PDF.
 * @param signal - Remote caller cancellation.
 * @returns provider lifetime, replaced with rendering, font, or engine configuration.
 */
@Remote('generation') getGeneration(signal: AbortSignal): OfficeToPdfGeneration
```

Source: [`packages/document/office-to-pdf/src/index.ts`](../../packages/document/office-to-pdf/src/index.ts)
<!-- END GENERATED cordis-surface -->
