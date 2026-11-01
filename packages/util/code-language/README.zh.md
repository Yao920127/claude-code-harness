---
description: "Client 程式碼介面與 Host read 卡片共享的唯一「副檔名 → 語法高亮語言」表。"
kind: "package-library"
---

# dsh-util-code-language

[English](README.md) | 中文

## 概述

本儲存庫唯一的「副檔名 → 語法高亮語言」表，供 Client 的文件 Code 預覽、diff 審閱與 Host read 工具持久化的 `lang` 提示共同使用。`languageForPath` 以大小寫不敏感的方式把檔名或路徑對映為規範化 grammar id；`CODE_HIGHLIGHT_EXTENSIONS` 列出預覽註冊可以宣告的全部字尾。`readLangHintForPath` 在同一張表上把 read 卡片的短 id 投影出來：已錄製的工作階段已經持有該字尾的值時保持該持久化值不變，其餘字尾取該語言的短名。該包可在瀏覽器使用，不提供 Cordis service，也不持有執行時狀態；真正的分詞仍由 Client 高亮器負責。

## 目錄

- [語言選擇](#language-selection)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="language-selection"></a>
## 語言選擇

表位於 [`src/index.ts`](src/index.ts)。每個鍵是規範化語言 id——即 Client 高亮器解析的 grammar id；每個值是選中它的、不含點的小寫副檔名。`languageForPath(path)` 取路徑最後一段的最後一個點之後的文字、轉小寫後在 `Map` 中查詢；使用 `Map` 可避免 `foo.constructor` 這類檔名解析到 `Object.prototype` 成員。未列入表的 dotfile（`.gitignore`）、無副檔名、結尾點、未知字尾都返回 `undefined`，各消費方一律按純文字渲染；前導點仍算分隔符，因此 `.env` 解析為 `dotenv`。`/` 與 `\` 都算路徑分隔符，因此 Windows 路徑與 POSIX 路徑解析一致。

該集合按常見原始碼、設定、腳本、資料與標記副檔名精選，並非完整語言登記表。沒有對應 grammar 的副檔名對映到最接近的 grammar（`properties` 對映到 `ini`，該 grammar 自帶 `properties` alias）；憑證與鎖副檔名（`pem`、`crt`、`key`、`cer`、`lock`）不列入表。CSV 對映為 `csv`；預覽註冊表將專用檢視器排在 Code 之前，因此 Spreadsheet 仍是它的預設預覽。`readLangHintForPath` 在同一張表上做投影：已錄製的工作階段已經持有該字尾的值時返回該持久化短 id，其餘字尾返回該語言的短名（`powershell`→`ps1`），無法識別的字尾返回 `undefined`——持久化欄位因此只有一種風格，即短名；對 `kotlin`、`swift`、`yaml`、`json` 等語言，短名與 grammar id 相同；而 `tsx`、`tf`、`tfvars`、`gradle` 這些字尾本身的名字更準確，保留其自身名字。消費方若希望 Client 高亮器真正分詞，仍取決於該 grammar 已在其中註冊——沒有載入 grammar 的 id 會按純文字渲染，而不是報錯。

-----

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **只匹配副檔名**——`languageForPath` 只看字尾，因此 `Dockerfile`、`Makefile`、`.gitignore`、`.editorconfig` 這類靠檔名識別的名稱仍不表。檔名規則暫緩。
- **不做內容嗅探**——副檔名缺失或未知時，即使位元組含義明確也按純文字處理；本表從不讀取內容。
- **精選而非窮舉**——本表小於 Shiki 的 grammar 目錄與 GitHub linguist；新增語言意味著同時新增副檔名條目與 Client grammar 註冊。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個工具不持有可變執行時關係。
