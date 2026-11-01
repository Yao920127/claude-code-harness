# Agent Note: 拉平交付的工具清單

Status: implemented

[English](2026-07-31-even-out-shipped-tool-rosters.md) | 中文

## 問題

兩個交付的 `dsh` surface 提供著不同的工具，而沒有任何記錄說明為什麼。工作階段檢查點、工具結果裁剪、goal 工具和 Ralph 在 `tui.cordis.yml`；`tool-todo` 以及後來的 web 搜尋在 `web.cordis.yml`。兩個 surface 都沒有工作階段搜尋、字串替換編輯器和重複工具守衛，儘管這三者都已成包存在，且沒有一個是 surface 專屬的。

結果是一處沒人做過決定的使用者可見差異：同一個模型、同一個請求，在終端上能定目標而在瀏覽器裡不能，在瀏覽器裡能搜網頁而在終端上不能。

## 決策

那些並非 surface 專屬的行移入 [`base.cordis.yml`](../../../../packages/bundle/base/cordis.patch.yml)，另有三行加入：`tool-session-query`、`tool-str-replace-editor` 和 `repeat-tool-reminder`。Web 搜尋也一併移入；其[部署決策](2026-07-31-web-default-search.zh.md)負責安全邊界，共享 base 則負責與 surface 無關的掛載。兩個 surface 組裝同一份清單，其中 `glob` 和 `grep` 是固定成員，因為 `dsh-tool-fs-search` 直接 spawn [打包的 ripgrep 二進位制](../../archived/architecture/2026-08-01-packaged-ripgrep-search.md)。後續決策收窄了這份清單：[session-search 決策](../../archived/feature/2026-08-02-session-search-not-shipped-default.md)讓 `tool-session-query` 保持需顯式啟用，[單一 editor 決策](../../archived/simplification/2026-08-10-default-presets-single-editor.md)從通用 preset 移除 `tool-str-replace-editor`，[僅持久 shell 決策](../simplification/2026-09-03-minimal-profiles-persistent-shell-only.zh.md)則從極簡組合移除它，[ralph 降級決策](../simplification/2026-09-12-ralph-off-in-shipped-defaults.zh.md)讓 `ralph` 在這份 base 清單與映像它的 preset 中預設關閉。

有兩行仍是 surface 專屬。`tmux-context` 只在 TUI，因為瀏覽器 surface 沒有終端複用器可描述。`session-reference` 只在 TUI，因為它以 launcher 的程序本地路徑驅動共享的 session-query 索引，而瀏覽器側邊欄會在自己的首次搜尋裡重建該索引。

**本次工具清單決策當時只做加法。** 落實時兩個 surface 均未移除任何工具行，目錄對比只發現了新增，別無其他。後續的 session-search 與單一編輯器決策分別負責對應的預設清單例外。共享執行器、沙箱組合與存取預設值獨立歸屬[workspace-write 預設值決策](../../archived/feature/2026-07-31-workspace-write-surface-default.md)。

### 什麼保持不掛，以及為什麼

有兩項能力基於其自身包所記錄的證據保持在外,列在這裡是為了讓「我們忘了」和「我們決定不要」保持可區分。

**`dsh-tool-cordis`** 讓模型寫一段 JavaScript 並掛成臨時外掛。它的 README 寫明瞭這個界限:「The sandbox is containment for honest code, not a security boundary — host-realm helpers on the sandbox global are reachable, so mount code can reach Node」([Known limitations](../../../../packages/extensions/tool-cordis/README.zh.md))。`node:vm` 的 realm 就在 harness 程序內,而 `dsh-sandbox-local` 只約束它 spawn 出去的 argv,因此在 Web surface 上,沙箱與批准接縫是被繞過而非被執行。

**LSP 三件套**留在外面是運維原因而非安全原因:`command` 在外掛載入時從 `PATH` 解析,因此缺少語言伺服器會讓整次啟動失敗,而不只是失去一個工具。等到「缺失」退化為「跳過註冊」之後,它就可以掛了。

### MCP 是依賴,不是設定行

`@deepseek-ai/dsh-mcp-client` 成為本 CLI（命令列介面）的執行時依賴,但在任何交付設定裡都沒有對應的行。該外掛每個實例只掛載一臺伺服器,且 `command` 是必填,因此一個預設值必須點名一臺第三方伺服器,並在每次啟動時把它作為子程序 spawn——不經 `ctx.shell`,因而也在 Web surface 所組合的沙箱策略之外。

真正能讓 MCP 成為預設的那一層,恰恰是本儲存庫尚未擁有的:一個讀取使用者伺服器清單、按條目逐臺掛載用戶端的橋接,形態與 [`dsh-hooks-claude-code`](../../../../packages/hooks/hooks-claude-code/README.zh.md) 讀取 Claude Code 的 `hooks.json` 完全相同。交付這個依賴意味著已安裝的 `dsh` 能從 `$DSH_HOME/config.yaml` 掛載伺服器;CLI README 裡給了那段 YAML。

## 測試

`apps/cli/tests/shipped-composition.e2e.ts` 曾在偽終端中透過真實 Loader 啟動交付樹，並從工作階段日誌持久化的 `request/header` 中讀出工具名，因此斷言的是模型實際收到的目錄。它傳入的 `--config` overlay `composition-keyless-tail.cordis.yml` 只用於測試隔離：一個無網路介面卡，以及落在工作區內的工作階段產物。

該尾部還曾插入 `composition-settled.ts`，用於在終端位元組流上宣告 Loader 啟用已 settle。TUI 在自己的 fiber 一啟動就渲染，因此在 banner 處敲下的提示詞可能在工具行與持久化仍在啟用時就抵達迴圈，從而組裝出不完整的目錄；把冒煙的首個提示詞 gate 在該標記上，正是斷言得以確定的原因。

同一份冒煙還根據同一份產物固定 TUI 的執行姿態。那些沙箱 schema 與初始權限斷言歸[workspace-write 預設值決策](../../archived/feature/2026-07-31-workspace-write-surface-default.md)所有，獨立於本工具清單決策。

[`apps/web/tests/shipped-composition.e2e.ts`](../../../../apps/web/tests/shipped-composition.e2e.ts) 在建置產物 lane 中覆蓋 Web surface,斷言它的工具目錄、它的存取預設值未被觸碰,以及 `workspace-write` 的可寫根包含臨時目錄——一個會讓沙箱測試說謊的陷阱,當工作區落在 `/tmp` 下時([`roots.ts`](../../../../packages/sandbox/sandbox/src/roots.ts))。

`glob` 與 `grep` 被作為固定成員斷言，而不是一對主機依賴：`dsh-tool-fs-search` spawn 打包的 ripgrep 二進位制並無條件註冊兩個工具，因此這一對始終在場。

除入庫測試外,兩個 surface 都以 plain Node 從建置產物 `apps/cli/lib/bin.js` 出發、用真實金鑰驅動過。每一個已掛載的工具都執行成功,包括 `ralph` 與 `web_search`;模型從未觸達 `cordis_*` 或 `mcp_*`,被要求做 LSP 跳轉時退化到 `grep`,被要求開持久終端時用了後臺 `bash` 任務。

## 曾考慮的替代方案

**把共享的行複製進兩份 overlay,而不是提升到 base。** 基於「一處歸屬」原則否決:新增行裡有三行會存在兩份,而這些副本沒有任何理由發生分歧,下一次改工具清單還得記著改兩處。

**在同一次改動裡給 TUI 加沙箱。** 不予採納，因為這是一個不屬於工具清單改動的獨立決定：TUI 掛的是不受限執行器，替換它們會改變一個既有 surface 做什麼，而非它提供什麼。這個決定需要自己的證據——尤其因為 TUI 沒有 `approval/request` 的應答方，升權請求在那裡會 fail-closed，而不是彈出提示。

**開啟 PTC mode。** 它的信任立場按設計與 bash 同級,工具呼叫要過與 bash 相同的 `tools/pre-execute` 閘門,所以它與上面那些模型寫碼工具不是同一個判斷。在這裡仍被否決:`both` 會改變兩個 surface 上每一個模型可見請求,而 `ptc` 是把線路替換而非加一個——兩者都是呈現方式的決定,不是工具清單的決定。

**預設掛一臺 MCP 伺服器。**否決，因為交付預設值必須點名一臺，而任何選擇都會在每個使用者的機器上、在沙箱之外 spawn 一個第三方子程序。改為交付依賴。

## 後果

同一個模型在兩個 surface 上拿到同樣的工具,那處沒有記錄理由的差異消失了。測試會精確斷言二十個無條件提供的名稱，並把 `glob` 與 `grep` 作為固定成員釘在兩側，因此日後只改一個 surface 都會讓檢查失敗而不是悄悄發出去；[session-search-not-shipped-default 決策](../../archived/feature/2026-08-02-session-search-not-shipped-default.md)正是這樣一次後來的改動，兩個測試也隨之移動。

`apps/cli` 增加了五個 workspace 依賴:四個是交付樹當時掛載的,外加 `dsh-mcp-client`——它並不被掛載,存在的意義是讓已安裝的 `dsh` 能掛。四個保留了下來——[session-search-not-shipped-default 決策](../../archived/feature/2026-08-02-session-search-not-shipped-default.md)把 `@deepseek-ai/dsh-tool-session-query` 連同它的行一起移除了。

執行策略獨立於工具清單。[共享 workspace-write 決策](../../archived/feature/2026-07-31-workspace-write-surface-default.md)擁有兩個 surface 的沙箱執行器與預設權限；更改該策略不會增加或移除工具。
