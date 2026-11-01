# Agent Note: 使用者 patch 測試控制檔案系統事件投遞

Status: implemented

[English](2026-09-09-user-patch-hmr-test-delivery.md) | 中文

## 問題

macOS Sandbox 執行 (run 34238200206, job 102101292119) 在等待首次使用者 patch 新增時超時。本地並行復現表明，沒有檔案系統通知到達 HMR。輪詢變體也會遺漏後續修改，此時 HMR 沒有待執行的重新整理。這些失敗阻止重新整理斷言執行其負責驗證的解析、啟用與復原行為。

## 決策

[使用者 patch 測試](../../../../packages/boot/app-boot/tests/user-patches.spec.ts) 寫入真實 patch 檔案，並透過不持有原生監聽控制代碼的 Chokidar watcher 投遞 add、change 和 unlink 事件。應用啟動監視器註冊、重新整理序列化、Include 重組、外掛啟用、失敗報告與恢復仍使用真實實作；[Loader 策略](../simplification/2026-09-09-nontransactional-loader.zh.md) 不提供外掛復原。即使初始化在進入區域性清理塊前失敗，夾具也會恢復 watcher 工廠並銷燬 Context。

獨立的 [監視器測試](../../../../packages/boot/hmr/tests/watch-config.spec.ts) 負責原生通知投遞，包括 add/change/unlink、初始不存在的父目錄和檔案系統別名。重新整理測試不驗證作業系統的投遞保證。

## 考慮過的替代方案

**每個重新整理斷言都使用原生通知。** 不採用，因為這會讓每次解析器與啟用狀態轉換都重複依賴原生投遞。事件缺失會掩蓋下游究竟哪個行為出現問題。

**輪詢與固定等待。** 不採用，因為兩者都不能確認下一次修改已經投遞。Chokidar 就緒狀態不暴露 Node 非同步初始輪詢基線的完成時刻；本地輪詢復現仍會遺漏修改。延長測試期限無法恢復從未發出的事件。

**Mock HMR 註冊或 Include。** 不採用，因為測試必須保留真實重組、報告啟用失敗，並在解析失敗後保留執行中的設定。

## 影響

重新整理序列保留其語義斷言，並移除固定的 change 節流等待。獨立並行程序驗證隔離性，強制初始化失敗則驗證 watcher 在下一案例前關閉、工廠在下一案例前恢復。原生 watcher 失敗仍在其所屬測試中可見，需要單獨診斷。
