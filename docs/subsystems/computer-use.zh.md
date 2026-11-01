# 計算機操作

[English](computer-use.md) | 中文

計算機操作讓模型透過設定的提供者觀察並操作本地桌面。DSH 的共享能力稱為 **computer use（計算機操作）**；**Cua Driver** 是上游實作的名稱。

## 選擇提供者

在同一組閤中掛載 [`dsh-computer-use`](../../packages/computer-use/computer-use/README.zh.md) 和一個提供者。兩個 Cua Driver 提供者都是公開發布到 npm 的實驗性包，均需顯式啟用。

| 提供者 | 執行時 |
|---|---|
| [Cua Driver MCP](../../packages/experimental/computer-use-cua-driver-mcp/README.zh.md) | 透過 MCP 連線已安裝的 `cua-driver` 可執行檔案 |
| [Cua Driver 原生](../../packages/experimental/computer-use-cua-driver-native/README.zh.md) | 隨 npm 依賴安裝的平臺原生執行時 |

各提供者提供上游工具目錄。共享服務只註冊名稱，並拒絕任何第二個提供者，包括使用相同名稱的另一個實例。服務不包含通用桌面操作方法或模型控制的選擇器。

## 生命週期和桌面共享

提供者在關閉工具和自有資源期間保留註冊。啟動失敗會釋放此次嘗試的註冊。MCP 提供者在重連期間保留註冊。

一個已註冊的提供者不會為某個 Session 預留桌面。呼叫方負責協調跨 Session 和獨立 DSH 程序的完整觀察、操作和驗證流程。取消呼叫無法撤銷桌面已收到的輸入。

## 結果和平臺要求

工具使用常規執行流程和 Session 日誌。支援影象的模型路由在掛載附件儲存時接收持久化截圖；不支援影象的路由接收現有 MCP 影象診斷。提供者 README 負責說明安裝、權限和平臺限制。

[決策記錄](../../.agents/notes/implemented/architecture/2026-09-12-computer-use-provider-registration.zh.md)解釋只負責註冊的服務和兩個 Cua Driver 整合。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomputeruse--computeruseregistry"></a>

### `ctx.computerUse` — `ComputerUseRegistry`

Owns one optional provider registration in the shared computer-use service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: ComputerUseProviderName): () => Promise<void>
```

Source: [`packages/computer-use/computer-use/src/index.ts`](../../packages/computer-use/computer-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
