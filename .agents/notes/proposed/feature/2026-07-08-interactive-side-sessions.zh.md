# Agent Note: 互動式側工作階段與合併回寫

Status: proposed

[English](2026-07-08-interactive-side-sessions.md) | 中文

## 問題

使用者可能希望在不改變目前工作階段主上下文的前提下，探索一個來自活躍工作階段的問題。現有原語無法提供這種產品形態：[工作階段儲存 fork](../../archived/feature/2026-06-30-session-store-fork-api.md) 建立的是一個未繫結的工作階段，而 [fork subagent](../../implemented/feature/2026-06-21-subagent-capability-seam.zh.md) 是模型驅動的任務，其 transcript（文字記錄）會摺疊為一條工具結果。兩者都不能給使用者一個獨立的對話，也都不能在父工作階段中同時記錄結論和產生該結論的側工作階段。

## 提案

**側工作階段（side session）**是一個普通的活躍工作階段，從源工作階段的最後一個已完成輪次 fork 而來，繫結到自己的 agent（智慧代理），定位為只讀顧問，並能**合併回寫**一條精簡筆記。

- **Fork 並繫結：**用 parent 的平衡 completed-turn prefix、`parentSession`、`meta.isSeeded: true` 與精確 sibling `inheritedEventCount` 建立 child。這組合 `ctx.agents.create({ seed, inheritedEventCount, meta })`；不新增 core service 或 Session-store method。
- **顧問定位：**建立後注入一條外掛來源的 `context/message`，告知子工作階段只做解釋，不執行變更或繼續任務。保持系統提示詞逐位元組一致，可在繼承的歷史上保留提供者的字首快取。
- **合併回寫：**向子工作階段請求一條有長度上限的 handback，然後向父工作階段注入一條外掛來源的 `context/message`。父工作階段的下一次請求在日誌所記錄的位置看到該訊息，保持回放與[請求可重建性](../../implemented/architecture/2026-07-05-reconstructable-requests.zh.md)，無需新增工作階段事件。
- **呈現：**呼叫方式、工作階段切換與 handback 渲染屬於首個用戶端擁有的介面。本 Agent Note 僅規定與介面無關的機制。

退回產品化、工作階段樹檢視、面向模型的側工作階段工具，以及 `forkName`/`mergedInto` 中繼資料均不在本 Agent Note 範圍內。一次真實介面卡 spike 已驗證了源日誌隔離、繼承上下文、多輪子工作階段互動，以及合併回寫在父工作階段下一輪次中的可見性。

## 曾考慮的替代方案

- **使用 subagent seam：**否決。側工作階段是使用者驅動的、用戶端可見的，且可能存活超過父工作階段的一個輪次；subagent 是模型驅動的執行，返回一條工具結果。
- **修改子工作階段的系統提示詞：**預設否決，因為任何位元組變化都會從第零個 token 起使字首快取失效。部署方仍可選擇這種更強的隔離方式。
- **新增 `sidechat/*` 事件：**延後。已標註來源的 `context/message` 已經持久記錄內容、生產方和回放輸入；只有當某個介面需要差異化渲染時，專用事件才有正當理由。
- **現在就繫結一個協定介面：**否決。目前 UI 由用戶端擁有。即時呈現最終必須從持久訊息派生，以使回放渲染出相同的記錄。

## 驗收標準

- Fork 不改變 source Session，建立的 child 帶有平衡 completed-turn prefix、`parentSession`、`isSeeded: true`、精確 `inheritedEventCount` 與逐位元組相同 system prompt。
- 顧問定位在子工作階段追加歷史的頭部恰好新增一條外掛來源的 `context/message`，而非修改其系統提示詞。
- 合併回寫恰好新增一條有長度上限的 `context/message`，來源為 `plugin: sidechat`；父工作階段的下一次請求與回放在相同位置看到它。
- 父工作階段與子工作階段並行執行，日誌和流之間無串擾。
- 單元測試覆蓋 fork/attach 與合併回寫；快照覆蓋隨首個繫結介面一起落實。

## 風險

- 只讀行為在 `tools/pre-execute` 拒絕門禁強制執行之前僅為建議性質；[攔截點](../../implemented/feature/2026-06-30-interception-extension-points.zh.md)可在不改變本機制的前提下新增該門禁。
- 經過壓縮（compaction）的源工作階段 fork 出的是其壓縮檢視，因此繫結的介面應當告知使用者子工作階段繼承的是摘要而非被替換的輪次。
- 反覆的 handback 會消耗父工作階段上下文。每次合併的長度上限約束了單條筆記的大小；後續的合併整理屬於上下文壓縮的職責。
