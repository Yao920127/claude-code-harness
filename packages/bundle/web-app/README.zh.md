---
description: "dsh 的瀏覽器 GUI：互動式聊天、模型與設定管理、工作階段歷史，供執行 dsh web 表層的使用者使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-web-app

[English](README.md) | 中文

## 概述

執行 `dsh --profile web`，開啟提供聊天、模型與設定管理以及工作階段歷史的互動式瀏覽器 GUI。它使用與其他 dsh 表層相同的模型存取、工具與安全預設值。啟動時會列印帶認證資訊的 URL，通常還會在預設瀏覽器中開啟；SSH 工作階段和 `--no-open` 會保留該 URL，供你手動開啟。你可以更改埠並允許額外主機，但不能繫結所有網路介面。需要在瀏覽器中互動式工作時選擇本包；一次性的命令列任務應使用 `dsh-headless`。

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

啟動 GUI、開啟瀏覽器，然後開始與 agent（智慧代理）對話。flag 用於微調本次呼叫。

### 啟動 Web GUI

```sh
dsh --profile web
dsh --profile web --no-open --port 8080
```

啟動後你會看到 `dsh web:` 行，其根 URL 攜帶新的程序 token。除非 `--no-open` 或 SSH 工作階段抑制，否則預設瀏覽器會開啟該 URL、取得簽名 cookie，再重定向到不含認證參數的同一目錄。頁面載入且你可以與 agent 對話，就說明成功了。兩種可預期的失敗：前端未建置時，啟動會以建置提示停止（checkout 中執行 `pnpm run build`）；瀏覽器無法開啟時，stderr 會列印不含憑證的診斷，但伺服器會繼續執行——請自行開啟已列印的啟動 URL。

**設定 → 模型**顯示 **DeepSeek**，使用 `DEEPSEEK_API_KEY`。預設模型為 `deepseek-official` / `deepseek-flash`（DeepSeek-V41-Flash）。[DeepSeek 外掛](../../llm/llm-deepseek/README.zh.md#endpoint-and-wire-format)使用 Messages API。

已儲存的模型選擇覆蓋組合預設值。設定卡接受相容 Messages 的 API 地址與憑證引用。

### 設定

大多數使用者不需要設定這些；命令列 flag 會提供給下面四個設定——`--host`、`--port` 與 `--trusted-host` 來自本次呼叫，`--no-open` 僅對本次呼叫關閉瀏覽器交接：

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `openBrowser` | `true` | 啟動後用預設瀏覽器開啟；SSH 啟動會抑制它 |
| `printUrl` | `true` | 啟動時列印 `dsh web:` URL 行 |
| `surfaceContext` | `true` | 給 agent 提供 GUI 定位上下文，並把 `DSH_WEB_URL` 暴露給其 shell 命令 |
| `trustedHosts` | `[]` | 允許從網路存取 GUI 的額外主機 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)是每個受支援欄位及其 JSDoc 的窮盡式真源。 隨發行版交付的組合預設停用 `schedule`、`ui-schedule` 和 `time-context`。

### LAN 存取與可信主機

預設情況下 GUI 只接受本機的連線。繫結所有網路介面的部署也會允許 LAN 內的瀏覽器存取，此時列印的 URL 會附帶一個 LAN 地址；`--trusted-host` 在兩種情況下都能新增額外主機。Host 與 Origin 檢查控制可達性，token 交換則認證每個 Host API 方法與 WebSocket 流。LAN 地址只在啟動時取樣一次，因此之後的網路變化不會被感知——重新啟動 GUI 以重新公告。

### 透過 SSH 執行

透過 SSH 啟動 `dsh --profile web` 時，URL 行仍會列印，但不會為你開啟瀏覽器：本地轉發地址由 SSH 用戶端或編輯器持有。請在自己的機器上開啟轉發後的 URL；列印出的 URL 指向遠端主機 loopback 端點。

### 按工作階段的 agent 設定

每個瀏覽器工作階段選擇一個隨發行版交付的 preset（預設 `standard`）。Agent 預設設定頁可更改預設項並編輯預設的子外掛；儲存結果持久化到 `$DSH_HOME/profiles/web/cordis.patch.yml`。只有 Host 提供可編輯的 profile 時，Creator 的外掛管理工具才會啟用。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

此 bundle 由一層五個檔案的補丁和一個執行時膠水外掛組成：`cordis.patch.yml` 承載主機行和 preset 註冊表，每個 `presets/<id>.patch.yml` 插入一條隨發行版交付的 preset 宣告，按 `dsh.bundle.patch` 列出的順序應用。儲存棧與投影快取來自 `dsh-base`；Web 疊加層的工作區和訊息回饋條目消費共享的 `storageDomain` 服務。補丁重述 base 有意省略的介面專用值，插入 Web 專用主機條目和瀏覽器外掛列表，再將 Agent 層移到預設後面。膠水外掛負責 dist 服務、信任取樣、提示詞段落、bash 變數和就緒通知。`office-to-pdf` 條目為主機消費者掛載一個延遲建立引擎的 [Office 轉換提供者](../../document/office-to-pdf/README.zh.md)，使用此 bundle 的 Desktop 組合也共享該提供者。 轉換服務的 Remote 方法負責預覽讀取授權，Document Preview 負責 Office 檢視器和用戶端快取。

### patch 語義

patch 會替換目標行的整個 `config`，因此每個 Web 行都重述自己擁有的每個鍵：基礎行上的 persona 字首與字尾範本、`DSH_TOOLS_MODE` PTC mode 開關與 `session-query-sqlite` 值，隨後 `insert` 新增 Web 主機行、傳輸層與瀏覽器名錄。base 以程序級掛載的按 agent 工具行在這裡被停用，由 preset 名錄接管；每項主機層與 preset 層歸屬決策的理由以行內註解寫在 patch 裡。

### 就緒宣告

URL 行與瀏覽器交接都是就緒訊號：監督方一觀察到該行就發起 RPC，瀏覽器一開啟就請求頁面，因此兩者只在 Loader 設定樹結算、透過 required 啟動檢查且 Connection 認證可用後執行——在沒有 Loader 的手工建置樹中則立即執行。此時 client combo JavaScript 和 source map 仍未物化。可選外掛失敗不會阻止就緒宣告；required 啟動失敗或啟動中途被釋放的樹不會宣告任何內容。

### LAN 信任取樣

`resolveLanTrust` 在啟動時只取樣一次網路：loopback 繫結（`127.0.0.1`）不派生任何 LAN 地址，繫結所有網路卡則會加入每個非 internal IPv4 字面量。派生字面量加上顯式的 `--trusted-host` 權威標識組成 `/api` 瀏覽器信任柵欄，列印的 LAN URL 始終與該柵欄一致。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `web-app` 粘合外掛：dist 解析、LAN 信任取樣、提示詞段落、bash 變數、URL 行、瀏覽器交接 |
| [`src/startup.ts`](src/startup.ts) | `web-startup` 提供者：`--host`、`--port`、`--trusted-host`、`--no-open`、`--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | Web patch：重述的基礎值、Web 主機行、瀏覽器名錄、preset 註冊表 |
| [`presets/`](presets) | 每個隨發行版交付的 preset（`standard`、`ptc`、`minimal`、`cordis`）各一條 `@deepseek-ai/dsh-agent-preset` 宣告，各自一個補丁檔案 |
| — | 不釋出執行時不變式伴生入口；每項貢獻（frontend-static 子外掛、提示詞段落、bashEnv 註冊）都會隨 fiber 由註冊表釋放，且每個所屬註冊表的包負責該關係的不變式；本包不持有需要審計的可變狀態。 |
| [`tests/web-app.spec.ts`](tests/web-app.spec.ts) | dist 解析、退回席位、提示詞段落、就緒宣告 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 在真實 Loader 樹上的命令列解析 |
| [`tests/trusted-hosts.spec.ts`](tests/trusted-hosts.spec.ts) | LAN 信任取樣 |
| [`tests/browser-open.spec.ts`](tests/browser-open.spec.ts) | 頁面可達後的預設瀏覽器交接 |

### 不變式歸屬

不釋出不變式伴生入口，因為每項貢獻——frontend-static 子外掛、提示詞段落與 bash 變數註冊——都會隨 fiber 由註冊表釋放，且每個所屬註冊表的包負責該關係的不變式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入瞭解共享核心、瀏覽器過載流水線或已建置的前端時，閱讀以下頁面。

- [組合包索引](../README.zh.md)——基於同一核心建置的表層。
- [dsh-base](../base/README.zh.md)——GUI 執行其上的共享核心。
- [dsh-client-hmr](../../client/hmr/README.zh.md)——開發期間用戶端外掛變更如何過載。
- [frontend-static](../../host/frontend-static/README.zh.md)——已建置的前端如何被服務。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### Harness 原始碼與 Web 表層上下文

#### 模型看到什麼

當 `surfaceContext` 為 true 時，`harness:source` 段落標明磁碟上的 Harness 實作，但不會聲稱它就是工作目錄；全域段落 `app:web-surface`（first-party 順序 10100，位於可複用指令之後）則向模型說明 GUI：規範的本地 URL、「this page」指代什麼、更新約定（過載接收端始終開啟；無重新整理過載還需要 `pnpm run dev:web` watcher），以及不要啟動替代伺服器的指令。`DSH_WEB_URL` 還會連同描述出現在受管 bash 環境中，每次呼叫時從執行中的伺服器解析。當它為 false 時，這兩個段落和該變數都不會註冊。

#### Token 影響

每個工作階段一行原始碼說明和一段提示詞，外加兩行受管環境變數；每個程序內保持恆定。

#### KV Cache 影響

原始碼與 Web 段落位於第一方可複用指令之後。工具與設定一致時，不同 checkout 路徑或本地埠不會改變前置字首；不保證提供者複用快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你在不常見的環境下會遇到什麼——原始碼 checkout、SSH 工作階段或嚴格網路。它們是目前包約束，不是通用的瀏覽器對比或任務積壓。

- **前端必須已建置**——原始碼 checkout 需要先執行 `pnpm run build`；dist 缺失時啟動會以建置提示停止，且沒有從原始碼直接服務的退回路徑。
- **LAN 地址只在啟動時取樣一次**——啟動後的網路卡變化不會重新公告；列印的 LAN URL 始終與取樣結果一致。
- **只能觀察到交接的啟動**——GUI 只報告瀏覽器被請求開啟，而不是它確實開啟了；之後的瀏覽器退出永遠不會上報，列印的 URL 是你的手動退回路徑。
- **SSH 工作階段保留 URL 但跳過瀏覽器交接**——列印的 URL 指向遠端主機 loopback 端點；SSH 用戶端或編輯器必須暴露並開啟本地轉發地址。
- **`BROWSER` 覆蓋只能來自環境**——被發現的 `.env` 不能設定 `BROWSER`；只有繼承值能為自動交接選擇可執行檔案。
- **不支援繫結所有網路介面**——出於安全考慮，`--host 0.0.0.0` 會在啟動時被拒絕；請使用預設 loopback 主機。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

Web 組合包含帳號 Remote 控制器和帳號設定頁面。
