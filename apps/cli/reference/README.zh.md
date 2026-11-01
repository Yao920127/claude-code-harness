# `dsh` CLI（命令列介面）行為參考

[English](README.md) | 中文

本參考定義 profile 啟動、外掛管理和設定 dump 等命令模式。argv 由 [`src/args.ts`](../src/args.ts) 統一解析一次，[`src/bin.ts`](../src/bin.ts) 只會動態匯入選中的執行器。

<a id="profile-boot"></a>

## Profile 啟動

`dsh <name>` 是 `dsh --profile <name>` 的簡寫，啟動位於 `$DSH_HOME/profiles/<name>` 的 profile。簡寫中的名稱必須緊跟 `dsh`；`plugin` 仍為外掛管理命令，因此啟動同名 profile 時須使用 `dsh --profile plugin`。生效設定樹以空根節點為起點，依次疊加 profile manifest（中繼資料清單）的 `dsh.profile.bundles` 列表中指定的各組合包 patch、profile 自身的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml`（這是各 profile 共享的機器本地偏好，因此優先於逐 profile 設定層），以及按 argv 順序指定的各個 `--patch <path>` 覆蓋層。對同一設定行，後應用的層優先。patch 會替換目標行的整個 `config` 值，而不是深度合併其中的鍵；patch 也可以插入新行。最終 YAML 組合決定是否由 `dsh-hmr` 監視設定；未啟用 HMR 時，更改需要重新啟動。設定解析、schema 驗證、模組解析或外掛啟動失敗時，系統會報告錯誤並以非零狀態退出。收到 SIGINT 或 SIGTERM 時，掛載的根節點會先 dispose（資源釋放）再退出。

組合包名稱先從 dsh 安裝目錄解析，再從 profile 目錄解析。因此，內建組合包（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-sdk-app`、`@deepseek-ai/dsh-sdk-minimal`、`@deepseek-ai/dsh-acp-app`）始終來自目前執行的 `dsh` 所屬的安裝；樹外組合包來自 profile 中由 pnpm 管理的 `node_modules`。掛載設定行前，launcher 會按此順序遍歷安裝與所選 bundle，並將生成的不可變 runtime resolution 安裝到 Node 的解析器中。啟動不會建立共享或 profile 自有的 fallback 連結。profile 已安裝檔保留原生優先順序；profile 初始化和包管理器寫入與執行時解析相互獨立。

`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` profile 首次使用時會從隨附範本自動初始化（`web`：base + web-app，即時應用 patch；`headless`：base + headless，只在啟動時應用 patch；`sdk`：base + sdk-app，只在啟動時應用 patch；`sdk-minimal`：獨立組合包，只在啟動時應用 patch；`acp`：base + acp-app，只在啟動時應用 patch）。其他缺失的 profile 會顯式報錯，並提示執行 `dsh plugin --profile <name> add <package>`。

`dsh --profile <name> --from-default-profile <template>` 會在啟動前，從上述五個隨附範本之一初始化新的自定義目標。目標名稱不能是隨附 profile 名稱，並且完整的目標 profile 目錄必須不存在。launcher 會以獨佔方式領取該目錄，因此殘留檔案和另一個並行建立者都會在不作修改的情況下被拒絕。它把範本目前的組合包列表複製進一份依賴為空、使用者 patch 為空的新 manifest。它不會讀取 `<template>` 指定的本地同名 profile，不會複製其依賴或 patch，也不會持久化繼承欄位；範本列表之後的變化不會改寫新 profile。複製列表中指名的內建組合包仍從目前 dsh 安裝目錄解析。初始化成功不會增加 launcher 輸出。

profile 已經存在時，`--from-default-profile` 會被拒絕，且不會修改或啟動它；去掉該選項即可使用它。殘留的目標目錄同樣會被原樣保留，此時必須改用另一個 profile 名稱。未知範本或隨附目標名稱會在建立目標之前失敗；未知範本的診斷會列出有效範本。初始化在組合包解析和應用啟動之前提交，因此後續失敗仍會把新 profile 留在磁碟上，重試時需要去掉建立選項。三種設定 dump 模式都接受該選項，並在不啟動應用的情況下初始化目標。

```sh
dsh rescue --from-default-profile web
dsh rescue
```

### 應用參數

啟動器自身的 flag 必須寫在最前面，並在遇到第一個無法識別的 token 時結束；從該 token 開始的所有內容都會透過 `ctx.cmdlineArgs` 原樣交給已啟動的 profile，注入該 profile 的任意應用外掛都可以解析這些內容（[`dsh-cmdline`](../../../packages/boot/cmdline/README.zh.md)）。因此，`dsh rescue --from-default-profile web --no-open` 會先初始化，再把 `--no-open` 交給 Web；`dsh --profile web --port 8080` 會將 `--port` 交給 web 應用；`dsh --profile web --help` 只列印該應用的幫助資訊，不啟動應用；`dsh --help` 沒有可供交付參數的 profile，因此會列印啟動器自身的幫助資訊。`-V`/`--version` 位於應用參數邊界之前時，會列印啟動器的版本。

每套組合只會掛載一次。普通外掛注入 `cmdlineArgs`，解析所屬應用的參數，並將解析結果作為服務提供。每個從 flag 取值的設定行都會注入該服務；Loader 會等到服務啟用後，再對該行的設定求值（`port: !!js ctx.webStartup.port ?? 3080`），因此 flag 的優先順序高於設定行中寫明的值。要維持這一優先順序，設定行必須保留該表示式；如果使用者 patch 用字面量替換整個 `config`，也會隨之移除執行時讀取。幫助參數和被拒絕的參數都會請求退出：參數被拒絕時以非零狀態退出，顯示幫助時以 0 退出；依賴該提供者服務的設定行不會啟用。啟用 HMR 時，編輯 patch 檔案會根據仍在執行的服務重新計算表示式，因此不會重置目前正在使用的埠。

啟動器的 flag 必須寫在應用參數之前，且啟動器的解析器會消耗掉一個 `--`：必須以字面量 `--` 送達應用的參數需要寫成 `-- --`。`plugin` 僅在緊跟 `dsh` 時選擇外掛管理命令；選定 profile 後，`plugin` 和 `web` 都是普通應用參數。應用參數開始之前，重複指定 `--profile` 會被拒絕，包括簡寫後再指定 `--profile` 的情況。`ctx.cmdlineArgs.get()` 是共享的不可變讀取：多個外掛可以解析同一份快照，沒有讀取方的 profile 則會忽略自己的應用參數。

隨附的應用接受以下命令列參數：

| Profile | 參數 |
|---|---|
| `web` | `--host`、`--port`、可重複的 `--trusted-host`、`--no-open` |
| `headless` | 任務文字，作為位置參數 |
| `sdk` | 無選項；stdio 攜帶 JSON-RPC 協定 |
| `sdk-minimal` | 無選項；stdio 攜帶相同的 JSON-RPC 協定 |
| `acp` | 無選項；stdio 攜帶 ACP（Agent Client Protocol） |

一次性任務（`dsh --profile headless "run the tests"`）透過核心註冊表建立一個全新的持久化 Agent（智慧代理），提交任務、等待完全停穩並對工作階段執行 flush，再從其持久化事件區間中推導最後一個非空 assistant 文字與最終 `turn/end` 原因。它在 `dsh: reasoning:` 標題下將非空的提供者推理（reasoning）增量流式寫入 stderr，只在 stdout 列印最終文字，並在原因為 `completed` 時以 0 退出，否則以 1 退出；沒有推理內容的成功回應會保持 stderr 為空。沒有任務的呼叫是該應用的用法錯誤。隨附 headless profile 不掛載瀏覽器 Connection、HTTP 伺服器、Web 執行時或瀏覽器用戶端，也不會開啟監聽埠。

可在不啟動的情況下檢查組合出的設定樹：

```sh
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
```

`--dump-default-config` 只列印組合包各層；`--dump-config` 額外加上 profile 的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml` 和 `--patch` overlay。兩者都會列印註解，標明每行由哪個檔案提供，以及哪些 overlay 修改過它；`!!js` 表示式保持未求值，插入行中的相對外掛名以各自 patch 檔案所在目錄解析，找不到目標的 patch 會報告到 stderr。dump 操作會初始化缺失的 profile 檔案。它不會執行應用的命令列參數提供者，因此展示的是解析任何應用參數之前的組合設定樹；如果呼叫中包含應用參數，dump 會拒絕該呼叫。

<a id="config-schema-dump"></a>
### 設定 schema dump

`--dump-config-schema` 使用與 `--dump-config` 相同的組合包、profile、home 和 argv patch 層，支援可重複的 `--patch` 與 `--from-default-profile`。三種 dump flag 互斥，並拒絕應用參數和保留的 `desktop` profile。組合成功後，stdout 輸出一份縮排排版的 JSON Schema 2020-12 文件。根 schema 描述 `--dump-config` 輸出經解析後的 entry list；`$defs.patchList` 單獨描述 profile/home/CLI overlay。驗證該片段時應保留文件的 `$defs`。準備、patch 解析/組合或解析器設定失敗時，以非零結束代碼結束，不輸出 schema。收集或投影失敗時保留部分輸出並退出 1；診斷也會輸出到 stderr。即使 stdout 中的 schema 有效且可用，`partial` 投影或省略非 JSON 註解也適用此結束代碼。schema dump 的未匹配目標警告不包含層標籤；需要來源標籤時，使用相同設定層執行 `--dump-config`。

外掛 Config 的欄位、預設值、描述及支援的約束從原生 Schemastery 宣告投影。普通欄位內聯，共享 Config 和遞迴使用 `$ref`。JSON Schema 的預設值是註解，不執行填值。必填欄位會考慮 Schemastery 的 nullable fallback 能否透過驗證。聯合型別使用 `anyOf`，而原生執行仍選擇首個成功分支。`secret`、`credential-ref`、`ms` 等 role 元資訊及 `volatile` 即時更新元資訊保留在 `x-cordis` 註解中。非法 volatile 巢狀屬於 schema 定義錯誤；欄位輸入型別不會變成引用物件型別。回呼驗證、不支援的正則語義及其他未投影約束會標記為 partial，而不是靜默丟棄。非有限數邊界和非 JSON 預設值/展示註解會被省略並附上限制說明，結構欄位仍可用。物件常數保留普通 nullable 成員約束，但繼承屬性的比較會標記為 partial。無法表示的預設值、不支援的交集及無法求解的遞迴預設值依賴保留未知的省略行為，仍需原生驗證。

使用 Cordis entry-list 方言解析 YAML：`!!js` 標量變為不執行的 `{ "__jsExpr": "..." }` 標記。普通 Config 值和 entry 的 `disabled` 接受這些標記，但不求值其結果。Group 列表和 Include 欄位保持字面量。entry id 可省略；缺少非空 id 的非 insert patch 被接受為無操作，並由 Loader 警告。停用項可以省略必需的 Config，除非 `group: true` 強制啟用；disabled 表示式也使省略行為留待執行時決定。已提供的 Config 值仍接受驗證。`disabled` 接受布林值、null 和表示式標記；Loader 會把其他真值強制視為停用，但此 schema 拒絕它們。未設定 `group: true` 的停用 group 或 include 的子項不接受驗證，因為 Loader 從不建立它們。停用的 `group: true` 行之下的子項，以及插入到停用 group 的 patch，都按啟用狀態驗證，儘管 Loader 不會初始化祖先被停用的子項。已知根樹目標驗證完整 Config 替換，而不是深層 partial 物件。不推斷 Include 內部 id，也不推斷前序 patch 新增或改變的順序相關目標。未知外掛名保持開放；同名外掛解析出不同 schema 時，使用聯合約束並報告歧義。

根 `x-cordis` 註解包含 `profile`、`complete`、`entries`、`diagnostics` 和 `patchSchema`。設定項按遍歷順序保留 `path`、可選 `id`、`name`、`status` 和 `configRef`；狀態為 `schema`、`partial`、`absent`、`unsupported` 或 `error`。可選的 `tree: "group" | "include"` 標識原生承載外掛：它們可能因未匯出 Config 而具有 `status: "absent"`，但 `configRef` 指向 Loader 結構定義。被檢查的非法條目會獲得帶位置的錯誤，不丟棄有效的相鄰條目；沒有字面量名稱時省略 `name`。列表容器非法或 include patch 組合失敗時，在承載條目上報告診斷；組合失敗後該 include 的子項不可用，不會把未應用 patch 或過濾後的子項當作最終結果。未設定 `group: true` 的停用承載條目可以省略 config，並記錄為沒有子項的樹。投影限制會在共享該 Config 的每個條目上重複報告。Config 缺失表示欄位未知，不表示禁止設定。group 子項的發現路徑追加 `/config/<index>`，include 子項追加 `/include/<index>`；後者不是根 dump 中的 JSON Pointer。存在錯誤診斷、`partial`/`unsupported`/`error` 條目，或同一外掛名對應多個 Config 定義時，`complete` 為 false。此參考覆蓋所有宣告，包括停用項：它們的匯入或 include 失敗可能使可啟動的 profile 也被標為不完整。執行時生成的 preset/用戶端樹及外掛啟動檢查不屬於此參考範圍；反過來，`complete` 也不保證啟動成功。

可能修改輸入的前序 union 分支，以及可能改名或碰撞的字典鍵，需要放寬驗證。Lazy 中繼資料傳播可能影響目前 Config 之外的共享節點，因此該 Config 保留可獲得的宣告細節，同時增加不受限制的備選項，而不模擬原生修改。這些情況標記為 partial，仍需原生驗證。

收集會匯入可信模組，也可能呼叫 Config getter 和 lazy builder，但絕不應用外掛、執行 transform 回呼或求值設定表示式。匯入可能在輸出前後阻塞或保留程序控制代碼；自動呼叫方應設定外部超時。dump 不強制退出，也不持有匯入期間資源的釋放職責。匯入或 builder 對 stdout 的常規寫入轉向 stderr；直接寫檔案描述符不被攔截。profile 準備保留 YAML dump 的初始化寫入。輸出只有 schema 宣告，沒有實際設定值；宣告的預設值和外掛原始錯誤仍可能含敏感資料，分享前應檢查。收集器 API 參見 [app-boot](../../../packages/boot/app-boot/README.zh.md)。

輸出是可重新生成的 pre-stable 參考，不是單獨版本化的持久化目錄。`$schema` 標識 JSON Schema 驗證方言；`x-cordis` 隨 dsh 版本演進。更改 dsh 或外掛後應重新生成，並跟隨 `$ref` 和 `configRef`，而非硬編碼定義名、順序或文字。不相容的方言變更使用新的 `$schema`；註解變更不採用 Session 格式遷移。

<a id="startup-diagnostics"></a>
## 啟動診斷

必需外掛啟用失敗時，CLI 先輸出失敗外掛及其原始堆疊，再列出等待中的外掛和缺失服務。等待列表中的必需外掛排在前面。末尾的 `Full diagnostics:` 行指向直接位於 `$DSH_HOME/logs/`（預設 `~/.dsh/logs/`）下的唯一 `startup-<timestamp>-<uuid>.log` 檔案。CLI 完成報告和 stderr 寫入後會明確以結束代碼 1 結束，即使外掛仍有開啟的控制代碼；不會覆蓋以前的報告，也不會自動刪除它們。

報告包含 DSH 和 Node 版本、平臺、profile、根設定路徑、每個未啟用外掛的模組與狀態、原始錯誤，以及啟動期間的警告和錯誤參數，包括尚無 Fiber 的匯入錯誤。Node 檢查輸出保留巢狀原因、聚合成員、迴圈引用、不可列舉屬性和 Symbol 屬性，並關閉深度、字串及陣列長度限制。自定義檢查函式被停用，存取器只描述而不求值。收集器包含失敗後的非同步清理日誌，並在啟動結算後停止。它不會獨立於已記錄錯誤額外收集環境變數或設定內容。外掛原始錯誤可能包含設定或憑證值；報告開頭會提醒讀者在分享前檢查內容。報告不脫敏。

在 POSIX 上，新目錄和檔案分別請求 `0700` 和 `0600` 權限。CLI 僅在寫入成功後輸出檔案路徑。如果日誌目錄或檔案無法寫入，stderr 會包含寫入錯誤及完整報告，結束代碼仍為 1。只有可選外掛啟用異常時，維持正常警告輸出，不建立報告。

## 外掛管理

`dsh plugin --profile <name> <args...>` 在 profile 缺失時先初始化它（有隨附範本的用範本，其他名稱只裝 `@deepseek-ai/dsh-base`），然後以 profile 目錄為工作目錄，把 `<args...>` 轉發給 `pnpm`：`add`、`remove`、`why`、`update` 及其他所有 pnpm 子命令都照常可用；pnpm 必須在 PATH 上。相對路徑 spec（`.`、`../plugin` 及其 `file:`/`link:` 形式）會先錨定到呼叫目錄，因此在外掛 checkout 中執行 `add .` 安裝的是該 checkout，而不是 profile。每次成功執行後，系統都會根據目前安裝狀態更新 `dsh.profile.bundles`：如果某項依賴解析到的包在 manifest 中宣告瞭 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，該依賴就會加入設定層棧；如果某項依賴在 `update` 後獲得該宣告，也會隨即啟用。沒有組合包宣告的依賴仍作為普通依賴保留，並顯示一次性警告；已移除的依賴則從設定層棧中刪除。

Codex 與 Claude Code subagent 提供者是兩個彼此獨立的可選組合包。可以只新增一個包、在同一命令中新增兩個包，或獨立移除任一包：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
```

pnpm 操作成功後會改變磁碟上的 Profile manifest 與組合包列表；正在執行的 Profile 會保留本次啟動時的組合包集合。新增、移除或更新組合包後須重新啟動該 Profile。這個啟動邊界只適用於組合包成員變化，Profile 或 home 中普通 `cordis.patch.yml` 的編輯透過熱過載生效。下一次啟動時，每個已安裝組合包只註冊自己的休眠 Host 提供者；還須在複製出的 Preset 中單獨啟用對應工具行，新 Agent 才能看到該工具。[Codex provider README](../../../packages/subagent/subagent-codex/README.zh.md) 與 [Claude Code provider README](../../../packages/subagent/subagent-claude-code/README.zh.md) 負責可執行檔案、身份驗證、載荷與失敗細節；[base 組合包參考](../../../packages/bundle/base/README.zh.md) 負責預設依賴閉包。

```sh
dsh plugin --profile tui add github:deepseek-harness/turtle-ui
dsh plugin --profile tui remove turtle-ui
dsh --profile tui
```

隨原始碼釋出的 Git 託管外掛會在安裝期間透過 `prepare` 腳本建置，而 pnpm ≥10 預設會阻止該腳本，直到使用方明確允許。首次執行 `add` 會失敗，並顯示 pnpm 的 `allowBuilds` 提示；dsh 還會提示應修改該 profile 的 `pnpm-workspace.yaml`。將輸出的鍵複製到該檔案後，重新執行命令即可。安裝已經建置好的 tarball 或本地 checkout 時，無需加入 `allowBuilds`。

## Web Profile

`dsh web` 使用 profile 簡寫。啟動器先解析自身的 flag，其餘 flag 屬於 web 應用，由組合包中的普通提供者解析。`--host` 和 `--port` 覆蓋承載它們的那些行的組合取值，可重複的 `--trusted-host` 透過 `ctx.webRuntime.trustedHosts` 提供本次呼叫的 authority（部署表示式會拼接自己的 authority），`--no-open` 則只對本次呼叫關閉預設瀏覽器交接。用戶端外掛 HMR（熱模組替換）接收器始終掛載，在 `pnpm run dev:web` 重建用戶端 bundle 之前保持空閒；該命令先建置一次，再啟動這同一個啟動器並持續重建用戶端 bundle，加 `--no-serve` 則只執行 watcher、配合別處啟動的 `dsh web`。

```sh
dsh web
dsh web --no-open
dsh web --patch ./extra.cordis.yml
dsh web --dump-config
dsh web --help
```

生產 Web 執行器需要已建置的包和前端產物（`pnpm run build`）。預設服務地址是 `http://127.0.0.1:3080`；本機啟動時，只在完整 Loader 設定樹結算後才用預設瀏覽器開啟該規範主機 URL。繼承的 `SSH_CONNECTION` 或 `SSH_TTY` 非空時會跳過瀏覽器交接，因為本地轉發地址由 SSH 用戶端或編輯器持有；主機 URL 仍會列印。CLI 有意不支援 `--host 0.0.0.0`，並會以用法錯誤退出。本機交接前會列印英文提示 `dsh web: opening the default browser; pass --no-open to disable`；若作業系統交接失敗，stderr 診斷會說明原因、給出 URL 供手動存取，伺服器仍繼續執行。`--trusted-host` 可新增 `/api` 瀏覽器信任圍欄接受的具名 authority。

程序關閉時，外掛樹最多有 5 秒完成 dispose。首次收到 `SIGINT` 或 `SIGTERM` 時會開始優雅排空：`SIGTERM` 是監督程序發出的常規停止請求，在所有執行模式下都以 0 退出；`SIGINT` 則報告 130。第二次收到訊號時會立即強制退出。如果一次性執行在正常結束時已經卡在 dispose 階段，第一次按下 `Ctrl+C` 就會直接升級為強制退出，而不會被忽略。

基於 base 的模式都將執行命令時所在的目錄作為預設 workspace 根目錄，以 65,536 位元組渲染預算載入適用的 `AGENTS.md` 或 `CLAUDE.md` 指令，並使用記憶體 SQLite 工作階段內容索引。獨立的 `sdk-minimal` profile 把執行命令時所在的目錄作為沙箱策略根目錄，但刻意省略檔案系統工具、指令發現與 SQLite。啟用的 HMR 外掛會監視 profile 與 home 兩個 `cordis.patch.yml` 設定層的有效變更，並以事務方式重新應用；未啟用 HMR 時只應用一次。一次性執行模式透過有界關閉流程退出，該流程會 dispose 所有即時監視器。

基於 base 的 profile 中，新工作階段預設使用 `workspace-write` 權限預設。Bash 和檔案系統修改僅限於工作階段 workspace 與平臺臨時根目錄；讀取和網路存取不受限制，程序可見性則取決於所選沙箱後端——bwrap 在私有 PID 名稱空間中執行命令並隱藏主機程序，Landlock 與 Seatbelt 保持主機程序可見性不變。`DSH_PERMISSION_MODE` 更改程序後備值。General settings 中儲存的權限影響後續 Web 工作階段，不改變已開啟的工作階段。獨立的 `sdk-minimal` 設定樹則固定為 `danger-full-access`，且不掛載 approval 或權限 settings 服務。

`DSH_TOOLS_MODE` 為程序選擇 `native`、`ptc` 或 `both`；其他值會導致啟動失敗。隨附的 `minimal` agent preset 會保留該部署的呈現方式，將完整系統提示詞固定為 `You are a helpful software engineer assistant.`，並且僅組合按平臺選擇的持久 shell。建立 Web 工作階段時請選擇極簡模式；該 agent 不包含任何其他提示詞段落或面向模型的外掛，而共享的瀏覽器、workspace、持久化、沙箱與權限主機保持不變。

## 共享部署行為

基礎組合包掛載原生 DeepSeek 介面卡、settings 與憑證提供者、穩定的 `web_search` 和 `web_fetch`、僅限公網的 HTTP fetch 提供者，預設開啟的 DeepSeek 工作階段日誌上傳，以及面向所有使用者的回饋門控 OTel 上傳。提供者憑證依次從繼承環境、`$DSH_HOME/.credentials.yaml`、呼叫目錄的 `.env` 和 `$DSH_HOME/.env` 解析；受管文件從不物化進 `process.env`，而兩個 `.env` 檔案都是普通啟動環境層。搜尋使用 `DEEPSEEK_API_KEY` 並接受 `DEEPSEEK_SEARCH_BASE_URL`。已啟用的抓取呼叫會在所有 sandbox 與審批模式下執行，無需逐次確認；提供者會在連線前拒絕非公開目的地址。Web app 會停用 base 工具設定項，再透過 `cordis`、`ptc` 與 `standard` agent preset 暴露相同工具。

回饋記錄在工作階段日誌中，不會啟動模型工作。[DeepSeek 工作階段日誌貢獻器](../../../packages/session/session-log-deepseek/README.zh.md)預設隨後續 DeepSeek 請求傳送尚未確認接收的完整日誌字尾，包括經已設定閘道傳送的請求；將其 `enabled` 設定設為 `false` 可關閉上傳。[OTel 工作階段上傳](../../../packages/session/session-telemetry-otel/README.zh.md)適用於所有使用者和提供者，包括 `deepseek-official`，無需請求頭。基礎設定預設使用 `FEEDBACK_ONLY`：新的自身文字回饋、訊息評分、編輯與撤回會釋放截至該事件的完整規範日誌字首，包含儲存的上下文；後續記錄等待下一次顯式回饋。繼承的父級回饋不構成 fork 的授權。請求、恢復、掛載和 HMR 不觸發捕捉。SDK 批處理可完成已授權上傳，無需進一步互動或模型工作。`DSH_TELEMETRY_MODE=DISABLED` 禁止 OTel 投遞；`FULL` 被拒絕，任何非空的 `DSH_TELEMETRY_DISABLED` 都會停用其設定行。`DSH_TELEMETRY_OTLP_URL` 選擇採集端。交接盡力而為，不代表採集端接受；不提供持久化 outbox 或重試保證。這些 OTel 設定不會開啟或關閉 DeepSeek 貢獻。兩條路徑都不改變模型輸入，但匯出可能包含訊息文字、工具參數和結果，以及工作區路徑。

透過 `dsh plugin --profile <name> add <package-or-git-spec>` 安裝外部外掛組合包。安裝的包擁有其依賴，並貢獻其宣告的 `cordis.patch.yml` 層。CLI 還隨附 `@deepseek-ai/dsh-mcp-client` 作為供 patch 層使用的依賴，但預設不啟用 MCP 伺服器，因為每條伺服器命令都是 agent 沙箱之外的受信任可執行程式碼。

<a id="source-execution"></a>
## 原始碼執行

請在儲存庫根目錄中，於全新 checkout 之後及產物需要更新時單獨執行 `pnpm run build`，然後使用 `pnpm dsh <args...>`。`package.json` 中的腳本不會建置，而是透過 `node --import tsx/esm` 啟動 `apps/cli/src/bin.ts`，並轉發所有參數。Typert Host 產物缺失時，profile 啟動會因不含建置指引的模組解析錯誤而失敗。這些 Host 產物存在後，如果前端或 Client plugin 組合包缺失，啟動會失敗並提示執行 `pnpm run build`。啟動器不會檢查產物是否為最新，因此已有的陳舊組合包可能繼續執行舊版瀏覽器程式碼，直至重新建置。該程序會繼承啟動環境，且 `runProfile` 會在任何 entry 掛載之前從該快照解析出站代理，因此 `HTTP_PROXY`／`HTTPS_PROXY`（以及寫在 `.env` 層中的代理）無需任何額外開關即可生效。原始碼入口顯式選擇連結式 profile 解析，使 tsx workspace 匯入與 profile 外掛共享模組身份。安裝形式會使用 runtime profile 解析直接啟動建置後的 `apps/cli/lib/bin.js`，不會重新建置儲存庫。
