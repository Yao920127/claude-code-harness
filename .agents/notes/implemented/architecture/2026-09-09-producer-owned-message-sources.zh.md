# Agent Note: V4 邊緣上的生產者歸屬訊息源

Status: implemented

[English](2026-09-09-producer-owned-message-sources.md) | 中文

## Problem

已釋出 V3 的外掛歸屬使用共享包裝 `{ kind: 'plugin', plugin: '<producer>' }` 外加生產者的上下文形態欄位，消費方因此必須特殊對待一個合成 kind，而不是直接按生產者身份切換。工具結果成為一等 tool-role 訊息、目前世代進入 V4 之後，格式層還必須繼續讀取仍帶包裝的已釋出 V3 檔案。

## Decision

訊息源由生產者擁有：`kind` 標識生產者，各方透過 `MessageSourceMap` 提供宣告。V3-to-V4 遷移使用固定生產者表：`@deepseek-ai/dsh-system-prompt` 在 system-role 訊息上變成 `system-prompt`，否則變成 `runtime-context`；`compact` 變成 `compact-checkpoint`；`tools-code-mode` 與 `tools-ptc` 變成 `ptc-mode`；`dsh-compaction-basic` 變成 `compact-basic`；已知同名生產者保留 kind。未知外掛名在完整原名之前新增 `plugin:`，直接 source kind 則保留原名。該字首將名為 `user` 的外掛與人類使用者 kind 區分開；本邊保持直接歸屬不變。原上下文形態欄位及其他自有 JSON 中繼資料保留；只有舊包裝的身份欄位執行指定轉換。重新命名查詢使用自有鍵，因此 `__proto__` 和 `constructor` 仍是資料。

原生 V4 訊息源准入在每個宣告的持久化訊息槽位拒絕退役的 `kind: 'plugin'` 包裝，包括 inbox 和標題請求訊息。可恢復掃描丟棄字尾之前就會執行此拒絕。完整訊息源槽位驗證在格式目錄和原生 JSONL 掃描器共用的已知事件驗證中執行，先於兩者公開恢復產物或控制代碼。即使生產者未安裝，未知的非空歸屬 kind 及額外 JSON 欄位仍原樣保留。原生壓縮和標題關係驗證直接使用生產者 kind；[強制驗證決策](2026-09-17-native-v4-read-validation.zh.md)負責通用生命週期規則。

來源重寫由 V3 到 V4 遷移 Stage 負責，在歷史事件轉換為 V4 事件時只執行一次。目前 V4 編解碼器只保留已釋出的物理分幀和原生 V4 准入；它不會讓 V4 行進入已釋出 V3 驗證器，編碼、解碼、恢復和行准入路徑也沒有來源轉換檢視。

錄製的目前 V4 fixtures 與 writer、notification、stream-json 側車是生產者歸屬的；已釋出的 V2/V3fixtures 與側車保留 plugin 歸屬，讀取時經遷移轉換。[released session-format migrations](2026-08-31-released-session-format-migrations.zh.md)筆記擁有本邊所遵循的版本規則。

[訊息源歸屬策略](2026-09-17-persistence-attribution-policy.zh.md)區分持久化 source 宣告與僅用於請求的 user 輸入，並記錄新增歸屬 kind 的受限相容性承諾。即使沒有活動生產者宣告，凍結遷移規則仍保留歷史生產者 kind。

## Alternatives considered

**保留 released plugin 包裝作為目前形態。** 消費方將繼續特殊對待一個合成 kind，生產者身份仍是無型別字串；目前語義驗證器也會保留第二套非釋出的訊息源詞彙。

**只在掃描時重寫 released 行而不是遷移它們。** 掃描准入刻意只查形態並拒絕、從不修復；掃描時重寫會模糊 released 世代與目前行的界限，使目前產物保留與版本不符的來源身份。

**在 scanner 中把 plugin-kind 行當作普通損壞拒絕。** 這會讓過期的 released 行靜默截斷目前 Session，而不是給出拒絕；也會把完整解碼仍需要診斷的行錯誤分類。

## Consequences

本遷移的記錄語料庫應用凍結重新命名錶，而目前代驗證器直接消費生產者自有 kind。Web 上下文標籤渲染生產者 kind（`runtime-context`）而不是 released plugin 字串。共享重寫器將畸形歷史來源報告為 `SessionFormatError`，因此遷移會拒絕它，而不會靜默丟失載荷。
