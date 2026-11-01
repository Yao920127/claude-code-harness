# Agent Note: Volatile 設定引用

Status: implemented

[English](2026-09-18-volatile-config-references.md) | 中文

## Problem

為了改變一個值而替換整個外掛，也會銷燬外掛的服務和副作用。獨立的 settings 訂閱要求每個消費者額外實作一套動態設定來源。

## Decision

Schemastery 使用 `.volatile()` 宣告動態欄位，保留節點型別和表單中繼資料，解析結果是具有不可變快照的穩定引用。共享協定位於 Cosmokit。通用比較將兩個 volatile 引用視為相等。Loader 根據 schema 宣告的 volatile 路徑計算原始設定差異，並保留原始設定供後續啟用使用。原始 diff 未報告普通欄位變化但原始設定有差異時，Loader 經 fiber 的 `internal/config` 掛鉤解析並驗證候選設定，比較普通欄位的有效值，在這些值仍匹配時提交引用並通知所屬實例；所有更新路徑，包括 profile 過載、HMR 的 Include 重新整理和直接呼叫 `entry.update()`，都經 `Entry.update` 到達這一步。Fiber 不承擔這項更新策略，檔案監視由 HMR 提供。

僅 volatile 變化保留實例。普通欄位變化沿用現有重新掛載生命週期，不更新舊引用。實例區域性的 `loader/volatile-update` 事件在完整候選設定透過驗證且所有引用提交後報告路徑。事件使用普通 `emit`；監聽器完成不是設定提交條件。可以儲存引用，而值只能在單次操作中儲存。預設可選值仍具有可讀取的引用。

Config schema 負責提供基於 schema 的 settings 表單需要的欄位型別、預設值、角色和動態更新宣告。現有 settings 消費者保持不變；自動錶單生成及其遷移是獨立工作。[設定指南](../../../../docs/cordis-tutorial/05-config.zh.md)負責外掛作者的使用說明。

## Alternatives considered

**每次設定變化都重新啟動。** 當只有操作時讀取的參數變化時，這會釋放仍然有效的資源。

**增加另一套 settings 專用動態值 API。** 這會重複執行時更新語義，並使外掛為了讀取普通設定而依賴 settings。

**僅在掛載時包裝值。** 直接解析 schema 與外掛設定將返回不同種類的值，需要獨立的消費者型別。

## Consequences

Schema 拒絕動態容器內部的獨立 volatile 引用；整個物件和陣列可以作為一個 volatile 值。不可變快照接受普通資料。設定簡化解包引用，共享 symbol 支援 ESM/CJS 副本互操作。Group/Include 保留分發，目標外掛的僅 volatile 更新不進入 `internal/update`。直接呼叫 `fiber.update()` 保留原語義，包括自定義處理、儲存及 `noSave`。動態 volatile 更新由 Loader 自己提交，不需要額外外掛。

Schema 中繼資料使比較獨立於解析：diff 不執行表示式、驗證器或設定掛鉤。物件節點的預設值或 null 按宣告的預設值比較，即使沒有 volatile 後代欄位；等價的物件預設值不觸發重新掛載。普通表示式即使求值結果相等，修改時仍按原始值比較。Loader 比較解析後的普通值，其中 URL 按規範化地址比較。普通表示式產生不同值時，Loader 改為按普通流程重新掛載而不提交；嚴格比較對 URL、Date、RegExp 之外的類實例按身份比較，因此每次解析都產生新實例的普通 transform 欄位總是走重新掛載。通知階段監聽器拋錯只記錄日誌，不使更新失敗。Loader 在提交前驗證 volatile 候選；非法編輯保留在原始設定中，但在後續啟用之前不改變執行中的引用。

Schema 和生命週期迴歸測試覆蓋直接更新、無效候選、實例隔離、依賴替換、真實檔案監視及儲存後重新載入。HMR 模組測試覆蓋動態設定更新後的程式碼替換。這些測試不代表 settings 遷移或自動錶單渲染已經完成。
