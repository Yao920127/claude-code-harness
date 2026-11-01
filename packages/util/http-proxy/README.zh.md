---
description: "Harness 的出站 HTTP 代理支援：從啟動環境解析出的一份策略，如何覆蓋到 Node fetch 本來會直連的每一個請求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-http-proxy

[English](README.md) | 中文

## 概述

使用本包可為採用 Node 內建 `fetch` 的 Harness 請求應用一份出站 HTTP 代理策略，包括 LLM（大語言模型）、web 搜尋與 HTTP MCP 流量。啟動器只讀取一次標準代理環境變數，普通 `fetch` 呼叫方無需額外引入或改動。loopback 流量保持直連；不受支援的代理 URL 會被報告，並針對受影響的協定跳過。公共輔助函式可讓呼叫方路由採用自有代理設定的傳輸、準備子程序環境，或為隔離回放清除代理變數。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

無需掛載，也無需設定。`dsh` 啟動器會在第一個外掛載入之前，為每個 profile 解析並安裝策略，因此匯出了 `HTTPS_PROXY` 的使用者在所有位置都會走代理。本包是庫而非外掛，因為傳輸策略每個程序只有一個答案：沒有第二個實作可替換，也沒有比程序更窄的作用域可賦予。

### 編寫新的出站呼叫

普通 `fetch()` 會走代理，任何使用 `globalThis.fetch` 的 SDK 也一樣——MCP HTTP 傳輸與 pi-ai 提供者棧都使用它。應驗證每個 SDK 的實際傳輸；例外見[已知限制與延後工作](#known-limitations-and-deferred-work)。

| 你要寫的東西 | 使用 |
|---|---|
| 普通請求，或最終落到 `globalThis.fetch` 的 SDK | 什麼都不用——全域 dispatcher 已經在路由它 |
| 需要按“這次請求是否走代理”分支的呼叫 | `proxyRouteFor(url)` |
| 接受自有代理 URL 的 SDK | `proxyRouteFor(url)`，把 `route.proxy` 傳進去 |
| 由你自己建構環境的 spawn | 把 `proxyEnvironmentForChild()` 應用到該 spawn（`undefined` 表示刪除） |
| 必須連到自帶 fixture（測試前置資料）伺服器的 harness | 把 `clearedProxyEnv()` 應用到該 spawn |

`proxyRouteFor` 給出的不只是答案，還有該答案所假定的傳輸：走代理的那一支攜帶著此刻正按該策略路由的 dispatcher。若呼叫方先讀策略、再自建傳輸，解除安裝就可能落在兩次讀取之間，把請求發往其分支從未放行的去處。

建構 `new Agent(...)` 再作為 `dispatcher` 傳入會覆蓋全域 dispatcher，從而靜默繞開代理。`verify-no-bare-dispatcher` 會在本包之外拒絕該寫法。有一處呼叫點確實自有傳輸——`web-fetch-http` 會把請求釘在它已驗證過的地址上，而這是程序級 dispatcher 無法承載的單次請求狀態——它在該行用 `proxy-exempt:` 註解說明。

該門禁看不進 SDK 內部，因此每個出網點都配有 `egress.spec.ts`，透過假代理驅動實際傳輸並檢查觀察到的路由。每個新的出網點必須包含該傳輸測試。遙測斷言其直連例外。這些測試可發現呼叫點不變但依賴變更改變路由的情況。

### 策略讀取哪些值

`http_proxy`、`https_proxy`、`no_proxy` 與 `all_proxy`，小寫優先、大寫後備，空值視為未設定。`ALL_PROXY` 為兩種協定後備，HTTPS 最後退回到 HTTP 代理——其中第一條 Node 與 undici 都不會自行推導。取值來自啟動器的快照：先看匯出的環境變數，再看 `$DSH_HOME/.env`。專案自己的 `.env` 不能攜帶這些名字——那個檔案隨 clone 一起到來，啟動器寧可拒絕啟動，也不讓一個儲存庫決定 Harness 把流量發往何處。

loopback 始終被繞過——`localhost`、整個 `127.0.0.0/8` 段、`::1`、`0.0.0.0`，以及它們的 IPv4 對映寫法。否則 Harness 自己的 Web UI、Connection 傳輸以及每一個本地測試伺服器都會經由代理並形成迴環。釋出出去的繞過列表只包含讀取環境的消費者能匹配的四個字面量條目；`proxyForUrl` 自行識別整個網段，因為列表條目無法表達一個範圍。

### 失敗處理

本包無法使用的代理值——SOCKS 或 PAC URL、無法解析的字串、不受支援的協定——會被報告並跳過，該 scheme 轉為直連。該變數可能是使用者為其他工具匯出的，不應因此阻止 agent（智慧代理）啟動。

-----

<a id="understand-the-implementation"></a>
## 理解實作

### 設計理念

**一次解析，一個匹配器。** `proxyForUrl()` 與已安裝的 dispatcher 絕不能對同一個 URL 給出不同答案，否則 `dsh-web-fetch-http` 會把 dispatcher 本打算隧道轉發的連線固定到某個地址上。因此該 dispatcher 是一個 `Agent`，其按 origin 呼叫的 `factory` 自身呼叫 `proxyForUrl()`，不存在可能與第一個解析器產生漂移的第二個解析器。undici 的 `EnvHttpProxyAgent` 在此無法勝任：沒有 `HTTPS_PROXY` 時它讓 `https:` 複用 HTTP 代理，於是本包在拒絕使用者為該 scheme 指定的 URL 後本應保持直連的 scheme 仍會被隧道轉發。

**子程序繼承使用者自己的值，以及使用者未設定部分的解析結果。** 使用者以任一大小寫指定過的 scheme，會以他們書寫的形式原樣傳給子程序，因此使用者為 `curl` 設定的 SOCKS 代理絕不會被替換成為其他 scheme 指定的 HTTP 代理。兩種大小寫都未指定的 scheme 則攜帶解析值，否則子程序的路由會與父程序分歧：Node 的 `NODE_USE_ENV_PROXY` 不讀 `ALL_PROXY`。繞過列表始終採用解析結果——它只會追加 loopback 條目，使用者寫下的內容不會丟失。讓父子程序只有一個路由答案的代價是：`curl` 也會看到本包由 HTTP 代理推匯出的 `https:` 代理。有一處例外是為了保護子程序自身：當子程序收到的某個值是本包拒絕過的——比如為 `curl` 保留的 SOCKS URL——就不再設定 `NODE_USE_ENV_PROXY`，因為 Node 在該標誌下會在執行程式之前先解析 `HTTP_PROXY` 與 `HTTPS_PROXY`，遇到這類值直接退出。此時子 Node 直連（本程序已為該協定如此報告），而不是根本起不來。

### 原始碼地圖

| 檔案 | 承載 |
|---|---|
| `src/policy.ts` | 解析與繞過匹配；診斷只點名變數，從不帶出它的值。不引入任何傳輸實作，因此在沒有 undici 的環境中仍可載入。 |
| `src/install.ts` | 全域 dispatcher、生效策略記錄、路由與子程序環境。動態引入 undici。 |
| `src/index.ts` | 本包的對外介面：四個函式與一個型別。 |

### 繞過匹配

一個條目寫的是主機名，它連同其下所有子域名一起匹配：`NO_PROXY=example.com` 也會放行 `api.example.com`。字首 `.` 或 `*.` 可以寫，含義相同。條目可帶 `:port`，`*` 則放行全部。帶方括號與裸寫的 IPv6 字面量都能匹配——裸寫的 `::1` **不會**被讀成主機 `:` 埠 `1`，而 undici 自帶的匹配器正是這樣出錯的，這也是解析結果中同時攜帶 `::1` 與 `[::1]` 的原因。CIDR 不參與匹配：作業系統的繞過列表常含 `10.0.0.0/8`，必須改寫成字尾形式。

-----

<a id="further-exploration"></a>
## 進一步探索

- [網路代理指南](../../../docs/user/guide/network-proxy.zh.md)——需要匯出什麼，以及為什麼瀏覽器走代理而終端不走。
- [`dsh-web-fetch-http`](../../web/web-fetch-http/README.zh.md)——唯一一個安全規則會因代理而改變的消費方。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包只承擔傳輸策略：它改變位元組如何抵達網路，不註冊任何提示詞、schema 或結果文字。

#### KV Cache 影響

不會直接失效：本包不貢獻任何請求 token，也從不改變請求字首，因此提供者快取複用不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了本包不適用的情境，屬於目前的包級約束。

- **不支援 SOCKS、PAC 或作業系統代理探測**——只接受來自環境的 `http(s)://` 代理 URL。不會讀取 macOS 或 Windows 的系統代理設定，因此僅在代理軟體裡撥了開關的使用者仍須匯出環境變數；SOCKS URL 會被報告，且該協定保持直連，不會借用另一協定的代理。
- **不支援自定義憑證頒發機構**——做 TLS 攔截的企業代理需要在啟動前為程序設定 `NODE_EXTRA_CA_CERTS`，本包既不設定也不驗證它。
- **spawn 出的子程序只在足夠新的執行時上遵循策略，且僅當它繼承的每個值都是 Node 接受的**——它透過 Node 的 `NODE_USE_ENV_PROXY` 讀取已釋出的環境（22.21+、24+），而 engines 範圍允許 22.19 與 22.20，在這兩個版本上這樣的子程序保持直連。若使用者環境裡還有 SOCKS 或其他被拒的代理，所有子 Node 都保持直連：不設定該標誌，子程序才起得來。子程序還會按 Node 自己的 `NO_PROXY` 規則匹配繞過條目，其分隔符與 IPv4 區間處理與本包不同。本程序內不依賴任何 Node 版本：每一次程序內請求都會落到全域 dispatcher。
- **遙測按設計直連**——OTLP 匯出器透過 `node:http` 投遞，全域 dispatcher 觸及不到。要讓它走代理，要麼依賴 `http.Agent` 的 `proxyEnv`，而該選項晚於本專案支援的最低 Node 版本；要麼改用 SDK 的 `fetch` 傳輸，但它沒有壓縮能力，而隨附設定啟用了 gzip。遙測是唯一一條丟失後不會讓使用者付出任何代價的通道，因此維持原狀；`DSH_TELEMETRY_MODE=DISABLED` 可關閉它。
- **模型編寫的程式不接收代理設定**——Node ptc-runtime 程序與 workflow worker 不繼承可能含有 `user:password` 的代理 URL。其直接請求需要自行設定，並繼續受到執行沙箱的約束。
- **防迴歸門禁只看原始碼，看不到依賴內部**——`verify-no-bare-dispatcher` 解析 `packages/*/*/src` 與 `apps/*/src`；測試、腳本以及第三方 SDK 的內部都在其之外。這正是每個出網點還各配一份 `egress.spec.ts` 的原因。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>面向維護者的工作上下文——點選展開</summary>

userland undici 能觸及 Node 內建的 `fetch`，依賴的是兩者都會寫入 legacy 的 `Symbol.for('undici.globalDispatcher.1')` 槽位。那是跨版本的隱式耦合，不是約定——參見 [corepack#834](https://github.com/nodejs/corepack/issues/834) 中它失效的實例。`tests/install.spec.ts` 斷言真實請求會抵達一個 loopback 代理，因此破壞該耦合的版本升級會在那裡失敗，而不是流到線上。

</details>

**執行時不變式：** 不釋出伴生入口。本包唯一的可變狀態——生效中的策略——由單元測試對照它所安裝的 dispatcher 斷言：測試會對該註冊執行 dispose（資源釋放）並觀察一個真實的 loopback 代理。
