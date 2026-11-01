---
description: "面向 Windows 上選擇、設定或排查受限權杖程序隔離的使用者與維護者的 Windows 寫入限制沙箱後端。"
kind: "package-library"
---

# @deepseek-ai/dsh-sandbox-windows-acl

[English](README.md) | 中文

## 概述

在 Windows 上，本包將子程序的寫入與刪除限制在工作區和私有臨時目錄內：`workspace-write` 授予這兩處，`read-only` 均不授予。掛載 `dsh-sandbox-local` 後，受限的 bash 與 PowerShell 命令即獲得此行為；呼叫方也可以直接使用公開 `AclSandbox` API；任何 Win32 操作失敗都會阻止不受限制的 spawn。每次授權同時寫入能力 SID 允許 ACE、對父目錄刪除權限的環境性拒絕，以及被降級權杖必須匹配的 Low 完整性標籤，因此一個授權根目錄無法觸及另一個。該保證仍為部分強制：硬連結是檔案物件別名，而被其他 AppContainer 工具 ACL 過的檔案不可讀。

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

在 Windows 上，掛載本地沙箱提供者後，此後端就是 `ctx.sandbox` 背後的 runner——無需額外設定。要在 harness 之外 spawn 受限子程序時，直接嵌入 `AclSandbox` API。

### 何時選擇

為在 `read-only` 或 `workspace-write` 下隔離子程序檔案操作的 Windows 組合選擇它。當子程序還需要讀側隔離或網路限制時請另選機制：`WRITE_RESTRICTED` 只交叉檢查寫存取，因此請把此後端與讀側策略或 AppContainer 能力權杖配對以獲得更強隔離。

### 直接 API

`AclSandbox` 以捕捉 stdio 的方式 spawn 受限子程序（runner 風格使用可用繼承 stdio）。它要求顯式提供私有臨時目錄，或用 `tempDir: null` 停用臨時寫入——環境臨時根目錄絕不會被隱式授權。

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AclSandbox, tempWriteSid, workspaceWriteSid } from '@deepseek-ai/dsh-sandbox-windows-acl'

const workspaceRoot = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'dsh-'))

// mode selects the token's restricting-SID list (see Modes below) and must
// match the grant shape. workspace-write requires distinct workspace and
// private-temp identities; pass tempDir: null to disable temp writes.
const sandbox = new AclSandbox({
  writableDirs: [workspaceRoot],
  tempDir,
  writeSid: workspaceWriteSid(workspaceRoot),
  tempWriteSid: tempWriteSid(tempDir),
  mode: 'workspace-write',
})
await sandbox.init() // throws on ANY Win32 failure — never spawns unrestricted

const child = sandbox.spawn({ command: 'pwsh', args: ['-NoProfile', '-Command', '...'], cwd: workspaceRoot })
const { stdout, stderr, exitCode } = await child.wait()

sandbox.dispose() // revokes the revocable (temp) grant and label, keeps the standing workspace pair
rmSync(tempDir, { recursive: true, force: true })
```

工作區的安全描述符改動以常駐方式授予——`dispose()` 保留它們，因為它們是跨實例的複用快取——而不同的臨時 SID 以可回收方式授予。每次授權就是一次呼叫，同時攜帶能力 SID 允許 ACE、環境性刪除拒絕與 Low 禁止上調標籤。伺服器端對應實作是 `AclWriteGrant` 類：每個目錄一次 `add(path, standing)`，`dispose()` 撤銷可回收路徑並釋放各 SID。

### 隔離給你帶來什麼

在 `workspace-write` 下，子程序可以寫入工作區及其私有臨時目錄；受 ACL 管轄的其他寫入與刪除都會被拒絕，已記錄的硬連結與 AppContainer ACL 邊界除外。在 `read-only` 下不存在顯式寫入授權，因此寫入與刪除都會被拒絕，同樣帶有已記錄的邊界。

臨時隔離按每個活躍的工作階段/工作區對進行：共享工作區的工作階段共享其寫權限，但無法寫入彼此的臨時目錄。新的提供者總會選擇新的臨時路徑和 SID，因此崩潰殘留既無法阻止恢復的工作階段，也無法向其授權。

### 失敗與恢復

`init()` 在任何 Win32 失敗時丟擲——子程序絕不會不受限制地 spawn。執行命令前失敗的 runner 會向 stderr 列印 `windows-acl-run: <detail>` 並以 127 退出，seam 的 runner 失敗規則將其歸類為損壞的沙箱，而非拒絕。清理按設計盡力而為：`dispose()` 會嘗試全部臨時撤銷並把失敗聚合為 `AggregateError`。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋受限權杖機制、權杖列表、runner 約定與已驗證邊界；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 機制

呼叫者權杖被複製為 `WRITE_RESTRICTED` 受限權杖，其 restricting SIDs 攜帶彼此獨立的工作區與私有臨時目錄能力，該權杖還會被降級為 Low 完整性。Windows 執行兩次存取檢查——先對正常 SID，再對 restricting SID——並且只在兩次檢查都透過時才授予寫類存取；與此同時，核心的強制完整性檢查會拒絕對任何未標記為 Low 的物件進行寫類存取。寫 SID 交叉檢查只覆蓋物件自身的那次存取檢查：Windows 也可以依據父目錄的 `FILE_DELETE_CHILD` 權限批准寫入或刪除，而這項權限不需要任何 restricting SID 副署，因此只帶交叉檢查的權杖不僅能刪除其環境使用者 SID 所控制的任何檔案，還能刪除**另一個授權根目錄**內的檔案——那裡的 Low 標籤恰好能透過完整性檢查。所以每次授權還會向 world SID 拒絕 `FILE_DELETE_CHILD`，使能力 ACE 的 DELETE 位成為授權根目錄內唯一的刪除授權來源，並在同一次 `SetNamedSecurityInfoW` 呼叫中把該目錄標記為 Low。工作區 SID 由規範工作區路徑確定性派生（`workspaceWriteSid`），因此工作區根目錄的安全描述符改動每臺機器每個工作區只物化一次，之後每次工作階段、呼叫或重新啟動都命中精確 ACE／精確拒絕／精確標籤跳過。每個活躍的工作階段/工作區對則獲得一個隨機私有臨時目錄，以及一個從該路徑派生的 SID（`tempWriteSid`），因此各工作階段共享預期的工作區權限，卻不會繼承彼此的臨時目錄權限。每個策略專用 Win32 呼叫和 [`dsh-win32-process`](../../subprocess/win32-process/README.zh.md) 提供的程序原語都有檢查；失敗丟擲攜帶 API 名、精確錯誤碼、系統文字與失敗上下文的 `Win32Error`——從建構上 fail-closed。

### 模式與權杖列表

`workspace-write`（登入 SID、Everyone、工作區 SID、臨時 SID）為工作區與工作階段的私有臨時子目錄分別授予 Write；`read-only`（登入 SID、Everyone——不含寫入 SID）不授予任何內容。兩種模式都 spawn 降級為 Low 完整性的權杖，對它而言只有被標記 Low 的目錄保持可寫。保活組（登入 SID + Everyone）在兩種模式下都存在：沒有它，早期 DLL 初始化會以 `0xC0000142` 死亡、CNG 會讓 pwsh 以 `0xE0434352` 崩潰。寫入 SID 有意留在 read-only 列表之外：先前 workspace-write 時期留下的常駐授權 ACE 仍然失效，因為 write-restricted 的 pass-2 檢查只授予 restricting 列表所攜帶的內容，而常駐安全描述符改動讓重新升級免於重新傳播。

NUL 寫入是環境性的、不是被授權的：裝置 DACL 授予 Everyone 讀+寫+執行（`0x1201BF`），因此存取掩碼落在其內的開啟者（cmd 的 `> NUL`、node 的 `\\.\NUL`）在兩種模式下都能寫。`Set-Content NUL` 在兩種模式下都失敗（PowerShell/.NET 層效應，非裝置 DACL 所致），而 PowerShell 的 `> $null` 重定向不受影響。

Authenticated Users 在兩種列表中都不存在——WMI 名稱空間安全檢查失敗（`0x80041003`），因此 CIM cmdlet 與 `Get-ComputerInfo` 在所有受限模式下都不可用，且 C:\-root 樹建立逃逸被關閉。INTERACTIVE/LOCAL 同樣不存在：主機的 Public 樹向 INTERACTIVE 授予寫權限，因此 Public 寫入被拒絕。

### 隔離 runner

面向 seam 的形態是 runner 入口（`./runner`）：`dsh-sandbox-local` 在呼叫者命令的位置 spawn 的 argv 字首包裝——與 bwrap/landlock-run/sandbox-exec 同一架構。runner 建立受限權杖，在它之下 spawn 包裝後的 argv，呼叫者的 stdio 直接直接傳遞，把子程序包進 `KILL_ON_JOB_CLOSE` job，映像子程序的結束代碼，並在退出時撤銷其自行管理的臨時授權。每個 runner 側失敗都會向 stderr 列印 `windows-acl-run: <detail>` 並以 127 退出——seam 的 runner 失敗規則匹配該簽名。

```sh
node runner.js --workspace <dir> --temp <dir> --mode <read-only|workspace-write> [--write-sid <S-1-4-…> --temp-write-sid <S-1-4-…>] -- <argv...>
```

seam 先把確定性工作區 SID 的 ACE 常駐物化（每個工作區每伺服器生命週期一次——複用快取），再為每個活躍的工作階段/工作區對建立隨機私有臨時目錄和不同的可回收 SID，把兩種身份作為必須成對出現的 `--write-sid`/`--temp-write-sid` 傳入；runner 對照各自所屬路徑驗證二者，既不授權也不撤銷（`manageDacls: false`）。fork 獲得不同的臨時能力；即使恢復的是同一工作階段，新的提供者也會給出新的路徑和 SID，因此崩潰殘留只是失效垃圾。如果不帶這一對標誌，`--temp` 指定的是根目錄：無 agent（智慧代理）/獨立的 workspace-write runner 會建立隨機私有子目錄，自行管理其臨時 SID，重寫 TMP/TEMP，並在退出時移除該子目錄。重新啟動後重新授權常駐工作區 ACE 是冪等的：`grantWrite` 讀取目前 DACL，當完全相同的 ACE 已存在時跳過重新傳播。工作區若等於或包含臨時根目錄，會在任何授權前被拒絕。

啟動時若帶有 subprocess 控制標記，runner 會透過受限子程序的 CRT 啟動錶轉發 fd 7，並在 spawn 後立即關閉自身副本。可選的 `controlFileDescriptor: 7` 輸入要求 `stdio: 'inherit'`；在管道 stdio 下請求它會在程序建立前失敗。

### 已驗證邊界

- **Everyone 仍留在兩種 restricting 列表中，但不再帶來寫權限。** 保活組是早期 DLL 初始化與 CNG 所必需的；如今 Low 標籤會拒絕對被標記根目錄之外、由 Everyone 授權的寫入，因此這一舊缺口已關閉。
- **在授權根目錄內，能力 ACE 的 DELETE 位是唯一的刪除授權來源。** 授權會向 world SID 拒絕 `FILE_DELETE_CHILD`，這同時移除了環境性預設行為：自身 DACL 未授予 DELETE 的檔案不再能憑父目錄權限刪除——受限子程序與使用者自身程序皆然。使用者日常刪除仍然可用，因為工作區 DACL 直接向其授予 DELETE。
- **拒絕項只繼承到子目錄，且子目錄的 FullControl 開啟會被拒。** `FILE_DELETE_CHILD` 只在目錄上被評估，因此該 ACE 帶 `CONTAINER_INHERIT_ACE`、絕不落到檔案上（它的位 `0x40` 屬於 `FILE_ALL_ACCESS`，若落到檔案上會讓使用者、Administrators、SYSTEM 或 DSH host 的每次 `GENERIC_ALL`／`FullControl` 開啟都被拒絕）。授權根內的目錄保留該拒絕項，因而會拒絕這類開啟；基於 `DELETE` 的刪除、`MAXIMUM_ALLOWED` 與常規讀寫開啟不受影響——兩種結果都已被 runner 套件釘住。
- **寫入與刪除受限；讀取、網路與程序可見性不受限。** 兩層都不交叉檢查讀取，因此受限子程序可以讀取呼叫者可讀的任何檔案（包括其他工作區中的檔案）並開啟套接字；`read-only` 因而需要讀側策略才能表達。
- **硬連結是檔案物件別名，而非路徑別名。** 傳播到已有硬連結上的可繼承工作區授權會標記並授權底層同一檔案的安全描述符，因此同一物件也可透過外部別名寫入；拒絕工作區中的所有多連結檔案不具可行性，因為普通 pnpm 安裝會使用硬連結。
- **控制檯隔離不可用。** 以 `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` 建立的子程序在 DLL 初始化期間以 `STATUS_DLL_INIT_FAILED`（`0xC0000142`）死亡；子程序共享主機控制檯，基於管道的 stdio 重定向不受影響。
- **安全描述符改動是對真實目錄的駐留改動。** 工作區 ACE、拒絕項與標籤按設計常駐（複用快取，絕不撤銷）；臨時改動由 `dispose()` 撤銷——但若該目錄上仍留有其他能力授權，撤銷會保留共享的 Low 標籤——撤銷後殘留的那條拒絕項會隨臨時目錄本身一併消失；手工 `icacls` 清理無法在本平臺回收它們（`ERROR_NONE_MAPPED` 1332），請透過本模組回收。
- **常駐 Low 標籤的生命期長於 DSH，並會向其他 Low 完整性的程序放寬該目錄樹。** 工作區的可繼承標籤在工作階段結束後（以及同卷移動後）依然存在，因此任何以同一使用者身份執行在 Low 完整性的其他程序——別家產品的 Low-IL 沙箱、受保護模式閱讀器——都能寫入與刪除工作區內的內容，而在 Medium 標籤下這會被拒絕。這個標籤是寫邊界的代價：沒有它受限子程序根本無法寫入，而按工作階段回收會導致每次供給都要重新傳播整棵樹。
- **被授權目錄必須由呼叫者擁有並授予 `WRITE_OWNER`。** 所有者隱式獲得的只有 `READ_CONTROL` 與 `WRITE_DAC`；標籤位於 SACL，因此合併應用還需要 `WRITE_OWNER`（完全控制目錄——即正常工作區情形——本就具備）。DACL 只授予 Modify 的目錄現在會大聲失敗，而不是靜默跳過隔離。
- **環境臨時根目錄絕不會被隱式授權。** 直接呼叫方必須提供已存在的私有 `tempDir` 及其不同的 `tempWriteSid`，或用 `tempDir: null` 停用臨時寫入；實際臨時目錄不得與任何可寫根目錄重疊。
- **受限子程序的臨時能力按每個活躍的工作階段/工作區對私有。** runner 在 spawn 之前把 TMP/TEMP 改寫為該私有目錄；共享同一工作區 SID 的兩個權杖無法寫入彼此的臨時目錄。
- **受限權杖下 `whoami` 與權杖檢查 cmdlet 可能失敗。** 子程序對複製權杖的 `GetTokenInformation` 部分不可用，因此這類報告型 cmdlet 是否可用取決於主機環境；這是診斷噪音而非執行故障。

### 標頭檔案驗證與原始碼索引

沙箱擁有的 SID、ACL、權杖、檔案與鎖宣告由 [`verify/abi-probe.cpp`](verify/abi-probe.cpp) 對照 Windows 標頭檔案檢查。共享程序、stdio 與 Job ABI 由 [`@deepseek-ai/dsh-win32-process`](../../subprocess/win32-process/README.zh.md#header-verification) 歸屬並驗證。

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `AclSandbox`：受限權杖策略、DACL 授權、fail-closed 的 spawn 與 dispose |
| [`src/runner.ts`](src/runner.ts) | 基於共享 Win32 程序原語的 runner 入口 |
| [`src/grant.ts`](src/grant.ts) | `AclWriteGrant`：伺服器端授權物化與撤銷 |
| [`src/token.ts`](src/token.ts) + [`src/acl.ts`](src/acl.ts) | 沙箱背後的 Win32 權杖與 DACL 原語 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文件瞭解共享詞彙，再看掛載此檔的提供者、其消費方與設計決策。

- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐呼叫策略與強制執行語義。
- [本地沙箱後端](../sandbox-local/README.zh.md)——把此後端掛載為 win32 檔的提供者。
- [沙箱 seam 包](../sandbox/README.zh.md)——此後端實作的服務約定。
- [Win32 程序庫](../../subprocess/win32-process/README.zh.md)——共享的受限程序、stdio、Job、等待與控制代碼清理原語。
- [Bash 沙箱執行器](../../shell/bash-sandbox/README.zh.md)與[pwsh 沙箱執行器](../../shell/pwsh-sandbox/README.zh.md)——消費它的受限執行器。
- [Windows ACL 受限權杖沙箱決策](../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——為何選擇原始 ACL 受限權杖而非 mxc 與 AppContainer。

-----

<a id="model-experience"></a>
## 模型體驗

間接地透過 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md)、[`dsh-pwsh-sandbox`](../../shell/pwsh-sandbox/README.zh.md) 及其工具呈現；它們渲染此後端的部分強制執行與拒絕事實（工具層透過 `denialSignatures` 分類的受限 stderr），而 [`dsh-sandbox`](../sandbox/README.zh.md) seam 擁有 `SANDBOX_UNAVAILABLE` 文字、`sandbox-local` 擁有 runner 選擇。

#### KV Cache 影響

無直接影響；拒絕面屬於工具層。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明後端何時不合適，或何時需要特別運維。它們是目前包約束，不是通用 Windows 對比或任務積壓。

- **每個工作區一個寫入白名單**——寫入 SID 是白名單的基本單位，且就是工作區身份；同一沙盒實例跨兩個工作區複用時，兩個根目錄會互相擴大授權面。請按工作區根目錄各建一個實例——seam 正是這樣做的，以工作區路徑為鍵。
- **清理按設計盡力而為**——`dispose()` 會嘗試全部臨時撤銷並把失敗聚合為 `AggregateError`；清理失敗可能留下隨機目錄及其僅含臨時 SID 的 ACE。程序退出後，不會再有權杖攜帶該 SID，因此殘留保持失效，直到 OS 臨時目錄衛生或手動移除目錄將其回收。
- **常駐工作區 ACE 是不可見殘留。** 工作區改名會派生新的 SID；舊路徑上的舊 ACE 留在原地（失效、僅含寫入 SID），未來的清理命令可以回收它們。
- **NULL-DACL 目錄在 grant+revoke 往返下不保持身份。** 帶 NULL DACL 的目錄意味著「所有人完全控制」；`grantWrite` 從該 null 建置新 ACL，撤銷往返後留下的是 EMPTY（全部拒絕）DACL 而非原始 NULL DACL。真實工作區與臨時目錄都帶真實 DACL，因此這仍是記錄在案的邊界情形。
- **受限孫程序的管道 stdio 捕捉不可用。** libuv 的管道 stdio 用的是 NAMED pipe，其 client 端開啟所請求的寫存取沒有任何 restricting SID 被授予（是 Win32 層的預設 SD 範本，而非權杖預設 DACL），因此受限程序內 `spawn(..., { stdio: 'pipe' })` 以 EPERM 失敗；繼承與忽略 stdio 的 spawn 可用，匿名管道（PowerShell 的管道）因受限權杖預設 DACL 攜帶 restricting SID 全權 ACE 而可用。
- **授權物化是急切的全樹傳播。** 在帶可繼承 ACE 的目錄上呼叫 `SetNamedSecurityInfoW` 會立即遍歷每個後代（大型工作區樹上以數十秒計）；按工作區身份每臺機器每個工作區只付一次，精確 ACE 跳過讓後續每次供給都很便宜。
- **讀側隔離與網路策略不在範圍內**——`WRITE_RESTRICTED` 只交叉檢查寫存取；將此後端與讀側策略配對以獲得更強隔離。
- **讀取會被其他基於 AppContainer 的工具以包 SID 授權過的物件擋住。** 在本機上，當檔案的 DACL 攜帶針對包 SID（`S-1-15-2-…`）的 ACE 時，Low 完整性的權杖無法存取它——即使同一份 DACL 同時向使用者授予完全控制、向 Everyone 授予讀取（已觀測：只給新檔案加這一條 ACE 即可復現拒絕，補授 Everyone 讀取無法解除，而同樣內容複製到別處仍可讀）。其背後的核心規則尚未確證，也不由本包掌控；以 AppContainer 自我隔離的工具正是會寫入這類 ACE，因此被它們標記過的目錄樹對本後端的子程序將不可讀。移除外來 ACE（或重新安裝受影響的目錄樹）即可恢復存取。
- **寬目錄與 FAT 卷警告已推遲；FAT 類殘留未經驗證。** UI 側警告尚未實作，FAT 卷作為授權根會大聲失敗，而授權根之外的 FAT 類目標不儲存安全描述符；其有效完整性標籤由系統分配而非記錄在物件上，因此標籤層在該處的行為未經測試。FAT 仍被視為遺留殘留。
- **PowerShell 語言模式因受限模式而異。** 在 `read-only` 下，PowerShell 無法在臨時目錄中建立 AppLocker 探針檔案，因此會保守地以 ConstrainedLanguage 啟動（`Add-Type`、非核心 .NET 靜態呼叫、COM 與反射失敗）；交付的 `workspace-write` 路徑可讓探針完成，因此除非主機範圍的 WDAC/AppLocker 策略另有規定，否則 pwsh 保持 FullLanguage，而直接使用 `AclSandbox` 並設定 `tempDir: null` 時則沒有這一保證。這一區別屬於 PowerShell 啟動行為，不是 ACL 寫入邊界的一部分。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：未決方向與開放問題。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：警告與清理表面

對異常寬的目錄與 FAT 類卷的僅警告立場已記錄在上方限制中但尚未實作，回收改名工作區常駐 ACE 的清理命令也尚未決定。兩者都是開放方向，不是已交付行為。

</details>

**執行時不變式：** 不釋出伴生入口。本包沒有獨立事件序列或可變資料關係；fail-closed 約定在每個 Win32 呼叫處強制。
