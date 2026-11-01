# Agent Note: 創造模式 skill 漸進式披露並允許讀原始碼

Status: implemented

[English](2026-09-21-creator-skills-progressive-disclosure.md) | 中文

## Problem

出貨的 `cordis-plugin-development` skill 把三個互斥的配方和一份驗證清單放在一個 8.7 KB 的檔案裡，超過了標準 preset 工具結果修剪器只保留頭尾的 8192 字元閾值。兩個創造模式 skill 都禁止讀取 DSH 包原始碼，使 skill 文字成為唯一知識來源，未覆蓋的情況只能靠猜。skill 還用 `$DSH_HOME/profiles/<profile>` 指代 profile，而 agent 的 shell 從未拿到這個名字。

## Decision

`SKILL.md` 只保留流程、知識來源順序和索引表；配方移入 `references/`，可複製的組合包移入 `templates/`，都透過 `skill` 工具已報告的 skill 基目錄解析。一個測試保證開標頭檔案在修剪器頭部之內，並檢查每個被引用的檔案存在、每個範本可解析。

知識來源有順序而不禁止：先透過 `cordis_inspect_query` 檢查，再讀 `Config.listConfigs` 經 profile 包查詢解析出的 `packageDir` 下的包 README，仍有疑問時讀建置後的 `lib/` 宣告或 checkout 原始碼。自帶包從 dsh 安裝目錄解析，profile 自行安裝的包從 profile 解析，所以 skill 不再從 profile 目錄推導包路徑。啟動器提供 profile 上下文時，shell 註冊表把 `DSH_PROFILE` 與 `DSH_PROFILE_DIR` 作為保留內建變數暴露。

第三個 skill `cordis-composition-reference` 承載 Loader patch 方言和生成的可載入外掛包清單，並在 `doc-sync` 中做新鮮度門禁，讓流程 skill 不再增長。

## Alternatives considered

在系統提示里加創造模式文字每輪都要付費；skill 目錄已能按需路由。把 `docs/` 出貨給 agent 會把維護者材料稀釋進需要安裝態 profile 事實的執行時上下文。保留禁讀原始碼則要求 skill 複述它可能需要的每一條宣告。

## Consequences

首次載入 skill 約 3.9 KB，每個配方再加 1 到 3 KB。載入 `editing-cordis-compositions` 的錄製工作階段在其文字變化時需要重新整理。不帶 profile 啟動的組合沒有這兩個 profile 變數，skill 對此有說明。
