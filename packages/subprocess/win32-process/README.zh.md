---
description: "面向實作或排查 Windows ACL 沙箱與普通子程序 Job runner 的維護者，說明底層 Win32 程序原語。"
kind: "package-library"
---

# @deepseek-ai/dsh-win32-process

[English](README.md) | 中文

## 概述

供 Windows ACL 沙箱與普通子程序 Job runner 消費的底層 Win32 程序庫。它唯一擁有儲存庫中可複用 process、stdio 與 Job Object 操作的 Koffi 繫結表；它不是 Cordis 服務，也不決定沙箱策略或公共 child 行為。維護任一原生程序路徑或檢查控制代碼生命週期限制時，請閱讀本頁。

## 目錄

- [行為](#behavior)
- [標頭檔案驗證](#header-verification)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="behavior"></a>
## 行為

- **唯一可複用 ABI owner** — `abi.ts` 擁有兩條 process 路徑消費的 Win32 常數與 x64 佈局值。`ffi.ts` 懶載入 `kernel32.dll` 與 `advapi32.dll`，核驗 `STARTUPINFOW` 和 `PROCESS_INFORMATION`，提供帶型別的操作與錯誤格式化，並讓沙箱策略透過同一組已載入庫繫結剩餘 API。
- **restricted-token 建立** — `RestrictedProcessSpawnOptions` 要求沙箱的 primary token，並使用 `CreateProcessAsUserW`。pipe 與 inherited-stdio 路徑共用命令列引號處理、cwd、restricted-token null 環境策略、回傳值檢查與控制代碼清理。
- **管道程序原語** — `spawnPipedProcess()` 建立匿名 stdin/stdout/stderr 管道，立即關閉 stdin，並返回兩個讀取端；呼叫方負責等待程序與排空管道。任一區域性失敗都會關閉該操作已經擁有的控制代碼，並在各自 Win32 生命週期結束後釋放每個 Koffi 輸出槽與結構體分配。
- **繼承 stdio 的 Job 原語** — `spawnInheritedJobProcess()` 建立一個 kill-on-close Job，臨時把目前 stdio 控制代碼設為可繼承，以 suspended 狀態建立 restricted child，把它分配給 Job，再恢復初始執行緒。目的碼不會在 Job 分配前執行；受控的分配或恢復失敗會終止 suspended child，或在釋放全部已擁有控制代碼前關閉已分配的 Job。
- **ordinary Job runner 原語** — `CurrentTokenProcessSpawnOptions` 要求已解析的 `applicationName`、完整 target 環境，以及三個專用於 target stdin、stdout 與 stderr 的 runner CRT 描述符。`spawnCurrentTokenJobProcess()` 透過 Node 匯出的 `uv_get_osfhandle()` 把這些描述符對映為 OS 控制代碼，拒絕無效結果，臨時把控制代碼設為可繼承，並透過 `STARTF_USESTDHANDLES` 傳入。它使用 `CREATE_UNICODE_ENVIRONMENT` 傳入排序後的 UTF-16LE 環境塊，再以 suspended 狀態透過 `CreateProcessW` 建立 target、把它分配給 unnamed kill-on-close Job，並只在分配後恢復。原始命令列 argv 項保持不變，runner 也可以關閉自己的 carrier 描述符，而不觸碰 Node 自身的標準流。
- **ordinary 結算操作** — `pollProcessExit()` 單獨釋出 direct exit，`isJobEmpty()` 則讀取 `QueryInformationJobObject(JobObjectBasicAccountingInformation)`，直到 `ActiveProcesses` 歸零。帶檢查的 Job 終止與控制代碼關閉使 runner 保持唯一 native owner。
- **顯式結算歸屬** — `waitForProcessExit()` 等待並關閉沙箱 process 控制代碼；ordinary runner 的 process polling、Job accounting 與 checked Job termination/closure 是獨立操作。`drainPipe()` 在排空期間複用一個 native count slot，釋放該分配並關閉管道讀取控制代碼。每個呼叫方擁有自己的 result 組合與返回控制代碼。

程序建立在目的碼執行前設定 `STARTF_USESHOWWINDOW` 和 `SW_HIDE`。它保留控制檯繼承，不新增可能導致受限權杖下 DLL 初始化失敗的 `CREATE_NO_WINDOW` 或 `CREATE_NEW_CONSOLE`。已有的父程序控制檯視窗不會被隱藏。

Windows ACL 沙箱在這些原語上增加 SID、DACL、grant、workspace 與公共 child 策略。

- **繼承控制描述符**——Job 建立接受可選的 fd-7 管道。`STARTUPINFO.cbReserved2/lpReserved2` 攜帶八槽 CRT 描述符表，其中包含標準控制代碼、關閉的槽 3–6，以及槽 7 的控制管道。該表保留到 CreateProcess 返回；臨時控制代碼繼承在成功和失敗時均恢復。在 Node 啟動前初始化該槽可避免覆蓋 Node 已分配的描述符。

<a id="header-verification"></a>
## 標頭檔案驗證

process、stdio 與 Job 的常數以及選定結構體的大小和偏移由 [`verify/abi-probe.cpp`](verify/abi-probe.cpp) 對照 MinGW Windows 標頭檔案檢查：

```sh
g++ -std=c++20 -municode -O2 -o abi-probe.exe verify/abi-probe.cpp && ./abi-probe.exe
```

Koffi 的 `STARTUPINFOW` 與 `PROCESS_INFORMATION` 定義還會在模組載入時斷言各自的 64 位大小。該探針還固定指標與控制代碼寬度、Unicode 環境標誌，以及用於判斷完全停穩的基礎 Job accounting record 大小與 `ActiveProcesses` 偏移；其餘已記錄偏移和常數也由該探針提供證據。

<a id="model-experience"></a>
## 模型體驗

### 程序原語

#### 模型看到什麼

沒有直接內容。本包向沙箱與 ordinary runner 提供 `Win32ProcessBindings`、`CurrentTokenProcessBindings` 與程序原語；兩者擁有全部模型可見工具、輸出與診斷，本包不貢獻提示詞或工具 schema。

#### Token 影響

沒有直接影響。消費方決定程序輸出是否進入工具結果或後續模型請求。

#### KV Cache 影響

本包不貢獻穩定請求字首，因此不會使模型 KV Cache 失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅在 Windows 原生載入** — 匯入通用型別可跨平臺進行，但解析繫結表會載入 Windows DLL，並在其他主機失敗。跨平臺測試注入繫結表，不載入原生 API。
- **沒有公共程序服務** — 本包刻意不把原語包裝成 Cordis 或 Node 流。消費方必須擁有自己的策略、非同步排程、輸出上限、取消與最終控制代碼關閉。
- **restricted-token null 環境** — `CreateProcessAsUserW` 沙箱原語傳入 null 環境塊，並先透過 `SetEnvironmentVariableW` 建立改動，因為經 Koffi 傳入顯式環境塊會以 `ERROR_INVALID_PARAMETER` 失敗。ordinary `CreateProcessW` runner 則要求完整 target 環境，並傳入排序、雙 NUL 結尾的 UTF-16LE 塊，其中包括 `=X:` 驅動器條目，而不修改自身環境。
- **沒有 standalone process API** — 本包只暴露目前沙箱與 ordinary-runner 消費方所需的操作，不擁有 Node 流、公共控制代碼、輸出策略、取消或 durable state。
- **建立到分配之間的中斷** — 目標以 suspended 狀態啟動，不能在 Job 分配前執行，但 runner 若在程序建立到分配之間的極窄區間被外力終止，可能留下 suspended target。本包不宣告原子 Job 附加保證。
- **header 證據限定架構** — 已提交的 ABI probe 與佈局常數覆蓋儲存庫目前 64 位 Windows 目標。支援新的指標寬度或不相容 Windows ABI 前，必須先更新 probe。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。操作只持有呼叫內的原生控制代碼。
