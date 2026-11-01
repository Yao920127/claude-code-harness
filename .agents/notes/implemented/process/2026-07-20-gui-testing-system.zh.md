# Agent Note: GUI 測試體系——三層結構

Status: implemented

> 路徑更新（2026-08-27，Remote 遷移）：本文三層理念與黃金路徑方法仍為現行；物件層 spec 分佈於 `packages/api/session-controller/tests/` 和 `packages/test-support/client-runtime/tests/`，Remote 與承載 spec 分佈於 `packages/api/gateway/tests/` 和 `packages/client/connection/tests/`。元件 spec 是各 `packages/client/*/tests/` 下的外掛級 jsdom 套件。元件 spec 形態遵循 [slot 體系標準](../architecture/2026-07-22-slot-type-chain-implementation.zh.md)：props 直喂——store 份額來自 `createXXXStore().create()`（真引擎，獲認可的無額外機制路徑），框架掛鉤用普通樁；無渲染機制、不掛載提供者。slot 歸屬和註冊表語義歸 2 層地界（`ui-renderer` + `ui-slots` 套件），不歸元件 spec。

[English](2026-07-20-gui-testing-system.md) | 中文

> 分工線：本篇只講 GUI（`packages/{client,host}/*` + `apps/web`）特有的測試結構；全倉測試政策（分層原則、with-key 政策、真實實作優先、REAL-composition）見 [docs/testing.md](../../../../docs/testing.zh.md)，不在此複述。

## Problem

GUI 棧需要考慮多種應用形態，同應用形態內的不同執行環境（Node host、資料協定層、瀏覽器物件層、React/DOM），單一車道的測試給不了有效訊號。需要對各環節都進行有效測試，並具備全鏈結測試的基礎能力。

## Decision

沿架構天然的測試掛鉤切分為三層，自底向上：

| 層 | 被測物 | 關鍵手段 | 檔案落點 |
|---|---|---|---|
| 1 協定同構層 | 生成的 Typert Remote 描述符 + `ApiGateway` + Connection RPC 承載（參數/結果/錯誤/流/取消） | **同構點全鏈**：gateway host/client 套件在程序內驗證描述符 codec 與 Remote 分派；Connection host 套件不經瀏覽器即可執行相同的 `/api` 承載幀與信任檢查 | `packages/api/gateway/tests/`、`packages/client/connection/tests/` |
| 2 物件層編排 | `Session`/`SessionManager`/`ConnectionController`（狀態機與時序：縫合/去重/翻頁/樂觀清稿/pendingBuffers/重連/退避） | **「事件序列進→快照出」黃金路徑**：可程式設計假體 + deferred 控時序 + fake timers 控退避 | `packages/client/{runtime,connection}/tests/` |
| 3 組裝呈現層 | 建置產物 × 真實 client loader 與外掛組合 | 歸應用所有的語義快照在 jsdom 下用測試持有的 `RemoteMock` 啟動建置後 Client 圖；Playwright 案例分別驗證真實瀏覽器與 Host 載體，並透過 `dsh-llm-replay` 回放已錄製的模型工作階段（[整機用戶端測試檔](../testing/2026-09-06-client-assembly-test-line.zh.md)、[web e2e 車道](../testing/2026-07-24-web-gui-browser-e2e-lane.zh.md)） | `apps/web/tests/*.expected.e2e.ts`、`apps/web/tests/*.e2e.ts`、`apps/web/tests/*.snapshot.ts` |

層間紀律：**各層各測各的，上層不重測下層**：應用語義快照只固定組裝後外掛邊界上的使用者可見投影，Playwright 冒煙測試負責驗證瀏覽器與承載層是否存活；wire 語義歸 1 層，資料語義歸 2 層。純函式層（lineage/partial/notifier/transcript-adapter）隨 2 層同包 tests/ 零假體直測。

- **host 與 client 原始碼**均納入全倉 per-file 100% 覆蓋率門禁，僅排除 `vitest.config.ts` 中帶註解的少量瀏覽器級例外；元件套件透過逐檔案 jsdom pragma 和 Testing Library 執行，不會改變 Node 套件。
- **歸應用所有的語義快照**讀取已建置的 client bundle，透過真實 loader 執行它們，並驅動確定性的 RemoteMock 情境。它們負責固定側邊欄標籤、麵包屑和 `document.title` 等穩定可見狀態，而不固定 CSS 畫素或下層狀態機細節。

## 車道地圖

| 情境 | 命令 | 內容 | 何時跑 |
|---|---|---|---|
| 基礎 | `pnpm run test:gui` | 1+2 層 vitest（`packages/client packages/host`），秒級、無瀏覽器、無 server | 改 GUI 任意原始碼後隨手跑 |
| 語義快照 | `DSH_EXAMPLE_MODE=lib pnpm run test:snapshot` | 無需金鑰的組裝應用語義，以及儲存庫按傳輸形態劃分的預期輸出 | 使用者可見的 GUI 變更後；交付前 |
| 瀏覽器端到端 | `pnpm run test:web` | 先重建前端 dist，再執行 built-client RemoteMock 案例與真實 Host 瀏覽器情境，其中包括無金鑰的錄製工作階段回放（`DSH_SNAPSHOT=record`/`refresh` 重錄 fixture／重寫預期輸出） | 改建置面/boot/承載後；交付前 |
| 瀏覽器預期輸出門禁 | `DSH_SNAPSHOT=replay pnpm run test:web:built` | 複用 CI 建置的產物，並在不寫入的情況下比較每份已提交的瀏覽器預期輸出 | 每個 Linux 拉取請求 |
| 門禁 | `pnpm run test:coverage` | 全倉門禁（host 與 client GUI 包均納入，僅排除帶註解的瀏覽器級例外） | PR（Pull Request）視窗 |

**瀏覽器腳本與 vitest 的分工**：Playwright 負責瀏覽器/承載層黑盒迴歸和較長的連續使用者操作流程；普通 vitest 負責引用穩定性、時序和 wire 結構等資料層語義；快照 vitest 透過建置後的組合負責穩定的應用層語義輸出。這些車道彼此互補，而不重複斷言。

## 防迴歸紀律

- **修一個 bug 釘一條斷言**：瀏覽器可見的 bug 釘進所屬瀏覽器 spec（冒煙測試或 e2e 情境）；資料層 bug 釘進對應 spec（先例：res-close 誤判釘在 webserver 橋 suite——純 Node 秒級復現，不再需要 12s 瀏覽器哨兵作唯一防線）。
- **RemoteMock 全綠不算完，真 wire 也要過**：已解碼的程序內載體會刻意繞過 HTTP/WebSocket 鏈及其網路時序。改動觸及 connection、bridge、handler 或流式 transport 時必須執行瀏覽器車道（`pnpm run test:web`），由其中的無金鑰 e2e 情境驅動真實載體；帶金鑰的真實 Host 冒煙仍是真模型側的補充。
- 寫入磁碟程式碼即答案的對錶工作流：行為改動寫入磁碟打紅既有案例時，當場對錶校準（改測試還是改程式碼以 RFC/約定為裁），不留懸紅。

## Consequences

各車道各測各層：改動任意 GUI 原始碼後都能獲得秒級 `test:gui` 回饋，wire/物件層語義在 Node 環境中進行毫秒級斷言，基於建置後組合的快照固定確定性的使用者可見投影，瀏覽器負責接線與承載層驗收。層間紀律仍由評審負責，而 Linux CI 透過機器門禁確保瀏覽器預期輸出的新鮮度。每個新的應用快照都必須避開不穩定的佈局或時鐘輸出。

## Alternatives considered

| 放棄項 | 一句話理由 |
|---|---|
| 單一 e2e（全走瀏覽器） | 瀏覽器起步秒級×N 倍慢+時序不可控；wire/物件層不變數在 node env 可毫秒級全斷言 |
| verify 腳本遷 vitest | 有序腳本共享瀏覽器工作階段，拆 case 要麼形式化（sequential+共享 page）要麼重走前置×N；PASS/FAIL 流式輸出正是 agent（智慧代理）定位介面 |
| 為測試保留生產 Client fixture | 它把交付程式碼耦合到情境資料和 query 選擇的 transport；RemoteMock 與真實 Host 測試分別直接持有兩個所需層級 |
| GUI 包獨立 vitest config（曾設計 vitest.gui.config.ts） | 包級 tests/ 本就被根 include 掃到，`vitest run packages/client packages/host` 路徑過濾即窄迴圈——零新 config |
| 掛鉤/元件層暫緩單測 | jsdom 仍是覆蓋率主線，因為它能快速驗證逐檔案元件行為；必需的瀏覽器回放門禁在組裝層與之互補，而非取代它（[CI 門禁決策](../testing/2026-07-30-web-browser-snapshot-ci-gate.zh.md)） |
