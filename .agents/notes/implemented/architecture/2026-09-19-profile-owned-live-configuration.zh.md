# Agent Note: 將即時設定儲存在所屬 profile 中

Status: implemented

[English](2026-09-19-profile-owned-live-configuration.md) | 中文

## 問題

獨立的 settings 註冊重複了 schema、預設值、持久化和通知，也讓已存使用者設定高於部署 overlay，卻未保留值來自哪個組合來源。採用 Loader 已解析的 Config，使驗證與消費者共享同一所有者，並保留已有生命週期判定。

## 決定

外掛在 Cordis Config 中宣告全部可設定值。無需重新掛載即可變化的欄位使用 `.volatile()`；消費者在操作時讀取其引用。Settings 只列舉這些欄位並生成表單，不向業務提供設定。profile 編輯器寫入 `cordis.patch.yml`，並透過普通 Loader 協調路徑應用變化。

表單寫入目前 profile。home patch 和命令列 overlay 仍是優先順序更高的部署輸入；如果它們會遮蔽某次修改，編輯器會在持久化前拒絕寫入。兩個外掛實例透過各自不同的 profile entry id 定址。巢狀 Include 保留獨立所有權，不能透過該 profile 表單寫入。

Cordis config patch 替換完整 entry config。編輯會保留普通欄位、未編輯的秘密值和原始設定表示式。欄位重置恢復目前繼承值；整個 entry 重置後會移除其 config override，從而繼承後續 bundle 變化。其他編輯會把該 entry 的完整 config 存入 profile 行：寫入時組合出的普通欄位加上全部 volatile 欄位。此後 bundle 對這些欄位的修改在該 entry 的 config override 被移除之前不會到達該 profile。在已釋出的 bundle 中，修改預設權限預設會釘住 `permission.presets`，選擇預設會釘住 `agent-presets`，編輯並行度會釘住 `agent-loop.agents`，編輯網頁搜尋會釘住 `web-search-deepseek.apiKeyEnv`；使用者端會把這類行的每個 volatile 欄位都標為已覆蓋，而不只是被編輯的那個。要把寫入收窄到被編輯欄位需要 patch `config` 的合併語義，Include 不提供。

被移除的 `$DSH_HOME/settings.yaml` 會在 Settings 啟動後、Loader 完成所有條目載入時一次性匯入目前 profile：section id 即 entry id，其中 `ui-developer-tools` → `ui-settings`、`ui-onboarding` → `ui-settings-general`、`shell` → 目前平臺的 shell 執行器條目。檔案在第一次寫入前改名為 `settings.yaml.imported`，因此匯入不會重複；被拒絕的 section 會記錄日誌並保留在改名後的檔案中。

## 考慮過的替代方案

保留 settings 作為設定介面卡背後的第二份儲存仍需要協調兩份持久化文件，並決定並行修改或重新啟動後哪份優先，因此不採用。刪除的全域 settings 文件曾提供跨 profile 偏好；本設計明確將表單值持久化到各 profile。若重新引入共享偏好，必須採用顯式共享 Cordis 層並明確寫入目標。

## 後果

本決定只替代 [設定來源所有權](2026-08-04-configuration-source-ownership.zh.md) 中的非秘密 settings 層；其中的環境限制和憑證優先順序仍適用。[Volatile 引用](2026-09-18-volatile-config-references.zh.md) 負責引用生命週期和普通更新行為。

真實 profile 測試覆蓋多實例、持久化重新啟動、非法編輯、過期修訂、高優先順序層拒絕、秘密脫敏及設定表示式。瀏覽器測試透過完整應用執行表單寫入和重置，並檢查即時編輯前後的執行時引用身份。
