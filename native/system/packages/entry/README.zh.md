---
description: "預編譯 Landlock 啟動器與非同步 POSIX flock 的 JavaScript 入口。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system

[English](README.md) | 中文

`./landlock-run` 入口匯出 Landlock 啟動器路徑、強制執行探測、授權參數和協定常數。獨立的 `./flock` 入口匯出 `tryLockExclusive(fd): Promise<void>`；匯入任一入口都不會載入 `system.node`。包不提供根匯出。

鎖操作非同步嘗試 `LOCK_EX | LOCK_NB`。在完成前保持呼叫方擁有的描述符開啟；競爭以 `EAGAIN`/`EWOULDBLOCK` 拒絕，其他系統呼叫失敗也會拒絕，錯誤攜帶 code、值為正數的 errno 和 `syscall: 'flock'`。原生呼叫準備階段的錯誤也會拒絕同一個 promise。關閉指向該開啟檔案描述的最後一個描述符即釋放鎖。繫結不開啟、複製、關閉或顯式解鎖描述符。

可選作業系統/CPU 平臺包攜帶二進位制。它們的 `~x.y.z` 依賴範圍允許同一次版本內的後續補丁版本。Linux 包含 `bin/landlock-run` 和分別用於兩種 libc 的 `bin/glibc/system.node` / `bin/musl/system.node`；macOS 包含 `bin/system.node`。flock 繫結缺失或無法載入時，鎖取得請求會被拒絕，不在安裝時編譯。Landlock 仍是遵循既有失敗關閉協定的獨立可執行檔案；不支援的核心或平臺探測結果為不可用。

兩個 C 原始檔隨包分發以供審計。參見工作區[架構](../../docs/architecture.md)、[支援矩陣](../../docs/support-matrix.md)和 [CLI 約定](../../docs/cli-contract.md)。
