# Agent Note: What stays host-plane once presets own the agent plane

Status: implemented

[English](2026-08-10-host-plane-ownership-after-presets.md) | 中文

## 問題

[逐工作階段 agent preset](2026-09-18-declarative-agent-presets.zh.md) 把每一個面向模型的行搬上了 agent 平面，此後的每一處修復都是一個仍按搬遷之前的世界寫成的讀取點。`tasks` 因為 realm 之外的 preset 行要解析它而搬回主機；`goals` 因為同樣的理由從未離開；而當所有面向模型的工具都變成祖先貢獻之後，子 agent 的 `toolFilter` 也已被修好（[子 agent 加入父方 preset](../bug-fix/2026-08-10-child-agents-join-their-parent-preset.zh.md)）。

還有兩個讀取點仍站在這條線的錯誤一側。

`dsh-token-meter` 在主機側被停用，改掛進每個 preset 的 `compaction` realm。它不接受任何設定，每次摺疊都以 `Session` 建鍵，也不註冊工具或提示段——但它擁有 `tokenUsage`、`contextPressure` 與 `contextBreakdown` 三個投影單元，而 `sessionProjections` 是一張程序級、沒有作用域分層的表。因此從某個 preset 內部註冊的單元會替所有工作階段作答：一個 `minimal` 工作階段是否顯示 context meter，取決於本次啟動以來有沒有**別的**工作階段掛過 `standard`；而只跑過 `minimal` 的程序根本不顯示。

沒有加入任何 preset 的 agent 也無人指出。加入是一條 scope 父鏈連結；缺了它，`tools`、`system-prompt` 與 `skill` 的檢視都解析到空的全域層，模型什麼也收不到——不報錯，也沒有空目錄可看，只是一個無法行動的 agent。被委派的子 agent 在 preset 存在的整段時間裡都是這樣執行的，而同一個洞在每一個早於 preset 的入口點上都開著。

## 決策

**meter 屬於主機平面。** `dsh-token-meter` 回到主機組裝，並離開各 preset 的 `isolate` 對映，於是 `compaction-basic` 與 `tool-result-pruner` 在自己的 realm 內部解析到那一份主機實例。preset 保留 realm 與壓縮後端——preset 選擇的是它的 agent 是否壓縮，而不是它的 token 是否被計。這正是 `tasks` 與 `goals` 已經採用的判據，只是這次適用於一個因**投影**觸達面而不該歸 preset 所有的 Service：當一個單元的空值與真實值無法區分時，只要它註冊進的那張表是程序級的，它就不能是逐組裝的。

**未加入的 Agent 在使用模型時失敗。** 不變數 companion 檢查 `system-prompt/assemble`，因為未繫結的 Agent 可以合法地稍後透過 `recompose` 繫結。純 Host 和歷史 scope 提示詞讀取沒有 Agent，不屬於此檢查範圍。

投影 key 是否存在不能代表逐工作階段能力（[工作階段投影](../../../../packages/session/session-projection/README.zh.md)）。透過 `cordis_mount` 掛載的臨時外掛屬於組裝，而非呼叫工作階段（[Cordis 工具](../../../../packages/extensions/tool-cordis/README.zh.md)）。[宣告式 preset](2026-09-18-declarative-agent-presets.zh.md) 負責代際保留，在最後一個引用釋放後回收退役樹。

## 測試

`apps/cli/tests/web-agent-presets.e2e.ts` 在建立任何 Agent **之前**，於已啟動的 Web 組裝上讀取 `ctx.get('tokenMeter')`——preset 側的 meter 會待在 `isolate` realm 裡，對 `ctx.get` 不可見，因此這次讀取是一次所有權斷言而不是掛載順序的巧合——隨後斷言一個 `minimal` 工作階段的快照帶齊三個單元。

`packages/preset/agent-preset-registry/tests/invariant.spec.ts` 拒絕未加入的 Agent 組裝，並接受已加入的 Agent、Host 讀取和歷史 scope 讀取。

## 考慮過的替代方案

**把 meter 留在 preset，改為給投影註冊表分層。** 這是更精確的修法，代價也大得多：`snapshot`、`checkpoint` 與主動驅動都需要一次「工作階段 → 作用域」的解析，而冷讀在沒有 api-proxy 的 `presenterScopeFor` 時並不具備。相對於一個完全沒有 per-preset 狀態的 Service，這不成比例，因此改為把通則寫在註冊表上。

**對未加入的 agent 否決釋出。** 大聲勝過靜默，註冊表也支援這麼做——同步的 `agent/created` 監聽器丟擲會把建立整體復原。否決的理由是：在名單之外組裝 agent 是合法的——`recompose` 寫明瞭它隨後繫結的那個裸 agent，而 ACP 橋、SDK server 與 headless bundle 都會建立一個。否決會把能力缺口變成一次故障。

**讓配套也在 `agent/created` 處檢查加入情況。** 否決：釋出時分不清漏掉的加入與之後才會被繫結的 agent，因此該檢查會拒絕一條已寫明的路徑。提示片語裝分得清。

**基於同樣的投影理由，把 `plan-mode` 與 `tool-todo` 也搬離 agent 平面。** 否決：兩者確實是逐 preset 的能力，且對從不使用它們的工作階段，其單元算出的就是空值，而用戶端本來就按值讀取（`plan.active`、空列表）。只有空值與真實值無法區分的單元——meter——才被迫歸主機所有。

## 後果

context meter 成為逐工作階段的事實，而不再是掛載歷史的函式。代價是 preset 不能再選擇不做 token 記帳；隨附的 preset 沒有一個這麼做，`minimal` 現在也寫明它放棄的是自動壓縮而非記帳。

不變數覆蓋載入了 `dsh-invariants` 的組裝。生產入口必須顯式組裝 Agent；僅安裝註冊表不會自動繫結。
