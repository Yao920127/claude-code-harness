---
description: "面向模型的 read、read_image、write 與 edit 工具：供組合或排查 agent 檔案系統存取的使用者與維護者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs

[English](README.md) | 中文

## 概述

使用 `dsh-tool-fs` 可讓模型帶行號讀取 UTF-8 檔案、讀取受支援的圖片、建立或原子地替換檔案，以及執行有針對性的字面量編輯。結果都有上限，失敗會提供穩定錯誤碼與恢復指令。當寫入和編輯必須在成功讀取後執行時，請新增 `dsh-fs-observation-policy`；省略它時，變更仍是原子的，但不受此條件約束。圖片讀取需要持久附件儲存和支援圖片輸入的路由模型。glob 或 grep 搜尋請選擇同級的發現工具包。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `ctx.fs` 後端之後掛載工具，並在需要先讀後寫/編輯行為時掛載策略外掛。模型隨後獲得帶行號的讀取、原子的寫入與編輯，以及——掛載附件儲存時——影象讀取；每個結果都有上限，失敗攜帶穩定錯誤碼與恢復指令。

### 最小組合

一個後端、策略外掛，然後是工具；附件儲存為可選，用於啟用 `read_image`。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-fs'
```

策略外掛是可選的：省略時，工具直接使用裸提供者（無條件寫入、覆蓋與編輯，無已觀察狀態）。載入這些工具的部署也應載入該外掛，從而提供寫入/編輯前讀取行為。`read_image` 只在持久 `ctx.attachments` 服務已掛載時註冊；執行時還拒絕確切模型未宣告影象輸入的路由，因此文字路由的持久歷史不會出現影象塊。

### 工具

| 工具 | 參數 | 行為 |
|---|---|---|
| `read` | `file_path`、`offset?`、`limit?` | 帶行號的 UTF-8 內容與分頁 footer；`offset` 從 1 開始，`limit` 預設為設定的 `readLimit`，上限也為該值 |
| `read_image` | `file_path` | 讀取並持久儲存 PNG/JPEG/WebP/GIF 源圖；無副檔名路徑（包括規範化附件物件路徑）按檔案簽名識別格式；規範化可在下一次模型請求前縮小圖片，因此模型無需先建立縮圖 |
| `write` | `file_path`、`content` | 建立或完整替換檔案；有策略外掛時，覆蓋要求先在未變版本上執行 `read`，建立不需要 |
| `edit` | `file_path`、`old_string`、`new_string`、`replace_all?` | 字面量替換，除非 `replace_all` 為 true 否則要求唯一匹配；有策略外掛時，要求先執行 `read` 且檔案未變 |

欄位名使用 snake_case，與 Claude Code 和現有 harness 工具 schema 一致。成功返回緊湊信封——讀取視窗、影象引用或 `Created file`/`Updated file` 確認——`write`/`edit` 還會派生可回放的 diff 卡片中繼資料供 UI 展示。

### 設定

所有鍵均為可選；預設值是隨產品交付的讀取上限。

| 鍵 | 預設值 | 含義 |
|---|---|---|
| `readLimit` | `2000` | 一次 `read` 呼叫返回的預設和最大行數 |
| `readMaxLineLength` | `2000` | 每行截斷前保留的字元數 |
| `readMaxBytes` | `51200` | 一次 `read` 呼叫所選行的位元組上限；溢位時以「已達上限」footer 結束視窗 |
| `readStreamMinSize` | `10485760` | 大於等於該大小或大小未知的檔案採用流式讀取，而不是整體載入到記憶體 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-fs)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 策略與沙箱行為

`read` 與 `read_image` 的路徑授權完全由 `ctx.fs` 負責；媒體型別宣告和檔案簽名只決定 `read_image` 是否接受該後端返回的位元組。

掛載策略外掛後，`write` 與 `edit` 從 `fs/*` 意圖槽位取得防護，因此未讀目標或陳舊觀察會以 `FS_NOT_OBSERVED` 或 `FS_STALE_VERSION` 及恢復指令失敗。使用施加沙箱限制的後端（`fs-sandbox`）時，`write`/`edit` 還會公開 `sandbox_permissions` 與 `justification`；被拒絕的變更返回 `[sandbox: file access denied under <mode> mode]` 標記與同輪次升級提示，獲批的重試可以在該次呼叫中加蓋嚴格更寬的模式。理由欄位提示模型使用使用者目前提問的語言。

### 失敗與恢復

失敗被規範化為 `Error: <message>`，併為呼叫方保留結構化錯誤碼。穩定訊息包括 `file_path must be a non-empty string`、`limit must be less than or equal to <max>`、`cannot read "<path>": not found`、`cannot read "<path>": not a regular file`，以及影象路由拒絕 `cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images`。無論拒絕來自策略還是提供者，`FS_NOT_OBSERVED` 都規範化為 `cannot modify "<path>": file has not been read — read the file, then retry`；`FS_STALE_VERSION` 保留提供者原因並追加 `— re-read the file, then retry`。該次重新讀取確認缺失後，`edit` 報告 `FS_NOT_FOUND` 而不會重複陳舊恢復指令，`write` 則使用防護建立。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具套件背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

工具就是執行器；策略是事件門禁。工具不注入策略服務，也不檢查任何快取——每次變更都透過 `ctx.waterfall` 向單一意圖槽位請求防護，每個操作只在成功後發出 `fs/observed`。讀取恰好執行一次提供者 `stat`（型別與大小路由加觀察到的版本）；變更一次也不執行，因為防護來自意圖槽位，提供者在鎖內重新檢查。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config`、工具組合、`read_image` 附件門禁 |
| [`src/read.ts`](src/read.ts) | `read` 執行器：一次 stat、流式決策、視窗建置、觀察 |
| [`src/read-image.ts`](src/read-image.ts) | `read_image` 執行器：路由與媒體型別門禁、有界位元組、附件儲存 |
| [`src/write.ts`](src/write.ts) | `write` 執行器：意圖 waterfall、原子寫入、觀察 |
| [`src/edit.ts`](src/edit.ts) | `edit` 執行器：意圖 waterfall、字面量編輯、觀察 |
| [`src/read-render.ts`](src/read-render.ts) | 不依賴 Cordis 的視窗建置與信封格式化 |
| [`src/sandbox.ts`](src/sandbox.ts) | `write`/`edit` 共享的升權 API：策略解析與拒絕標記對映 |
| [`src/error.ts`](src/error.ts) | 防護變更失敗的穩定模型側診斷 |

### 各工具流程

四個工具共享同一種流程形態：用呼叫工作階段的 cwd 解析路徑、執行適用的門禁、恰好執行一次提供者操作，並且只在成功後發出 `fs/observed`。`read` 與 `read_image` 為型別與大小路由付出一次 `stat`；`write` 與 `edit` 不執行 stat，因為防護來自意圖槽位，提供者失敗以型別化 `FsError` 結果呈現。各工具執行器位於 `src/read.ts`、`src/read-image.ts`、`src/write.ts` 與 `src/edit.ts`。

### 觀察與並行

`fs/observed` 在操作成功之後透過普通 `ctx.emit` 發出；監聽器的約定是同步且只有副作用的記錄器，因此非同步或可能失敗的觀察不屬於該事件。`read` 允許並行排程，因為它唯一改變狀態的操作是同步記錄版本；稍後的 `write` 或 `edit` 會在目標鎖內重新檢查版本，因此記錄器競態會安全地失敗，兩個變更工具仍保持互斥。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具逐步進入它們所組合的約定、後端與策略。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——這些工具消費的 `ctx.fs` 約定。
- [fs-local](../fs-local/README.zh.md)——這些工具執行於其上的主機檔案系統後端。
- [fs-sandbox](../fs-sandbox/README.zh.md)——新增升權欄位的沙箱強制後端。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——透過 `fs/*` 事件防護變更的策略外掛。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)——本包註冊的窮盡式 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到的內容

組裝時，每個指導段落透過 `ctx.tools.get(name, scope)` 檢查對應工具，僅在該 agent 可見時輸出。write 段落僅在 edit 可見時推薦 edit。三個工具都可用時，下方原文保持不變；限制的施加、解除和工具註冊變化在下次組裝時生效。同一檢查適用於直接限制 agent 和 subagent 的 `toolFilter`，也適用於透過 `run_code` 暴露的 PTC 能力。 write/edit 中的先讀後改句子描述觀察策略，並非要求呼叫名為 `read` 的工具。隱藏 `read` 時仍保留這些句子：策略繼續保護修改操作，其他產生觀察記錄的操作（例如 `str_replace_editor` 的 `command: view`）也能建立同一檔案觀察記錄。工具可見性不會停用該前置條件。

##### Read 指導

```markdown
Use the read tool — not shell commands like cat — to inspect text files. Use offset and limit to continue reading large files.
```

##### Write 指導

```markdown
Read an existing file before overwriting it with write (the default fs-observation-policy requires it) and prefer edit for targeted changes.
```

##### Edit 指導

```markdown
Read a file before editing it (the default fs-observation-policy requires it), unless you just created or edited it in this session.
```

#### Token 影響

指導成本取決於可見工具及其適用的跨工具推薦。

#### KV Cache 影響

可見工具集合、外掛作用域和指導文字不變時，字首保持穩定。限制或外掛生命週期變化可能從首個變化的段落開始使複用失效。

### 工具 schema

#### 模型看到的內容

模型會看到已生成的 [`read`、`read_image`、`write` 和 `edit` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)，參數使用 snake_case。圖片工具只在持久附件儲存已掛載時出現；schema 本身與路由無關，嚴格門禁在執行時拒絕。作用域工具限制可以為某個 agent 移除任一定義。

#### Token 影響

該工具檢視中的每個請求都支付固定 schema 成本。

#### KV Cache 影響

只要可見工具定義和順序不變，字首就保持穩定。註冊生命週期或作用域限制可能從首個變化的 schema token 開始使複用失效。

### 讀取結果

#### 模型看到的內容

成功讀取結果精確為 `<path><displayPath></path>`、換行、`<type>file</type>`、換行、`<content>`、形如 `<lineNumber>: <text>` 的編號行、一個空行、一條 footer 和 `</content>`。footer 精確為 `(Output capped. Showing lines <start>-<end>. Use offset=<next> to continue.)`、`(Showing lines <start>-<end> of <total>. Use offset=<next> to continue.)` 或 `(End of file - total <total> lines)`。長行結尾精確為 `... (line truncated to <max> chars)`。讀取缺失目標仍返回 `FS_NOT_FOUND`，但會為呼叫工作階段記錄確認缺失；外部刪除的檔案被重新讀取後，重試的 `write` 可以透過提供者的不替換防護安全地重新建立該檔案。

#### Token 影響

讀取輸出受 `readLimit`、`readMaxLineLength` 與 `readMaxBytes` 限制；保留的呼叫與結果會反覆傳送，直到上下文壓縮（compaction）。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 影象讀取結果

#### 模型看到的內容

成功的 `read_image` 返回 `<path><displayPath></path>`、`<type>image</type>` 和寫明媒體型別、規範化尺寸與位元組數的 `<content>` 信封，隨後是作為原生影象塊的影象本身。結果會隨持久引用寫入工作階段日誌，然後才進入下一次模型請求。

#### Token 影響

影象在之後每次請求中都會計費，直到壓縮。每次呼叫都獨立受附件儲存的 `maxImageBytes`/`maxImagePixels`/`maxImageDimension` 約束；重複成功呼叫會在歷史中累積，內容定址只去重儲存的位元組，不去重每次請求的 token 成本。

#### KV Cache 影響

僅追加；新可見內容跟在可複用請求字首之後，不會使既有 KV 快取條目失效。

### 寫入與編輯結果

#### 模型看到的內容

寫入精確返回五行包絡：`<path><displayPath></path>`、`<type>file</type>`、`<content>`、`Created file` 或 `Updated file`，以及 `</content>`。編輯精確返回 `The file <displayPath> has been updated successfully.`；對於 `replace_all`，精確返回 `The file <displayPath> has been updated. All occurrences were successfully replaced.`。完整寫入或替換文字仍保留在 assistant 工具呼叫參數中。

#### Token 影響

成功文字很少，但大型變更參數和所有結果會反覆傳送，直到上下文壓縮。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 工具錯誤

#### 模型看到的內容

失敗會規範化為 `Error: <message>`。本包穩定的總和檢查碼讀取訊息是 `file_path must be a non-empty string`、`limit must be less than or equal to <max>`、`old_string must be a non-empty string`、`old_string and new_string must differ`、`cannot read "<path>": not found`、`cannot read "<path>": not a regular file`、`offset <offset> is out of range for "<path>" (<total> lines)`、`cannot read "<path>": the <ext> extension does not declare a supported image format; read_image accepts PNG/JPEG/WebP/GIF files, including extension-less files in those formats`、`cannot read "<path>": the file content is not a supported image format; read_image accepts PNG/JPEG/WebP/GIF`、`cannot read "<path>": the bytes do not decode as a supported PNG/JPEG/WebP/GIF image; the file may be truncated or corrupt`、`cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images`，以及型別不匹配的修復訊息 `cannot read "<path>": the <ext> extension declares <type>, but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats`（無副檔名路徑的不匹配報告 `cannot read "<path>": the file signature claims <type>, but the bytes decode as a different image format; the file may be corrupt`）。16-bit 轉換失敗會報告 `cannot read "<path>": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry`。提供者和策略範本在各自包的 README 中逐字列出。模型側錯誤包裝把所有 `FS_NOT_OBSERVED` 來源規範化為 `cannot modify "<path>": file has not been read — read the file, then retry`；`FS_STALE_VERSION` 保留提供者原因並追加 `— re-read the file, then retry`。兩者都保留結構化錯誤碼和原始原因。該次重新讀取確認缺失後，`edit` 會報告 `FS_NOT_FOUND`，而不會重複陳舊恢復指令；`write` 則使用帶防護的建立。

#### Token 影響

只有失敗呼叫會新增這些保留 token。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具套件何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用檔案系統對比或任務積壓。

- **未交付面向模型的目錄列表工具**：`ctx.fs.listDir` 服務於 skill（技能）發現等提供者程式碼，同級 `dsh-tool-fs-search` 包則提供基於 ripgrep 的 `glob` 與 `grep`，而不是擴充功能檔案系統 seam。
- **`read` 只處理 UTF-8 文字檔案**：影象使用獨立的 `read_image` 工具；PDF、音訊和影片仍延期處理。目錄目標為 `FS_NOT_REGULAR_FILE`。
- **媒體型別按副檔名宣告**：副檔名選擇宣告型別，附件儲存的魔數驗證保持權威；副檔名錯誤但格式正確的影象會得到改名修復提示，而不是被嗅探接受。只有沒有副檔名的路徑按檔案簽名識別格式。
- **物件路徑重新走源准入**：對規範化附件物件呼叫 `read_image` 會把其位元組作為新來源重新准入，因此把 `maxImageBytes`/`maxMessageImageBytes` 設定得低於規範化圖片位元組預算的部署可能拒絕 `ctx.attachments.readImage` 仍可讀取的物件路徑；預設設定下規範化預算（4 MiB）遠低於源上限（20 MiB）。
- **內嵌影象預覽依賴 UI 組合**：工具結果卡片經由瀏覽器的 `tool.call.images` 槽位渲染影象，由附件呈現外掛填充；未組合該外掛的 UI 改為顯示結果的信封文字。
- **沒有附件區域工具**：agent 在擁有檔案系統路徑時可以透過其他可用工具裁剪圖片；沒有路徑的貼上或拖入圖片無法按更高解析度重新讀取。
- **沒有超時介面**：`read`/`write`/`edit` 不接受超時參數，也不宣告超時預算；取消只透過 `exec.signal` 傳遞（見[提供者理由](../README.zh.md)）。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個模型側 adapter 沒有獨立 lifecycle stream；執行關係由它呼叫的 capability seam 負責。
