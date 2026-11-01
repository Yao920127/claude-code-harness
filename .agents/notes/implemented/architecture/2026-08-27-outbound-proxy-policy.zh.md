# Agent Note: 一份出站代理策略，在任何請求發生之前裝好

Status: implemented

[English](2026-08-27-outbound-proxy-policy.md) | 中文

## Problem

Node 內建的 `fetch` 會忽略 `HTTP_PROXY` 與 `HTTPS_PROXY`。開發者執行的其他工具——curl、git、npm、pip——都遵循它們，所以代理後面的使用者匯出一次變數就期待一切隨之生效。Harness 並沒有：`setGlobalDispatcher`、`ProxyAgent` 與 `EnvHttpProxyAgent` 在 `packages/` 與 `apps/` 中出現次數為零，因此模型請求、每次 web 搜尋、`web_fetch`、走 HTTP 的 MCP 與 OTLP 匯出器全部直連，且是靜默的，任何地方都沒有診斷。

儲存庫曾短暫擁有過答案，又在無人察覺時弄丟了。PR #971 在 `bin/dsh` 裡設定了 `NODE_USE_ENV_PROXY=1`；十一天後的“cleanup: remove managed source installer”改動整體刪除了那個啟動器，把該標誌一併帶走。留下的只有 `apps/cli/reference/README.md` 裡的一句話，讓讀者去設定一個已經無人消費的變數。

即便照做，那句話也不可能生效，原因有三條且都經過實測。`NODE_USE_ENV_PROXY` 在程序啟動時對環境取快照，而 `loadLayeredEnv()` 是在之後才合併 `.env` 層，因此寫在 `$DSH_HOME/.env` 中的代理對它不可見。它只覆蓋 Node 24.0+，在 22 線上只覆蓋 22.21+——而 `engines` 允許 `^22.19.0`，那裡根本沒有這個變數，設定了也不會有任何警告。它也完全觸及不到 `web-fetch-http`：該提供方向 `fetch` 傳入自己的 `dispatcher`，而顯式 dispatcher 無論標誌如何都會覆蓋全域的那個。

## Decision

**一份策略，從啟動環境解析一次，裝為全域 dispatcher。** `packages/util/http-proxy` 解析出 `ProxyPolicy`，並在 `runProfile` 中於環境快照提供之後、任何 entry 掛載之前完成安裝。Node 的 `fetch` 解析的正是 undici 的全域 dispatcher，因此每一處普通 `fetch()` 以及每一個最終落到 `globalThis.fetch` 的 SDK 都無需改動即被覆蓋——撰寫時是九個呼叫點，未來新增的也自動覆蓋。`loadLayeredEnv` 只有一個呼叫方，且 `apps/web` 不提供 bin，因此這一處即覆蓋全部 profile，包括不疊加 `base` 的 `sdk-minimal`。

解析讀取的是啟動器的快照而非 `process.env`，這正是讓 `$DSH_HOME/.env` 中的代理生效的原因——也是環境變數方案不可能具備的能力。僅限該檔案：`loadLayeredEnv` 拒絕專案 `.env` 裡的代理名，正如它在那裡拒絕 `PATH` 或 `NODE_OPTIONS`，因為那個檔案隨 clone 一起到來，不得替 Harness 選擇路由。home 檔案僅對這四個代理名豁免，而 `DSH_HOME` 本身是 bootstrap-only，因此沒有任何 `.env` 能把這份豁免指向儲存庫控制的目錄。

**放在 `util/` 的庫，而非外掛。** 傳輸策略每個程序只有一個答案：沒有可替換的實作，也沒有比程序更窄的作用域可賦予。因此本包只匯出函式、不掛載任何東西——`boot`、`web`、`subprocess` 與 `workflow` 都消費它，而 `util/` 正是其他所有組都可以依賴的那一組。

早先的修訂把它放進新建的 `net/` 包組，理由是依賴 `undici` 使它不符合“零依賴”組。那個理解是錯的：[優先使用依賴而非手寫](../process/2026-07-26-dependencies-over-hand-rolling.zh.md) 記錄了該章程約束的是 *harness* 依賴——util 不依賴它們，任何組才都能依賴 util——並不禁止外部包。真正需要去掉的是對 `dsh-launch-environment` 的依賴：解析只用到它的一個方法，於是改為宣告結構化的 `EnvLookup`，啟動器原樣傳入自己的快照即可。

那次修訂一併引入的外掛也隨之刪除。它讓某個組合可以把策略寫進 `cordis.yml`，但沒有任何隨附 bundle 掛載它，因此啟動器那條路徑是唯一可達的——而它的 `Config` 是那條設定分支唯一的供給方，別處無從到達。

**每種呼叫需求對應一項操作。** `installProxyFromEnvironment`、`proxyRouteFor`、`proxyEnvironmentForChild` 與 `clearedProxyEnv` 分別負責安裝、逐請求路由、子程序繼承和 fixture 隔離。特定於 SDK 的工廠會透過共享 API 暴露各自的傳輸約束。`web-fetch-http` 在建構地址固定傳輸時使用已解析路由；OTLP 匯出器保持直連。安裝檔含解析與診斷上報，因為呼叫方需要一項同時解析並安裝路由的操作。

`proxyRouteFor` 還堵掉了舊存取器讓人寫得出來的一個缺陷。`web-fetch-http` 先讀策略決定是否 pin，再讀一次去建構傳輸；兩次讀取之間發生解除安裝，就會為第一次讀取已判定走代理的 URL 返回一個直連且未 pin 的 agent。路由把兩者一起交出，分支與請求便無從分歧。它攜帶的是程序級 dispatcher，dispose 時是 close 而非 destroy，因此策略被解除安裝時已經發出的請求仍會跑完。

**已安裝的 dispatcher 按策略路由，而不是重新解析一遍環境。** 安裝過程建構一個 `Agent`，其按 origin 呼叫的 `factory` 會詢問 `proxyForUrl` 該 origin 的去向，並據此返回 `ProxyAgent` 或 undici 自帶的預設用戶端。undici 的 `EnvHttpProxyAgent` 曾是首選，但對這套策略是錯的：沒有 `HTTPS_PROXY` 時它會把 HTTPS agent 設為 HTTP agent，於是本包在拒絕某個 SOCKS 或畸形 URL 後本應保持直連的 scheme 仍會被隧道轉發，而診斷卻聲稱直連。讓路由走同一個謂詞，從建構上而非靠測試消除了這一類分歧。把策略釋出到環境中的做法保留下來，但如今只服務一類讀者：派生的子程序——它沒有策略物件可查。

這樣 `proxyForUrl()` 與 dispatcher 就從同一組值給出答案。兩者必須一致：一旦對某個 URL 產生分歧，`web-fetch-http` 就會把 dispatcher 本打算隧道轉發的連線固定到某個地址上。

**解析補上 Node 與 undici 都不提供的部分。** `ALL_PROXY` 為兩種協定後備；空值視為未設定，因為 undici 的 `??` 鏈會讓空的小寫名遮住有值的大寫名；loopback 始終繞過，否則 Web UI、Connection 傳輸以及每一個本地測試伺服器都會經由代理並形成迴環。繞過列表同時攜帶 `::1` **與** `[::1]`：undici 自帶的匹配器會把裸寫的 `::1` 讀成主機 `:` 埠 `1`，從而永不豁免它。

**拒絕是靜默的，且絕不為被拒協定改道。** 使用者填寫而被本包拒絕的槽位，會讓該協定保持直連，而不是繼續退回到 `ALL_PROXY` 或 HTTP 代理，從而讓診斷與實際路由一致。SOCKS URL、無法解析的字串或不受支援的協定，會在 stderr 上報告並跳過——該變數可能是為其他工具匯出的，它的筆誤不應阻止 agent 啟動。環境是唯一來源，因此不存在一個本應適用 `AGENTS.md` 「設定錯誤必須響」規則的設定面。

**經由代理時，`web_fetch` 不再解析與固定地址。** 該提供者會驗證一組公網地址並把連線固定到其上。經由代理時沒有可固定的物件——origin 的 DNS 由代理執行——而固定後的直連會徹底繞開代理。因此代理轉發的一跳跳過解析，設定代理即表示信任該代理進行目的地選擇。被策略繞過的一跳，包括每一個 loopback 與每一條 `NO_PROXY` 條目，仍走原有的解析並固定路徑。Kimi Code 與 Claude Code 各自獨立得出了同一結論。

URL 層策略未受影響：僅 `http(s)`、禁止內嵌憑證、長度上限與跨域重定向拒絕在每一跳上依然生效。

**普通子程序接收代理策略；PTC 程式環境省略它。** `proxyEnvironmentForChild()` 併入 `scrubbedParentEnv()`。PTC 也執行工作流腳本，並從程式環境中排除這些設定，因為代理 URL 可能攜帶 `user:password`；程式的直接請求採用直連。

子程序拿到的是使用者自己的值，而這恰恰曾把它弄壞。Node 在 `NODE_USE_ENV_PROXY` 下會在執行程式之前先解析 `HTTP_PROXY` 與 `HTTPS_PROXY`，遇到 `http:`/`https:` 之外的協定直接退出；於是一個為 `curl` 保留的 `socks4://` 會讓每個 Node 子程序——MCP server、subagent CLI、`npm`——在第一行之前就終結，而本程序此前只報告過該協定保持直連。在 Node 24.17 上實測：`socks4://`、`ftp://` 與畸形值均以 1 退出；`socks5://` 恰好在該版本被接受。現在只要子程序收到的某個值是本包拒絕過的，就扣下該標誌，這樣的子程序直連，`curl` 仍讀到為它保留的值。若改為把解析後的值交給子程序，Node 固然能繼續走代理，代價卻是悄悄改寫使用者為另一工具設定的值。

這接受了一處已記錄的接縫。此類上下文按 Node 自己的規則匹配繞過條目，其分隔符與 IPv4 區間支援與本包不同，且該標誌僅存在於 Node 22.21+ 與 24+。

**SDK 傳輸需要獨立驗證。** OTLP 匯出器在 Node 上選擇 `http-exporter-transport`，透過 `node:http` 投遞並繞過全域 fetch dispatcher；其瀏覽器實作中的 `globalThis.fetch` 引用不能證明 Node 路由。[E2B 移除決策](../simplification/2026-09-11-remove-e2b-providers.zh.md)撤下另一項 SDK 傳輸整合，但不改變這一要求。

**遙測的直連是有意為之。** 要讓它走代理只有兩條路，代價都超過這條通道本身的價值。`http.Agent` 透過 `proxyEnv` 讀取環境，而該選項自 Node 22.21 與 24.5 才有——落在 engines 範圍之內，因此 22.19、22.20 與 24.0–24.4 無論如何仍是直連，而代理包還得為一條只在部分執行時生效的路徑保留 `createNodeHttpAgent` 匯出。改用 SDK 的 `fetch` delegate 替換傳輸可以覆蓋所有執行時，但該 delegate 沒有壓縮能力，而隨附的 `base` bundle 啟用了 gzip：實測一批真實規模的 OTLP 資料啟用後體積只有 1/6.4。曾有一版轉而在載入期拒絕 `exporter.compression`，結果凡是啟動隨附 bundle 的測試全部失敗；另一版在 serializer 處 gzip 確實能跑通，但代價是把傳輸層程式碼塞進了遙測外掛。

與之相比，遙測是唯一一條丟失了對使用者毫無代價的出網通道：沒有任何工具、模型請求或工作階段依賴它，而連不上的匯出本就被靜默丟棄。處在強制代理後的使用者，只是停留在本次改動之前的狀態，而不是被弄壞。`egress.spec.ts` 現在斷言這一排除——若某次 SDK 升級把匯出器挪到 `fetch` 上，遙測就會開始靜默走代理，而該案例正是讓這件事暴露出來的東西。

**每個出網點都配有出網測試。** 各所屬包中的 `egress.spec.ts` 透過假代理驅動實際傳輸，並檢查觀察到的路由。這些測試覆蓋搜尋後端、pi-ai 發現、走 HTTP 的 MCP、子 Node 程序、worker 執行緒和遙測的直連例外。它們可發現靜態呼叫點檢查無法觀察到的依賴傳輸變化。

**用門禁防止該缺陷復現。** `verify-no-bare-dispatcher` 解析 TypeScript AST——`scripts/AGENTS.md` 要求 source-ownership 門禁使用語法感知發現，而逐行正則漏掉了本儲存庫已在使用的 `{ dispatcher }` 簡寫，以及重新命名匯入後的 `new Alias(...)`。它在所屬包之外拒絕 undici agent 建構與顯式 `dispatcher` 選項。`proxyRouteFor(url)` 是受支援的替代；唯一一處確實自有傳輸的呼叫點——`web-fetch-http`，它把請求釘在已驗證的地址上——用 `proxy-exempt:` 註解說明。這條規則之所以存在，是因為 `web-fetch-http` 裡原本那行 `new Agent` 在寫下時完全合理——那時根本還沒有代理這回事，也沒有任何機制會攔下它。

## Alternatives considered

**只寫文件，讓使用者設 `NODE_USE_ENV_PROXY=1`。** 基於上文三條實測被否決：對 `$DSH_HOME/.env` 不可見、在最低支援的 Node 上不存在、且無論如何被 `web-fetch-http` 繞過。而這恰恰是儲存庫此前聲稱的做法。

**把策略值傳遞到每一個呼叫點。** DeepSeek-Reasonix 在 98 處這樣做，換來每提供者的 opt-out。被否決：該能力服務於本 Harness 並不具備的需求，而手工改九處意味著第十處會被遺忘——Pi 的變更日誌正記錄了 OAuth 與 Bedrock 兩次事後補漏。它關於隔離性的論點確實成立，本方案改為顯式處理 worker 執行緒、並以「dispose 後還原前一個 dispatcher」的斷言來回應。

**`http.setGlobalProxyFromEnv()`。** Node 自帶的程式化開關同時覆蓋 `fetch` 與 `node:http`，並返回還原函式——正是 `ctx.effect()` 想要的形態。不可用：`added: v24.14.0`，22 線上完全沒有。若 `engines` 日後升過該版本，值得回頭替換。

**用 `undici.install()` patch `globalThis.fetch`。** Pi 這樣做，是為了讓 fetch 與 dispatcher 處於同一個 undici——較新 Node 的內建 fetch 經 userland dispatcher 處理壓縮回應時會出錯。此處被否決為投機性複雜度：本儲存庫 `engines` 的上限尚未觸及該執行時。

**做成能力接縫。** 被否決。Service Definition／Provider／Consumer 用於可替換後端；這裡每個程序只有一種實作、一個答案。若日後要支援作業系統代理或 PAC，`resolveProxyPolicy` 就是擴充功能點。

**讀取作業系統的代理設定。** 本次變更中被否決。所調研的六個產品中只有 Codex 與 Reasonix 這樣做，且 Codex 把它放在預設關閉的開關之後。在作者機器上實測，它什麼也讀不到：代理軟體把設定寫在了 Wi-Fi 服務上，而主介面是一塊沒有代理的 USB 乙太網卡，因此 `scutil --proxy` 報告無代理，而匯出的環境變數卻工作正常。它還需要自帶的繞過匹配器，因為作業系統的列表含有 undici 與 Node 都不匹配的 CIDR 條目。

**也把代理設定交給模型編寫的程式碼。** 不採納，因為代理 URL 可能攜帶憑證。PTC 程序（包括工作流執行）不在程式環境中提供這些設定；直接網路存取仍受程式執行策略約束。

## Consequences

匯出了 `HTTPS_PROXY`、或把它寫進 `$DSH_HOME/.env` 的使用者，在 Harness 發起請求的每一處都會走代理，無需任何標誌與設定。啟動器在第一個外掛掛載之前恰好安裝一次。

由於不讀取作業系統設定，面向使用者的文件從補充材料變成了承重件：僅在代理軟體裡撥了「系統代理」開關的使用者什麼也得不到，且沒有診斷。因此 `docs/user/guide/network-proxy.md` 說明了要匯出哪些變數，以及為什麼瀏覽器走代理而終端不走——這個「三套機制」的困惑是最常見的報障，且並非本 Harness 特有。

`web_fetch` 的安全敘述現在有兩種形態，其 README 已如實說明：直連的一跳保留地址驗證與固定，代理轉發的一跳把目的地選擇交給運維方設定的代理。這是本次變更唯一改動的對外安全承諾。

userland undici 能觸及 Node 內建的 `fetch`，依賴於兩者都會寫入 legacy 的 `Symbol.for('undici.globalDispatcher.1')` 槽位。那是跨版本的隱式耦合而非約定——corepack#834 記錄了它失效的實例——因此 `tests/install.spec.ts` 會驅動一次真實請求穿過 loopback 代理。破壞該耦合的版本升級會在那裡失敗，而不是流到線上。

測試套件對開發者自身的環境免疫：每份 Vitest 設定都會先執行 `scripts/test-proxy-environment.ts`，在任何測試之前清除全部八個代理變數名的兩種大小寫形式；`install.spec.ts` 則在每個自行設值的案例前後還原本機的值。這是必需的。開發過程中，一個已匯出的小寫 `all_proxy` 曾決定了某個測試的結果，因為解析優先讀取小寫。

## Testing

`packages/util/http-proxy` 有 84 個測試，per-file 覆蓋率 100%。解析覆蓋優先順序、`ALL_PROXY` 後備、空值遮蔽、SOCKS 與畸形值診斷，以及只設 https 變數時 `http:` 保持直連；路由以結構化方式覆蓋整個 loopback 網段，繞過匹配覆蓋字尾、埠、兩種 IPv6 寫法，以及刻意不匹配的 CIDR 條目。安裝驅動一個真實的 loopback 代理，斷言絕對形式的請求確實抵達、被繞過的目標不抵達，且 dispose 會還原 dispatcher、策略與環境。所有案例一律經 `installProxyFromEnvironment` 安裝，因此沒有測試能斷言一次真實啟動無法產生的策略物件。

`packages/web/web-fetch-http/tests/proxy.spec.ts` 斷言了最關鍵的那個決定：經由代理時公網地址解析器完全不被呼叫，而被繞過的一跳仍恰好呼叫一次，且跨域重定向拒絕在代理路徑上依然成立。

`verify-no-bare-dispatcher.spec.ts` 證明該門禁能拒掉本包所要修復的那種寫法、接受 `proxyRouteFor`、接受帶註解的豁免，並在目前程式碼樹上透過。

出網測試以負向形式承載遙測這一項：隨附後端在已安裝策略下執行匯出，而假代理什麼也沒收到——這個有意的排除因此是被斷言的，而不只是被記錄的。另有一組一致性測試，對文件所述 `NO_PROXY` 詞彙中的每種形態，把 `proxyForUrl` 的判斷與真實 `fetch` 的實際去向相互核對；由於 dispatcher 正是按同一謂詞路由，它現在能抓住的是 `bypassesProxy` 對某種形態的讀法與詞彙文件不一致，以及未來任何重新引入第二個匹配器的 dispatcher。

無錄製工作階段快照變更：本次改動不影響任何模型可見輸入或產品使用者可見的 transcript 輸出。
