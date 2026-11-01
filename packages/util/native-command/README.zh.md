---
description: "主機原生命令與路徑開啟工具，提供無 shell 執行、取消、桌面探測與 WSL 路徑交接。"
kind: "package-library"
---

# @deepseek-ai/dsh-native-command

[English](README.md) | 中文

## 概述

`dsh-native-command` 無需 shell 即可執行 Host 可執行檔案，並透過桌面開啟 Host 檔案系統路徑。命令執行器捕捉 utf8 輸出、傳播取消，並隱藏 Windows 瞬時控制檯。路徑開啟器支援預設應用與文字編輯器意圖、瀏覽器可渲染文件、WSL 轉換與桌面可用性檢查。它是庫而非外掛：沒有 `ctx`、無狀態、不發事件。

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

當主機側整合需要執行一條原生命令、並需要它的輸出或失敗資訊（或兩者兼要）、且絕不能涉及 shell 時，使用本執行器。

### 執行一條命令

```ts
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'

declare const script: string
declare const signal: AbortSignal
const { stdout, stderr } = await runNativeCommand('osascript', ['-e', script], signal)
```

結束代碼為 0 時，呼叫解析為捕捉到的 stdout 與 stderr。任何失敗都會以錯誤拒絕，錯誤附帶退出 `code` 與兩路已捕捉輸出，因此呼叫方無需重跑命令即可區分工具缺失（`ENOENT`）、取消（`ABORT_ERR`）與真實的命令失敗。

### 注入命令邊界

`NativeCommandRunner` 型別是主機整合的可注入命令邊界：在整合需要一個可測試邊界的位置傳入該函式（或其包裝層），測試即可替換為假執行器。

### 開啟 Host 路徑

`openNativePath(path, signal)` 將路徑交給預設應用；平臺能夠確定預設瀏覽器時，HTML 與 SVG 會優先交給該瀏覽器。`openNativeAssociatedPath(path, signal)` 始終使用檔案型別關聯，不覆蓋為瀏覽器。`openNativeTextFile(path, signal)` 選擇文字編輯器意圖；macOS 使用 `open -t`。Windows 將每種意圖都交給 Explorer，由 shell 自身的預設應用解析（即雙擊所走的那條）選擇應用；Explorer 收到的是編碼後的檔案 URI，其結束代碼 1 按已轉交請求處理，取消、找不到可執行檔案和其他結束代碼仍然報錯。該確認不能證明應用已開啟檔案。WSL 路徑先透過 `wslpath -w` 轉換，再交給 Windows 桌面。`canOpenNativePath()` 報告目前 Host 是否可能具備桌面目標。

`revealNativePath(path, signal)` 在 Finder 或檔案資源管理器中選中檔案，包含 WSL 路徑轉換；在桌面 Linux 上透過 `xdg-open` 開啟上層目錄。`nativeFileManager()` 標識該操作，供 UI 根據 Host 選擇文案；桌面是否可用仍由獨立的 `canOpenNativePath()` 檢查決定。呼叫方必須先授權絕對檔案路徑，再執行操作。平臺分派由注入執行器的測試覆蓋；原生桌面驗證由對應平臺負責。 Explorer 接收獨立參數中的編碼檔案 URI。結束代碼 1 按已轉交請求處理；取消、找不到可執行檔案和其他結束代碼仍然報錯。該確認不能證明應用已開啟檔案，也不能證明桌面視窗已選中檔案。

`nativeFileApplications(path, signal)` 返回關聯應用、在地化名稱、圖示和目前預設項。macOS 12 及以上版本使用 LaunchServices，Windows 使用 Shell 關聯處理器並在提取前解析打包應用的間接圖示引用，Linux 使用 GIO，並共用 XDG 桌面檔案和圖示讀取邏輯。macOS 上 bundle 識別符號與顯示名都相同的多份複製（自更新暫存副本、按版本安裝的複製）合併為系統預設項，否則保留最高版本；顯示名不同的並存安裝兩項都保留。`openNativeFileApplication(path, application, signal)` 按完整的目前註冊列表重新驗證關聯應用，展示列表中被合併掉的複製仍可開啟，且不修改系統預設值。Windows 交給 Shell 啟動應用，Linux 交給 `gio launch` 展開參數。WSL 轉換路徑後使用 Windows 介面卡。呼叫方負責驗證本地檔案路徑。原生整合測試分別在相應平臺使用獨立的 Windows 檔案關聯和 Linux XDG 目錄。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

命令執行器是 Node `execFile` 的薄包裝。路徑開啟器根據平臺與環境事實選擇一條無 shell 命令，而呼叫方繼續負責決定允許開啟哪個路徑。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 命令執行器與路徑開啟器的公共匯出 |
| [`src/runner.ts`](src/runner.ts) | 無 shell 的 `execFile` 介面卡 |
| [`src/path-opener.ts`](src/path-opener.ts) | 桌面探測、開啟意圖、瀏覽器偏好與 WSL 轉換 |
| — | 不釋出執行時不變式伴生入口；每次執行都是一次無狀態的子程序往返，不擁有事件流或可變執行時資料；相關行為由單元測試保障。 |

### execFile 給了執行器什麼

`execFile` 以 argv 陣列直接 spawn 可執行檔案——沒有 shell 字串，參數不經 shell 解釋。`signal` 選項在呼叫方中止觸發時終止子程序；`windowsHide` 在 Windows 上抑制瞬時控制檯視窗。遇到非零退出或 spawn 錯誤時，回呼把 `code`、`stdout`、`stderr` 掛到被拒絕的錯誤上，並保留原始錯誤作為 `cause`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要消費方或本工具刻意不屬於的通用子程序能力時，閱讀以下頁面。

- [原生目錄選擇器](../../host/directory-picker-native/README.zh.md)——本執行器執行的 OS 選擇器命令。
- [Session Controller](../../api/session-controller/README.zh.md)——開啟前解析 Session 相對 workspace 路徑。
- [Settings Controller](../../api/settings-controller/README.zh.md)——選擇 settings 文件。
- [子程序能力](../../subprocess/subprocess/README.zh.md)——通用子程序 seam，本包並非其組成部分。

-----

<a id="model-experience"></a>
## 模型體驗

無：主機側工具不註冊任何面向模型的內容。

#### KV Cache 影響

此處沒有任何內容進入請求字首；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

Linux 的關聯查詢和指定應用啟動需要 GIO。缺少原生命令時查詢失敗，缺失的圖示返回 null；呼叫方可以保留檔案定位作為備用動作。


這些限制說明本執行器何時不是合適的工具。它們是目前包約束，不是任務積壓。

- 命令輸出受 Node 的 `execFile` 緩衝上限約束，超過上限時拒絕結果。流式輸出由 subprocess 能力處理。
- Windows 關聯處理器的圖示只在 Shell 能解析其間接引用時顯示；解析失敗時退回到處理器的可執行檔案，處理器沒有給出可執行檔案（打包處理器可能只報 AUMID 或家族名）時則沒有圖示。
- Windows 主機需要互動桌面工作階段。在非互動工作階段（服務，或沒有互動登入的計劃任務）中，`explorer.exe` 不呼叫任何檔案關聯，且仍在約 1 秒後以結束代碼 1 返回（Windows 11 ARM64 build 26200 的 SSH session 0 實測），於是「開啟」會報告成功卻什麼都沒開啟；呼叫方的 abort 訊號把這段等待變成超時而不是掛死。同一目標改用 `Invoke-Item` 命令時可在該工作階段內解析關聯，目錄失敗也會以非零結束代碼報出。該工作階段下的後備尚未實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
