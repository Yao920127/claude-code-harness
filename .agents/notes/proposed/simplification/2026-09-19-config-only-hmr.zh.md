# Agent Note: 將 DSH HMR 限定為即時 profile 設定更新

Status: proposed

[English](2026-09-19-config-only-hmr.md) | 中文

## 問題

[DSH HMR](../../../../packages/boot/hmr/src/index.ts) 同時擁有序列 profile 設定重新整理和執行中的 JavaScript 模組替換。模組替換增加了 Node loader 內部介面、依賴遍歷、快取備份、新舊外掛 fiber、復原、模組監聽與匯入錯誤格式化。[基礎組合](../../../../packages/bundle/base/cordis.patch.yml) 使用 `root: []`；其他隨產品釋出的 profile 停用或省略 HMR（熱模組替換）。預設產品需要設定重新整理，而原始碼替換服務於自定義 profile 的顯式啟用。

該選項是真實受支援的行為：[profile 測試](../../../../apps/cli/tests/profile-hmr.spec.ts)、模組測試和[建置後 CLI 測試](../../../../apps/cli/tests/built-bin.e2e.ts) 都覆蓋它，生成的檢查 API 也展示其方法和事件。本提案以開發連續性換取更小的維護子系統，並不將程式碼判定為不可達。

## 提案

保留 `watchConfig`、`runExclusive`、精確的 profile/home 補丁與 manifest（中繼資料清單）監聽、應用就緒協調、序列重新整理和釋放排空。原始碼模組、任意 Include 和框架依賴的修改要求重新啟動程序；刪除框架變化時對 `loader.exit()` 的自動呼叫。瀏覽器 Client 載入保持獨立。

刪除模組監聽與分發、依賴圖分析、模組快取/fiber 替換與恢復、僅供模組使用的狀態/選項、`baseDir`、`getOuterStack`、`getLinked` 及 `hmr/change`/`hmr/reload`。刪除[匯入錯誤格式化器](../../../../packages/boot/hmr/src/error.ts)、僅供模組使用的依賴和模組/錯誤專用測試。保留 Chokidar 及[精確監聽](../../../../packages/boot/hmr/src/watch-config.ts) 實際使用的設定監聽選項。已定位約 400 行原始碼和 372 行專用測試屬於可刪除模組路徑；實作時必須單獨計算保留的設定程式碼和混合測試。

僅修改[profile 管理決策](../../implemented/architecture/2026-09-14-current-profile-plugin-management.zh.md) 與[單一啟動器決策](../../implemented/architecture/2026-08-22-single-dsh-application-launcher.zh.md) 中承諾模組替換及其協調的部分。其設定、安裝與啟動器職責保留。[非事務式 Loader 決策](../../implemented/simplification/2026-09-09-nontransactional-loader.zh.md) 為避免重複復原提供理由，但尚未授權撤回原始碼 HMR。

## 考慮過的替代方案

**保留可選原始碼替換。** 外掛作者可以在不重新啟動活動 Session 的情況下編輯程式碼，失敗替換會恢復舊外掛。這項能力有價值；本提案有意放棄它，以移除 DSH 對 loader 版本的耦合及替換狀態所有權。

**僅刪除復原或將替換委託到別處。** 部分刪除可能讓快取模組和活動 fiber 屬於不同代。包裝另一個 HMR 實作仍保留公共行為及協調負擔。這兩種方式都不能實作此處提出的完整刪除。

## 驗收標準

- 即時 profile/home 補丁與組合包列表變化、Plugin Manager 序列化、就緒、自身移除、釋放排空及後續有效編輯後的恢復仍有覆蓋。
- 原始碼和任意 Include 修改在重新啟動後生效。刪除的原始碼選項給出明確遷移/設定錯誤；更新隨產品釋出的 `root: []` 項，不靜默忽略過時選項。
- 刪除僅供模組使用的 API、事件、依賴、生成宣告與測試。保留剩餘公共佇列/監聽 API，以及包安裝/重新啟動語義。
- 執行聚焦的 HMR 設定/監聽/協調及 Plugin Manager 測試、app-boot 過載覆蓋與真實建置後 CLI（命令列介面）profile 重新整理情境。將原始碼替換預期改為已同意的重新啟動行為，並更新所需的組裝快照與文件。

## 風險

自定義 profile 和已安裝外掛會失去即時伺服器端程式碼替換及其失敗恢復。重新啟動可能中斷長時間開發工作，因此接受該提案需要同意此產品取捨。刪除共享設定協調，或在另一個包重建原始碼替換，都會違背提案目的。
