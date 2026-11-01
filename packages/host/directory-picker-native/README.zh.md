---
description: "目錄選擇 seam 的原生 OS 選擇器後端：為坐在 web GUI 主機螢幕前的操作者每次開啟一個平臺選擇器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | 中文

## 概述

坐在主機螢幕前的操作者透過原生 OS 選擇器選擇工作區目錄：`dsh-host-directory-picker-native` 每次選擇開啟一個平臺目錄選擇器，並解析出所選絕對路徑（取消時為 `null`）。macOS 驅動 `osascript`，Linux 使用 Zenity 並以 KDialog 退回，Windows 在 spawn 的子程序中開啟現代 `IFileOpenDialog`。只有操作者坐在主機螢幕前時才可用——遠端部署應組合[瀏覽後端](../directory-picker-browse/README.zh.md)。一行組合設定還會在工作區流程中註冊匹配的瀏覽器側互動，因此同時選擇兩側。

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

當操作者工作在主機螢幕前，且原生選擇器是合適的互動時，組合此後端。開啟目錄選擇器的工作區流程每個開啟請求呼叫一次 `pick(signal)`；返回的 Promise 解析為所選絕對路徑，操作者取消時解析為 `null`。

### 何時選擇

為 macOS、Windows 或桌面 Linux 上的工作站本地操作者選擇此後端。當用戶端無法觸達 OS 選擇器時——遠端瀏覽器、SSH 轉發工作階段或無人值守主機——請選擇[瀏覽後端](../directory-picker-browse/README.zh.md)。具體情況不固定時，[自適應選擇器](../directory-picker-auto/README.zh.md)會在啟動時判定。

### 操作者會看到什麼

每次呼叫在主機螢幕上開啟一個原生選擇器並等待操作者；中止呼叫方的訊號會終止選擇器程序，而不是讓它留在螢幕上。Linux 上選擇器需要安裝 Zenity 或 KDialog 之一；兩者都沒有時，`pick` 以包含解決建議的錯誤拒絕，而不會退回為手輸路徑提示。本包的瀏覽器端向工作區流程註冊一個無渲染的流程佔用者——每次 `open` 請求驅動 `directoryPicker/pick`，並上報唯一結果（所選路徑、取消或失敗）。

### 可觀察的失敗

取消返回 `null`，不是錯誤。平臺工具缺失、選擇器啟動失敗或選擇操作中止都會導致 Promise 拒絕，介面可呈現相應錯誤；[瀏覽後端](../directory-picker-browse/README.zh.md)仍是原生目錄選擇不可靠時的組合層退回方案。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

後端是平臺選擇器之上的一層薄服務：`NativeDirectoryPicker` 註冊 `native` 能力，其 `pick` 轉發給 `pickNativeDirectory`，選擇器以子程序執行，因此主機程序不會因對話方塊而阻塞。命令邊界（`DirectoryPickerRunner`）與平臺事實可注入；共享的免 shell 子程序執行器位於 [`dsh-native-command`](../../util/native-command/README.zh.md)。

### 平臺機制

平臺工具不經 shell 呼叫：macOS 使用 `osascript`，Linux 使用 Zenity 並以 KDialog 退回；呼叫方的中止訊號會終止原生程序。Windows 在 spawn 的子程序中開啟現代 `IFileOpenDialog`——由 koffi 在子程序主執行緒上驅動的 COM 工作階段，採用主機接受的最佳執行緒 DPI 感知（優先 per-monitor-v2），中止時向對話方塊執行緒投遞 `WM_CLOSE`。在 `Show` 之前，子程序立即透過 `keybd_event` 合成一次 Alt 按鍵，讓對話方塊即使由後臺主機程序 spawn 也能啟用為前臺視窗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：持有穩定 `native` 能力的 `NativeDirectoryPicker` 服務 |
| [`src/native-picker.ts`](src/native-picker.ts) | 選擇器分發：平臺選擇、子程序執行、中止接線 |
| [`src/win32-dialog.ts`](src/win32-dialog.ts) 及同族檔案 | Windows 經 koffi 的子程序 `IFileOpenDialog`、DPI 處理、`WM_CLOSE` 中止 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當後端約定不夠用時閱讀以下內容：先看 seam 定義，再看替代後端與在兩者之間選擇的那個選擇器。

- [目錄選擇 seam](../directory-picker/README.zh.md)——`native` 能力約定與型別化錯誤詞彙。
- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——後端為何在互動形態上彼此不同。
- [瀏覽後端](../directory-picker-browse/README.zh.md)——面向遠端用戶端的應用內替代方案。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——native 與 browse 之間的啟動時判定。
- [免 shell 子程序執行器](../../util/native-command/README.zh.md)——選擇器執行所依賴的共享子程序原語。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 主機的目錄選擇後端不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明原生互動何時不可用或不穩定。它們是目前包約束，不是任務積壓。

- **Linux 依賴桌面工具**——Zenity 與 KDialog 均未安裝時，`pick` 以包含解決建議的錯誤拒絕；它不會退回為手輸路徑提示（組合層面的退回是瀏覽後端）。
- **Windows 沒有機制級退回**——透過打包依賴 koffi 執行的子程序選擇器是唯一原生層級，因此 COM 拒絕或對話方塊崩潰會直接上報失敗；組合層面的退回仍是瀏覽後端。
- **Windows 前臺授權依賴注入的輸入**——子程序在 `Show` 之前合成一次 Alt 按鍵，對話方塊才能從後臺主機取得前臺；在合成輸入被抑制的環境（安全桌面、受限遠端工作階段、提權前臺視窗）中，對話方塊仍可能在其他視窗後面開啟。該技術僅在 Windows 11 上驗證過。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。每次選擇都是一次無狀態的子程序往返；選擇器的結果僅為返回的路徑。
