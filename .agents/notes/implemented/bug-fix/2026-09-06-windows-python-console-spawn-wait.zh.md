# Agent Note: 等待 Windows Python 控制檯執行時

Status: implemented

[English](2026-09-06-windows-python-console-spawn-wait.md) | 中文

## 問題

Python 安裝的 `dsh.exe` 控制檯命令會在初始化 profile 前間歇性地以 Windows 存取衝突 `0xc0000005` 退出。其冒煙斷言遺漏程序狀態，只報告空標準流。原生 faulthandler 探測 (run 34030851888) 將故障定位在執行時控制檯入口呼叫的 Python 3.10 `os._execvpe`，而非打包的 Node 可執行檔案。直接啟動可執行檔案的對照透過。

## 決策

[Python 控制檯入口](../../../../python/sdk-runtime/src/deepseek_harness_runtime/__init__.py) 在 Windows 上使用 `subprocess.run`，繼承標準流與環境，等待執行時結束，再以執行時狀態退出。POSIX 保留 `os.execvpe` 程序替換。Windows CRT exec 並非 POSIX 程序替換；顯式啟動並等待的路徑避開觀測到的原生 exec 操作。

[安裝後 wheel 冒煙測試](../../../../scripts/smoke-python-runtime.py) 在 profile 安裝失敗時，同時報告十進位制、無符號 32 位十六進位制狀態與捕捉的標準流。這保留普通命令失敗和原生程序異常的區別。

## 已考慮的替代方案

**停用 Node 編譯快取。** 未採用：早期探測中快取環境變化與結果相關，但冷快取對照也能透過，且 Python faulthandler 將實際故障定位在原生 exec 呼叫。快取設定保持不變。

**重試或繞過已安裝的控制檯命令。** 拒絕，因為二者都會掩蓋已釋出命令的失敗，而不是修復程序啟動。keyless 安裝後 wheel 斷言仍為必需檢查。

## 後果

Windows 保留 Python 父程序直到執行時退出，不再依賴 CRT overlay 行為。標準同步子程序實作負責等待和中斷清理。不新增自定義程序樹管理器或全域主機設定。

[執行時解析測試](../../../../python/sdk/tests/test_runtime_resolution.py) 保留 POSIX 轉發驗證，並覆蓋 Windows 參數／環境轉發、狀態 0/37/513、真實子程序完成、Unicode 標準流和帶空格的參數。寬退出狀態由原生 Windows 驗證，因為 POSIX 會將程序狀態截斷為八位。原生固定次數對照 (run 34031142773) 中，啟用編譯快取的四次修復後啟動全部透過；該批次四次未修復對照也全部透過，因此它不是同批次復現。完整安裝後 wheel CI 必須獨立於本地分支級測試，驗證最終產物。
