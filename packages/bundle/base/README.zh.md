---
description: "共享的 dsh 核心：為每個 dsh --profile 表層提供模型存取、工具、持久工作階段與安全預設值，供使用者組合或定製 profile。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-base

[English](README.md) | 中文

## 概述

每個基於 base 的 `dsh --profile` 表層都執行在 `dsh-base` 上，因此這些表層共享模型連線、完整工具集、持久工作階段歷史和 workspace 安全預設值。隨附的 `sdk-minimal` profile 刻意改用完整的獨立設定樹。你通常不直接操作本組合包——隨發行版交付的基於 base 的 profile 已經包含它，自定義的基於 base 的 profile 則把它放在第一位。需要其他預設值時，應修改自己的 profile patch 或新增後續組合包；本包不是供匯入的庫。

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

你會自動獲得 dsh 核心：隨發行版交付的 `web`、`headless`、`sdk` 與 `acp` profile 已包含它，自定義 profile 則把它列為第一個組合包。之後一切無需任何額外設定即可工作。

### 最小自定義 profile

要在共享核心之上建置 profile，請建立一個 profile，其 `package.json` 把 `@deepseek-ai/dsh-base` 列在首位：

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base"]
    }
  }
}
```

執行 `dsh --profile my-profile "your task"`，你就得到一個可用的 agent（智慧代理），帶模型存取、工具、持久化與預設權限策略。隨發行版交付的 `web`、`headless`、`sdk` 與 `acp` profile 會在首次使用時為你建立。要新增更多組合包，執行 `dsh plugin --profile <name> add <package>`；內建組合包從 dsh 安裝目錄解析。profile 約定見 [app-boot 的 profile 章節](../../boot/app-boot/README.zh.md)。

### 你得到什麼

開箱即用，基於本核心建置的每個 profile 都提供：DeepSeek 模型連線（提供者與模型可設定，你還可以在設定中啟用額外提供者）、完整工具集——檔案編輯、shell 命令、web 搜尋、公開 HTTP(S) 抓取、subagent、任務與目標跟蹤——可跨重新啟動存活的持久工作階段，以及預設權限策略：把檔案寫入限制在工作區內，危險操作前徵詢許可。Web 抓取無需逐次審批，其提供者會拒絕非公開目的地址。回饋儲存在工作階段日誌中。[OTel 工作階段上傳](../../session/session-telemetry-otel/README.zh.md)對所有使用者預設使用 `FEEDBACK_ONLY`，包括 `deepseek-official`：新的文字回饋、訊息評分、編輯與撤回會釋放截至該事件的完整規範工作階段日誌字首，包含上下文。後續記錄等待下一次顯式回饋；傳送已授權批次無需進一步互動或模型呼叫。`DISABLED` 阻止 OTel 捕捉。預設開啟的 [DeepSeek 工作階段日誌貢獻器](../../session/session-log-deepseek/README.zh.md)仍是獨立的請求路徑。

預設檔案編輯使用 `read`、`write` 和 `edit`。`str_replace_editor` 工具仍可顯式啟用。要將它加入基於 base 的 profile，請在 profile、home 或逐次呼叫 patch 中新增以下條目：

```yaml
- insert:
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
      config:
        maxOutputChars: 16000
```

本 bundle 統一掛載 [MCP 資源](../../mcp/mcp-resources/README.zh.md)一次。只需為所需伺服器設定 [MCP 用戶端條目](../../mcp/mcp-client/README.zh.md)。其他提供者掛載的用戶端在所屬作用域中也屬於已設定狀態。呼叫方作用域中沒有已設定伺服器時，不會獲得 MCP 工具或提示詞文字。

### 各平臺的 shell 工具

在 macOS 與 Linux 上你獲得 bash shell 工具；在 Windows 上則獲得對應的 PowerShell 孿生工具，因此每臺機器恰好有一套 shell 棧。各平臺的安全行為完全一致。偏好不受沙盒約束的 PowerShell 執行器的 Windows 主機可以在其 profile patch 中切換 shell 行——切換必須同時停用兩個 PowerShell 行並重新啟用兩個 bash 行，否則 profile 無法載入。

### 更改預設值

要改變基於本核心建置的 profile 提供的內容——不同的預設模型、更嚴格的權限模式、更多或更少的工具——請編輯 profile 的 `cordis.patch.yml` 或新增後面的組合包。每個 patch 條目會替換目標的整個設定，因此請重述每個想保留的設定。保持沙箱化檔案系統提供者作為唯一的檔案寫入路徑：在其之上再新增普通檔案系統提供者會導致 profile 載入失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本組合包是一份靜態 patch 文件：一個應用到空 profile 根之上的 `insert` 列表。它不掛載任何服務、不發出任何事件、也不持有任何可變狀態；每條插入行所屬的包負責該行的行為與不變式。

### 組合機制

patch 會替換目標行的整個 `config`，而不是合併進它。後續組合包層與使用者的 profile `cordis.patch.yml` 按 id 覆蓋行，每行最後一次寫入生效。按模式取值不同的行不屬於這裡：每個模式組合包重述自己的完整設定，讓任何單一行最多隻屬於一個組合包層加使用者層。完整行集合及其設計依據以行內註解寫在 [`cordis.patch.yml`](cordis.patch.yml) 裡；[生成的組合圖](../../../apps/cli/composition.md)負責渲染它。

### 平臺門控

patch 在自身上按平臺門控兩個 shell 棧：`bash-sandbox` 與 `tool-bash` 攜帶 `disabled: !!js process.platform === 'win32'`，孿生行 `pwsh-sandbox` 與 `tool-pwsh` 以取反的表示式僅在 win32 掛載。權限面與 POSIX 完全一致：沙箱策略透過 Windows ACL 受限權杖 runner（`dsh-sandbox-local` → `@deepseek-ai/dsh-sandbox-windows-acl`）執行相同的檔案效果策略，`fs-sandbox` 繼續圍欄 `ctx.fs` 寫入——在其旁再掛載 `dsh-fs-local` 會重複註冊 `ctx.fs` 並在載入時失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 組合包的實體：基礎外掛行，附以行內註解說明各行依據 |
| [`src/index.ts`](src/index.ts) | 包入口；不攜帶任何執行時 API |
| — | 不釋出執行時不變式伴生入口；本包是靜態 patch 列表載體（由其他包擁有的 loader 行構成的 YAML 文件）；它不掛載任何服務、不發出任何事件，也沒有任何可檢查的可變關係。每條插入行所屬的包負責該行的不變式。 |
| [`tests/base.spec.ts`](tests/base.spec.ts) | manifest（中繼資料清單）宣告與平臺門控檢查 |

### 不變式歸屬

不釋出不變式伴生入口，因為本包是靜態 patch 列表載體：每條插入行由所屬的包負責其不變式，組合包自身沒有任何可審計的可變關係。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入瞭解 profile、基於本核心建置的表層或確切組合時，閱讀以下頁面。

- [app-boot 的 profile 章節](../../boot/app-boot/README.zh.md)——profile 如何解析、分層與定製。
- [組合包索引](../README.zh.md)——基於本核心建置的表層。
- [生成組合圖](../../../apps/cli/composition.md)——隨發行版交付的每個 profile 使用的確切外掛集合。
- [Profile 組合包設計筆記](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——profile 與組合包的組合設計。
- [Codex 與 Claude Code 提供者組合包](../../subagent/README.zh.md)——可疊加安裝的可選提供者組合包。

-----

<a id="model-experience"></a>
## 模型體驗

透過每條插入行所屬的包間接產生影響，由各包負責其行的模型可見行為。

#### KV Cache 影響

組合包本身不新增任何請求字首；每條插入行所屬的包負責各自的快取影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你核心何時需要額外注意、覆蓋應放在哪裡。它們是目前包約束，不是通用對比或任務積壓。

- **覆蓋會替換整個設定塊**——patch 條目會替換目標的整個設定，因此你的覆蓋必須重述每個想保留的設定；不會自動合併。
- **按表層的設定屬於該表層的組合包**——web GUI 與 headless 模式取值不同的預設值放在對應表層的組合包裡，而不是共享核心。
- **Windows 的臨時目錄授權是按工作階段的私有子目錄**——`workspace-write` 把寫入限制在工作區與工作階段自己的 temp 子目錄（`<temp>\dsh-<hash>`，受限子程序的 TMP/TEMP 被改寫）；`read-only` 不授予任何臨時目錄寫入權限。見 `@deepseek-ai/dsh-sandbox-windows-acl`。
- **在沙箱化檔案系統提供者之上新增普通提供者會導致 profile 失敗**——兩者註冊同一個服務，profile 因此拒絕載入；二選一。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

基礎組合在憑證服務旁掛載授權服務和平臺帳號提供者。提供者只在顯式登入嘗試期間開啟回呼監聽器。
