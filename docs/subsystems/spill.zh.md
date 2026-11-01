# spill 儲存

[English](spill.md) | 中文

spill 儲存[能力 seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)持久儲存呼叫方提供的文字，並返回面向模型的定位符與檢索指引。其 Service Definition 是 [dsh-spill](../../packages/spill/spill)（`ctx.spillStore`），本地 Service Provider 是 [dsh-spill-local](../../packages/spill/spill-local)。消費方包括[工具結果策略](../../packages/spill/spill-policy)與[工作階段引用](../../packages/context/session-reference/README.zh.md)。spill 是可選能力，不屬於[智慧代理迴圈主幹](core.zh.md)；預覽與 spill 決策由消費方負責，儲存則原樣儲存所提供的文字。

原始碼：[`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## 儲存請求

`saveText` 是唯一的服務操作：原樣持久儲存 `content`，並返回不透明的定位符、後端提供的檢索提示和精確位元組數。請求攜帶儲存時的儲存名稱空間（`owner`）、描述性的生產者來源資訊（`source`，絕非存取控制）以及後端可用作命名提示而非路徑的 `suggestedName`。工具來源標識實際工具呼叫；工作階段引用來源標識被捕捉的源工作階段，而其歸屬是接收上下文的目標工作階段。

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

保留期清理可以連同其他舊工作階段產物一起使舊定位符失效；spill seam 不定義逐工作階段的清理策略。

```ts type-equiv
/**
 * Producer of a spilled artifact. Tool results carry their model-issued call id;
 * session references identify the captured source session instead. Descriptive
 * source description only, never access control.
 */
type SpillSource = {
  kind: 'tool'
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: ToolCallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
} | {
  kind: 'session-reference'
  /** Session whose projected conversation was captured. */
  sessionId: SessionId
  /** Host-provided label for the referenced session. */
  label: string
}
```

## 結果

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` 是後端返回的[品牌化](core.zh.md#branded-ids)面向模型控制代碼。本地後端將它渲染為檔案系統路徑；遠端或資料庫後端可以渲染 URI、鍵或命令 token。消費方將它視為不透明值，並使用 `retrievalHint` 渲染，而不是假定 `read` 始終是正確的檢索機制。

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## 服務

`SpillStore`（`ctx.spillStore`，定義於 [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)）是隻有一個方法的抽象服務：`saveText(input) → Promise<SpillRef>`。它持久儲存完整的 `content`，並在實際儲存失敗（權限、ENOSPC、後端不可用）時拒絕。該 seam 只負責儲存：不負責保留策略、工具結果替換或檢索／搜尋 API。

本地後端（[dsh-spill-local](../../packages/spill/spill-local)）寫入 `<root>/session-<hash>/<random>-<safeName>`：根目錄是已設定或延遲建立的私有（0700）目錄，工作階段子目錄採用 `sha256(sessionId)`，並透過排他且僅所有者可存取的寫入（`open(path, 'wx', 0o600)`）防止預先植入的符號連結重定向寫入。其 `locator` 是本地路徑，`retrievalHint` 則告知模型在該路徑上使用 `read` 或 `grep`。策略消費方（[dsh-spill-policy](../../packages/spill/spill-policy)）會把超過 `maxInlineTokens` 的圖文結果替換為按原順序保留的首尾內容和 spill 地址；該過程盡力而為：儲存失敗時保留原始內聯結果，而不會把成功的呼叫變成 `isError`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Semantics every implementation must honor:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
