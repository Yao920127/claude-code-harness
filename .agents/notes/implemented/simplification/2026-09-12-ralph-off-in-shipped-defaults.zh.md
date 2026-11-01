# Agent Note: 在隨附預設組合中關閉 ralph

Status: implemented

[English](2026-09-12-ralph-off-in-shipped-defaults.md) | 中文

## 問題

`ralph` 工具執行一個固定的前臺迴圈：每一輪開啟一個全新的、不帶對話種子的子代理，直到某個 worker 報告完成或給出具體阻塞原因才返回。它面向模型的描述把用途限制為直接人類明確要求的場合，其 README 也記錄：完成與否是 worker 的自我宣告，沒有獨立評估；該迴圈沒有後臺收集、沒有可恢復的檢查點，也沒有排程器。

該工具在 `packages/bundle/base/cordis.patch.yml` 以及四個隨附 agent preset 中的三個裡預設啟用。於是預設工作階段帶著一個自身描述就叫模型不要主動使用的工具，預設檔位的工具目錄也在宣傳 Harness 尚未背書的能力。[隨附工具清單](../feature/2026-07-31-even-out-shipped-tool-rosters.zh.md)決策組裝了這份 base 清單，並逐條列出此後的每次收窄；本次是那份清單上新增的一條。

## 決策

`packages/bundle/base/cordis.patch.yml` 把它的 `tool-ralph` 行宣告為 `disabled: true`，`standard`、`ptc`、`cordis` 三個 preset 也以同樣方式宣告各自的 `tool-ralph` 行。`minimal` preset 沒有該行。包本身、工具的對外約定和它的測試都保留：這次改的是哪些預設組合掛載該行，而不是該能力是否存在。

`ptc` preset 還額外把 `workflow-ptc` 宣告為停用。該 preset 在去掉通用 `workflow` 工具之後只為 `ralph` 保留了這個引擎，因此停用 `ralph` 使該組合中的引擎不再有消費方。

每個被停用的行都在本地註解裡帶上恢復方法。對基於 base 的檔位，用一行 overlay 即可從 `$DSH_HOME/cordis.patch.yml` 或 `--patch` 檔案重新啟用。隨附 preset 是 Web bundle 補丁（`packages/bundle/web-app/cordis.patch.yml`）裡的 `@deepseek-ai/dsh-agent-preset` 行，因此想要 `ralph` 的 Web 工作階段可以在 profile 補丁裡覆蓋該行的 `config.plugins`，或透過 Web 編輯器以**新 id** 儲存一個 preset，宣告會持久化到 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`；註冊表拒絕重複的 preset id（`packages/preset/agent-preset-registry/src/index.ts`）。在 `ptc` 中，覆蓋要同時刪掉工具行和引擎行的 `disabled`，因為 `tool-ralph` 注入 `ctx.workflowEngine`。

`packages/bundle/web-app/cordis.patch.yml` 在自己的層裡重述這條停用宣告。`scripts/verify-cordis-config.ts` 中的 `validatePresetPlaneSeparation` 在收集已宣告的行 id 時不看 `disabled`，所以刪掉這一行會讓 `tool-ralph` 回到 Web 主機平面，並與每個 preset 中的同名行衝突。

`snapshots/session/ralph-loop` 成為 `ralph` 組合的所有者，它的 `cordis.yml` 與 `cordis.snapshot.yml` 重新啟用該行，於是唯一演練該工具的錄製情境保住了自己的證據。兄弟組合不會繼承 `text-turn/cordis.snapshot.yml`，因此新的回放補丁在 `ralph` 行之外重述了那些替換項。

## 考慮過的替代方案

**新增第五個隨附 preset 承載被降級的能力。** preset 名單提供了真實的按工作階段選擇，但隨附 preset 一經存在就會被發現並展示給每個使用者，無法表達“預設關閉”。preset 層同樣沒有補丁語義，新 preset 就是 `standard` 的一份完整副本，會與它靜默地分叉。

**刪除該行而不是停用它。** [共享 base 預設檔案編輯器](2026-09-05-base-default-file-editor.zh.md)的決策把 `str_replace_editor` 從 base 的選擇中移除，而不是關閉隨附，也最明確地表達了降級。被刪除的行對使用者自有組合同樣不可達，因為補丁只能對已存在的行翻轉 `disabled`。

**只在 Web preset 中降級。** 預設 Web 工作階段正是討論中的介面，這樣的差異也最小。它會讓 headless、sdk、acp 和自定義的基於 base 的檔位繼續隨附預設 Web 介面拒絕的工具，而這正是 `verify-cordis-config` 所稱的近似副本漂移的常見失敗形態。

**連同 goal 工具一起降級。** 兩者都推遲了獨立評估，用同一把尺子量結果相同。goal 工具是受支援的長時間工作路徑——`ralph` 的描述本身就把普通的長時間工作指向它們——並且帶有產品介面，因此一起降級會讓長時間工作失去受支援的執行方式。

**在 `ptc` 中保留 `workflow-ptc` 啟用。** 這樣在複製出的 `ptc` preset 中刪掉 `tool-ralph` 的 `disabled` 只需改一處而不是兩處。它會在隨附組合裡留下一個沒有消費方的提供者，而 `packages/AGENTS.md` 拒絕這種做法；改由重述後的註解點明這層依賴。

**把選擇啟用的方法寫進 `docs/`。** 指南頁面能觸達從不開啟組合檔案的使用者。各平面的恢復方法不同，但每種都只有三行，因此由行內註解在使用點承載。

## 後果

預設的 Web、headless、sdk、acp 或自定義基於 base 的工作階段不再提供 `ralph`，`standard`、`ptc`、`cordis` 三個 preset 也不再提供。要恢復它，使用者需要修改組合，因此該能力變成顯式選擇加入，而不只是被勸阻使用。已經記錄了 `ralph` 呼叫的既有工作階段仍可回放和渲染：工具包仍然安裝，其事件型別未變。

`ptc` 模式同時失去該引擎。複製出的 `ptc` preset 若只恢復 `tool-ralph` 而不恢復 `workflow-ptc`，該工具行會留下未解析的注入，這正是兩行都在註解裡點明這層依賴的原因。

## 驗證

`apps/cli/tests/web-agent-presets.e2e.ts` 固定了四點：每個帶 `tool-ralph` 的 preset 都停用它；`minimal` 清單不含該行；`ptc` 停用 `workflow-ptc`；`standard` 與 `cordis` 為各自的 `workflow` 工具保留引擎啟用。`apps/cli/tests/web-agent-presets.e2e.ts` 與 `apps/web/tests/shipped-composition.e2e.ts` 固定預設與 PTC 的確切工具目錄，因此某一行不再貢獻會直接導致測試失敗，而不是讓列表悄悄變短。`scripts/verify-cordis-config.ts` 的平面隔離檢查在停用行存在的情況下繼續透過。

多數受影響的錄製工作階段旁掛檔案由 `DSH_SNAPSHOT=refresh pnpm run test:snapshot` 重新生成，並由 `pnpm run test:snapshot` 回放整個語料。另有六個旁掛檔案是人工整理，因為本機沒有任何一次執行會產出它們。其中四個屬於 `pwsh-tool-turn` 與 `persistent-pwsh-tool-turn`：本機缺少 `pwsh`，這兩個情境在本地被跳過；它們刪掉的文字與重新整理在別處刪掉的文字逐位元組相同。剩下兩個是 `snapshots/web/schedule-catalog`，沒有任何在執行中的測試寫入或讀取它們：`schedule-after.e2e.ts` 只讀該目錄的 `catalog.expected.md` 與 `session.v3.jsonl`，`assertFixtureInventory` 也只檢查那四個檔案存在，因此它 `snapshot.yml` 裡的 `header.pin: true` 並未被強制執行。`snapshots/session/ralph-loop` 在它自己的組合補丁下透過，這證明這次降級把該行移出了預設組合，卻沒有移除對該工具的覆蓋。
