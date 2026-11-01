# 在網路代理後面執行 DSH

[English](network-proxy.md) | 中文

DSH 會把自身的出站請求——模型呼叫、web 搜尋、頁面抓取、走 HTTP 的 MCP 伺服器——都經由標準代理環境變數所指定的代理發出。它在啟動時讀取這些變數，不需要其他設定。有幾條路徑出於設計或執行時限制保持直連，下文"哪些保持直連"一節列出了它們。

## 匯出環境變數

```sh
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

把這兩行寫進 shell 設定，這樣每次呼叫 `dsh` 都會繼承它們；也可以寫進 `$DSH_HOME/.env`（預設 `~/.dsh/.env`），和 API key 放在一起；匯出的環境變數始終優先於該檔案。專案自己的 `.env` 不能設定它們：它隨 `git clone` 一起到來，DSH 寧可拒絕啟動，也不讓一個儲存庫決定你的流量去向。

需要憑證的代理把憑證寫在 URL 裡：`http://user:password@proxy.example:8080`。DSH 絕不會回顯這個 URL：診斷只點名被拒絕的變數，因此使用者名稱和密碼都不會出現在任何地方。

## 為什麼瀏覽器走代理、終端卻不走

這是最常見的意外，而且並非 DSH 特有。**根本不存在一個所有軟體都遵循的"系統代理"**——實際上有三套互不相干的機制：

| 機制 | 誰會遵循 |
|---|---|
| 作業系統的代理設定 | Safari、絕大多數 macOS 原生應用、Chrome 與 Edge |
| `HTTP_PROXY` / `HTTPS_PROXY` 環境變數 | `curl`、`git`、`npm`、`pip` 以及 DSH |
| TUN 模式（虛擬網路卡） | 所有程式，且對應用透明 |

Clash 這類代理軟體裡的"系統代理"開關只寫第一套。瀏覽器會讀到它，命令列工具則永遠看不到。這就是為什麼匯出環境變數是一個獨立步驟，也是為什麼開啟 TUN 模式後兩者都能工作、且完全不需要變數。

DSH 不讀取作業系統的代理設定。請匯出環境變數，或使用 TUN 模式。

## 指定哪些目標保持直連

`NO_PROXY` 列出需要直連的主機：

```sh
export NO_PROXY=internal.example.com,.corp.example.com,registry.local
```

一個條目寫的是主機名，它連同其下所有子域名一起匹配：`NO_PROXY=example.com` 也會讓 `api.example.com` 直連。字首 `.` 或 `*.` 可以寫，含義相同。條目可帶 `:port`，`*` 則放行全部。

**CIDR 網段不生效。** 作業系統的繞過列表常含 `10.0.0.0/8` 或 `192.168.0.0/16` 這類條目；把它們複製進 `NO_PROXY` 不會有任何效果。請改用主機名或域名字尾。

不需要列出 `localhost` 或 `127.0.0.1`。DSH 始終繞過 loopback，否則它自己的 Web UI 與本地伺服器都會經由代理並形成迴環。

## 值得知道的限制

**不支援 SOCKS 代理。** `socks5://` 形式的值會在啟動時被報告並跳過，指定它的那個 scheme 轉為直連——把 `HTTPS_PROXY=socks5://…` 與一個可用的 `HTTP_PROXY` 一起設定時，`https:` 會保持直連，而不會去借用 HTTP 代理。請把變數指向代理軟體的 HTTP 埠——多數軟體兩者都提供，且 HTTP 埠通常就在相鄰的埠號上。

**只設 `ALL_PROXY` 也夠用。** DSH 會用它為兩種協定後備，儘管 Node 與 curl 在這一點上並不一致。顯式設定 `HTTPS_PROXY` 仍然更清楚。

**做 TLS 攔截的企業代理需要它的憑證。** 如果代理已經可達但請求仍報憑證錯誤，請在啟動前把 Node 指向你所在組織的 CA 包：

```sh
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
```

Node 只在程序啟動時讀取該變數，所以要在執行 `dsh` 之前匯出。

**DSH 替你執行的工具遵循同一個代理。** bash 工具裡的命令、`git`、`gh`，以及作為子程序啟動的 MCP 伺服器都會繼承這些變數。子程序若本身是 Node 程式，則需 Node 22.21 或更高版本才會遵循；更舊的 Node 會直連。如果你的某個代理變數是 DSH 拒絕的值——比如 SOCKS URL——基於 Node 的工具同樣直連而不是起不來，`curl` 與 `git` 則仍會讀取那個值。

**代理 URL 裡的密碼同樣會到達這些工具。** `HTTPS_PROXY=http://alice:s3cret@proxy.example:8080` 就是一個普通環境變數，因此 DSH 執行的每一條命令——包括模型編寫的那些——都能讀到它，而列印環境的命令會把密碼寫進被保留的輸出。這與該變數在你 shell 裡對其他一切程式的行為一致。若這一點重要，請為代理提供一個無需憑證的入口，或改用 URL 之外的方式認證。

## 哪些保持直連

並非 DSH 發出的每個請求都會走代理：

- **本機上的一切。** loopback 始終直連：`localhost`、整個 `127.0.0.0/8` 段、`::1` 與 `0.0.0.0`。代理無法有意義地存取一個只在本地監聽的服務。
- **模型編寫的程式碼。** Workflow worker 與 Node ptc-runtime 程序不接收代理設定，因此模型腳本讀不到可能攜帶密碼的代理 URL。直接請求必須自行設定所需代理，並繼續受到執行沙箱的約束。
- **使用情況遙測。** OTLP 匯出器用的是 Node 自帶的 HTTP 用戶端，而不是代理所設定的那個，因此遙測直連；在禁止直連出網的環境裡它只會失敗。DSH 的任何功能都不依賴它。設 `DSH_TELEMETRY_MODE=DISABLED` 可完全關閉。
- **`web_fetch` 存取字面量私網地址。** 形如 `http://10.0.0.5/` 的 URL 會被拒絕而非交給代理，與未設定代理時得到的拒絕相同。

## 驗證是否生效

讓 agent 抓取一個頁面，同時觀察代理軟體的連線日誌：

```sh
dsh --profile headless "fetch https://example.com and tell me the page title"
```

如果請求沒有出現在那裡，確認變數確實進入了 DSH 自己的環境：

```sh
env | grep -i proxy
```
