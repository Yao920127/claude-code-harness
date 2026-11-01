# Agent Note: 永久刪除 Session

Status: implemented

[English](2026-09-26-permanent-session-deletion.md) | 中文

## Problem

歸檔只隱藏 Session，仍保留其日誌、投影快取行與 Workspace 歸屬條目，因此使用者不再需要的對話仍佔用磁碟且可被恢復。使用者需要從側邊欄永久刪除對話，包括它啟動的子代理的記錄。

## Decision

`SessionPersistence.delete(id)` 屬於持久化 Service Definition。[JSONL 後端](../../../../packages/session/session-persistence-jsonl/README.zh.md)在程序內並透過跨程序租約宣告寫入權後，刪除該工作階段自有的目錄及所有保留的格式代；因此有寫入者持有或已建立尚未寫入磁碟的工作階段會以 `SessionAlreadyOwnedError` 被拒絕。

[Session 控制器](../../../../packages/api/session-controller/README.zh.md)提供 `session.delete`。它以 `stopActivity` 歸檔該 Session，透過現有的歸檔准入停止執行中的輪次、任務、子代理與提醒，並攔截它們引發的所有喚醒。隨後它透過建立或恢復該 Agent 時保留的控制代碼釋放活躍 Agent。它先從最深處刪除 subagent 來源的後代，最後刪除該 Session；對每一個，它刪除已儲存日誌，透過 `sessionProjectionCache.forget` 刪除投影快取行，透過 `workspaceRegistry.forgetSession` 刪除 Workspace 歸屬、歸檔與置頂條目，最後發出 `api-session/removed`。subagent 擁有的 Session 不能單獨刪除。

Web 側邊欄新增一個破壞性的“刪除工作階段”行，排在所有外掛行之後，開啟一個寫明該 Session 名稱的確認對話方塊。確認時，若該 Session 是目前選中項，會先離開它。

## Alternatives considered

**只刪除列表條目並保留檔案。** 歸檔已經能隱藏 Session；再增加一種隱藏狀態既不釋放磁碟空間，也不會刪除使用者要求刪除的記錄。

**連同來源刪除 fork。** Fork 的日誌儲存複製的字首，是獨立的對話；刪除它會移除使用者沒有選中的歷史。

**刪除溢位輸出與附件。** Fork 會繼續讀取從來源繼承的溢位定位符，附件按內容跨 Session 去重且沒有引用計數，因此按 Session 刪除可能破壞其他 Session。溢位保留期與帶外維護仍是它們的清理途徑。

**不停止工作直接刪除。** 執行中的輪次、任務或提醒可能在檔案刪除後繼續追加或喚醒該 Session。

## Consequences

刪除無法撤銷。已刪除 Session 的溢位輸出檔案與按內容定址的附件會保留，直到各自的保留期或維護將其移除；Host 的 Claude 設定目錄下 Claude Code 的原生記錄也不會被刪除。活躍 Agent 由其他所有者建立的 Session 會被拒絕而不會被刪除。後端測試覆蓋目錄刪除、所有權拒絕與取消；控制器測試覆蓋順序、後代、冷 Session 與錯誤對映；用戶端測試覆蓋確認對話方塊、列表移除與離開目前 Session。
