---
description: "面向建置或排查實驗性預覽部署的維護者，說明瀏覽器 worker 虛擬檔案系統（VFS）映像打包。"
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-packer`

[English](README.md) | 中文

## 概述

VFS 映像打包器：把一份合成 profile 變成瀏覽器 worker 掛載為檔案系統的 gzip 壓縮基礎 tar，並把不透明資料目錄變成按序應用的 overlay tar（[實驗組](../README.zh.md)）。不做任何原始碼編譯——基礎映像攜帶儲存庫真實建置產物，預覽部署除錯的正是 served 部署交付的位元組。打包預覽映像或排查映像內容時，請閱讀本頁。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

公開 npm 包透過庫入口匯出 `packVfsImage` 和 `packVfsOverlay`。呼叫方提供合成設定、包目錄和解析根目錄；本包不安裝 profile 層。執行時的庫入口提供打包所用的模組代理表與替換表。

打包器在 [`src/repository.ts`](src/repository.ts) 中擁有內部 `dsh.configTrees` 宣告、總和檢查碼源目錄解析。該欄位不屬於公共外掛 manifest API。

打包是三層標準棧：

1. **Roster**——合成 profile 的外掛行（標準 YAML 解析、Include 方言、`!!js` 原樣保留），加上 CLI（命令列介面）在 `package.json` `dsh.configTrees` 裡宣告的每棵設定樹（agent（智慧代理） presets）的行，按 Node 式依賴閉包物化。外部 peer 邊絕不會繫結到 worker，workspace peer 保留在鏈上。
2. **釋出檢視**——每個 workspace 或 vendored 包貢獻其建置後的 npm 切片（`files` 走 picomatch），不帶原始碼和 workspace `dist/`。外部包的 `main` 或 `exports` 可能指向 `src/` 或 `dist/`，因此兩處釋出 JavaScript 都會保留，只應用通用的測試、map、宣告與歸檔排除規則。
3. **可達性 sweep**——用執行時載入器自己的解析, 從全部不含萬用字元的 workspace 執行時匯出加 worker 裝配種子 (`IMAGE_ENTRY_SEEDS`) 出發, 打包時把每個可達模組轉換為符合包裝層約定的形式. 僅含型別宣告的條件樹不作為掃描入口; 執行時程式碼請求這些匯出仍會失敗. 該轉換會報告名稱可靜態確定的 import、re-export 與動態 import、經 `require` 發起的呼叫, 以及透過 `node:module` 或 `module` 具名匯入 (含匯入別名) 在模組作用域直接發起的 `createRequire(import.meta.url)('pkg')` 呼叫. 頁面資產 (`./client` 匯出背後的 `lib/client.js`) 原樣直髮; 自家程式碼的不可解析請求會讓打包失敗, 第三方不可解析請求則允許延後到 require 時明確失敗.

`repository.ts` 擁有儲存庫形態輸入（`vendor/`、`packages/`、`native/system/packages/` 與 `apps/` 的 workspace 掃描；經真 CLI dump 路徑合成 profile）；`pack.ts` 一概不擁有，同一庫換參即可打另一棵樹。Native 掃描使 Landlock 入口包成為普通釋出檢視依賴，其可執行檔案仍由 Worker 平臺實作。CLI 為 `dsh-pack-vfs-image --out <file> [--profile web]`；`apps/web` 的 `build:preview` 在預覽殼建置後執行它。

儲存庫介面卡還宣告 `webworker-runtime/tests/fixtures/` 下僅用於 preview 的 fixture（測試前置資料） tree。CLI 會把每套具名 fixture 打成一份獨立的確定性 overlay 歸檔，並寫出瀏覽器可讀的 manifest（中繼資料清單）。Overlay 檔案繞過 npm 釋出檢視和模組可達性排除規則，因此點目錄與範例原始碼會完整保留；其掛載位置僅限 `home/` 與 `workspace/`。`packVfsOverlay` 將所有檔案視為不透明位元組。

`packPreviewFixture` 在 Node 中透過 [Session 格式目錄](../../session/session-format-catalog/README.zh.md)準備每個 fixture 目錄裡最新的規範原始 Session 代際。它從同一 fixture 根目錄收集直屬子 Session 的發現證據，再補全歷史父目錄。它嚴格恢復原始檔、編碼並嚴格驗證目前後繼檔案，然後將後繼檔案與未改變的原始檔一同打包。如果選中的代際格式錯誤、不受支援或屬於未來版本，建置會拒絕，不退回。臨時後繼檔案在打包後刪除。瀏覽器以寫模式開啟時即可使用目前資料，無需呼叫 Node 的遷移驗證 Worker。投影快取仍由其所屬包驗證；較早代際不能提供目前摺疊檢查點。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包在建置期執行並寫出映像檔案，其產物本身不進入任何模型請求。

#### KV Cache 影響

無：本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **規則表依賴人工判斷**（`rules.ts`：exclude glob、頁面資產模式、入口種子），由 `tests/` 釘住；worker 需要觸達的新資產類別應加錶行，而不是改掃描器。
- **可達性只推斷精確請求形式**——計算得到的 `import` 與 `require` 參數、儲存下來的 `createRequire` 結果、經 CommonJS 取得的 `createRequire`，以及基準不是 `import.meta.url` 的呼叫只在執行時解析；若目標已被裁掉就會顯式失敗。只能透過這些形式觸達的目標需要顯式映像入口種子。
- **vendored 包原始碼（`src/*.ts`）被排除**——執行時無人解析它們；未來若有 worker 內原始碼巡檢功能需要專門的 include 規則。
- **打包器假定建置產物 `lib/` 是新鮮的**：它從不編譯，工作區建置陳舊就會打包陳舊位元組。先跑儲存庫建置。
- **CLI 必須位於原有儲存庫位置**：`dsh-pack-vfs-image` 相對於自身安裝檔案定位檢出目錄，並從中讀取原始碼 CLI、設定樹和預覽 fixture。npm 安裝支援參數化的庫 API；CLI 和儲存庫輔助函式需要完整且已建置的 DeepSeek Harness 檢出目錄。
- **Preview Session 輸入使用原始 JSONL** — `packPreviewFixture` 拒絕壓縮檔案與不規範的 Session 代際檔名。通用 overlay 仍逐位元組保留輸入。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是沒有生產事件流或可變資料的建置時 pass；無法解析的自有程式碼請求與全有或全無的包裝層約定會直接讓 pack 失敗。
