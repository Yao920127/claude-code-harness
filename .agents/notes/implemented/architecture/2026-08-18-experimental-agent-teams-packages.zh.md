# Agent Note: 以實驗性包名釋出 Agent Teams

Status: implemented

[English](2026-08-18-experimental-agent-teams-packages.md) | 中文

## 問題

Agent Teams 的服務與工具約定仍在變化，但它需要使用真實 Session 日誌、subagent 生命週期、工具、範例、快照和儲存庫檢查。使用者還需要直接從 npm 安裝完整 Team 組合，而無需建置原始碼 checkout。

把這些包移入產品職責組會移除實驗性名稱，並暗示穩定包 owner 已經就位。釋出 `packages/experimental/` 下的所有包又會暴露無關的內部原型。釋出策略必須讓使用者安裝 Agent Teams，同時讓內部專用原型保持私有。

## 決策

`packages/experimental/agent-team`、`packages/experimental/tool-agent-team`、`packages/experimental/agent-team-profile` 與 `packages/experimental/client-ui-agent-team` 是公開 workspace 包。它們保留現有 `@deepseek-ai/dsh-experimental-*` 名稱並加入 dsh 釋出系列。[釋出拒絕列表決策](../process/2026-09-12-experimental-publication-denylist.zh.md)負責預設公開與私有例外；[實驗性包規則](../../../../packages/experimental/AGENTS.md)負責依賴隔離與後續 promotion。

dsh 打包與釋出集合以及本地基線釋出器包含這四個 Agent Teams 目錄和 [Cua Driver 提供者](2026-09-12-computer-use-provider-registration.zh.md)。workspace 約束要求它們省略 `private`、將 `publishConfig.access` 設為 `public`，並保留實驗性 npm 字首。實驗組之外的釋出包、應用和 Python 執行時不能在 `dependencies`、`optionalDependencies` 或 `peerDependencies` 中引用實驗包；實驗包可以依賴釋出包和彼此。

通用的呼叫方預留 continuable child 身份和精確 direct-child drain 仍屬於穩定 Subagent 服務。它們負責 Subagent 身份與 Activation 生命週期，不 import 或命名 Agent Teams；實驗性 Team 服務沿允許的方向消費這些能力。

[單組合包決策](2026-09-18-agent-teams-single-bundle.zh.md)取代了獨立 Host 與 Web 組合包的組合方式。本記錄保留髮布、依賴隔離與 promotion 的理由。目前 Team profile 仍須顯式啟用，並停用模型可見名稱與 Team 工具重疊的全域 continuable-child control；[可選組合包決策](../process/2026-09-15-shipped-optional-bundles.zh.md)負責其隨安裝交付的規則。

profile 啟動會先解析所選 bundle，再計算[不可變 runtime resolution](2026-09-09-profile-resolution-generations.zh.md)。runtime resolution 保留安裝優先順序，按 profile 順序完整遍歷每個顯式 bundle 根，並讓 pnpm 管理的 profile 包保持優先。執行時攔截在記憶體中強制該結果，不物化 fallback 連結。因此，私有 profile 層可以攜帶實驗性 plugin 設定行，而無需把這些 plugin 加入釋出 app、要求 profile 使用者直接安裝傳遞依賴、破壞 packaged-runtime 的模組身份，或改變其他 profile 的解析結果。

對這四個包而言，實驗性狀態改變相容性與支援預期，而不阻止釋出。這些包仍須滿足儲存庫的一般文件、不變式、生命週期、安全、單元測試、真實組合測試和快照要求。promotion 前仍須評審公開約定、限制、測試證據、執行時依賴方，並由一名具名 owner 接受穩定包義務。

## 曾考慮的替代方案

**把 Agent Teams 移入產品職責組。** 這會移除要求保留的實驗性 npm 名稱，並在約定穩定前暗示已有穩定包 owner。

**讓 Agent Teams 保持私有且僅供原始碼 checkout 使用。** 這會保留最簡單的實驗性策略，但使用者無法從 npm 安裝完整 opt-in 組合。

**釋出所有實驗性包。** 其他原型仍只供內部使用，也沒有接受公開包約定。

**把 Subagent 前置能力移入 experimental 目錄。** child 身份分配與 Activation teardown 屬於 Subagent owner，且不包含 Team 專用約定。移動或複製這些能力會反轉依賴方向，或把同一個生命週期拆到多個包中。

## 後果

Agent Teams 會作為 dsh 釋出系列中的四個可安裝 tarball 釋出，同時保持包名不變，也不會在隨附 profile 中啟用 Team。公開可用不代表這些包穩定或預設受支援，穩定釋出包也不能對其建立執行時依賴。

釋出系列保留實驗性 npm 名稱。promotion 仍會按照實驗性包規則產生路徑和 npm 名改動。
