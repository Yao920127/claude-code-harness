# 翻譯語體樣例（style samples）

本檔案是翻譯語體的校準錨點：每組樣例是一段英文原文與一段人工定稿的中文譯文，覆蓋本儲存庫文件的主要文體。**譯文的語體以這些樣例為準**——文體樣例的效力高於對語氣的文字描述，但術語表、忠實性與結構規則仍然優先。翻譯或評審時對照最接近的文體樣例。本檔案中英對照、自成雙語，不參與配對（見 [README.md](README.md) 排除清單）。

維護方式：人工評審校準出新的金標段落後追加到對應文體；發現語義、結構或術語錯誤時直接修正。新增或修正樣例都需經過 PR 評審。

## ① 架構敘述

> This document describes the architecture of the DeepSeek Harness — the foundation of **DeepSeek Code**. The governing principle, from the microkernel design discussion: **everything is a plugin**. The core is deliberately tiny — a handful of abstract services plus one concrete loop plugin (`dsh-agent-loop`) — and every product feature is a plugin against the extension API described here, without modifying the loop.

本文介紹 DeepSeek Harness 整體架構，它是 **DeepSeek Code** 的底層基座。微核心設計討論中確立了核心設計準則：**一切皆外掛**。核心刻意做得極精簡，僅包含少量抽象服務，外加一個實體迴圈外掛 `dsh-agent-loop`。所有產品功能均基於本文定義的擴充功能介面開發為獨立外掛，無需改動主迴圈邏輯。

> Dependency rule: extension plugins depend on interfaces, never on `dsh-agent-loop` (the loop is swappable); composition bundles such as `dsh-base` and `dsh-sdk-minimal` may assemble the concrete loop.

依賴約束規範：各類擴充功能外掛僅依賴抽象介面，嚴禁直接依賴 `dsh-agent-loop`（該主迴圈支援替換實作）；`dsh-base` 與 `dsh-sdk-minimal` 等組合包可以組裝具體迴圈。

> This document covers **behavior**; type definitions live in [subsystems/](../subsystems/core.md), the per-event/service reference lives in the generated regions of [subsystems/](../subsystems/core.md), and package contracts in the package READMEs state each package's required configuration and behavior ([map](../../packages/README.md)).

本文件描述整體行為邏輯；型別定義存放於 [subsystems/](../subsystems/core.zh.md)；各類事件、服務的詳細參考見 [subsystems/](../subsystems/core.zh.md) 中的生成區塊；相應的 README 說明每個包（package）要求的設定和行為（[索引](../../packages/README.zh.md)）。

## ② 防禦模式規則

> Hard-won bug-class rules: each pattern below is a class of defect that actually shipped or nearly shipped here, stated as the rule that prevents its recurrence. Read this before writing lifecycle, concurrency, subprocess, or teardown code.

這些都是踩坑總結得出的缺陷分類規範：下文每種正規化都對應一類曾上線、或險些流入線上的問題，每條規範旨在杜絕同類問題復現。編寫生命週期、並行、子程序、資源銷燬相關程式碼前，請務必閱讀本文件。

> **Dispose must reach quiescence, not just request it** — A teardown that issues kills/aborts but returns before the work stops leaves orphans. Make cleanup async and await the children's exit (kill → await `done`), and close listener/notification registries BEFORE killing so late completions stay silent. Tests prove disposal waited (pid gone right after `await fiber.dispose()`), not merely that the process eventually dies.

**dispose（資源釋放）必須等待所有任務完全停穩，不能僅下發終止指令就返回**：如果清理過程只發出終止或中斷訊號，卻不等任務停止就返回，就會留下孤兒程序。清理應採用非同步方式，等待所有子任務徹底退出（先發出終止訊號，再等待退出）；發出訊號前應先關閉監聽器與通知註冊表，使延遲到達的完成事件不再觸發通知。測試要證明 dispose 的確等到清理完成：執行完 `await fiber.dispose()` 後程序 PID 立即消失，不能只檢查程序最終會自行消亡。

> **Async state is not synchronous state** — `agent.followup()` does not flip status before returning; a background job's completion races turn boundaries; `reader.close()` fires for both EOF and disposal. Never gate control flow on a status you only just requested — drive lifecycle off the events/promises that actually fire (`agent/status`, `task.done`), and observe the transition (saw `running` THEN `idle`) instead of treating status as a per-follow-up result: several queued follow-ups run as consecutive turns under one `running` interval, while cancellation or disposal can discard unstarted items.

**非同步狀態不等同於同步瞬時狀態**：呼叫 `agent.followup()` 不會在返回前同步更新狀態；後臺任務的完成時間與輪次邊界存在競態；`reader.close()` 既會在讀到檔案末尾時觸發，也會在資源釋放時觸發。切勿把剛剛發起的狀態變更當成已經生效，據此控制流程；生命週期邏輯應以實際觸發的事件和已完成的 promise（`agent/status`、`task.done`）為準，並觀察完整的狀態變化（先 `running`，再 `idle`），不要把狀態當作逐次 `followup()` 的結果：多次排隊的 `followup()` 會作為連續輪次執行，但可能共用一個 `running` 區間；取消或資源釋放還可能丟棄尚未啟動的佇列項。

## ③ 測試政策清單

> **Coverage gate** (`pnpm run test:coverage`): the gating run, per-file 100% on `packages/*/*/src`. An uncovered line is often dead code the gate is correctly flagging for deletion, not a missing test to bolt on. Line coverage is necessary, never sufficient — it proves lines ran, not that the feature works as shipped.

覆蓋率門禁（`pnpm run test:coverage`）：作為合入門禁驗證，要求 `packages/*/*/src` 目錄下每個檔案行覆蓋率達到 100%。未覆蓋程式碼行大多是無用死程式碼，門禁標記這類程式碼是提示刪除，而非單純補充測試。行覆蓋率是必要條件，但遠不充分：它僅能證明程式碼被執行過，無法保證功能符合線上預期。

> We are DeepSeek — do not ration real-API tests. A no-key test proves the plumbing; only a with-key run proves the agent works against a real model. Write many: real prompts that write files, multi-turn conversations, tool use, cancellation mid-stream. Cheapest and highest-value are **smoke tests** that boot the real example, send one real prompt, and check the world — they catch the "green unit tests, broken product" class that mocks structurally cannot. The self-skip exists only so secretless CI and keyless contributors aren't blocked; it is not a cost signal.

我們是 DeepSeek：真實介面相關測試不得刻意縮減案例數量。無金鑰測試僅能驗證底層通路；只有攜帶有效金鑰執行的案例，才能確認 agent（智慧代理）可正常對接真實模型。請大量編寫此類測試：包含檔案寫入類真實提示詞、多輪對話、工具呼叫、流式中途取消等情境。

成本最低、收益最高的是**冒煙測試**：拉起完整真實範例，傳送一條真實提示，並檢查檔案、程序等外部可觀察結果。這類案例能捕捉一類問題——單元測試全部綠燈，但產品實際執行故障，單靠 mock 完全無法發現這類缺陷。

自帶自動跳過邏輯，僅用於保障無金鑰 CI 環境、無權限貢獻者不會被流程攔截，不代表可以以此為由削減真實介面測試投入。

> **Prefer the real implementation over a mock** — Mock only genuinely expensive or non-deterministic dependencies (the LLM adapter, the network, the clock); keep everything downstream real. A hand-rolled stand-in proves the bridge moves bytes, not that the shipping tool behaves as asserted — the two drift while the test stays green.

**優先使用真實實作，而非 mock 替身**——僅對開銷極大、結果不確定的依賴做 mock（LLM（大語言模型）介面卡、網路、時鐘），其餘下游元件全部使用真實實作。手寫的 mock 替身只能驗證資料通路能傳輸位元組，無法保證線上工具符合預期邏輯；長期下來業務邏輯與 mock 實作會出現偏差，但測試仍會顯示透過。

## ④ 機制描述

> Blob hashes, not commit hashes, so the record is computable for files edited in the same PR (`git hash-object foo.md`) and consistency is a pure content comparison. The recorded hash also recovers the exact last-confirmed text of either side (`git cat-file -p <hash>`), so an out-of-sync pair is updated by diffing the edited side against its last-confirmed state and patching the counterpart minimally — never by re-translating whole files.

系統採用檔案 blob hash 而非 commit hash 記錄狀態。同一 PR 內修改檔案時，可透過 `git hash-object foo.md` 直接算出對應 blob hash，僅對比檔案內容即可判斷雙語文件是否同步。透過記錄的 blob hash，可使用 `git cat-file -p <hash>` 還原上次確認對齊時兩側的原文。當雙語文件不一致時，只需對比修改版本與上次確認版本的差異，最小幅度同步修改另一側譯文，無需全文重新翻譯。

## ⑤ 政策宣告

> The gate's limit, stated plainly: a green gate means the pair was confirmed consistent at these exact contents, not that the confirmation was sound. It checks hashes and Markdown structure; it cannot judge whether the two sides actually say the same thing — that is the reviewer's half of the contract. A re-recorded pair with a sloppy counterpart passes the gate; it must not pass review.

門禁的限制很明確：透過門禁只說明兩側檔案目前的 blob hash 與伴隨記錄吻合，並且 Markdown 結構簽名一致，也就是說，這組內容曾被確認一致；它不代表這次確認可靠。評審人必須檢查兩種語言是否真正表達了相同的意思。即使譯文粗糙、表意有誤，重新記錄配對後仍能透過門禁，但絕不能透過人工評審。

## ⑥ Agent Note 論證

> Comparing git timestamps of the pair (no record) — rejected: formatting-only edits would false-positive, and a counterpart committed after an unrelated edit would false-negative; content identity is the only signal that means what the gate claims.

對比雙語檔案的 git 時間戳（無記錄方案）——不予採納：僅調整格式的改動會觸發誤報，無關修改後再提交譯文又會造成漏檢。只有基於內容本身的標識（每側檔案的 blob hash 與伴隨記錄比對），才能承載門禁所聲稱的語義。

## ⑦ 統一要求（長段拆分示範）

> **Universal requirement**: every in-scope document merges as a complete bilingual pair. The manifest contains only explicit exclusions: it has no per-file rollout list, date cutoff, or README-specific policy class. […] Pairing is a continuing obligation: every later edit to either side updates the counterpart and consistency record in the same change.

**統一要求**：每篇納入範圍的文件合入時都必須構成完整的雙語配對。manifest（中繼資料清單）只包含顯式排除項：其中沒有逐檔案推進清單、日期分界或 README 專用政策類別。（……）配對是一項持續義務：後續修改任一側時，都必須在同一變更中同步更新對側檔案和一致性記錄。

## 從樣例提煉的要點

- 語體是規範制度文：完整主謂、確定語氣；不口語化，也不學術腔。
- 給句子補顯式執行主體：英文的被動句和抽象主語，中文寫成「系統／門禁／工具／評審人」做主語。
- 用中文工程慣用語替換直譯：false positive/negative→誤報／漏檢、ratchet→只向前收緊不倒退放寬、reviewable act→評審憑證。
- 隱喻在地化而非移植：bilingual from birth→從建立起就要求雙語齊備；grandfathered→歷史存量遺留。
- 類別名詞說中文並在首現括注英文：實操手冊（cookbook）、事故檢討（postmortem）；指目錄或路徑時保留程式碼體英文。
- 長段按語義單元拆段，一段一件事；名詞短語展開為動詞句。
- 母語重寫不等於刪減：原文每個語義成分都要落實。
- 樣例與 [terminology.md](terminology.md) 衝突時，以術語表為準：收錄樣例前按表修正術語（例如 agent、mock、LLM 保留英文，cancellation 譯「取消」）。
- 程式碼體識別符號（事件名 `agent/status`、狀態值 `running`、包名 `dsh-bash-local` 等）在譯文中保留 code span 原文，不得口語化改寫；Pass 2 必須逐句核驗。
