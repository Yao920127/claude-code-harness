# 打包與安裝外掛

[English](publish.md) | 中文

前幾篇教學透過 `--patch` overlay 載入本地外掛。本教學把它打包成可安裝的**組合包**（bundle），用 `dsh plugin add` 安裝進一個 **profile**，並解釋決定組合後設定的層順序。本文假設 `dsh` CLI 已安裝。請先完成[外掛設定](./config.zh.md)。

如果改用全新的原始碼 checkout，請先按照[從原始碼執行章節](../../../../README.zh.md#run-from-source)完成準備，將本教學的 `hello-plugin` 目錄放在儲存庫根目錄，並從該目錄把下文的 `dsh ...` 命令改為 `pnpm dsh ...`。建置與啟動器行為見[原始碼執行](../../../../apps/cli/reference/README.zh.md#source-execution)。

## 兩個概念，兩種 manifest

安裝機制建立在兩個概念之上。二者都由一份 `package.json` 描述，但它們在 `dsh` 鍵下攜帶的 manifest（中繼資料清單）種類不同，回答的問題也不同：

- **組合包**是附帶一個設定層的 npm 包。它的 manifest 宣告 `dsh.bundle`，回答的是"這個包貢獻什麼？"：一個插入或覆蓋外掛行的 patch 檔案。
- **profile** 是位於 `$DSH_HOME/profiles/<name>` 下、描述一份可啟動組合的目錄。它的 manifest 宣告 `dsh.profile`，回答的是"這套設定由哪些組合包按什麼順序組成？"。

組合包是你編寫並分發的東西；profile 是使用者用 `dsh --profile <name>` 啟動的東西。沒有東西同時是兩者。

### 組合包 manifest

建立包目錄：

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

建立 `hello-plugin/package.json`：

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

建立 `hello-plugin/index.js`，寫入外掛入口：

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

建立 `hello-plugin/cordis.patch.yml`。這個 patch 與你寫過的 `--patch` overlay 一樣，是一個 patch 條目的 YAML 陣列；區別是外掛行按包名而不是相對原始碼路徑引用這個包，這樣 Node 的模組解析才能找到已安裝的程式碼：

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

`patch` 也接受一個有序的檔案列表，例如 `["./base.patch.yml", "./web.patch.yml"]`；launcher 按該順序把它們作為同一層應用，每個檔案中的相對外掛路徑相對於該檔案解析。沒有 `dsh.bundle` 宣告的包仍然可以安裝，但只作為普通依賴：`dsh plugin` 會列印警告，且不啟用任何層。如果一個庫供外掛包 import，而不是供使用者啟用，就使用這種包格式。

### profile manifest

profile 目錄包含兩個檔案：

- `package.json` — profile 的樹外外掛依賴（由 pnpm 管理），加上 `dsh.profile` manifest 及其有序的 `bundles` 列表。
- `cordis.patch.yml` — 使用者自己的 patch 層，在每個組合包層之後應用。

profile manifest 從不需要手寫：`dsh --profile <name> --from-default-profile <template>` 可以從隨附應用範本建立 profile，`dsh plugin` 則建立一個以 base 為基礎的 profile，並維護其中已安裝的 bundle 列表。建立規則以 [CLI（命令列介面）行為參考](../../../../apps/cli/reference/README.zh.md#profile-boot)為準；下一節展示外掛路徑。

## 安裝進 profile

`dsh plugin --profile <name> <args...>` 在 profile 目錄內轉發給 pnpm，因此所有 pnpm 子命令都可用。在包含 `hello-plugin` 的目錄中安裝該包的 checkout：

```sh
dsh plugin --profile demo add ./hello-plugin
```

首次使用會初始化 profile（`@deepseek-ai/dsh-base` 作為它的第一個組合包），pnpm 連結該 checkout，而 `dsh` 因為這個包宣告瞭 `dsh.bundle`，把它追加進 `dsh.profile.bundles`：

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:/path/to/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-hello-plugin"
      ]
    }
  }
}
```

透過連結安裝的 checkout 保留自己的 `node_modules`。與 harness 自身的包一樣，需要與主機共享實例的 dsh 包同時宣告在 `peerDependencies` 與 `devDependencies` 中。在該 manifest 的查詢位置，執行中 dsh 的 runtime resolution 已包含的 peer 使用安裝中的副本；devDependency 副本供型別檢查和獨立測試使用。需要獨立版本的第三方依賴和無狀態 dsh 工具包放在 `dependencies` 中。

普通 linked import 遵循 Node 的祖先順序，檢查每個目錄目前的 peer 宣告。更近的物理包先於更高的 peer 宣告。link 目標可以沒有 `package.json`，祖先 peer 仍可生效，即使該 manifest 旁沒有物理 `node_modules`。顯式 `require.resolve(..., { paths })` 始終是原生查詢，包括指向 profile 內的路徑。npm、Desktop 與原始碼啟動共用這些規則；規則不會使已載入模組失效，也不驗證 peer 版本範圍。作用域和檔案查詢行為見[解析規則](../../../../.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.zh.md)。

連結整個 checkout 不會對執行中安裝自身的包目錄應用 peer 攔截。目標仍位於 profile 內的連結（包括它的 pnpm store）屬於 profile 自己安裝的內容，不算外部 linked root。外部連結互相重疊也不改變查詢順序，每個請求仍從其 importer 所在目錄開始。

先不啟動、只驗證該層，再啟動：

```sh
dsh --profile demo --dump-config   # shows a "# == dsh-hello-plugin" layer
dsh --profile demo
```

`dsh plugin --profile demo remove dsh-hello-plugin` 會同時移除依賴和對應的層。

## 載入順序

生效設定在空根之上按以下順序逐層組合：

1. profile 的 `dsh.profile.bundles` 列表所列的各個組合包 patch，按列表順序——先是 `@deepseek-ai/dsh-base`，然後是每個已安裝組合包，按其加入順序。
2. profile 自己的 `cordis.patch.yml`。
3. home 級的 `$DSH_HOME/cordis.patch.yml`——各 profile 共享的機器本地偏好。
4. 每個 `--patch <path>` overlay，按 argv 順序。

應用參數不是另一層 patch。表層組合包可以透過下文所述的普通應用自有服務解析它們。

後應用的層按行勝出，且 patch 會替換目標行的整個 `config` 值，而不是深度合併各鍵。這給組合包作者帶來兩個推論：

- 你的 patch 可以按 `id` 覆蓋前面各層的行——就像 [`dsh-web-app` 組合包](../../../../packages/bundle/web-app/cordis.patch.yml)覆蓋 `dsh-base` 的行那樣——但必須重述該行需要的每一個鍵，而不是隻寫改動的那個。
- 使用者可以在自己 profile 的 `cordis.patch.yml` 中覆蓋你的行，無需改動你的包，所以優先給出使用者大機率會保留的設定預設值，其餘交給 schema 承擔。

內建組合包名稱始終從 dsh 安裝目錄本身解析；pnpm 只管理樹外的包，所以你的組合包可以放心依賴 `@deepseek-ai/dsh-base` 存在且與安裝保持一致。

## 讓表層組合包持有自己的命令列

定義了可執行應用的組合包掛載一個普通提供者外掛：

```yaml
- id: hello-startup
  name: 'dsh-hello-plugin/startup'
```

該外掛匯出 `inject = ['cmdlineArgs']`，使用自己的 commander program 呼叫 [`@deepseek-ai/dsh-cmdline`](../../../../packages/boot/cmdline/README.zh.md) 中的 `parseCmdline`，再在 program 自己的 action 中把應用自有服務提供出去。啟動器把自身 flag 之後的同一份不可變參數交給每個外掛，因此新增應用專屬 flag 無需修改啟動器，多個外掛也可以解析該快照。Loader 行不需要啟動器標記或特殊型別。

受這些參數設定的行會注入提供者服務，並在自己的 `!!js` 選項中讀取它，同時把部署取值寫在旁邊作為退回：

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

遇到 `--help` 時，提供者不會發布該服務，所以這些行不會啟用。Loader 只掛載一次組合，等待每一行的普通注入，再基於其已注入的上下文求值該行的 `!!js` 設定。

## 從 GitHub 安裝：建置腳本這道坎

釋出到註冊表不是必須的——使用者可以直接從 git 託管安裝：

```sh
dsh plugin --profile demo add github:you/hello-plugin
```

但 git 安裝拉取的是**原始碼，不是建置產物**：沒有任何環節執行你的 `build` 腳本，因此 TypeScript 包到手時沒有 `lib/` 輸出，載入會失敗。必須兩邊各做一件事：

- **作者**提供一個 `prepare` 腳本——pnpm 在 git 安裝後執行它——從原始碼建置出釋出入口，且必須自包含：不能假設僅開發環境才有的上下文，例如旁邊有一份 monorepo checkout。專用的 tsdown 設定可以直接轉譯 `src/`，不用專案引用，也不做型別檢查。
- **使用者**為建置授權。pnpm ≥10 在得到顯式允許之前拒絕執行 git 依賴的 `prepare` 腳本，所以第一次 `add` 會失敗；`dsh` 會指出修法——把 pnpm 列印的確切包鍵複製進該 profile 的 `pnpm-workspace.yaml`：

  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```

  然後重新執行 `add`。

請把這項授權視為**允許該包的程式碼在安裝時於你的機器上執行**，且不在 agent 執行的任何沙箱之內。只對原始碼可信的包授權，並鎖定 commit（`github:you/hello-plugin#<sha>`），讓後續推送無法悄悄改變實際執行的內容。

如果不想讓使用者做這項授權，就改為分發建置產物——以下兩種形式都不需要任何建置權限：

- **釋出到 npm**，在 `pnpm publish` 時建置好 `lib/`；`dsh plugin add your-package` 安裝的就是預建置程式碼。
- **交付 tarball**：用 `pnpm pack` 打包；使用者執行 `dsh plugin add ./hello-plugin-0.1.0.tgz`。

## 下一步

- [外掛與生命週期](../framework/index.zh.md) — 外掛的完整生命週期
- [CLI（命令列介面）行為參考](../../../../apps/cli/reference/README.zh.md) — 確切的層優先順序、flag 與 profile 機制
