# native/

[English](README.md) | 中文

與 DeepSeek Harness 一同維護的原生原始碼和公開包。[`system/` workspace](system/README.zh.md) 負責 Landlock 啟動器、POSIX flock 繫結、平臺包和[釋出流程](system/docs/release.md)。

## Workspace 與釋出邊界

`system/` 及其包屬於儲存庫根 pnpm workspace，並共用根鎖檔案。開發和 CI 中的 harness 消費方直接使用目前 workspace 的入口包，因此啟動器約定變更與消費方更新可以在同一個改動中落實並一起測試。

主儲存庫的 `Node Addon System` 工作流為每個受支援架建置置並測試。`Node Addon System Release` 彙集這些原生產物，打包並驗證 npm tarball，隨後可選擇以同一個原生包版本釋出。入口包繼續將平臺包宣告為 npm 可選依賴，因此 npm 仍然只會安裝與使用者作業系統和 CPU 匹配的包。
