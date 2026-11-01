# `@deepseek-ai/dsh`

[English](README.md) | 中文

`dsh` 是唯一受支援的 Node 應用啟動器；profile 由多個外掛組合包 patch 層按順序疊加而成，其上再應用使用者自己的覆蓋設定。SDK 與 ACP（Agent Client Protocol）都是 profile，而不是獨立的公開可執行命令。Python 執行時 wheel 包中也包含同一個命令；SDK 預設使用 `sdk`，極簡範例選擇 `sdk-minimal`。[`src/args.ts`](src/args.ts) 負責命令語法，[`src/bin.ts`](src/bin.ts) 只載入選中的執行器。無效命令、來自其他模式的選項，以及致命的設定或啟動錯誤都會以非零狀態退出。

## 入口模式

| 命令 | 用途 |
|---|---|
| `dsh <name>` / `dsh --profile <name>` | 啟動位於 `$DSH_HOME/profiles/<name>` 的指定 profile。 |
| `dsh --profile <name> --from-default-profile <template>` | 從隨附範本建立新的自定義 profile，然後啟動它。 |
| `dsh --profile acp` | 透過 ACP stdio 為自動化用戶端提供服務，直至斷開連線。 |
| `dsh --profile headless "job"` | 執行一個全新的持久化工作階段，列印最終答案並退出。 |
| `dsh --profile sdk` | 透過 JSON-RPC stdio 為 SDK 用戶端提供服務，直至關閉或斷開連線。 |
| `dsh --profile sdk-minimal` | 以獨立極簡 agent（智慧代理）設定樹為 SDK 用戶端提供服務。 |
| `dsh web` | 啟動 Web profile。 |
| `dsh plugin --profile <name> <pnpm args>` | 透過在 profile 目錄中轉發給 pnpm 來管理該 profile 的外掛。 |

執行命令時所在的目錄將作為預設 workspace 根目錄。`web`、`cch`、`headless`、`sdk`、`sdk-minimal` 和 `acp` profile 在首次使用時會從隨附範本自動初始化。使用 `--from-default-profile` 可以基於這些範本之一，在尚未使用的非內建名稱處建立其他 profile；透過 `dsh plugin` 則可以初始化一個以 base 為基礎的 profile。`desktop` 名稱保留給 Electron 持有的 profile，因此 CLI（命令列介面）會拒絕針對它的啟動、設定 dump 和外掛管理請求。

<a id="cch"></a>
## cch profile

隨附的 `cch` profile 組合與 Desktop profile 相同的組合包：以 Claude Code 為預設模型路由、Claude 品牌與繁體中文的 Web 應用。它的啟動方式與其他 profile 相同；儲存庫的 `pnpm cch web` 腳本以原始碼 launcher 啟動它，並把後續參數交給 Web 應用。

```sh
dsh cch                    # boot the cch profile
pnpm cch web --no-open     # from the repository: the same, without opening a browser
```

`cch` profile 與其他 CLI profile 共用 `$DSH_HOME` 中的工作階段與設定；Desktop 應用保留自己的 profile 目錄與已安裝外掛。

## 應用參數

啟動器只解析自身的 flag，並將其後的所有內容交給已啟動的 profile；注入該 profile 的任意應用外掛都可以解析這份共享的不可變快照（[`dsh-cmdline`](../../packages/boot/cmdline/README.zh.md)）。啟動器無法識別的第一個 token 標誌著應用參數的開始：

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profile

profile 目錄包含一個 `package.json`，其中記錄樹外外掛依賴，以及 profile manifest（中繼資料清單）`dsh.profile`、其中按順序排列的 `bundles` 列表；還包含一個 `cordis.patch.yml`，其中儲存使用者自己的 patch 層。在 YAML 中啟用的 `dsh-hmr` 監視 profile manifest、profile 與 home 級 patch 檔案，再透過統一序列過載重新組合所有層。未啟用 HMR 時，更改在重新啟動後生效。監聽器註冊期間發生的編輯與後續編輯使用相同的非致命過載錯誤報告。[外掛管理器](../../packages/boot/plugin-manager/README.zh.md) 與 `dsh plugin` 共享包操作和 profile 寫鎖；更新依賴會保留已停用的組合包選擇。CLI 包操作繼承認證環境和終端描述符，支援互動式建置批准；service 呼叫保留清理後的環境並捕捉診斷。

安裝和 profile 啟動會按宣告的 DSH peer 範圍，檢查與 `dsh --version` 顯示值相同的執行時版本。不相容外掛需要使用者明確確認精確版本豁免。[外掛管理器的相容性參考](../../packages/boot/plugin-manager/README.zh.md#version-compatibility-and-exemptions)說明 `version-exemptions`、`allow-version`、`revoke-version`、持久化規則與風險。

設定樹以空根為起點，依次疊加以下設定層：
- `dsh.profile.bundles` 中各組合包的 patch
- profile 自身的 `cordis.patch.yml`，然後是 home 級的 `$DSH_HOME/cordis.patch.yml`
- `--patch` 指定的覆蓋層

`dsh.profile.bundles` 中列出的組合包先從 dsh 安裝目錄解析（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-sdk-app`、`@deepseek-ai/dsh-sdk-minimal`、`@deepseek-ai/dsh-acp-app`），再從 profile 自身的 `node_modules` 解析；pnpm 會將樹外外掛安裝到該目錄。

使用 `--dump-default-config` 和 `--dump-config` 可在不啟動的情況下檢查組合後的設定樹。`--dump-config-schema` 會匯入組合樹中外掛宣告的 schema，並列印描述 entry 與 patch 的 JSON Schema，而不是設定值；檢查不受信任的外掛前，請閱讀 [schema dump 的安全性與範圍](reference/README.zh.md#config-schema-dump)。

層的確切優先順序、flag、關閉行為、部署預設值和原始碼執行方式，以 [CLI 行為參考](reference/README.zh.md)為準。[啟動與過載失敗表](../../packages/boot/app-boot/README.zh.md#startup-and-reload-failures)對比 optional、required 外掛啟動失敗與設定 HMR 的行為。

## 可選覆蓋層

`config/examples/` 交付 GitHub 評審 webhook、記憶 MCP 伺服器與執行時 Cordis 工具的可選覆蓋層。它們絕不屬於預設 profile；設定與安全說明由[使用者指南](../../docs/user/guide/index.zh.md)和[開發實戰指南](../../docs/user/develop/practice/index.zh.md)負責。

## 開發

生產執行需要已建置的包與前端產物。請在儲存庫根目錄單獨執行 `pnpm run build`，然後使用 `pnpm dsh <args...>` 執行 TypeScript 入口並轉發所有參數；模組解析約定以[原始碼執行參考](reference/README.zh.md#source-execution)為準。

`@deepseek-ai/dsh/profile-boot` 匯出向 Desktop Host 提供共享 profile 生命週期。已解析的應用 profile 為執行時包解析指定自己的安裝錨點，同時沿用 Harness home patch、代理環境、遙測開關、patch 熱過載和有界關閉。

[Web 失敗矩陣](tests/profiles/web/tests/web-failure-matrix.expected.e2e.ts)在 `test:expected` 中透過建置後的 CLI 驗證啟動失敗與啟用 `awaitWriteFinish` 的原生設定 HMR。它不呼叫模型 API，而是檢查經過認證的 HTTP 回應、診斷、恢復、程序退出與 dispose；[啟動驗收測試](tests/profiles/web/tests/web-best-effort-startup.expected.e2e.ts)還覆蓋隨附 Web 的必需依賴與埠衝突。
