---
description: "open-in-app 的主機半邊：在 macOS、Windows、Linux 上把已安裝的編輯器、Git GUI、終端與檔案管理器解析為已驗證的啟動器，並以三條 webServer 路由提供目錄、圖示與啟動端點。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-open-in-app

[English](README.md) | 中文

## 概述

將 `dsh-host-open-in-app` 與其[瀏覽器配套包](../../client/ui-open-in-app/README.zh.md)一起使用，讓使用者能在已安裝的編輯器、Git GUI、終端或檔案管理器中開啟 workspace 目錄。本包提供固定的應用目錄，並只顯示主機能夠驗證的條目；新安裝的應用在重新啟動後出現，而檢測到啟動器缺失時會移除對應條目。請求須透過部署的瀏覽器認證與主機來源信任檢查。檢測與啟動命令使用可設定的期限，且不會把繼承的憑證傳給啟動的應用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包掛進攜帶 `webServer`、`connection` 與 `subprocess` 的組合，通常與其瀏覽器表面 [`dsh-client-ui-open-in-app`](../../client/ui-open-in-app/README.zh.md) 並排；只要主機解析出目錄中至少一個已安裝的應用，這對包就會在 Web 工作階段頭部放上 "Open In..." 分體按鈕。

### 何時選擇

當 Web 部署的使用者在本地編輯器、Git GUI、終端或檔案管理器旁工作、希望一鍵在其中開啟 workspace 目錄時選擇本包。若只需從主機程式碼用系統預設應用開啟一個路徑，請用 `dsh-apiproxy` 的 `openPath`——本包的主體是*用哪個*應用，帶逐應用解析與啟動器。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-host-open-in-app'
  config:
    probeTimeoutMs: 10000
    iconTimeoutMs: 10000
    launchWatchMs: 1000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `probeTimeoutMs` | 必填 | 目錄解析主機命令（`xcode-select`、Windows 註冊表讀取）的逐命令期限（毫秒）。 |
| `iconTimeoutMs` | 必填 | 圖示提取主機命令（macOS 的 `plutil`/`sips`、Windows 的 PowerShell 提取）的逐命令期限（毫秒）。 |
| `launchWatchMs` | 必填 | 每次啟動的早期失敗看護視窗：視窗關閉時仍在執行的啟動器計為已啟動並繼續執行，因此它約束的是 open 路由掛起一次成功啟動的時長。 |

三個期限彼此獨立，調整一種操作的超時不會改變其他操作的回應時間；超時是失敗上界而非延遲預算，命令健康時保守的解析/圖示期限沒有任何代價。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-open-in-app)是所有可接受欄位的詳盡來源。

### 目錄及其解析方式

目錄是一份固定白名單，覆蓋編輯器與 IDE（Cursor、VS Code 與 Insiders、Windsurf、Zed、Sublime Text、Xcode、Android Studio，以及 JetBrains 系 IntelliJ IDEA、PyCharm、WebStorm、PhpStorm、GoLand、Rider、RustRover）、Git GUI（Fork、Sourcetree、GitHub Desktop、Tower、GitKraken、SmartGit、Sublime Merge）、終端（Ghostty、Warp、iTerm2、kitty、Terminal、Windows Terminal、Git Bash、GNOME Terminal、Konsole）與各平臺檔案管理器（Finder、檔案資源管理器、`xdg-open`）。每個條目按平臺宣告按序嘗試的啟動器來源，且每個來源產出的都是**已驗證的啟動器**——本機實際持有的產物——絕不是一條裸的安裝記錄：

- **macOS** 在已知應用目錄（`/Applications`、`~/Applications`）中查詢條目的 bundle 拼寫，啟動 `open -a <解析出的 bundle>`；Xcode 跟隨 `xcode-select -p`，因此能找到 Beta 或改名的安裝。不做 Launch Services 查詢，也不掃描磁碟。
- **Windows** 依次讀取 `App Paths` 註冊表鍵、Uninstall 記錄（僅當它們能證明磁碟上存在可執行檔案時才採用）、已知安裝路徑，以及採用版本化安裝目錄的應用中最新的目錄。GitHub Desktop 會同時解析版本化可執行檔案與隨包提供的 `cli.js`，不經命令 shell 呼叫受支援的 `github open <path>` 行為。註冊表讀取按批進行，每次解析每個根只跑一條 `reg.exe query`。
- **Linux 與 Windows 的 CLI（命令列介面）名稱**經組合的 subprocess 能力在程序內解析（PATH/PATHEXT stat，無 shell、無 `which`）；CLI 不在 PATH 上的 Linux GUI 條目退回到其 XDG desktop 條目驗證過的 `TryExec`/`Exec` 可執行檔案，且只有主機宣告瞭 display server 時才提供 `xdg-open` 檔案管理器條目。

### 預期行為

[啟動環境](../../util/launch-environment/README.zh.md)中繼承的程序層的 `SSH_CONNECTION` 或 `SSH_TTY` 非空時，應用列表為空，Web 頭部隱藏 Open In，包括已記住的應用選擇。專案與使用者 `.env` 中的值不作為 SSH 啟動的依據。主機跳過應用探測，並拒絕不可用應用的圖示和啟動請求。SSH 工作階段即使攜帶顯示服務或 VS Code IPC 連線，也遵循此規則；若啟動器移除了兩個 SSH 標記，本規則無法識別該遠端部署。

解析惰性執行，每主機程序一次，在首個需要它的請求上進行；安裝應用要下次重新啟動後生效，解除安裝方向則立即自愈——啟動時發現可執行檔案已消失會只重解析該條目一次，無法再證明時把它從列表中移除。圖示路由在每個可提取的平臺上提供應用真實圖示：macOS 上 bundle 的 `.icns` 轉 128px PNG，Windows 上可執行檔案的關聯圖示轉 32px PNG，Linux 上 desktop 條目在 hicolor 主題中的圖示（PNG 或 SVG）；提取不到的圖示應答 404，瀏覽器表面渲染通用佔點陣圖形。

### `./shared` 子路徑

路由路徑與 wire 載荷型別以瀏覽器安全的 `./shared` 子路徑釋出（只有常數與型別，沒有執行時身份）；瀏覽器包把它內聯進自己的 client bundle。路由或載荷的變更落在 `src/shared.ts`，兩個包都從那裡取得。

-----

<a id="understand-the-implementation"></a>
## 理解實作

Linux 桌面檔案欄位和圖示使用共享的 [native-command](../../util/native-command/README.zh.md) 工具。目錄開啟器來自本包的已安裝應用列表，檔案開啟器來自作業系統的檔案關聯。

<details>
<summary>實作內幕——點選展開</summary>

本包拆為一張資料表與三個角色。[`src/catalog.ts`](src/catalog.ts) 是編譯期表格：每個條目按平臺的 locator 鏈（`fixed`、`app`、`xcode`、`cli`、`file`、`scan`、`app-paths`、`install-record`、`github-desktop`、`desktop`），以及 Linux 上擁有其圖示的 desktop 條目 id。[`src/resolver.ts`](src/resolver.ts) 把表格解析到本機：一趟產出目錄 id 到已驗證啟動的對映（主/退回 argv 加圖示來源），共享一次批次的 Windows 註冊表讀取；argv 啟動以清理過憑證的環境（`scrubbedParentEnv`）疊加介面卡顯式環境後 detached 派生，Windows GUI 預設保持可見，只有負責另行開啟 GUI 的 CLI 介面卡會隱藏自己的程序。`shell-open` 啟動（檔案管理器）在同一看護視窗下經 `dsh-native-command` 的路徑開啟器執行 OS shell 的 open verb，spawn 的 `ENOENT` 被歸類為 `missing`，讓路由能重新整理失效條目。[`src/icons.ts`](src/icons.ts) 按平臺提取圖示：macOS 在解析出的 bundle 上跑 `plutil`/`sips`，Windows 在解析出的可執行檔案上跑生成的 PowerShell `ExtractAssociatedIcon` 腳本（`-File` 位置參數讓路徑不經過命令列解析），Linux 走 desktop 條目/hicolor/pixmaps 的檔案系統查詢。

[`src/index.ts`](src/index.ts) 在 `ctx.webServer` 上註冊三條路由：`GET /open-in-app/apps`（解析對映的 keys）、`GET /open-in-app/icon/<id>`（提取的圖示，程序內記憶體快取）、`POST /open-in-app/open`（直接使用對映中已驗證的啟動器——絕不重新檢測）。每條路由都先向組合的 `connection` 服務詢問是否拒絕；完整的信任敘述——Host/Origin 柵欄與瀏覽器認證——唯一的出處在 [`src/index.ts`](src/index.ts) 的模組註解。在該柵欄之上，open 路由在 wire 邊界驗證請求體：`application/json` 媒體型別、64 KiB 上限、解析為可用的目錄 id、指向現存目錄的絕對路徑。解析與圖示命令經 [`@deepseek-ai/dsh-native-command`](../../util/native-command/README.zh.md)（argv，絕不走 shell）在各自期限內執行；PATH 名稱走 `ctx.subprocess.resolveExecutable()` 程序內解析。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [dsh-client-ui-open-in-app](../../client/ui-open-in-app/README.zh.md)——消費這三條路由的瀏覽器分體按鈕。
- [dsh-subprocess](../../subprocess/subprocess/README.zh.md)——提供程序內 PATH 解析與清理過的子程序環境的能力。
- [dsh-native-command](../../util/native-command/README.zh.md)——解析與圖示命令的免 shell 主機命令執行器。
- [dsh-host-webserver](../webserver/README.zh.md)——承載三條 HTTP 端點的路由註冊表。
- [Host 包地圖](../README.zh.md)——本包所屬的 GUI 主機家族。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包為人開啟主機應用，不觸及任何提示詞、訊息、schema、流或工具結果。

#### KV Cache 影響

無；本包從不組裝或傳送提供者請求。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- **目錄在建置期固定。** 部署無法從 cordis.yml 增加自己的編輯器或 Git GUI；擴充功能列表意味著同時擴充功能 `OPEN_IN_APP_CATALOG` 與瀏覽器包的詞典。作業系統可以定位已知應用，但無法證明每個已安裝應用都能接收 workspace 目錄，也無法給出各應用需要的啟動協定，因此本包不會無邊界地列舉 OS 應用。可設定的 custom handler 仍然延後；其中由使用者提供的 label 屬於使用者資料，不是 locale 擁有的產品文案。
- **macOS 檢測只查已知路徑。** bundle 改名超出目錄收錄的拼寫、或挪到 `/Applications` 與 `~/Applications` 之外就不會被檢測；不做 Launch Services 查詢（原生 LaunchServices/NSWorkspace 查詢需要儲存庫尚無的 addon），也刻意不掃描磁碟。
- **圖示保真度受平臺約束。** Windows 圖示來自 32px 的 `ExtractAssociatedIcon`——不帶原生 addon 時 .NET 標準面能給出的最大尺寸——在高分屏上可能略微發軟；Linux 圖示只查 hicolor 主題與 pixmaps，不追使用者的自定義圖示主題；若干條目（沒有 desktop 條目的純 CLI 啟動器）沒有圖示來源，保持通用佔點陣圖形。
- **新安裝要重新啟動後出現。** 解析每主機程序一次；只有解除安裝方向自愈（啟動器缺失時當場只重解析該條目）。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作語境——點選展開</summary>

轉正期的各項決定——host/`ui-` 分包、為什麼用裸 webServer 路由而非 Typert Remote、目錄為什麼保持編譯期固定、resolver 重設計（已驗證啟動器、單趟解析、點選不再重新檢測）、三期限設定、以及各平臺圖示策略與被拒的替代方案——記錄在[轉正 Agent Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.zh.md)。

</details>

**執行時不變式：** 不釋出伴生入口。本包經三條無狀態路由提供一趟主機解析的結果；路由註冊已由各自的 HMR（熱模組替換）安全測試證明可處置，不存在可能分叉的獨立觀測。
