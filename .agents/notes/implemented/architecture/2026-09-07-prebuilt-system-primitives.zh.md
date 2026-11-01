# Agent Note: 預編譯系統原語

Status: implemented

[English](2026-09-07-prebuilt-system-primitives.md) | 中文

## Problem

JSONL 寫入方依賴的 `fs-ext` 在使用者安裝時編譯 NAN addon。因此，原生編譯器是否可用以及 Node 模組 ABI 的變化會影響普通安裝，包括 Node 26。儲存庫已經維護了 Landlock 啟動器及其按平臺釋出的工作流。

## Decision

[native/system](../../../../native/system/README.zh.md) 中獨立版本的 `@deepseek-ai/node-addon-system` 包族分發既有 `landlock-run` 可執行檔案和使用穩定 Node-API v8 的 `system.node` addon。平臺包按作業系統和 CPU 選擇；Linux 分別攜帶 glibc 與 musl addon 檔案。macOS 攜帶 addon，但不包含 Landlock 可執行檔案。入口包和平臺包都不在安裝期間編譯。

包不提供根匯出。`./landlock-run` JavaScript 入口保留 Landlock API 和 [CLI 協定](../../../../native/system/docs/cli-contract.md)。`./flock` 入口僅在呼叫 `tryLockExclusive(fd)` 時載入 addon。它在非同步原生工作中執行 `flock(fd, LOCK_EX | LOCK_NB)`，並在該工作執行緒儲存 errno。呼叫方在完成前持有描述符，並透過關閉它釋放鎖。繫結缺失時拒絕取得鎖，不授予沒有保護的鎖。

[Session 寫租約決策](../feature/2026-08-31-cross-process-session-write-lease.zh.md) 繼續負責取得時機、inode 驗證、關閉所有權和崩潰語義。Windows 保留既有 koffi 訊號量。瀏覽器 worker 僅替換 flock 子路徑，使用未經修改的 `./landlock-run` JavaScript API。

原始碼建置在需要 addon 的儲存庫測試與建置之前顯式編譯目前主機 addon。Native CI 建置完整平臺產物，並讓相同 addon 位元組跨 Node 版本測試；Linux 還在 Alpine 中執行 musl 產物。平臺 prepack 拒絕格式錯誤或不完整的二進位制，離線 npm 安裝演練檢查安裝位元組與真實鎖行為。Native [測試](../../../../native/system/test/flock.test.js) 覆蓋描述符與程序競爭、關閉和崩潰釋放、獨立 errno 值及 worker 清理。

## Alternatives considered

**保留 NAN，為每個 Node ABI 釋出建置。** 這會為僅需穩定 Node-API 操作的繫結保留 Node 主版本建置矩陣。已評估的 `fs-ext-extra-prebuilt@2.2.14` 在 Node 26 ABI147 下選中 Node 25 ABI141 二進位制；預設安裝退回還會在 NAN 被提升安裝時提前退出而不編譯。

**將 fs-ext 打入父包 tarball。** npm 預設仍執行 bundled 依賴的安裝掛鉤。僅打包既不能禁止編譯，也不能讓一個二進位制跨作業系統、CPU、libc 實作或 Node ABI 通用。

**將 flock 換成 OFD/fcntl 鎖。** 在普通 Linux 檔案系統上，這些鎖不一定排斥既有 flock 持有者。tmpfs 探針在 fs-ext 持有 flock 時仍取得 OFD 鎖，因此這不是保持行為的替換。

**透過 koffi 執行 POSIX 呼叫。** 同步呼叫改變事件迴圈的阻塞行為；在非同步回呼後讀取 errno 會讀到錯誤執行緒的值。原生 async-work 介面卡把系統呼叫結果和 errno 儲存在一起，無須另加 FFI 協調層。

## Consequences

包族維護小型 C 繫結、平臺建置和安裝產物驗證，而不是整套檔案系統擴充功能 API。Node-API 消除按 Node 主版本分發二進位制的要求，但不消除作業系統、CPU 和 libc 要求。統一原生髮布包含兩項能力，但匯入或使用其中一項不會載入另一項。Landlock 二進位制語義、Windows 鎖和已釋出 Session 資料格式保持不變。
