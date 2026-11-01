---
description: "DeepSeek Harness 包工作區：packages/ 下的 npm 包如何分組、每個組負責什麼，以及約束它們的約定。"
kind: "package-group"
---

# 包

[English](README.md) | 中文

## 概述

harness 由 `packages/` 下的 npm 包組裝而成，按能力系列分組：工作階段與 agent loop（智慧代理迴圈）、面向模型的工具、shell 與檔案系統執行、Web 存取、subagent 等等。把本頁當作頂層地圖使用：先找到擁有某能力的組，再開啟其 README 檢視包列表。每個包都以 `@deepseek-ai/dsh-*` 為作用域、只屬於一個組；每個組的 README 都是該能力系列的權威包對映。

## 目錄

- [包分組](#package-groups)
- [釋出預期](#release-expectations)
- [依賴](#dependencies)
- [包 README 約定](#package-readme-contracts)
- [開發備註](#dev-note)

-----

<a id="package-groups"></a>
## 包分組

每個包只屬於一個組；新包加入現有組，新組則更新其自身 README 與本表。

| 組 | 職責 |
|---|---|
| [`core/`](core/README.zh.md) | 產品 API 主幹：工作階段、提示詞、工具、agent 服務與具體迴圈 |
| [`api/`](api/README.zh.md) | Remote BFF 裝配與 Typert RPC 閘道 |
| [`typert/`](typert/README.zh.md) | 型別圖生成、產物載入與執行時註冊表 |
| [`goal/`](goal/README.zh.md) | 同工作階段 goal 的持久化與生命週期 |
| [`schedule/`](schedule/README.zh.md) | Host 擁有的定時後續操作 |
| [`feedback/`](feedback/README.zh.md) | 人類回饋的採集與命令 |
| [`identity/`](identity/README.zh.md) | 共享匿名身份 |
| [`llm/`](llm/README.zh.md) | LLM（大語言模型）能力系列：抽象服務 + 提供者介面卡 |
| [`subprocess/`](subprocess/README.zh.md) | 子程序能力系列：Service Definition + 本地程序樹提供者 |
| [`ssh/`](ssh/README.zh.md) | POSIX 遠端連線及配套檔案系統、子程序與沙箱提供者 |
| [`shell/`](shell/README.zh.md) | Bash 能力系列：執行器 seam、本地實作、面向模型的工具 |
| [`terminal/`](terminal/README.zh.md) | 持久 PTY 能力系列：限定所有者範圍的工作階段、本地實作、面向模型的工具 |
| [`ptc-runtime/`](ptc-runtime/README.zh.md) | PTC 執行能力族：Service Definition + 沙箱 Node 提供者 + PTC mode Consumer |
| [`computer-use/`](computer-use/README.zh.md) | 按名稱獨佔註冊桌面提供者 |
| [`browser-use/`](browser-use/README.zh.md) | 按名稱獨佔註冊瀏覽器提供者 |
| [`sandbox/`](sandbox/README.zh.md) | 程序限制 seam；bwrap、Landlock、Seatbelt 後端 |
| [`deliverables/`](deliverables/README.zh.md) | 輪次交付物：顯式檔案交付與記錄的工作區改動 |
| [`fs/`](fs/README.zh.md) | 檔案系統能力系列：seam、本地實作、面向模型的檔案工具、發現工具 |
| [`lsp/`](lsp/README.zh.md) | LSP 能力系列：seam、通用 stdio 提供者和 `lsp` 工具 |
| [`skill/`](skill/README.zh.md) | skill（技能）能力系列：提供者註冊表、本地提供者、面向模型的目錄／loader |
| [`compaction/`](compaction/README.zh.md) | 壓縮（compaction）能力系列：Service Definition + 基礎提供者 + 命令 Consumer |
| [`context/`](context/README.zh.md) | 模型可見請求上下文：workspace 指令、時間上下文、引用 |
| [`subagent/`](subagent/README.zh.md) | subagent 能力系列：提供者註冊表約定和麵向模型的委託工具 |
| [`jobs/`](jobs/README.zh.md) | 通用後臺任務執行時和麵向模型的作業控制工具 |
| [`experimental/`](experimental/README.zh.md) | 預穩定原型，包含顯式私有例外 |
| [`workflow/`](workflow/README.zh.md) | 工作流 seam、PTC 程序引擎、面向模型的 `workflow`／`ralph` 工具 |
| [`webhook/`](webhook/README.zh.md) | 已驗證外部事件、受信規則與即發即棄 Workspace 工作階段 |
| [`web/`](web/README.zh.md) | Web 能力系列：seam、搜尋／取得提供者、面向模型的 Web 工具 |
| [`document/`](document/README.zh.md) | 共享主機 Office 到 PDF 轉換 |
| [`attachment/`](attachment/README.zh.md) | 持久附件標識、驗證、本地內容定址儲存 |
| [`spill/`](spill/README.zh.md) | spill 能力系列：儲存 seam、本地實作、工具結果 spill 策略 |
| [`todo/`](todo/README.zh.md) | 面向模型的 `todo_write` 工具 |
| [`plan/`](plan/README.zh.md) | Plan 協作狀態，提供直接進入命令與經評審的退出 |
| [`preset/`](preset/README.zh.md) | 由 preset `cordis.yml` 按工作階段組裝 agent |
| [`guard/`](guard/README.zh.md) | 迴圈衛生守衛：建議性重複呼叫提醒 + `tools/execute` 截止時間強制執行器 |
| [`bundle/`](bundle/README.zh.md) | 可安裝的 `dsh --profile` 補丁層 |
| [`extensions/`](extensions/README.zh.md) | agent 執行時自修改：即時外掛／服務檢查與模型所寫掛載／解除安裝 |
| [`mcp/`](mcp/README.zh.md) | 將外部 Model Context Protocol 伺服器的工具接入為原生工具 |
| [`hooks/`](hooks/README.zh.md) | 掛鉤橋接 + 共享的 Claude Code／Codex 線協定庫 |
| [`session/`](session/README.zh.md) | 持久工作階段資料平面：持久化 seam + 後端、投影 seam、基於日誌的標題、工作階段上報 |
| [`session-query/`](session-query/README.zh.md) | 工作階段檢索系列：邏輯語料庫、有界讀取、血緣、語義過濾、SQLite 全文搜尋 |
| [`settings/`](settings/README.zh.md) | 使用者設定 seam + 基於檔案的提供者 |
| [`credentials/`](credentials/README.zh.md) | 憑證引用與憑證記錄 seam + 環境變數優先於 `.env` 的提供者 + 需要向人詢問的授權流程 |
| [`storage/`](storage/README.zh.md) | 非工作階段儲存中樞 + 後端 + 領域形式 |
| [`workspace/`](workspace/README.zh.md) | Workspace 實體 |
| [`sdk/`](sdk/README.zh.md) | 程序外 SDK：JSON-RPC 協定與 TypeScript 用戶端／伺服器 |
| [`acp/`](acp/README.zh.md) | 僅面向自動化的 ACP（Agent Client Protocol）伺服器 |
| [`interaction/`](interaction/README.zh.md) | 人機協作平面：批准／互動 seam、權限預設、命令、詢問使用者的工具 |
| [`boot/`](boot/README.zh.md) | 共享的 app bin 啟動粘合層 |
| [`host/`](host/README.zh.md) | Web GUI 主機服務、目錄選擇、應用啟動、外掛清單和產品遙測 |
| [`client/`](client/README.zh.md) | web GUI 瀏覽器半側：shell、協定層、物件服務、slot、`ui-*` 外掛 |
| [`test-support/`](test-support/README.zh.md) | 測試基礎設施（testkit、回放、Loader 冒煙測試） |
| [`runtime-diagnostics/`](runtime-diagnostics/README.zh.md) | 執行時診斷：按包歸屬的執行時不變式檢查與報告 |
| [`util/`](util/README.zh.md) | 組間共享的低層零依賴工具（`Branded<B>`、home／路徑輔助函式、超時、留存） |

-----

<a id="release-expectations"></a>
## 釋出預期

大多陣列屬於產品組，提供穩定 API。例外：`experimental/` 釋出時不提供穩定性或支援承諾，`test-support/`、`runtime-diagnostics/` 與 `util/` 是相容性預期較低的支援組。

-----

<a id="dependencies"></a>
## 依賴

依賴圖由工具生成：[docs/module-graph.md](../docs/module-graph.zh.md)（`pnpm run gen-module-graph`，CI 中有新鮮度門禁）。

**擴充功能外掛依賴 Service Definition，絕不依賴具體提供者。** `dsh-agent-loop` 可替換；UI、掛鉤和工具外掛使用 `dsh-agent`。組合包可以依賴主幹外掛。能力在需要獨立演進時分離 Service Definition／Service Provider／Consumer 角色；詳見[能力 seam](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)。

-----

<a id="package-readme-contracts"></a>
## 包 README 約定

每個包 README 都覆蓋用途、設定、擴充功能點與[模型體驗](../docs/cookbook/adding-a-package.zh.md#4-write-the-package-readme)，列入模型無關[省略允許清單](../scripts/verify-package-readme-model-experience.ts)的包除外。它還要包含 `## Known Limitations and Deferred Work`，或列入其[允許清單](../scripts/verify-package-readme-limitations.ts)。包約定——匯出、服務存取、不變式、測試——見 [packages/AGENTS.md](AGENTS.md)。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
