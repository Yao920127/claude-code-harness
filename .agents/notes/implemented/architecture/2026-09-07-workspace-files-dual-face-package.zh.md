# Agent Note: 工作區檔案統一為 API 雙面包

Status: implemented

[English](2026-09-07-workspace-files-dual-face-package.md) | 中文

## Problem

工作區檔案服務與瀏覽器資源提供者共同演進，但其編譯圖包含指向 Remote 裝配和 Sidebar UI 的反向依賴。拆包避開了這些環，卻分離了線路協定與其 Client 模型的歸屬。只有 Host 實作、Client 編譯入口僅含型別的包，也缺少 Client 目錄分析用於區分執行時匯出的 `dsh.client` 與 `./client` 宣告。

## Decision

`packages/api/workspace-files` 擁有兩面的實作。Host 與 Client 葉設定仍由各自的根聚合直接引用，solution 根設定引用兩片葉子。Host 匯出檔案服務，`./client` 匯出實際的資源提供者外掛，`dsh.client` 宣告瀏覽器外掛。web-app 的一個條目載入兩面。這隻取代[工作區檔案服務記錄](2026-09-05-workspace-files-service.zh.md)中的拆包決定，其授權、分頁與流語義保持不變。

兩條依賴方向使編譯圖保持無環：

- `client/resources` 從定義 `RemoteResult` 與 `RemoteFailure` 的 `typert/protocol` 包匯入它們，不依賴 `api/remotes`；後者負責裝配消費資源模型的提供者。
- 文字預覽使用檔案包匯出的參數型別宣告 `SidebarRightResourceParamsMap.file`。檔案提供者宣告其資源值，但不匯入 Sidebar UI。呼叫方需要該導航宣告時，匯入檢視器的型別入口。

這消除了 `remotes → workspace-files → resources → remotes` 和 `remotes → workspace-files → sidebar-right → ui-conversation → remotes`。Cordis 執行時服務注入仍獨立於 TypeScript 工程引用。

## Alternatives considered

**保留兩個包。** 這隔離了編譯環，卻拆開同一檔案能力的 Host 與 Client 歸屬。刪除反向型別依賴後，可以採用與其它 API Controller 相同的雙面組織。

**刪除根 Client 引用。** 傳遞引用仍會編譯該葉子，但兩個根聚合必須顯式命名本包對應的編譯面。

**修改目錄分析或增加空 Client 外掛。** 兩者都不能提供要求的瀏覽器實作。實際的 `./client` 匯出和 `dsh.client` 使用分析器已有的雙面支援路徑。

## Consequences

Host 線路方法和瀏覽器資源行為不變。瀏覽器實作、測試與文件歸同一個包所有；Client 型別依賴止於協定和資源模型層，不反向觸及 UI 或 Remote 裝配。

## Verification

Cordis inspect 目錄檢查分析宣告的 Client 匯出，兩個編譯聚合保留其葉引用，Host 與 Client 檔案服務測試覆蓋相同的實作。現有依賴與工程引用檢查約束這些編譯關係。
