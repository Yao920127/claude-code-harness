# Agent Note: 宣告式 Agent preset 與保留代際

Status: implemented

[English](2026-09-18-declarative-agent-presets.md) | 中文

## Problem

Preset 目錄重複承擔 Cordis 設定的所有權。獨立的發現、中繼資料、複製和編輯 API 無法透過普通 profile 補丁表達相同組裝。儲存時釋放定義，也必須保留執行中 Agent 仍在使用的外掛。

## Decision

`dsh-agent-preset-registry` 負責選擇與執行時代際；`dsh-agent-preset` 在普通 Cordis YAML 中宣告標識、顯示中繼資料和子外掛列表。定義提前啟用。啟用失敗保留在列表中，並拒絕新繫結，但不阻止應用啟動。

註冊表擁有各代際的 scope 與 Loader 樹。Agent 將自身 scope 連結到選定代際，子 Agent 繼承父方的確切代際。更新使舊代際退役；Agent 和臨時歷史讀取者保留引用，直至釋放。最後一個引用釋放後，退役樹被銷燬。Host 註冊表和 Agent loop 保持共享；preset 的服務提供者與消費者需要處於隔離 realm 中。

Web 編輯器與 `agent_preset` 工具只接受子外掛 YAML。儲存寫入目前 profile 的使用者補丁，保留顯示中繼資料和無關設定。版本檢查和 profile 鎖防止覆蓋並行儲存；驗證拒絕會使編輯失效的更高優先順序覆蓋。持久化與啟用結果分別報告。設定在 Host 中執行，因此工具寫入需要批准或完全存取權限。

工作階段資料繼續記錄 preset 標識。重新啟動時根據目前設定解析該標識，定義缺失則拒絕恢復。舊的可執行代際僅保留在程序內，不會序列化。儲存的使用者預設值與空白工作階段選擇保持不變：未指定 preset 的新工作階段解析 `selectedDefault`，用戶端的開發者工具偏好只決定是否展示這項選擇。

## Alternatives considered

**同時保留目錄 preset 與宣告。** 兩個可寫來源會爭用標識，需要額外的優先順序、遷移和編輯規則。普通 profile 設定已提供所需持久化和分層，因此 preset 不再有獨立路徑。

**讓宣告外掛擁有執行中的子樹。** 編輯時 Loader 釋放外掛會撤銷執行中 Agent 的工具。註冊表所有權使保留代際具有獨立於宣告的明確生命週期。

**首次選擇時才載入。** 延遲啟用推遲診斷，並增加首次使用的等待狀態。提前啟用適用於這些組裝，且可在選擇前暴露失敗。

**Preset 損壞就拒絕應用啟動。** 可選能力集失敗後應仍能在 Web 中修復。健康定義和 Host 服務保持可用。

## Consequences

同一程序可以執行能力不同的 Agent，同時共享各選定代際。退役代際在仍有引用時佔用記憶體。Preset 不提供安全沙箱，使用者覆蓋會替換整個子外掛列表，不會合並後續內建變更。

原有目錄與逐工作階段掛載決策保留為[歷史背景](../../archived/architecture/2026-08-03-per-session-agent-presets.md)。Host 服務所有權繼續由 [Host 平面說明](2026-08-10-host-plane-ownership-after-presets.zh.md)記錄。

## Testing

註冊表測試覆蓋父子 scope 保留、歷史讀取租約、選擇日誌及啟用失敗。編輯器測試使用真實 profile 補丁，檢查衝突拒絕並保留巢狀表示式。隨附 Web 組裝測試透過建置產物驗證啟用、作用域工具、Creator 技能和 profile 編輯。
