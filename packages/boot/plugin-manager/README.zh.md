---
description: "透過 Web 側邊欄或 agent 啟停 profile 外掛，並安裝、刪除或選擇組合包。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-manager

[English](README.md) | 中文

應用擁有的 profile 透過啟動器資訊提供內建包管理器呼叫方式。它在包操作和 registry 檢查中優先於 `pnpmCommand`；其環境僅應用於這些子程序。

## 概述

管理目前 profile 的外掛，無需手動編輯設定。啟停單個外掛條目、選擇已安裝的組合包，以及安裝或刪除外部組合包。在 YAML 中啟用 HMR 時，設定變化立即生效；未啟用 HMR 時，執行中的組合保留到重新啟動。改動影響使用該 profile 的全部工作階段。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [失敗行為](#failure-behavior)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

基於 base 的 profile 提供管理服務。在 Web 中，側邊欄的**外掛**頁（[ui-plugin-manager](../../client/ui-plugin-manager/README.zh.md)）管理 profile 的組合包及其能唯一定位的行；設定頁的外掛列表保持只讀。Agent 預設條目保持只讀。`plugin_manager` 工具提供相同操作，在 Creator 模式中啟用。其他預設仍預設停用。 每個工具操作都要求 `danger-full-access` 或本次呼叫的批准。在較低沙箱模式下，`ask` 會請求審批；`never`、拒絕、取消或審批渠道不可用時均不執行。批准不改變工作階段的權限模式。profile 變更跨工作階段持久化，已安裝的 Host 程式碼在主機程序內執行，不受工作區沙箱限制。依賴建置腳本仍需單獨批准。

未使用 Agent 預設的部署在 profile patch 中啟用工具；使用預設的工作階段由其預設中的 `tool-plugin-manager` 條目控制。

```yaml
- id: tool-plugin-manager
  disabled: false
```

外掛開關只更新 profile 的 `cordis.patch.yml` 中最後一條匹配覆蓋項的 `disabled`；沒有匹配項時追加。匹配依據是條目 id，以及覆蓋項宣告的模組名稱。組合包開關修改 `package.json` 的有序 `dsh.profile.bundles` 列表。關閉保留依賴；開啟追加到列表末尾，可能改變設定優先順序。安裝新組合包預設啟用。home 和單次啟動 patch 保留更高優先順序。

已選擇但無法載入的組合包仍會出現在 `listBundles` 中，並攜帶 `error`；`enabled` 表示儲存的選擇，不代表載入成功。外掛頁面顯示錯誤並允許取消選擇。損壞的組合包無法啟用。管理組合包的檔案變得不可讀後仍受保護。

`listBundles` 為各組合包及其宣告的外掛行提供可選的展示 `meta`，包括已停用的組合包。Client 從這些值中選擇語言。單獨的 `description` 欄位是該組合包原始的 `package.json.description`；元資訊診斷不會阻止管理操作。`plugin_manager` 工具的列表結果不包含 UI 展示元資訊。

`inspect(spec, options)` 在任何東西安裝之前讀出 spec 指向什麼：註冊表包名透過 `pnpm view` 詢問註冊表，在 profile 目錄中執行，因而與安裝使用同樣的代理與認證設定；絕對路徑讀取其 `package.json`；git 地址或 tarball 只答復自己的形式和它被拉取的 `host`。答覆攜帶名稱、版本、描述、該包是否宣告組合包，以及作答的 `registry`，否則給出 `problem`：`invalid-spec`、`already-installed`、`not-found`、`not-a-package`、`not-a-bundle`、`network` 或 `unknown`，並附上問過的 `registries`。呼叫方的 `signal` 或 `inspectTimeoutMs` 會結束查詢。

`installBundle` 在啟動 pnpm 前透過 `git ls-remote` 檢查 GitHub 儲存庫，使用 profile 目錄及安裝器的 Git 與代理設定。`githubConnectionTimeoutMs` 預設為 5000 毫秒，只限制這次檢查，不限制包下載或建置。檢查停用憑證助手和認證提示；只有網路失敗與超時會停止安裝，透過現有失敗型別與診斷日誌返回，並標記 `failedAt: 'spec-host'`。認證、儲存庫查詢及其他失敗繼續交給 pnpm，包括其 HTTPS 到 SSH 的退回。取消安裝或銷燬管理器會停止檢查及其子程序。註冊表包、本地路徑、壓縮包和其他 Git 主機跳過此檢查。儲存庫可達後，下載或組合包驗證仍可能失敗。

註冊表按順序詢問。計劃從 `options.registry` 開始，否則從設定的 `registry`（`null` 即 pnpm 自身設定指定的那個）開始，並在一個註冊表不可達、超時或答覆沒有這個包或版本（尚未同步的映像會如此）時繼續問 `fallbackRegistries`。設定集合之外的註冊表只問它自己，因而私有源永遠不會落到公共源；pnpm 自身的註冊表只在它指向的地址（每次做計劃前經 `pnpm config get registry` 讀出）是 npm 官方源或某個備選源時才算集合成員，否則視為私有源只問它自己。pnpm 自身設定已經指向的註冊表只問一次。查詢以 `--registry` 執行 `pnpm view` 且不帶 pnpm 自身的重試，所以死掉的註冊表會在 `inspectTimeoutMs` 內報告並轉問下一個；pnpm 把拒絕以 JSON 列印在 stdout，讀法與 stderr 相同。安裝保留 pnpm 的重試設定。`registries()` 把設定集合和 pnpm 指向的地址答覆給選擇器。[註冊表 Agent Note](../../../.agents/notes/implemented/architecture/2026-09-18-plugin-install-registries.zh.md) 擁有理由。

可在瀏覽器使用的 `@deepseek-ai/dsh-plugin-manager/registry` 入口匯出 `OFFICIAL_NPM_REGISTRY` 和 `NPMMIRROR_REGISTRY`，供消費方識別這兩個公共註冊表。

`installBundle` 接受呼叫方生成的 `requestId`，`plugin-manager/install-log` 在其下流式轉發每次 pnpm 執行的輸出，`plugin-manager/install-state` 通告 `installing`、`cancelling` 與 `applying`；每問一個註冊表通告一次 `installing`，`attempt` 帶上這次的註冊表、序號和計劃長度。安裝沿用查詢的計劃，從 `options.registry` 開始，以 `--registry` 執行 `pnpm add`，兩次嘗試之間恢復 profile 檔案；換一個註冊表能改變的失敗才轉問下一個，其他失敗即停，錯誤行點名 git 或 tarball spec 自身拉取主機的失敗也停，因為沒有註冊表能替代那臺主機；`failedAt` 說明最後一次失敗的執行連不上的是二者中的哪一個。`cancelInstall(requestId)` 停止執行，只在 Git 檢查或 pnpm 退出且檔案恢復後答覆 `cancelled`，組合包已在應用時答覆 `too-late`，其他 id 答覆 `not-running`；安裝呼叫隨後報告 `application: 'cancelled'`。失敗、被取消或裝入了沒有組合包 patch 的包的執行，會把 `package.json` 與 `pnpm-lock.yaml` 恢復原樣；`packageResult.kind` 按退出方式與輸出對最後一次執行分類，`registries` 列出問過的每個註冊表，`bundle` 給出完成的執行新增的包。`listBundles` 攜帶每個組合包的一句話簡介（包的 `description`）、其 patch 宣告的行及其存活條目，以及它覆蓋的內建行；它列出 profile 自己的組合包、安裝提供的組合包，以及被選中卻沒有組合包 patch 的名字（作為 `not-bundle` 問題），未選中的普通依賴不列出。啟動器的 `OPTIONAL_BUNDLES` 點名的組合包是 `optional`：隨安裝提供、預設關閉、由使用者開啟，永不可解除安裝，也不被任何隨附範本選中（[理由](../../../.agents/notes/implemented/process/2026-09-15-shipped-optional-bundles.zh.md)）。每個完成的操作都會發出 `plugin-manager/changed`；在管理器之外應用的一代 patch（HMR 監視到 CLI 或手工編輯後）不發通知，頁面要到下一次讀取才知道。

`waitForInstall(requestId)` 讓用戶端在回應丟失後等待活動安裝的結果，包括不可取消的應用階段。它返回與原呼叫相同的結果，請求不在活動中時返回 `null`。已完成的結果不保留；`null` 不表示成功或已取消。

pnpm 11 攔下依賴腳本時，失敗的安裝在 `pendingBuilds` 裡報告 profile 中所有待決定的包名，包括先前嘗試留下的；失敗的執行會恢復 `package.json` 與 `pnpm-lock.yaml`，但有意不恢復 pnpm 記錄這些名字的 `pnpm-workspace.yaml`。Web 外掛頁提供**允許這些腳本並重試**；工具可以在使用者於對話中批准這些腳本後，透過 `install_bundle` 的 `approvedBuilds` 代為授權。服務只驗證待決定的名字，不核實對話中的批准。授權按包名儲存在目前 profile，允許以主機使用者的權限執行命令，並在再次安裝失敗後保留。只能批准目前未決定的名字；已有的拒絕與通配規則不能透過此操作覆蓋。`allowBuilds` 裡出現 YAML 錨點或別名時拒絕授權。重試保留原來的啟用選擇。

<a id="version-compatibility-and-exemptions"></a>
### 版本相容性與豁免

點名軟體包的安裝命令（`add`，或帶 spec 的 `install`）會在 pnpm 執行前完成檢查：本地路徑直接讀取其 `package.json`，registry spec 透過 pnpm 的 registry 查詢得到該範圍選中的版本及其宣告的 peer。不相容的 DSH peer 會在 pnpm 執行前使操作失敗，因此不會下載任何內容、不會執行建置腳本；呼叫方隨請求提交的建置批准在此檢查之前記錄，會保留下來。git 或 tarball spec 必須先抓取，因此在安裝後才判定：此時操作會恢復 profile 清單與鎖檔案，並按恢復後的鎖檔案重新安裝（profile 原本沒有鎖檔案時，按恢復後的清單重新安裝且不建立鎖檔案），同時報告該恢復是否成功；已獲准建置腳本的副作用可能保留。本次執行未改動的依賴不會阻塞無關操作：它保持已安裝狀態，執行會輸出點名它的警告，由 profile 啟動拒絕載入。請求 `enabled: false` 的安裝同樣受檢。啟動檢查獨立執行；版本範圍語義見 [App boot](../app-boot/README.zh.md#profiles)。版本豁免不授權依賴腳本。

豁免儲存在 profile 自己的 `compatibility.json` 中（與 `package.json`、`cordis.patch.yml` 並列），將精確的 `package-name@version` 對映到精確 DSH 執行時版本列表。寫豁免不改變依賴、組合包選擇或 patch 層。外掛升級和 DSH 升級都不繼承授權。使用 `plugin_manager` 的 `list_version_exemptions` 取得執行時版本與已有授權，再透過 `set_version_exemption` 提交 `target`、`runtimeVersion` 和 `enabled`。授權還要求 `acceptRisk: true`；只能在警告使用者不相容外掛可能導致崩潰或資料丟失，並獲得使用者對此版本組合的明確許可後傳入。服務驗證確認參數和版本，不核實對話歷史。撤銷可以移除歷史執行時版本的授權。

授權在下一次組合時生效。線上 profile 會重新組合，被授權的外掛會在目前工作階段中掛載，結果報告 `applied`；僅啟動型 profile 在重新啟動前保留目前條目並報告 `restart-required`。

CLI 提供 `dsh plugin --profile <profile> version-exemptions`、`allow-version <package@version> --dsh-version <runtime> --accept-risk` 和 `revoke-version <package@version> --dsh-version <runtime>`。授權會在儲存前列印風險警告。相容性拒絕帶有 `incompatible-version` 錯誤碼，以及每個被拒絕軟體包的 `name`、`version`、`runtimeVersion` 和未滿足的 `peers`；各介面自行呈現這份記錄。Web 頁面透過 locale 詞典生成文案，CLI 拒絕時列印精確的 `allow-version` 命令。透過工具或 CLI 新增豁免後，重試原操作。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `pnpmCommand` | `pnpm` | pnpm 可執行檔名或路徑，與 `dsh plugin` 命令一樣透過 `PATH` 解析。 |
| `inspectTimeoutMs` | `20000` | 單次檢查所做註冊表查詢的上限，單位毫秒。 |
| `githubConnectionTimeoutMs` | `5000` | 安裝前 GitHub 儲存庫連線檢查的時限，單位毫秒。 |
| `registry` | pnpm 自身設定 | 查詢與安裝首先詢問的註冊表，http(s) URL；預設為 pnpm 自身設定指定的那個。 |
| `fallbackRegistries` | `['https://registry.npmmirror.com/']` | 前一個註冊表不可達或沒有該包副本時依次詢問的註冊表，http(s) URL；pnpm 自身的註冊表只在它指向 npm 官方源或這裡的某一個時才進入順序。 |
| `outputBytes` | `16384` | 每次操作返回的 pnpm 診斷位元組上限；完整輸出保留在返回的日誌路徑中。 |
| `lockWaitMs` | `120000` | 取得 profile 寫鎖的最長等待毫秒數。 |
| `idleTimeoutMs` | `600000` | service 包操作允許持續無捕捉輸出的最長毫秒數，達到即被管理器終止；繼承描述符執行的 `dsh plugin` 不受此上界約束。 |

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

服務與 `dsh plugin` 共用 [operations.ts](src/operations.ts) 中的包管理操作。啟動器提供目前 profile；[DSH HMR](../hmr/README.zh.md) 序列執行模組過載、檔案監聽和管理寫入。每次重新整理重新讀取組合包選擇與 patch 層，更新原有根 Include，並等待已移除外掛釋放資源及剩餘 Loader 樹穩定。CLI 與 service 操作共用 profile manifest 寫鎖，防止並行包操作和 manifest 寫入。HMR 不取得該鎖。pnpm 在 HMR 佇列之外執行；安裝在 pnpm 成功後選入組合包，刪除則在執行 pnpm 前取消選入並完成解除安裝。service 執行若在 `idleTimeoutMs` 內沒有任何捕捉輸出即被終止，與退出狀態一併報告 `timedOut`，不論訊號留下什麼退出狀態都歸類為 `timeout`，且不再轉問下一個註冊表，因此單次操作佔用 profile 鎖的時長有上界；CLI 繼承終端、不捕捉輸出，因此不受此上界約束，由操作者中斷。執行以程序退出為完成點，隨後只在一個有界的寬限視窗內排空管道，因此繼承管道的孫程序無法讓操作掛起。被終止的執行會停止整棵程序樹並等待其消失，因為生命週期腳本的存活時間超過啟動它的 pnpm 程序（issue #4981）。每個操作把它啟動的 pnpm 執行記錄在 `.plugin-manager/run.json` 中，並在執行結束時刪除該記錄。持有者程序已退出的鎖會被下一個寫入方接管，但該程序的 pnpm 程序樹可能仍在執行，因此發現記錄的操作最多等待五秒讓記錄中的執行停止，否則不執行 pnpm，並以指明該程序與記錄檔案的診斷失敗。僅依賴欄位變化不會觸發設定過載。

結果包含最後嘗試的階段、目標、磁碟變化、應用狀態和錯誤碼。Web 詞典呈現管理文案；pnpm 與 Loader 的診斷保持原樣。無關的已有故障作為警告返回；新出現、設定變化後的故障，以及顯式啟用目標未啟用，都會使操作失敗。失敗或被取消的安裝會恢復 pnpm 執行前快照的 manifest 與 lockfile（[理由](../../../.agents/notes/implemented/architecture/2026-09-15-guided-plugin-installation.zh.md)）；失敗的刪除保留部分改動和診斷。安裝按 request id 跟蹤到呼叫結束，因此取消只針對一次執行，並且不取 profile 鎖就能等待它結束。CLI 繼承認證環境和終端描述符；service 使用清理後的環境並捕捉輸出。管理器直接讀取檔案和 Loader 狀態，不維護第二份目標狀態註冊表，因此不釋出單獨的執行時不變式伴生入口。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [App boot](../app-boot/README.zh.md)——profile 設定層與啟動策略。
- [Plugin inventory](../../host/plugin-inventory/README.zh.md)——目前 Loader 和預設狀態。
- [外掛管理頁](../../client/ui-plugin-manager/README.zh.md)——基於本服務的 Web 側邊欄頁面。
- [Plugin settings](../../client/ui-settings-plugin-inventory/README.zh.md)——只讀的 Web 清單。

<a id="model-experience"></a>
## 模型體驗

### 管理工具

#### 模型看到什麼

[`plugin_manager` 工具](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plugin-manager) 列出外掛條目和組合包，並執行影響整個 profile 的改動。結果包含儲存狀態變化、應用狀態和包管理診斷。管理操作不會向 Agent 注入訊息。

#### Token 影響

裝配工具消費者時提供工具宣告；每次呼叫追加返回的清單或改動結果。

#### KV Cache 影響

工具結果追加到對話中。啟停其他工具可能改變後續工具宣告及其快取複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- Web 一次批准顯示出來的整組待決定包，沒有逐包選擇。
- 替換已有包後需要重新啟動程序，以載入新的 JavaScript 模組版本。
- 僅啟動時載入的 profile 不能刪除目前程序啟動時使用的包；停止程序後使用 `dsh plugin`。
- 管理器不能關閉自身所需的管理元件、修改其他 profile 或編輯 agent 預設組合。
- 失敗的刪除可能留下部分依賴改動，失敗或被取消的安裝可能在 `node_modules` 或 pnpm 快取中留下已下載檔案。檔案缺失的未啟用依賴仍可刪除。診斷日誌保留在 profile 的 `.plugin-manager/logs` 目錄中。
- 管理結果描述 Host 啟用狀態。瀏覽器同步失敗會在設定的外掛列表中單獨顯示。
- Desktop 包管理操作仍由 Desktop shell 負責。

<a id="failure-behavior"></a>
### 失敗行為

失敗保留已完成步驟，並報告實際殘留狀態。沒有有效組合包宣告的 profile 依賴仍可見、可刪除，但不能啟用。

| 失敗操作 | 處理方式 |
|---|---|
| 安裝：pnpm 執行或組合包驗證失敗 | 恢復 pnpm 執行前快照的 `package.json` 與 `pnpm-lock.yaml`；pnpm 已下載的檔案可能保留。報告安裝失敗。 |
| 啟用：儲存選擇項或載入失敗 | 保留已安裝的依賴和已儲存的選擇項。報告啟用失敗，允許修正、停用或解除安裝。 |
| 解除安裝：任一步失敗 | 停在失敗步驟，保留已完成的改動和待重試刪除的依賴，報告解除安裝失敗。不重新啟用組合包。 |

pnpm 執行和組合包驗證成功即完成安裝，後續啟用失敗不撤銷安裝。解除安裝依次執行：從 `dsh.profile.bundles` 移除組合包、解除安裝執行時貢獻、執行 `pnpm remove`。任一步失敗都不繼續執行後續步驟。

恢復只重寫這兩份快照檔案；使用者編寫的 patch 設定、應用資料、診斷日誌以及 pnpm 已下載的檔案保持原樣，沒有 manifest 引用的包由下一次包操作清理。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
