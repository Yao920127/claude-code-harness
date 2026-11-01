# Agent Note: 致命診斷與 Desktop 崩潰報告

Status: implemented

[English](2026-09-22-fatal-diagnostics-and-crash-reports.md) | 中文

## Problem

Desktop 應用的兩起使用者側故障都是靠致命恢復對話方塊的截圖定位的。該對話方塊只顯示錯誤的最後八行，並且當時聲稱完整診斷已寫入 Electron 控制檯，而打包安裝的應用從不暴露那個控制檯。

Windows 上，`dsh-subprocess-local` 的 `OutputCollector.spillAll` 在子程序 stdout 的 `'data'` 監聽器內開啟 spill 檔案。帶 `'wx'` 的 `openSync` 丟擲 `ENOENT`，對該標誌而言這意味著每程序私有 spill 目錄已不存在（它只建立一次、從不重建；是什麼刪除了它沒有被觀測到），由於沒有任何程序級 handler，Desktop Host 以 Node 預設的未捕捉異常輸出退出。`path:` 屬性恰好落在可見的八行裡；此外關於該故障的資訊一無所獲。

macOS 上，啟動審計把一組 Web 用戶端行列為 `import failed (see console for the import error)`，而真正的 import 錯誤只留在渲染程序 console 中。可見的八個名字與依賴同一個 application batch 的行完全吻合，因此該 batch 腳本的一次載入失敗可以解釋截圖；失敗是傳輸錯誤、過期 URL 的 404 還是回應截斷，無法判定。batch 只請求一次，因此任何瞬態失敗都是最終結果。

兩起事故共享三個缺口：致命診斷沒有持久化、Host 沒有 `uncaughtException` 策略、一個可失敗步驟被允許拖垮整個功能。

## Decision

四條決定一併交付。

**未捕捉異常是致命的並會被報告；失敗的操作絕不恢復。** `dsh-app-boot` 的 `installFailLoud` 為 `'uncaughtException'` 註冊與 `'unhandledRejection'` 相同的 handler：向 stderr 寫一條帶標籤的 `util.inspect` 診斷，在既有超時內等待介面的 release 掛鉤，以 1 退出。控制流不會回到失敗的操作，事件迴圈只執行到 release 結束或超時，因為只有丟擲點知道哪些狀態仍然完整；在更新過程中丟擲的 `'data'` 監聽器已經丟掉了一塊資料並只設定了一半自己的欄位，恢復執行會把可見的崩潰變成靜默錯誤的輸出。用 `util.inspect` 替代 `err.stack`，因為 `node:fs` 錯誤的 `code`、`syscall`、`path` 以及 `cause` 鏈都是堆疊行省略的可列舉屬性。rejection 的標籤 `fatal load failure` 保持不變，因為 Web profile 的 expected-output e2e 測試匹配它；異常使用 `fatal uncaught exception`。

**spill 檔案在每一步都是盡力而為。** `spillPath` 本來就是可選的，最終關閉失敗時已經會撤回它。`spillAll` 現在包住開啟或追加過程中的每一種檔案系統失敗：丟棄該 spill，透過所有者的 logger 報告一次（`SpillOptions.onFailure`，由執行時和 SSH helper 接到 `ctx.logger.error`），並讓記憶體尾部繼續收集。被刪除的目錄不會重建：該設計的安全性依賴於由本程序一次性建立的隨機名稱，重建一個已知名稱就放棄了這一點。在 `ENOENT` 時新建隨機目錄是待辦工作。

**Desktop 致命失敗在彈出視窗前寫入崩潰報告。** 每個 `reportFatal` 呼叫方都標明來源（`host`、`web-boot`、`renderer`、`main`）。`DesktopFatalRecovery.report` 最多等待 `writeCrashReport` 一秒，然後彈出對話方塊並把檔案路徑單獨佔一行——與錯誤是否被截短無關，埠佔用變體同樣如此。報告包含來源、後端是否已就緒、應用與執行時版本、完整的 inspect 錯誤（backend 狀態攜帶原始錯誤物件；Host 啟動失敗透過 fatal IPC 事件攜帶 Host 自己的 inspect 錯誤，因為 Host 的 stderr 與該訊息存在競爭，而殼只報告它看到的第一個失敗），以及從 `webContents` 的 `'console-message'` 捕捉的主視窗最近 error 級 console 輸出（64 KiB 尾部）。報告位於 `app.getPath('logs')` 下，平臺允許時僅所有者可讀，啟動時保留最新十份。關閉過程中的致命失敗只寫報告、不彈出視窗。按鈕與恢復操作不變。

**batch 腳本失敗是按行的問題，不是啟動失敗。** 在 `ClientModuleSystem.arrive` 中，傳輸失敗（腳本 `error` 事件；什麼都沒執行）在同一 URL 上重試一次，等待該 batch 的所有行共享這次重試。載入成功但沒有註冊某行的腳本絕不重新執行：batch 按順序註冊各包，`register()` 拒絕重複，重放會在原次執行已註冊的第一個包處停止。每個已執行的 batch URL 都會被記住，因此即使首個從該 batch 匯入的是它已註冊的行、之後另一行發現自己缺失，這一點仍然成立。兩種情況下每條仍缺失的行隨後載入自己的單資源 combo URL，Host 為每個包都提供該 URL；失敗的 batch URL 會被記住，後續行直接走退回，而單資源 URL 跨 import 保持可重試（一次啟動內 Loader 對每個條目只 import 一次，因此缺失行只有一次退回嘗試）。依賴失敗用消費者與依賴的名字包裝。模組系統在最外層操作按行記錄最後一次 `import()` 或 `prefetch()` 失敗，因此 factory 執行錯誤與到達錯誤一樣被捕捉，`assertEntriesActive` 按無 fiber 的條目報告該文字。

## 與既有決定的關係

本 note 部分取代 [Desktop 原生致命恢復](2026-09-15-desktop-native-fatal-recovery.zh.md)：對話方塊指向的記錄現在是崩潰報告檔案而非 Electron 控制檯，對話方塊詳情多出報告路徑一行；該 note 對對話方塊歸屬、按鈕集合與 profile 恢復的決定仍然有效。`uncaughtException` 的處理把 [fail-loud release](../bug-fix/2026-07-31-fail-loud-releases-the-terminal.zh.md) note 的 release 機制擴充功能到同步丟擲。

## 與 Desktop 日誌體系設計的關係

Desktop 本地日誌設計（Worker 獨佔寫入的滾動 JSONL 日誌、封閉事件詞彙、脫敏與速率限制）是持續日誌設計，仍是未來工作。它規定 Host stderr 與渲染程序 console 輸出永不持久化、錯誤只以固定分類進入日誌。本決定劃出一個例外：致命失敗的一次性崩潰報告保留原始錯誤以及保留的 stderr 與 console 尾部，因為兩次現場定位需要的正是這些原始內容，而報告有界（error 段截至 256 KiB、Host 診斷 64 KiB、渲染程序 console 尾部 64 KiB）、本地、僅所有者可讀，且只在應用已經彈出致命對話方塊時寫入。對話方塊標明檔名，使用者知道自己會分享什麼。任何非崩潰報告的內容仍遵循持續日誌的隱私姿態。

## Testing

- `dsh-app-boot`：未捕捉異常產生帶可列舉屬性與 cause 鏈的帶標籤診斷，與 rejection 共享退出閂鎖和 release 超時，兩個 handler 都能解除安裝。
- `dsh-subprocess-local`：開啟時 `ENOENT`（目錄被刪）、開啟時 `ENOTDIR`、檔案已存在後追加時 `ENOSPC`，三者都保持尾部逐位元組一致、撤回 spill 檔案、報告一次且不丟擲。
- `dsh-client-modules`：傳輸失敗重試一次並共享重試；持續失敗按缺失行退回且不重複請求 batch；零註冊或部分註冊的 batch 不重新執行；單資源 URL 保持可重試；最終錯誤列出每次嘗試；傳輸、factory 與依賴失敗都被記錄，成功和失效會清除記錄。
- `dsh-client-web`：提供模組系統時啟動審計寫出記錄的 import 錯誤。
- Desktop：`crash-report` 單測覆蓋渲染、僅所有者可讀的寫入、寫入失敗、不觸碰其他檔案的清理以及 console 尾部；`fatal-recovery` 測試在兩種語言下釘住帶與不帶報告路徑的對話方塊文字、一秒上限以及每次致命失敗只寫一次；啟動夾具斷言執行階段 Host 退出的報告輸入，包括捕捉的渲染程序 console。

## Consequences

Host 現在對兩種失敗走同一條退出路徑，比 Node 立即退出的預設行為最多晚 release 超時的時間，因此致命對話方塊可能在失敗後最多兩秒才出現，且 release 視窗內外掛寫到 stderr 的內容可能把 fail-loud 那一行擠出對話方塊的八行摘錄（報告檔案保留 64 KiB 尾部）。spill 失敗對使用者不再可見，只剩一個帶截斷標記且沒有路徑的結果；外掛 logger 那一行是唯一痕跡，Host 側持續日誌設計將來會持久化它。崩潰報告持久化原始 stderr 與 console 尾部，理由如上。batch 載入失敗現在對每條缺失行最多花費三次請求，且絕不讓已註冊的行失敗；共享的 batch 記憶意味著頁面生命週期內，失敗 batch 中某行的後續 import 會直接走其單資源 URL。

## Alternatives considered

**捕捉未捕捉異常並讓 Host 繼續執行。** 否決：監聽器丟擲後的狀態除丟擲點外無人知曉。在 Windows 案例中，繼續執行會丟掉該塊資料、向模型宣告一個不存在檔案的 spill 路徑，並在之後每一塊上再次丟擲。

**在 `ENOENT` 時重建 spill 目錄。** 本次否決：重建已知名稱放棄了該設計賴以存在的隨機目錄屬性。失敗時新建 `mkdtemp` 需要收集器持有目錄提供函式而非字串，作為待辦。

**同步寫崩潰報告以保持對話方塊同步。** 否決：在緩慢或網路掛載的 profile 目錄上，一次掛起的寫入會讓殼凍結且完全沒有對話方塊。帶一秒上限的非同步寫入無論如何都會彈出對話方塊。

**按持續日誌設計的規定，崩潰報告只持久化分類後的錯誤類別。** 對崩潰報告否決：`path:` 屬性和渲染程序的 `bundle script … failed to load` 那一行是兩次定位的關鍵證據，按該規則會被抹成 `UNCLASSIFIED`。

**對每種失敗都重試 batch URL。** 否決：重新執行一個已註冊部分包的 batch 會在腳本內丟擲 `duplicate factory registration`，`load` 事件照常觸發，呼叫方看到的還是最初那個「loaded without registering」，無法分辨是重試造成的。

**保留更多代 Host batch URL，使重組的 graph 不會讓進行中的啟動收到 404。** 推遲而非交付：沒有找到 ready 之後改動 graph 的生產觸發者，`lazyBody` 快取回應 Buffer 使保留有實際記憶體成本，代數與時限是需要 `Config` 欄位的部署可調項。
