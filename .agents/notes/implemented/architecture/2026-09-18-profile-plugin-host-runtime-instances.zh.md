# Agent Note: Profile 外掛共享安裝自帶的主機執行時實例

Status: implemented

[English](2026-09-18-profile-plugin-host-runtime-instances.md) | 中文

## Problem

profile 從 npm 裝進來的 out-of-tree 外掛，沿祖先 `node_modules` 鏈解析裸模組名，而 profile 自己那一層位於執行時解析（runtime resolution）的攔截層之上（[解析順序](2026-09-19-profile-resolution-lookup-order.zh.md)）。於是它會為經 `dependencies` 邊到達的每個包各留一份自己的副本，而載入它的 Host 用的是安裝裡那一份。多數包可以容忍這種重複；`@deepseek-ai/dsh-scope` 不能：它用一個模組級 `Symbol('dsh.scope')` 給作用域上下文打標記，並把作用域父鏈和事件載體鍵儲存在模組級表裡，而每個讀標記的註冊表——工具註冊、提示詞 section、MCP 資源、作用域事件——都按同一性比較它。profile 那份副本的 `createScope` 寫下的標記，安裝那份的 `scopeOf` 讀不到，於是本該屬於某個 Agent 的註冊落進了程序全域層。

Issue #4573 就是這個問題在生產裡的形態。當本包經 `dependencies` 到達這兩個執行時時，掛載 Playwright MCP 瀏覽器提供者的 profile 多裝了一份 `dsh-scope`：第一個 Agent 的 MCP 工具註冊到全域層，第二個 Agent 的工具同步撞名，`failOnStartupError: true` 把這次撞名放大成 Agent 建立失敗。把 profile 的包版本對齊到 Host 並不能改變結果，因為無論哪個版本，副本都是第二份模組實例。

## Decision

Out-of-tree 外掛包，凡是跨實例同一性要緊的主機執行時，一律寫成匹配的 `peerDependencies` 與 `devDependencies`，絕不寫進 `dependencies`。Profile 的 pnpm 設定是 `nodeLinker: hoisted` 加 `autoInstallPeers: false`，這類 peer 不會裝進 profile；匯入走到 `$DSH_HOME/profiles/node_modules` 時，由執行時解析（runtime resolution）的攔截層提供安裝裡的那一份實例（[解析順序](2026-09-19-profile-resolution-lookup-order.zh.md)）。

`@deepseek-ai/dsh-scope` 的同一性既在讀取者 `scopeOf`、`carrierKeyOf`、`scopeTarget` 上，也在寫入者 `createScope` 上：標記由寫入者鑄造，再由讀取者比較。`@deepseek-ai/dsh-mcp-client` 同屬這一類，因為它線上的 `serverName` 保留表是模組級的，第二份副本會為同一名稱空間保留第二張表。因此 `@deepseek-ai/dsh-experimental-browser-use-runtime` 把兩者宣告為 peer（並補匹配的 dev 條目），只把不攜帶實例內狀態的 `@deepseek-ai/schemastery` 留在執行時依賴裡。

`tests/shared-host-runtimes.spec.ts` 釘住這個包的分割槽。`tests/host-runtime-duplication.spec.ts` 復現這條規則攔下的問題：兩份包各多一份副本時，每個 Agent 的 MCP 工具都落進全域層，第二個 Agent 的建立被拒；而實際釋出的單實例佈局下全域層為空，兩個 Agent 各拿到自己的用戶端。

[Published dependency faces](../process/2026-08-26-published-dependency-faces.zh.md) 擁有 `verify-package-dependencies`：它的 `peerRequiredHostExports` 表分類了 `dsh-scope` 的讀取者，它的包選擇覆蓋 Client 面的包與一份顯式 Host 名單。該 gate 不選擇 `packages/experimental/` 下的任何包，也沒有分類 `createScope`；gate 覆蓋不到的 out-of-tree 外掛包，由本記錄擁有這條規則。

## Alternatives considered

**把 MCP 用戶端掛到 `agent.ctx`，而不是本包自造的作用域。** 它不成立，是因為 profile 那份副本的 `scopeOf` 同樣讀不到安裝為 `agent.ctx` 寫下的標記，`serverName` 保留會退化成程序全域所有者，第二個 Agent 在那一步就失敗——即 `0.1.6-alpha.1` 上看到的錯誤形態。消除重複副本才是兩種形態共同的修復。

**把 `dsh-scope` 的標記改成 `Symbol.for`，讓兩份副本互相認得。** 這隻修好標記查詢。作用域父鏈與事件載體鍵仍各留一份，一份副本的鏈式遍歷與載體准入看不見另一份記錄的關係——可見錯誤更小，成因更難定位，而且 profile 本不需要的那份重複依然存在。

**把 profile 的包版本對齊到 Host。** 版本相同，兩個目錄依舊載入出兩份模組實例，問題照舊。

## Consequences

- 修復要生效，需要升級並重灌 profile 裡的外掛依賴。在此之前，已裝好的 profile 一直帶著那份副本，Host 側無法補救。
- 這條規則讓外掛依賴「安裝確實帶了這個 peer」。兩個包都是 `@deepseek-ai/dsh` 安裝的依賴，執行時解析能提供它們；若某外掛不在安裝閉包內，它會直接載入失敗，而不是帶著第二份副本啟動。
- `docs/module-graph.md` 把這些邊畫進 peer 區，圖與分割槽表達的是同一條所有權邊界。
- 另有三個實驗提供者（`browser-use-stagehand-native`、`computer-use-cua-driver-mcp`、`computer-use-cua-driver-native`）把 `@deepseek-ai/dsh-mcp-client` 寫成依賴。它們不按 Agent 掛 MCP 用戶端，因此自身不會觸發本決策要防的故障。若一個 profile 把其中之一與本包一起安裝，hoisted 會把那份依賴平鋪到 profile 自己的 `node_modules`，位置高於攔截層，於是本包的 peer 解析到那份副本：兩份 `dsh-mcp-client` 各存一張 `serverName` 保留表，一份上保留的名字在另一份上不再被檢測。作用域標記的分裂不會回來，因為它們都沒有把 `@deepseek-ai/dsh-scope` 寫成依賴。Issue #4628 記錄把這三處宣告改為 peer 並各自驗證的後續工作。
- `verify-package-dependencies` 仍不選擇 `packages/experimental/` 下的包，所以本包的分割槽只由 `tests/shared-host-runtimes.spec.ts` 釘住。擴大該 gate 的選擇範圍，就是本記錄留下的覆蓋缺口。
