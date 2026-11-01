# SSH

[English](ssh.md) | 中文

[SSH 提供者家族](../../packages/ssh/README.zh.md) 透過部署方持有的 OpenSSH 連線提供一個遠端檔案系統／程序環境。Harness、模型傳輸及 Session 儲存留在主機。該家族實作既有檔案系統、子程序及沙箱 API，不引入 SSH 專用模型工具。

## 執行座標

檔案系統身份、可執行檔案查詢、程序 cwd、沙箱工作區根目錄及語言伺服器檔案 URL 都指向 SSH 主機。提供者在檔案實際存在的位置規範化路徑，保留檔案系統對 `symlink/..` 的解釋。策略解析器保留執行環境中的絕對路徑寫法，不嘗試在 Harness 主機上解析遠端路徑。

`processPath()` 提供配套子程序提供者可用的路徑。SSH 的 `processPathFromHostPath()` 仍不可用；安裝遠端產物不意味著任意主機路徑可移植。因此 [`NodePtcRuntime`](../../packages/ptc-runtime/ptc-runtime-node/README.zh.md) 使用顯式安裝並經過摘要驗證的遠端載入程式。

## 傳輸與信任

管理 RPC 使用輔助程序的 SSH exec 流。普通 stdin、stdout、stderr、終端輸出及可選 fd 7 控制流使用分別認證的轉發 Unix 套接字。每條轉發流擁有獨立 SSH 通道視窗；暫停的程式輸出不與控制或管理訊息共用視窗。所有通道仍共享連線頻寬及傳輸失敗。

部署認證、已安裝產物驗證及逐流 TLS 認證屬於 [`dsh-ssh`](../../packages/ssh/ssh/README.zh.md)。輔助程序使用遠端機器上的可信本地提供者執行檔案系統與程序請求。SSH 是傳輸方式；檔案效果限制由所選遠端沙箱提供者執行。

## 程序生命週期與取消

程序先預留，再連線流，且啟動最多接受一次。`done` 報告直接結果，`waitForExit` 觀察遠端託管程序範圍。終端操作保留共享非同步 API。準備階段取消、已啟動程序終止及提供者釋放都透過輔助程序釋放各自資源。

管理截止時限約束單次 RPC 觀察，不替代 Bash 或 PTC 執行時消費方選擇的執行截止時限。遠端等待可以持續掛起，同時其他請求繼續推進。SSH 丟失會使待處理操作失效；輔助程序 EOF、訊號及租期到期會啟動遠端清理。用戶端如實報告未確認結果，絕不透過重連重放可能已執行的操作。

## 組合範圍

headless 透過已掛載的檔案系統提供者記錄和檢查 Session cwd。因此遠端 FS、Bash、終端、LSP 及 PTC 消費方可以共享這些座標。假定可存取主機檔案系統的 Web 工作區檢視需要單獨整合；僅替換提供者並不會使這些檢視支援遠端。

替代方案與驗證責任見[決策記錄](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md)。

## 連線 API

```ts type-equiv
/** Deployment-owned SSH identity and installed helper; no model argument selects these values. */
interface Config {
  /** OpenSSH host alias, including its existing user, key and known-host configuration. */
  host: string
  /** Absolute remote Node executable. */
  node: string
  /** Absolute path to the installed, bundled helper entry. */
  helper: string
  /** SHA-256 of that bundled helper; mismatches refuse the connection. */
  helperHash: string
  /** Absolute remote default workspace. */
  workspace: string
  /** Optional preinstalled built PTC entry, paired with its expected digest. */
  bootstrapPath?: string
  /** SHA-256 of bootstrapPath; both fields must be supplied together. */
  bootstrapHash?: string
  /** Connection and administrative-request deadline, at most 2,147,483,647 milliseconds. */
  requestTimeoutMs?: number
  /** Maximum JSON payload bytes per helper request or response. */
  maxFrameBytes?: number
  /** Maximum ordinary requests; heartbeat and bounded resource cleanup have reserved capacity. */
  maxPending?: number
  /** Remote helper lease; loss of heartbeats starts remote managed cleanup. */
  leaseMs?: number
}
```

```ts public-api
/** One non-reconnecting SSH session; loss invalidates all active operations. */
declare class SshConnection extends Service {
  static Config: schema<Config>;
  /** Verified remote helper coordinates; callers must await this before launch. */
  readonly ready: Promise<Hello>;
  constructor(ctx: Context, config: Config);
  /** Hold plugin readiness until the remote identity and helper digest are verified. */
  async [Service.init](): Promise<void>;
  /** Verified remote Node executable for the paired PTC runtime. */
  get nodeExecutable(): string;
  /** Verified preinstalled PTC entry; unconfigured runtimes fail before program execution. */
  get bootstrapPath(): string;
  /**
     * Send a helper operation; cancellation never replays an ambiguous mutation.
     * @param method - the private helper operation.
     * @param params - JSON request fields validated by the helper.
     * @param result - response validation before returning provider-visible data.
     * @param signal - cancellation, which does not undo completed remote effects.
     * @param wait - allow a process observation to outlast the administrative deadline.
     * @returns the validated remote result.
     */
  async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>;
  /**
     * Forward one authenticated stream through an independent SSH channel.
     * @param endpoint - private coordinates issued by this connection's helper.
     * @param signal - cancellation of allocation and the resulting socket.
     * @returns a paused socket; attach a consumer before resuming it.
     */
  async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>;
  /** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
  dispose(): Promise<void>;
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxssh--sshconnection"></a>

### `ctx.ssh` — `SshConnection`

One non-reconnecting SSH session; loss invalidates all active operations.

```ts cordis-catalog
/**
 * Send a helper operation; cancellation never replays an ambiguous mutation.
 * @param method - the private helper operation.
 * @param params - JSON request fields validated by the helper.
 * @param result - response validation before returning provider-visible data.
 * @param signal - cancellation, which does not undo completed remote effects.
 * @param wait - allow a process observation to outlast the administrative deadline.
 * @returns the validated remote result.
 */
async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>

/**
 * Forward one authenticated stream through an independent SSH channel.
 * @param endpoint - private coordinates issued by this connection's helper.
 * @param signal - cancellation of allocation and the resulting socket.
 * @returns a paused socket; attach a consumer before resuming it.
 */
async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>

/** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
dispose(): Promise<void>
```

Source: [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)
<!-- END GENERATED cordis-surface -->
