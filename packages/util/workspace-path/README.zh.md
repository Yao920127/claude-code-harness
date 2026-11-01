---
description: "瀏覽器安全的 Workspace 路徑輔助函式：拼接相對路徑、縮寫 POSIX 主目錄並生成顯示標題。"
kind: "package-library"
---

# dsh-util-workspace-path

[English](README.md) | 中文

## 概述

供 Workspace 相關用戶端和控制器包共享、可在瀏覽器使用的路徑輔助函式。該包負責拼接 Workspace 相對路徑、縮寫用於展示的 POSIX 主目錄、從 POSIX 或 Windows 路徑提取 Workspace 標題、把路徑拆成目錄部分與末段供展示，並擁有在 Sidebar 與資源模型之間命名工作區檔案的 `dsh-resource://file/…` 地址語法。`relativizeToCwd` 在顯示時省略工作區字首，並保留該目錄以外的路徑。它不提供 Cordis service，也不持有執行時狀態。

## 目錄

- [檔案地址](#file-addresses)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="file-addresses"></a>
## 檔案地址

資源地址 = `dsh-resource://<type>/…`，type（URI 的 host）即資源協定鍵（`file`，或外掛在 `ResourceProtocolMap` 中宣告的鍵）；其他 scheme 屬導航協定，另行定義。`dsh-resource://file/session/<sessionId>/<path>` 指定授權 Host 讀取的 Session，以及工作區相對或絕對路徑。前導斜槓保留在路徑中：`/etc/hosts` 對應 `dsh-resource://file/session/s//etc/hosts`，Windows 磁碟機代號對應 `dsh-resource://file/session/s/C:/x/y.txt`，UNC 對應 `dsh-resource://file/session/s///server/share/y.txt`。Host 解析路徑並執行存取檢查。`absolute/<path>` 形式仍可解析，但不攜帶授權 Session，因此 file 提供者不能讀取，Preview 也不認領；兩者均不借用目前或 Tab Session。語法住在 [`src/file-address.ts`](src/file-address.ts)；路徑輔助函式留在 [`src/index.ts`](src/index.ts) 並再匯出它。

`sessionFileAddress(sessionId, path)` 將 `\` 歸一為 `/`，去掉前導 `./`，但保留前導 `/` 字元。id 和每個路徑段都做元件編碼，`:` 保持字面。`fileAddressFor(sessionId, cwd, path)` 始終建構 Session 地址：`cwd` 內的路徑轉為相對路徑；其他絕對路徑（包括 `cwd` 未知時）仍作為該 Session 地址內的絕對路徑。`absoluteFileAddress(absolutePath)` 只建構不帶 Session 的形式。`parseFileAddress(address)` 檢查精確的檔案地址字首、忽略查詢與片段字尾、逐段解碼，併為 Session 地址返回 `{ scope, sessionId, path }`，為不帶 Session 的形式返回 `{ scope, path }`。其他 type 或 scheme、未知作用域、缺 id 或路徑，或錯誤轉義都返回 `undefined`。

`fileMediaUrl(base, path)` 從已解碼的絕對路徑生成帶認證檔案路由的 URL，支援 HTTP(S) 應用基址與桌面端 `dsh-app://app/` 來源，保留字面量百分號與部署字首，並拒絕其他應用基址、相對路徑、網路路徑字首和控制字元。Markdown 呼叫方先解碼所寫 URL；原生檔案卡片路徑原樣傳入。

-----

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **路徑解析僅處理字面值**——它識別 POSIX 絕對路徑、Windows 磁碟機代號路徑和 UNC 路徑，拼接相對路徑時保留 Workspace 路徑的分隔符，但不存取檔案系統，也不規範化 `.` 與 `..` 路徑段。
- **主目錄縮寫僅支援 POSIX**——Windows 路徑保持不變，因為可移植瀏覽器無法安全推斷 Windows 主目錄路徑等價關係。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個工具不持有可變執行時關係。
