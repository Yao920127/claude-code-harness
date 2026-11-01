# Agent Note: 複用空白 Session 時取得寫鎖

Status: implemented

[English](2026-09-17-process-local-blank-sessions.md) | 中文

## Problem

兩個共享 Session 儲存的 Host 在開啟 Workspace 時可能選中同一個空白 Session。空白 Session 已有活動 Agent，可以接受 slash 命令，並且可能在建立檢查點後持有寫鎖。無人佔用的持久化空白工作階段也可能帶有 Host 重新啟動後仍有用的命令設定。

## Decision

Session 列表包含持久化空白工作階段。啟動恢復選擇已儲存的空白工作階段；普通 Workspace 導航按列表順序選擇第一個符合條件且未歸檔的成員。顯式 ID 的 `session.create` 會恢復該 Session，並在開啟歷史前取得寫鎖。只有 `session/writer-held` 會觸發新建 Session。其他錯誤返回呼用方。同一 Client 的並行 Workspace 連線共享取得與退回過程。後續導航會取消尚未完成的啟動選擇。

Agent 在整個生命週期內持有取得的控制代碼。檢查佔用後釋放探測鎖，會在恢復前留下競態。持久化資料與 Remote schema 均不引入 PID 或程序身份。

本決策擴充功能 [Client Session scope 決策](2026-07-25-web-client-session-scope-and-provide-channel.zh.md)中的空白工作階段複用策略；其真實 Session 支援 slash 以及 Provider 收養的理由仍然有效。

## Alternatives considered

**純用戶端草稿。** Slash 命令與 Session 作用域外掛在首條提示詞之前就需要真實 Session。延遲建立需要單獨的命令生命週期。

**釋放活動空白工作階段的寫鎖。** Blank 表示沒有 `turn/start`，並不表示沒有事件。活動 Agent 仍可能追加命令與設定事件，因此釋放其鎖會允許多個寫入方競爭。

**隱藏所有冷空白工作階段。** 這會讓導航丟失可複用的命令設定，並且每次重新啟動都建立另一空白工作階段，即使舊寫鎖已空閒。

**持久化建立者 PID。** 核心寫鎖已能仲裁取得操作。PID 複用與過時的建立者記錄無法增加權威性。

## Consequences

Host 可以複用自己的活動空白工作階段，也可以接管無人佔用的持久化空白工作階段並保留其 slash 狀態。現有寫鎖被持有時，不同 Host 建立不同的空白工作階段。所選空白工作階段被佔用時，即使另有空閒空白工作階段也會新建；導航不再尋找其他候選。不增加清理邏輯。兩個 Host 開啟同一個已有對話時仍可能遇到寫鎖爭用。未知投影提示仍可見且不掃描冷日誌正文；自動複用要求已知的空白中繼資料。非鎖爭用的取得錯誤會中止新建工作階段，目前只報告到控制檯；此流程沒有針對隱藏空白工作階段的恢復操作。

## Verification

導航測試覆蓋已儲存選擇、單候選鎖爭用退回、其他錯誤、重疊取得以及後續導航替代。實際 Web 組合測試持有真實持久化寫鎖，驗證另有空閒空白工作階段時仍新建，並接管已釋放的所選空白工作階段及其 plan 狀態。fresh-round-trip 的錄製 Session 情境在提交已錄製的提示詞前重新整理空白工作階段。
