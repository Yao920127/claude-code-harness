# Agent Note: 設定 schema dump 的驗證策略

Status: implemented

[English](2026-09-20-config-schema-dump-validation-policy.md) | 中文

## Problem

`dsh --profile <name> --dump-config-schema` 在不掛載外掛的情況下，把原生 Schemastery Config 宣告投影為 JSON Schema。原生驗證會修改輸入、求值 `!!js` 表示式並執行 transform 回呼；靜態文件無法完整重現這些行為。評審中有三項選擇存在爭議，若不記錄會被反覆重提：投影部分近似時 `complete` 和結束代碼的含義、收集器檢查哪些行，以及投影如何處理無法建模的原生行為。

## Decision

- **部分投影以 1 退出。** 只要存在錯誤診斷、任何 `partial`、`unsupported` 或 `error` 條目，或同一外掛名解析出多個 Config 定義，`x-cordis.complete` 即為 false 且 CLI 以 1 退出，即使 stdout 已包含有效且有用的 schema。結束代碼回答的是該文件能否替代原生驗證，而不是是否產生了輸出。只需要 schema 的呼叫方讀取 stdout 並忽略結束代碼；`x-cordis` 下的診斷會在受影響的每個條目上說明各項限制。
- **發現面向宣告，幷包含停用行。** 收集器遍歷 Loader 將接收的每一行，包括字面量停用或表示式停用的行，並匯入它們的模組。因此停用行的匯入或 include 失敗會使可啟動的 profile 被標為不完整。唯一的例外遵循 Loader：未設定 `group: true` 的停用 group 或 include 從不建立其子項，所以缺失的承載 config 記錄為沒有子項的樹，entry schema 也不驗證其子宣告。
- **放寬而不是模擬原生修改。** 當原生解析可能在後續驗證讀取前改變輸入（容器寫回適應值、字典鍵改名、loose 退回、lazy 中繼資料傳播到共享節點）時，投影保留可獲得的宣告細節，同時並列一個不受限制的備選項，並記錄一條限制。它絕不模擬該修改。放寬的範圍限定於該機制：只有容器會寫回適應值，因此作為前序 union 分支的裸原始型別 transform 保留 `anyOf`。

[CLI 參考](../../../../apps/cli/reference/README.zh.md#config-schema-dump)記錄了由此產生的行為；[app-boot](../../../../packages/boot/app-boot/README.zh.md) 負責收集器 API。

## Alternatives considered

**輸出有效文件並僅給出警告，以 0 退出。** 被否決：把 schema 交給編輯器或 agent 的消費者會把近似文件當作權威。非零退出迫使呼叫方顯式決定。

**發現時跳過停用行。** 被否決：停用行是使用者很可能重新啟用的宣告，其 schema、id 目標和匯入失敗正是編輯 agent 所需。跳過還會導致 `configRef` 目標隨 `disabled` 切換而變化。

**為祖先被停用的子項提供放寬的子列表變體。** 暫被否決：它需要一套去掉必填約束的並行 `entryList` 和 `entry` 規則。停用的 `group: true` 行之下的子項以及插入到停用 group 的 patch 按啟用狀態驗證，參考文件已如此說明。

**在投影中模擬原生修改。** 被否決：transform 回呼是 dump 不得執行的外掛程式碼，而重現寫回順序會把投影器與 Schemastery 內部實作耦合。帶限制說明的放寬維護成本更低，也不會拒絕原生驗證接受的輸入。

## Consequences

使用不受支援承載外掛的已釋出 profile 會報告 `complete: false` 並以 1 退出，同時仍輸出可用的 schema，因此消費者必須讀取 `x-cordis.diagnostics` 來區分近似文件與不可用文件。每次放寬都配有一條限制診斷，生成的 schema 能驗證每個已釋出 profile 的 `--dump-config` 輸出。
