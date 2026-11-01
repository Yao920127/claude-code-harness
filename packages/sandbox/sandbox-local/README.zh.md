---
description: "面向 Linux、macOS 或 Windows 上選擇、設定或排查程序隔離的使用者與維護者的本地各平臺沙箱後端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-local

[English](README.md) | 中文

## 概述

`dsh-sandbox-local` 在共享主機核心和檔案系統的同時，限制 Linux、macOS 與 Windows 上的命令及其派生程序。它自動選擇受支援的平臺 runner；沒有可用 runner 時以 `SANDBOX_UNAVAILABLE` 失敗，因此命令絕不會靜默無限制執行。每次執行都會報告 `full` 或 `partial` 強制執行，以及拒絕和 runner 失敗簽名，讓呼叫方能區分不可用或損壞的沙箱與策略拒絕。主機本地 bash 或 pwsh 執行適合選擇它；程序需要隔離環境時應改用容器或遠端執行器。

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

在 `ctx.sandbox` 後掛載此提供者並配一個受限執行器，執行器 spawn 的每條命令都會在你解析的策略下受限執行。隨附的[基礎組合包](../../bundle/base/cordis.patch.yml)擁有預設策略與執行器接線。

### 何時選擇

當命令必須在主機上受限執行時選擇它：它是掛載 `ctx.sandbox` 的 Linux、macOS 與 Windows 組合的預設後端。當程序必須在隔離環境中執行時請另選機制——容器或遠端執行器會替換整個能力，而此提供者與主機共享核心和檔案系統。

### 最小設定

載入沙箱服務並掛載提供者；以下預設值即選擇策略。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `runnerCommand` | `[]` | 自定義 runner argv；會追加 bwrap 相容的 profile 參數，斷言完全強制執行，並跳過內建選擇與探測 |
| `runnerFailureSignatures` | `[]` | 識別自定義 runner 自身失敗方言的不區分大小寫 stderr 子串；與 `runnerCommand` 搭配必需 |
| `probeTimeoutMs` | `5,000` | 每次競爭 runner 候選功能探測的超時時間 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-sandbox-local)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 受限執行與強制執行

掛載提供者後，命令在你逐呼叫解析的模式下執行。強制執行是報告的事實，而非承諾：`full` 表示後端管轄模式承諾的每個檔案操作，`partial` 表示它只管轄子集——Windows ACL 檔（硬連結、讀取不受限與 AppContainer ACL 邊界）與較舊的 Landlock ABI 是目前的部分強制執行情形，因此需要絕對邊界的消費方可以拒絕或向上暴露它們。被拒絕的檔案操作透過後端的拒絕方言呈現，執行命令前失敗的 runner 會報告結構化的 runner 失敗簽名。

### 失敗與恢復

不受支援的平臺或不可用的 runner 會拒絕執行：`confine()` 以 `SANDBOX_UNAVAILABLE` 拒絕 並列出該平臺的 runner 選項，消費方會呈現該錯誤，而不是讓命令不受限制地執行。啟動後拒絕自身 profile 的 runner 由其致命 stderr 簽名與結束代碼識別，因此損壞的沙箱不會被誤認為被拒絕的命令。`runnerCommand` 覆蓋是操作方斷言：它跳過功能探測，並假定設定的 runner 誠實實作與 bwrap 相容的 profile。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 runner 選擇、各平臺 profile 與失敗方言；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### runner 選擇

選擇按平臺優先、探測其次：每個平臺都有 runner 鏈（`linux`：`bwrap` 再 Landlock；`darwin`：Seatbelt；`win32`：ACL 受限權杖 runner）。唯一候選直接選擇、不探測；競爭候選按鏈序各執行一次功能探測，首個可用結論在提供者生命週期內快取。沒有鏈的平臺、或鏈上所有探測都失敗時，平臺不可用，`confine()` 會拒絕執行。

### 平臺 profile

bwrap profile 組合只讀主機根目錄、全新 `/dev` 與私有 PID 名稱空間中的 `/proc`——命令可管理其後代，但看不到主機程序，因此 procfs 魔法連結無法繞過掛載；`workspace-write` 另加臨時的 `/tmp` 與可寫工作區繫結掛載。[私有 PID 筆記](../../../.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.zh.md)記錄該邊界。

`@deepseek-ai/node-addon-system/landlock-run` API 提供平臺 launcher、功能探測與授權詞彙；此提供者只做模式到授權的對映，把路徑解析與探測解析保留在帶版本的 binary 中。

Seatbelt profile 預設允許，帶 `(deny file-write*)` 與來自共享 `writableRoots` 輔助函式的寫入 allow-list，因此恰好管轄模式承諾的檔案操作；每個根目錄都經過規範化，因為 Seatbelt 匹配解析後的路徑（`/tmp` 就是 `/private/tmp`）。

Windows 檔為每個工作區保留一個確定性寫入 SID 和常駐 ACE，同時為每個活躍的工作階段/工作區對分配一個隨機私有臨時目錄，以及不同的 SID 和可撤銷 ACE——共享工作區的工作階段共享其預期寫權限，卻不會繼承彼此的臨時目錄權限。新的提供者總會選擇新的臨時路徑和 SID，因此崩潰殘留既無法阻止恢復的工作階段，也無法向其授權。該檔報告 `partial` 強制執行，因為 NTFS 硬連結會把同一檔案物件別名為多個路徑、讀取仍不受限，且被其他 AppContainer 工具以包 SID 標記過的目錄樹對 Low 完整性子程序不可讀。

建置後的 ACL runner 缺失時，原始碼啟動將 `tsx/esm/api` 載入器和 TypeScript 路徑對映固定到本安裝目錄。命令的工作目錄和環境中的 `TSX_TSCONFIG_PATH` 無法選擇 runner 的原始碼依賴。

### 拒絕與 runner 失敗方言

每個 runner 的核心都有自己的拒絕方言，隨每次包裝以 `denialSignatures` 攜帶，`runnerFailureRules` 則給出每個 runner 的致命簽名，因此消費方先分類 runner 拒絕，再檢查拒絕簽名。精確的字串與結束代碼位於 [`src/index.ts`](src/index.ts)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：runner 鏈選擇、功能探測、逐呼叫包裝、ACL 授權生命週期 |
| [`src/profiles.ts`](src/profiles.ts) | 各平臺 profile 建置器：bwrap 掛載、Landlock 授權、Seatbelt SBPL |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文件瞭解共享詞彙，再看 seam 約定、消費方與 win32 檔。

- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐呼叫策略與分類方言。
- [沙箱 seam 包](../sandbox/README.zh.md)——本提供者實作的服務約定。
- [Bash 沙箱執行器](../../shell/bash-sandbox/README.zh.md)——受限的 bash 消費方。
- [Windows ACL 受限權杖檔](../sandbox-windows-acl/README.zh.md)——本提供者掛載的 win32 後端。
- [子程序沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——能力邊界與 runner 選擇語義。

-----

<a id="model-experience"></a>
## 模型體驗

透過 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md) 和 [`dsh-tool-bash`](../../shell/tool-bash/README.zh.md) 間接影響；它們渲染此提供者的強制執行與拒絕事實，而 [`dsh-sandbox`](../sandbox/README.zh.md) seam 擁有 `SANDBOX_UNAVAILABLE` 文字、本提供者擁有 runner 選擇，profile 不進入上下文。

#### KV Cache 影響

不會直接使 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供者何時不合適，或何時需要特別運維。它們是目前包約束，不是通用平臺對比或任務積壓。

- **Windows ACL 只能實作部分強制執行**——NTFS 硬連結會使工作區路徑與外部路徑指向同一個檔案物件，讀取仍不受限，且被其他 AppContainer 工具以包 SID 標記過的目錄樹對 Low 完整性子程序不可讀。提供者報告 `enforcement: 'partial'`，而不會把該邊界誇大為完整強制執行。
- **Landlock 可能只實作部分強制執行**——較舊且受支援的核心 ABI 只能限制自身公開的存取類別，因此報告 `enforcement: 'partial'`，不會誇大為完整強制執行。
- **Seatbelt 依賴已棄用的 `sandbox-exec`**——macOS 仍會提供它，但若 Apple 移除該私有策略引擎，該提供者無法替換或探測。
- **runner 選擇在提供者生命週期內快取**——安裝、移除或修復 runner 後，必須過載外掛才能改變選擇。
- **`runnerCommand` 是操作方斷言**——設定的自定義 runner 會跳過功能探測，並假定它誠實實作與 bwrap 相容的 profile；如果它本身是 Bash 腳本，其直譯器啟動發生在該腳本施加約束之前。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：未決方向與開放問題。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：環境一致的能力組

[沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)把環境一致的能力組範例（例如 bash 加 fs 針對同一個容器）列為延期階段；該方向尚未決定。

</details>
