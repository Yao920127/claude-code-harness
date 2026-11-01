---
description: "應用 Remote 裝配：為 Client 消費方選擇帶型別的 Host 能力與轉發事件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-remotes

[English](README.md) | 中文

## 概述

為本應用選定的 Host Remote 能力提供雙側 BFF。Host 入口擁有轉發事件名單並向 API Gateway 註冊應用事件 source；Client 入口以執行時值形式匯入生成的 `/remote` 產物，透過 `ctx.remote.$mount()` 掛載每項貢獻，並重新匯出對應的宣告合併。Client 業務包依賴該外觀，而不依賴 Gateway 實作或單獨的 Remote 執行時入口。

## 目錄

- [使用本包](#use-this-package)
- [轉發的 Host 事件](#forwarded-host-events)
- [建置邊界](#build-boundary)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

[`@deepseek-ai/dsh-api-session-controller`](../session-controller/README.zh.md) 擁有 agent（智慧代理）與工作階段身份策略，包括供其他 namespace 使用的 Typert lookup 解析器。本包只選擇並掛載生成的工作階段 contribution，不複製啟用策略。

Client 組合掛載 Office 轉換、Commands、憑證、settings、Goal、Schedule、動態 Cordis、檔案與工作階段引用、只讀 Host 外掛清單、外掛安裝源回應比較、訊息回饋、權限預設、工作階段控制器、subagents 和 Workspace 控制器 contribution。`permissionPresets` namespace 返回 current-session 控制元件使用的完整程序級目錄。該組合解除安裝時，Cordis effect 的所有權機制會撤回所有貢獻；`@deepseek-ai/dsh-api-gateway/client` 負責描述符驗證、可追蹤的 namespace 服務、直接與作用域方法、呼叫、流與取消。Client 入口透過 Cordis 消費共享的 `TypertClientRemote` 介面，不匯入具體 Gateway；它只以 type-only 形式重新匯出 Gateway Client face 的宣告合併，因此消費端經由本外觀取到轉發事件詞彙時，執行時不會多出一條通往 Gateway 實作的邊。

本 facade 同時是 Client 包指稱 wire 型別詞彙的正門。它以 type-only 方式轉出 Remote 失敗詞彙（`RemoteResult`、`RemoteFailure`、`RemoteErrorCode`、`RemoteErrorDetailsMap`）、Host 事實（`RemoteHostFacts`），以及各已選領域對 Client 安全的載荷型別，因此 Client 功能包只 import 一個 specifier，不必伸手進 `dsh-typert-protocol`、Gateway 或某個擁有方的 Host 入口。有兩類包刻意不走這道門：本裝配自己選中的 API 層包——反向 import 會形成依賴環——以及它們的測試，後者直接從 `dsh-typert-protocol` 取失敗詞彙。UI 包的測試則從 [`dsh-client-test-runtime`](../../test-support/client-runtime/README.zh.md) 取 `RemoteError` 建構器。

本包不擁有物理傳輸或 Host 服務發現。它只把應用選擇投影為生成的 Remote contribution，以及每個 Client 各自獨立的 Host 事件源；API Gateway 負責 endpoint、carrier、取消與重連。Web 或未來的 TUI 只要提供同一份不依賴 React 的 `ctx.remote` 約定，均可複用其 Client face。

-----

<a id="forwarded-host-events"></a>
## 轉發的 Host 事件

`src/remote-events.ts` 持有 `API_REMOTE_FORWARDED_EVENTS`，即本應用不改名轉發給消費端的 Host Cordis 事件名單；每個條目還會選擇普通傳送或 agent-scoped waterfall（瀑布式事件）投遞。該名單同時就是 `ctx.remote.$on` 的合法鍵集，只含型別的 `src/types.ts` 派生其選擇面。多轉發一個事件只需在該陣列裡加一項：型別投影、消費端鍵面與 Host 轉發迴圈全部由它派生。

監聽器簽名不在此處重寫。名單內每條事件的 Cordis `Events` 宣告都住在其 owner 包 client-safe 的 `./types` 匯出，本包兩個 face 都把那些宣告納入編譯面。Host face 還會把每個條目斷言給 `TypertForwardableEventEntry`：`emit` 條目必須是已宣告的單向事件，`waterfall` 條目則必須是已宣告的 agent-scoped waterfall，且其最後一個參數是返回相同結果型別的 `next()` 回呼。

Host entry 為每條 Client 流獨立註冊一組 allowlist listener 和一個佇列，並在普通事件入隊前拒絕非 JSON 參數。對於 waterfall，它只投影頂層 agent 身份與 JSON 請求欄位；Client 結果也必須能無損表示為 JSON，而 `next()` 會委託給後續 Host listener。每個作用域 waterfall 請求都必須以 `request.agent` 直接攜帶路由所用的 agent；Host 會在轉發前拒絕缺失或不匹配的身份。該 source 在 `ctx.typertGateway.registerRemoteEvents()` 暴露 Gateway 內部的 `$events` 邏輯流前同步掛好所有 listener，因此首個 `ready` 項既能證明增量投遞已就緒，也會攜帶供 Client 顯示路徑的 Host home。撤回註冊會中止活動流。

無 payload 的 `schedule/changed` 事件使 Schedule 任務查詢失效；Client 在收到通知及重連後重新讀取。無 payload 的 `permission-presets/catalog-changed` 事件使程序目錄失效。Client 在首次讀取 `permissionPresets.catalog()` 前先訂閱，並在通知後重新讀取完整快照；該事件不攜帶目錄狀態，也不改變 Session 序號。

<a id="build-boundary"></a>
## 建置邊界

儲存庫中的多數包只屬於一個 TypeScript face：Host 包登記在根 `tsconfig.host.json`，Client 包登記在根 `tsconfig.client.json`。本包需要拆分，因為 Host 入口要參與 Host Typert 圖，而 `src/client/index.ts` 必須等 Host tsdown 生成業務包的 `/remote` 宣告後才能編譯。

本包根 `tsconfig.json` 只是引用 `tsconfig.host.json` 與 `tsconfig.client.json` 的 solution。Host aggregate 和 Host 直接消費方引用前者，Client aggregate 和 Client 直接消費方引用後者；禁止把包根 solution 放進任一 aggregate 的依賴圖。兩個 project 擁有互不重疊的原始碼和 `.tsbuildinfo`，但共享 `lib/types` 輸出目錄——只有一處刻意的例外：`src/remote-events.ts` 與 `src/types.ts` **同時**列進兩個 face 的 `files`，因為轉發事件名單是「消費端能收到什麼」的唯一控制點，Host 轉發迴圈與 Client 的 `ctx.remote.$on` 鍵面必須讀同一份宣告，而不是兩份可能彼此漂移的宣告。

這條例外不止是一行 `files`。根 `tsconfig.base.json` 把 `@deepseek-ai/dsh-api-remotes/types` 對映到 `src/types.ts`——**源平面**，與其餘所有 workspace 子路徑一致，也與生成的 `/remote` 產物相反（後者沒有 `paths` 條目，靠 `exports` 命中建置產物）。於是兩個 face 都把同一份名單與型別投影收進各自的 program，並向 `lib/types` 發射逐字相同的 `remote-events` 與 `types` 輸出；`.tsbuildinfo` 仍各自獨立。沒有任何門禁強制兩個 face 的原始檔互不重疊——`scripts/project-reference-faces.ts` 只驗證「引用一個 split project 必須指到對應 face」——因此本段記錄這次雙列為何是有意的。

包內 `clientBundle(..., { hostPhase: true })` 讓 Host tsdown 打包 Host 入口，讓後續 Client tsdown 只打包 browser 入口。普通 Client 外掛仍使用單一 Client project，並在 Client tsdown 階段一起生成 Node loader 入口和 browser bundle；只有兩組原始碼需要不同 compiler face 時才拆分。

<a id="model-experience"></a>
## 模型體驗

無，因為該 BFF 只選擇 Remote 應用方法和轉發事件，不註冊任何模型介面。

#### KV Cache 影響

無直接影響；其觸發的任何模型可見行為均由已掛載的 Host 能力負責。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- 能力集合由建置時顯式匯入的值固定確定；Client 不會在執行時發現 Host 中已啟用的服務或 Remote 定義。
- 若要增加能力，必須顯式匯入相應的 `/remote` 值並在此組合中掛載。
- 只有仍在等待的作用域 waterfall 會在重連後回放；單向通知仍是相互隔離的 best-effort 投遞，不會回放。需要可靠恢復的狀態必須由擁有方提供查詢、遊標或初始基線。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。被觀察的關係由 Typert、agent 註冊表和工作階段註冊表負責。

用戶端組裝包含 account 名稱空間，用於登入操作和可重連的帳號快照。
