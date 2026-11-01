---
description: "隨包附帶的 Word、PowerPoint 和 Excel 指令，供需要 Office 檔案編寫與結構檢查能力的部署使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-office

[English](README.md) | 中文

## 概述

Agent（智慧代理）可以載入 Word、PowerPoint 和 Excel 工作流，預設使用內建 Python 環境，並遵循使用者或 AGENTS.md 明確指定的環境。這些 skill（技能）涵蓋建立、區域性編輯、結構檢查和檔案交付。環境提供 LibreOffice Kit CLI 時，可直接渲染選定頁面或工作表區域、轉換所需 PDF，並將重新計算後的工作簿儲存為新檔案。視覺檢查要求模型支援圖片輸入，複用原始檔未變時的預覽，並在適用檢查透過後結束；普通交付不要求安裝渲染器。

## 目錄

- [使用本包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

將本提供者與 skill 註冊表及 `dsh-tool-skill` 一同掛載，即可在工作階段目錄中提供 `office-docx`、`office-pptx` 和 `office-xlsx`。提供者攜帶指令和腳本；部署提供直譯器、編寫庫、執行工具與檔案交付工具。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-skill-office'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `assetRoot` | 包內的 `assets/` | 包含三個 skill 資料夾和共享 `scripts/` 的絕對資源目錄；部署可將其放在應用歸檔之外。 |
| `node` | 目前獨立 Node 程序 | Node 可執行檔案的絕對路徑；Electron 和獨立 SDK 可執行檔案必須顯式提供。 |
| `cli` | 已安裝 kit 的 `lib/cli.js` | CLI 入口的絕對路徑；`false` 顯式停用 CLI。 |

相對路徑、資源缺失或 skill 檔案的 YAML frontmatter 缺少描述都會導致啟用失敗。解除安裝外掛會移除其候選項。專案和使用者 skill 的優先順序仍由 skill 註冊表負責。

載入的技能在 `Installed LibreOffice Kit` 段落中提供 `libreofficeKit.node` 和 `libreofficeKit.cli` 的絕對路徑。除非使用者明確要求不用內建二進位制，Agent 將內建 CLI 作為 Node 的第一個參數執行，無需依賴工作目錄或搜尋 PATH。內建 CLI 失敗時報告錯誤，不替換為系統可執行檔案。啟用時檢查兩個路徑是否為實際檔案。npm 部署預設使用已安裝的 kit；Desktop 提供獨立 Node 和 ASAR 外的完整 Office 依賴；Python SDK 提供獨立 Node 和可執行檔案旁的 Office 目錄。僅有 Python 的自定義部署必須設定 `cli: false`，或提供獨立 Node。

### 結構檢查

共享 Python 檢查器讀取 DOCX、PPTX 或 XLSX，不修改原始檔。它識別 Transitional 與 Strict OOXML 名稱空間，驗證 ZIP/XML 和包內引用關係，報告文件結構，並可檢查必需文字或幻燈片／工作表數量。DOCX 文字斷言覆蓋正文、分節引用的頁首和頁尾，以及正文引用的腳註和尾註；批註、詞庫文字與未引用的部件或腳註／尾註不能滿足斷言。它只使用 Python 標準庫。無效包、損壞或加密的 ZIP 成員和報告檔案寫入失敗都會在標準輸出中產生 JSON 失敗報告。檢查透過不代表外觀、特性保留或公式計算結果已得到驗證。

Excel 資料和公式任務跳過視覺檢查；涉及格式、排版、圖表外觀、列印或已知顯示問題時，檢查相關區域。基礎樣式設定本身不觸發視覺檢查，公式重算和使用者要求的匯出仍是獨立操作。 空白或透明預覽不能透過視覺檢查。預覽失敗時結束視覺檢查，不建立診斷工作簿、不轉換 PDF，也不擅自修改列印設定；交付可用工作簿並說明檢查限制。

-----

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

提供者註冊三個內建候選項，並在啟用時從隨包 YAML frontmatter 讀取描述。載入後的指令正文不包含這些中繼資料。載入後的每個 skill 暴露自己的檔案系統目錄，因此執行工具可以定位共享檢查器，而不依賴任務工作目錄。可設定的外部資源支援 Python 無法讀取應用歸檔的分發方式。

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供者註冊與設定資源路徑。 |
| [`assets/`](assets/) | 三種工作流和只讀 OOXML 檢查器。 |
| — | 不釋出執行時不變數伴隨入口：提供者擁有不可變候選項，skill 註冊表負責註冊生命週期和優先順序。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸閱讀

- [skill 註冊表](../skill/README.zh.md)——發現與優先順序。
- [skill 工具](../tool-skill/README.zh.md)——模型可見目錄與正文。
- [檔案交付](../../deliverables/tool-present/README.zh.md)——目前源路徑交付。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-skill` 間接呈現，由其渲染目錄項與選中的指令正文。

#### KV 快取影響

掛載提供者會增加三個目錄項；載入 skill 時，其正文進入既有 skill 工具的插入位置。提供者不另增提示詞分割槽。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- 提供者依賴 LibreOffice Kit，但不安裝 Python 或編寫庫。檢查器要求 Python 3.9 或更高版本。
- 結構檢查不判斷分頁、裁切、字型、圖表外觀或 Excel 重算。
- 檢查器只接受 DOCX、PPTX 和 XLSX；傳統格式、加密檔案和啟用宏的格式需要合適的其他工作流。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
