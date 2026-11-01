# Agent Note: 跨程序工作階段寫租約

Status: implemented

[English](2026-08-31-cross-process-session-write-lease.md) | 中文

## Problem

JSONL 後端的寫控制代碼認領只在單個後端實例內部排除第二個寫入方。兩個程序——兩個 CLI 工作階段，或主機與 SDK 執行時並存——可以對同一工作階段執行寫開啟，把追加交錯寫進同一個日誌檔案，撕壞壓縮幀與 seq 連續性。該 seam 需要一份仲裁者位於所有寫入程序之外的持久跨程序寫所有權，因為沒有任何寫入方能活過所有故障模式。

## Decision

`SessionWriteLease`（packages/session/session-persistence-jsonl/src/lease.ts）在日誌旁的 `session.lock` 上持有核心鎖，貫穿寫控制代碼的整個生命期：POSIX 經由預編譯 `@deepseek-ai/node-addon-system/flock` 繫結 以非阻塞 `flock(2)` 加鎖，Windows 持有由規範鎖路徑派生的命名核心訊號量（計數 1，`CreateSemaphoreW`，實作在 src/win32.ts 既有 koffi 繫結旁）——零檔案系統足跡的核心物件，隨最後一個控制代碼關閉而銷燬。競爭對映為 `SessionAlreadyOwnedError`；持有者的描述符或控制代碼關閉時核心釋放鎖，包括任何形式的程序死亡，因此崩潰的持有者從不阻塞後繼者，也不存在任何過期簿記。活著但卡死的持有者保有鎖直到其程序退出：剝奪停頓寫入方的所有權被否決，因為其復活後的追加會撕壞日誌；POSIX 上刪除鎖檔案仍是該情境的顯式放棄手段。由於 POSIX 鎖指向 inode 而非路徑，取得後會驗證所鎖 inode 仍是鎖路徑上的檔案，否則重試。鎖在寫開啟既有工件時立即取得，新建工作階段則僅在首次物化寫入之前取得——未物化的工作階段不留任何檔案系統足跡，已取得鎖的控制代碼即使物化失敗也保有鎖直到關閉；釋放從不刪除鎖檔案，保住後續加鎖者用於驗證的穩定 inode。瀏覽器 worker 部署將 flock 入口存根為立即成功，因為程序內寫認領已排除所有寫入方。它的 `node:fs` 替代實作仍從 `FileHandle.stat({ bigint: true })` 報告 BigInt device 與 inode 身份，並在該路徑仍指向所開啟檔案時與路徑 `stat` 一致，因為租約在存根式加鎖後仍保留 inode 替換檢查。

## Alternatives considered

**TTL 記錄加續約與 rename 認領（最初實作，review 中被替換）** —— 日誌旁的 JSON 記錄攜帶 owner 權杖與過期時間，按間隔續約，過期後以原子 rename 接管。它在所有檔案系統上都能活，但本質是一個微縮的分散式演算法：續約定時器、丟失檢測、帶複核與歸還的接管認領——而其殘餘的多方競態仍允許有界的雙寫重疊（一個續約間隔）。核心仲裁刪除了整族競態及其全部機制，代價是一個原生建置依賴和上述卡死持有者語義。

**`proper-lockfile`** —— npm 生態對同一 TTL 模型的"過期判定加 touch"實作。它保留"先刪後建"的接管競態，用 mtime 加 inode 檢測失主（弱於 owner 權杖），且自 2021 年起再無釋出。

**fs-ext 自帶的 Windows 實作（`LockFileEx` 位元組區間鎖）** —— 被 CI 實證否決：Windows 的位元組區間鎖是強制鎖，任何讀到被鎖檔案的程序都會硬失敗（ripgrep 遍歷工作階段目錄時以 os error 33 崩掉）。

**Windows 共享模式獨佔開啟（`CreateFileW` 拒絕 `FILE_SHARE_WRITE`）** —— 讀者不受影響，但持有期間釘住鎖檔案的名字與目錄：CI 顯示數十個套件的臨時根清理因仍開啟的控制代碼阻塞遞迴刪除而報 EBUSY，使用者刪除工作階段目錄也會撞上同一堵牆。命名訊號量保住核心仲裁，且檔案系統足跡為零。

**POSIX 也手寫 ffi（經 koffi 調 `flock(2)`）** —— 繫結選擇與非同步 errno 處理由[預編譯系統原語決策](../architecture/2026-09-07-prebuilt-system-primitives.zh.md)規定。Windows 側保留 `win32.ts` 已有的 koffi 繫結。

## Consequences

跨程序排他需要對應平臺的預編譯系統繫結、每個物化工作階段一個由釋放刻意留下的鎖檔案，以及卡死持有者規則：卡住的程序阻塞該工作階段的寫入方直到其退出。它換來的是即時崩潰恢復（無等待期）、零續約流量，以及刪除了 TTL 設計只能"管理"而非"消除"的全部接管競態。諮詢式 `flock` 在部分網路檔案系統（NFSv3）上不可靠；位於此類掛載上的根目錄會退化為僅程序內排他。POSIX 上刪除活躍工作階段的鎖檔案按設計即放棄排他——harness 自身從不這樣做；agent-loop 的 resume 測試刻意用它模擬卡死的第一個生命週期，並在 Windows 上跳過：那裡的鎖是任何檔案操作都無法放棄的核心物件。
