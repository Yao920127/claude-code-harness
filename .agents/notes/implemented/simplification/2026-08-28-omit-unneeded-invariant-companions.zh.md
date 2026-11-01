# Agent Note: 沒有獨立觀察時省略不變數伴生入口

Status: implemented

[English](2026-08-28-omit-unneeded-invariant-companions.md) | 中文

## 問題

包不變數規則曾要求每個工作區包都發布 `./invariant`，包括沒有執行時關係可檢查的包。目前工作區有 209 個帶說明的空伴生入口，每個入口都帶來原始檔、公共匯出、釋出項、僅供不變數使用的依賴或 TypeScript 引用、建置接線與註冊測試。這套機制只表達否定結論，沒有增加執行時斷言。

`dsh-host-webserver` 伴生入口以可執行形式暴露了同一問題。它會在外掛生命週期事件上註冊並釋放合成保留路由，再次呼叫同一組服務操作來檢測殘留。該探針沒有獨立產生的觀察：它透過自己要驗證的實作修改並檢查同一張路由表，而真實路由與 HMR 測試已經覆蓋重複拒絕和 disposer 對稱性。

## 決策

### 獨立觀察是釋出條件

只有當包能夠比較可能獨立產生分歧的觀察時，才釋出 `./invariant`。符合條件的關係包括跨事件生命週期、順序、身份或配對協定；事件與權威可變狀態的對照；多個生產方或 adapter 組裝的輸出；以及由另一個操作後續摺疊或消費的持久資料。

服務或方法是否存在、外掛 metadata 或 effect、固定純函式範例，以及呼叫同一變更操作來驗證該操作的探針，仍屬於型別、載入、單元或整合測試。parser 與 config 輸入、模型或工具 JSON、持久檔案、worker 與程序訊息和 wire 輸入，仍在擁有其輸入的操作處驗證。

`dsh-time-context` 伴生入口繼續釋出。它把外掛產生的 context message 與獨立擁有的目前輪使用者訊息 source 和持久事件時間進行對照，因此即使 formatter 本身正確，attribution、輪次位置與 elapsed-time 關係仍可能產生分歧。

### 在包 README 中明確省略

沒有符合條件的關係時，包會省略 `src/invariant.ts`、`./invariant` 匯出、`lib/invariant.js` 釋出、僅供不變數使用的依賴與 TypeScript 引用、建置入口和伴生入口專用測試。中英文包 README 會說明不釋出伴生入口，並記錄該包的具體原因。儲存庫會拒絕空 installer，因為不存在原始檔加 README 說明可以直接表達該決策。

`verify-package-invariants` 會掃描每個包。它要求英文 README 記錄包級省略原因，拒絕不完整的匯出、釋出或伴生入口建置接線，拒絕空 installer，並對每個已釋出伴生入口執行註冊、Loader namespace、reporter 使用、依賴、引用與建置檢查。Vitest Host 只在目前包存在伴生入口時掛載它，拓撲與建置產物檢查則列舉已釋出集合。

### 審計結果

全儲存庫審計刪除了 209 個帶說明的空伴生入口和合成的 `dsh-host-webserver` 伴生入口，留下 39 項比較獨立觀察的檢查。保留項包括 session、command、approval、workflow 與 hook 生命週期等跨事件協定；settings、storage-domain、Workspace、client modules 與 slots 等事件到狀態檢查；system prompt 與 time context 等多生產方組裝檢查；以及 todo、plan mode 與 sandbox mode 等由 projection 或 policy state 消費的持久資料。

被省略關係繼續由現有包行為測試負責，包括 webserver 路由註冊與 HMR 釋放。產品行為與包根入口不變；被省略的 `./invariant` 子路徑按照儲存庫的預釋出相容策略移除。

## 考慮過的替代方案

- **保留帶說明的空伴生入口。** 不採用：原始檔、公共子路徑、依賴邊、建置輸出和測試是一套過於繁重的機制，不應只用來表達不存在檢查；包 README 可以直接記錄該結論。
- **把 webserver 探針保留為清理 sentinel。** 不採用：它會在無關生命週期事件上修改保留路由，並且只驗證自己呼叫的服務方法。真實路由與 HMR 測試可以在沒有生產診斷 effect 的情況下覆蓋該行為。
- **把每個生產方格式 parser 都視為自驗證。** 不採用：即使文字只有一個生產方，parser 仍可能對照獨立 source identity、時間或持久歷史。`dsh-time-context` 符合條件，因為其訊息會與目前輪使用者訊息和持久事件時間對照；只對同一寫入方的 payload 做往返檢查不符合條件。
- **要求每個擁有私有可變狀態的包都發布伴生入口。** 不採用：沒有獨立事件或第二資料來源的私有狀態只能透過重複實作來檢查，或者需要專門為診斷暴露新 API。

## 後果

- 擁有有意義檢查的包保留可獨立載入、過濾並歸屬到包的伴生入口。
- 沒有檢查的包不再承擔不變數原始檔、公共子路徑、建置產物或僅供不變數使用的依賴，其 README 會保留原因。
- 新增可變關係或被消費的事件協定時，必須重新審視省略結論、更新 README，並新增帶負向測試的聚焦伴生入口。
- 不變數服務的設定、歸屬唯一性、子 fiber 生命週期、過濾、復原、dispose 與 HMR 約定保持不變。
- 早期的[有意義執行時約定決策](../architecture/2026-07-19-package-invariant-runtime-contracts.zh.md)仍是語義檢查品質的權威依據；本決策取代其中的窮盡釋出與帶說明空入口形式。
