# Typert 遠端呼叫

[English](typert.md) | 中文

以下型別由生成的 Remote 產物、Host Gateway 與消費方 API assembly 共用。[Typert Gateway Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md) 負責架構與傳輸決策；本頁記錄 [`dsh-typert-protocol`](../../packages/typert/protocol/src/types.ts) 和 [`dsh-api-gateway`](../../packages/api/gateway/src/types.ts) 中公共約定的字面定義。

## Lookup 與上下文宣告

業務物件包透過宣告合併擴充功能兩個空 map。lookup 將一種 Host 物件型別與其 wire identity 關聯；上下文宣告將一種作用域上下文類別與其 wire identity 關聯。生成的 descriptor 引用這些 key，執行時提供者則提供活物件解析行為。

```ts type-equiv
/** Merge-extensible Host object lookup declarations. */
interface TypertLookupMap {}
```

```ts type-equiv
/** Merge-extensible scoped Context declarations. */
interface TypertContextMap {}
```

lookup 的 resolver 解除安裝後，註冊表仍會保留其 wire 宣告。因此 SRC 發現過程會繼續把該參數歸類為 lookup，並因不可用而失敗，而不會把 wire 值當作普通業務物件接受。

```ts type-equiv
/** Stable wire declaration retained after a lookup provider unloads. */
interface TypertLookupDefinition {
  /** Merge-declared lookup key. */
  readonly key: string
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string
  /** Wire field replacing the Host object parameter. */
  readonly wire: string
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string
}
```

## 呼叫 descriptor

`InvocationDescriptor` 是本地反射資訊，不是 wire message。Host 與消費方建置會生成彼此對應的 descriptor；請求只傳送 endpoint 與具名 `args`。strict codec 攜帶生成的 schema factory，SRC codec 則在不恢復結構型別的前提下強制要求輸入為 JSON 安全值。一元結果 codec 可提供 `encode()` 處理含位元組的子樹，並透過 `decode()` 遞迴驗證原生位元組；Client 宣告將每個 `Uint8Array` 限定為以 `ArrayBuffer` 為底層緩衝區。純 JSON 結果無需位元組識別或 Client 解碼。取消透過帶外 carrier signal 表達：它在業務參數之後注入，絕不進入 `args`。

```ts type-equiv
/** Codec attached to one invocation parameter or result. */
type TypertCodec =
  | {
    readonly mode: 'strict'
    readonly typeSymbol: string
    /** Materialize and return the process-realm schema on first boundary use. */
    readonly create: () => TypertSchema
    /**
     * Decode a unary result whose fields require type-specific handling.
     * @param value - result reconstructed by the RPC carrier.
     * @returns the validated result, retaining native byte views.
     */
    readonly decode?: (value: unknown) => unknown
    /**
     * Project typed binary fields into RPC result attachments.
     * @param value - native unary result.
     * @param writeBytes - records a byte view at its result-relative path and returns its JSON placeholder.
     * @returns JSON metadata with untouched JSON subtrees retained.
     */
    readonly encode?: (value: unknown, writeBytes: (bytes: Uint8Array, path: readonly (string | number)[]) => null) => unknown
  }
  | {
    readonly mode: 'src-json'
  }
```

```ts type-equiv
/** One ordered business parameter in a Remote invocation. */
interface InvocationParameterDescriptor {
  /** Source-level parameter name. */
  readonly name: string
  /** Required key in the wire `args` object. */
  readonly wire: string
  /** Whether the value is JSON or requires a registered Host lookup. */
  readonly source: 'json' | 'lookup'
  /** Lookup key when `source` is `lookup`. */
  readonly lookup?: string
  /** Boundary codec for the wire representation. */
  readonly codec: TypertCodec
  /** Missing wire fields decode to `undefined` only for an explicitly declared `T | undefined`. */
  readonly acceptsUndefined?: true
}
```

```ts type-equiv
/** Carrier-independent description of one exported method invocation. */
interface InvocationDescriptor {
  /** Globally stable generated identity. */
  readonly id: string
  /** Cordis service key owning the method. */
  readonly service: string
  /** Wire namespace, defaulting to the service key. */
  readonly namespace: string
  /** Public instance method name. */
  readonly method: string
  /** Service member invoked when the exported method name is an alias. */
  readonly implementation?: string
  /** Absent for unary calls; stream calls deliver every yielded item as the Host produced it. */
  readonly mode?: 'stream'
  /** Receiver selection mode. */
  readonly invocation:
    | { readonly kind: 'direct' }
    | {
      readonly kind: 'context'
      readonly context: string
      readonly wire: string
      readonly codec: TypertCodec
    }
  /** Optional consuming-Context projection for one direct lookup parameter. */
  readonly scope?: {
    /** Context kind whose Client adapter supplies the identity. */
    readonly context: string
    /** Lookup parameter wire field replaced by the Context identity. */
    readonly wire: string
  }
  /** Ordered business parameters. */
  readonly parameters: readonly InvocationParameterDescriptor[]
  /**
   * Client-to-Host items of the same logical stream, generated from the `In`
   * type argument of the method's `RemoteStream<Out, In>` return type; absent
   * when `In` is `never`. The method reads the items through
   * `RemoteInvocation.uplink()`, so nothing enters the parameter list.
   */
  readonly uplink?: {
    /** Codec validating every uplink item before `uplink()` delivers it. */
    readonly codec: TypertCodec
  }
  /** Transport cancellation injected after business parameters instead of entering wire args. */
  readonly cancellation?: {
    /** Reserved final Host method parameter. */
    readonly parameter: 'signal'
  }
  /** Codec for the unary result or each yielded stream item. */
  readonly result: TypertCodec
  /** Source declaration used only for diagnostics. */
  readonly sourceLocation?: InvocationSourceLocation
}
```

Host 別名 `RemoteStream<Out, In>` 同時命名一條流的兩個方向，接收方法透過 `this.ctx.invocation` 讀取本次呼叫的上下文：

```ts type-equiv
/**
 * One Remote stream as a Host method returns it: the items it yields to the
 * Client, iterated as a plain `AsyncIterable<Out>`. `In` is the type of the
 * items the Client may send back on the same logical stream, read through
 * `RemoteInvocation.uplink()`; it is carried only as a type-level marker. The
 * default `never` declares a method that reads none, and its descriptor
 * carries no uplink codec. A generated Client stream method returns the same
 * stream as a `RemoteStreamHandle<Out, In>`.
 * @template Out - item type the Host method yields.
 * @template In - item type the Client may send; `never` when the method reads none.
 */
type RemoteStream<Out, In = never> = AsyncIterable<Out> & { readonly [STREAM_UPLINK]?: In }
```

```ts type-equiv
/**
 * One open Remote stream as the Client holds it: the downlink items as an
 * `AsyncIterable`, plus the uplink and cancellation of the same logical
 * stream. A generated Client stream method returns it, and calling that
 * method opens the stream: a holder that neither iterates nor disposes the
 * handle keeps the Host stream alive. A handle stands for one generation:
 * when the carrier is lost, iteration fails with the carrier error and the
 * handle is finished.
 * @template Out - item type the Host method yields.
 * @template In - item type the Client may send; `never` when the method reads none.
 */
interface RemoteStreamHandle<Out, In> extends AsyncIterable<Out> {
  /**
   * Send one uplink item. Items sent before the stream has opened are queued
   * and sent once the `open` frame is on the wire. A top-level `undefined`
   * travels as an `item` frame without `value`.
   * @param item - item the Host validates against the method's uplink codec.
   * @throws {Error} when the item is not a lossless JSON value, when `end()`
   * was called, or once the stream has terminated.
   */
  send(item: In): void
  /** Half-close the uplink: the Host's `uplink()` iteration ends. Idempotent; ignored after termination. */
  end(): void
  /**
   * Cancel the logical stream: send `cancel` unless a terminal frame has
   * arrived, and end the downlink iterator quietly. Breaking out of
   * `for await` early does the same.
   */
  dispose(): void
}
```

```ts type-equiv
/**
 * One Peer's session on this Host. Connection owns it: `ctx` is the Cordis
 * scope that owns connection-lifetime registrations and is disposed with the
 * Peer. Who the Peer is and what it may do are not recorded here.
 */
interface PeerScope {
  readonly id: PeerId
  readonly ctx: Context
  /**
   * Tear down every registration made through `ctx`.
   * @returns settles once the scope has quiesced; racing calls share one completion.
   */
  dispose(): Promise<void>
}
```

```ts type-equiv
/**
 * The context of one Remote call, reachable inside the receiving method as
 * `this.ctx.invocation`. The Gateway derives the receiver from a Context that
 * carries it, so no parameter is injected and nothing crosses the wire.
 */
interface RemoteInvocation {
  readonly request: {
    readonly namespace: string
    readonly method: string
    readonly args: Readonly<Record<string, unknown>>
  }
  /** Cordis service key of the receiving Service. */
  readonly service: string
  /** Peer the call speaks for; an in-process carrier speaks for the operator. */
  readonly peer: PeerScope
  /** Carrier cancellation: Client cancel, socket close, or an uplink failure. */
  readonly signal: AbortSignal
  /**
   * The Client's uplink items for this call. Available once; a second call
   * throws. With an uplink codec on the descriptor every item is decoded to
   * `In`; without one items arrive as `unknown` after a JSON-safety check.
   * Iteration ends when the Client ends its uplink; when the method finishes
   * its downlink the Gateway calls the iterator's `return()` and unread items
   * are dropped. `In` is the caller's assertion: the runtime decodes by the
   * descriptor and does not cross-check it.
   * @template In - item type the caller reads; the descriptor codec decides what arrives.
   * @returns the single-consumer uplink iterable.
   */
  uplink<In = unknown>(): AsyncIterable<In>
}
```

## Typert 註冊表

`ctx.typert` 分開儲存目前環境的 descriptor、顯式選擇的 Remote contribution、lookup 提供者與作用域上下文提供者。lookup 提供者擁有穩定 wire 宣告和預設 resolver；Host 組合可以為同一個 key 設定 effect-scoped 同步或非同步 resolver，設定解除安裝後恢復預設策略。各項註冊都是由 Cordis 持有的 effect，並返回可等待的 disposer。

```ts type-equiv
/** Minimal Typert runtime consumed through dependency inversion. */
interface TypertRegistryContract {
  readonly local: TypertLocalRegistry
  readonly remotes: TypertRemoteRegistry
  readonly lookups: TypertLookupRegistry
  readonly contexts: TypertContextRegistry
}
```

生成的消費方宣告會把 direct namespace 合併到 `TypertClientRemote` 繼承的 map 中。

```ts type-equiv
/** Merge-extensible direct namespace surface generated for Client Remote services. */
interface TypertRemoteNamespaceMap {}
```

## Host Gateway

Connection 會先解碼 carrier envelope，再呼叫 `ctx.typertGateway`。請求將精確的具名 wire 欄位與 carrier 的取消 signal 分開攜帶；基礎設施與邊界失敗由 `TypertGatewayError` 承載，其 `gateway/*` 碼就是普通的 `RemoteError` 碼，因此 RPC 介面卡會把每個經結構識別的 `RemoteError` 連同其 code 與 details 原樣放行，只把無法識別的異常歸併為 `gateway/internal`。

```ts type-equiv
/** One Remote method request after a carrier has decoded its envelope. */
interface InvokeRemoteRequest {
  /** Remote namespace selected by the generated descriptor. */
  readonly namespace: string
  /** Exported Service method name. */
  readonly method: string
  /** Named wire values; fields must exactly match the descriptor. */
  readonly args: Readonly<Record<string, unknown>>
  /**
   * Client uplink items of this logical stream, delivered to the method through
   * `invocation.uplink()`; absent means an immediately ended iterable.
   */
  readonly uplink?: AsyncIterable<unknown>
  /** Peer the call speaks for; absent means an in-process carrier, answered as the operator. */
  readonly peer?: PeerScope
  /** Carrier or direct-caller cancellation injected only into cancellation-aware methods. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** Stable infrastructure and boundary failures emitted before or after business execution. */
type TypertGatewayErrorCode =
  | 'gateway/ambiguous-endpoint'
  | 'gateway/arguments-invalid'
  | 'gateway/binding-invalid'
  | 'gateway/context-failed'
  | 'gateway/context-not-found'
  | 'gateway/context-unavailable'
  | 'gateway/definition-unavailable'
  | 'gateway/input-invalid'
  | 'gateway/invocation-unavailable'
  | 'gateway/lookup-failed'
  | 'gateway/lookup-not-found'
  | 'gateway/lookup-unavailable'
  | 'gateway/method-unavailable'
  | 'gateway/protocol'
  | 'gateway/provider-mismatch'
  | 'gateway/result-invalid'
  | 'gateway/service-unavailable'
  | 'gateway/signature-invalid'
  | 'gateway/uplink-overflow'
```

```ts type-equiv
/** Host dispatcher consumed by Connection adapters. */
interface TypertGateway {
  /** Carrier adapter shared by WebSocket and in-process transports. */
  readonly wireStream: TypertGatewayWireStream
  /**
   * Register the application-selected forwarded-event source.
   * @param source - stream factory installed by the Remote assembly.
   * @param host - stable Host facts included in each Client generation's opening frame.
   * @returns disposer removing this exact source and cancelling its active streams.
   */
  registerRemoteEvents(
    source: TypertRemoteEventSource,
    host: RemoteEventHostInfo,
  ): () => Promise<void>
  /**
   * Invoke one live Remote method without assuming a carrier or response envelope.
   * @param request - decoded endpoint and named wire arguments.
   * @returns the business result without output decoding.
   * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
   */
  invoke(request: InvokeRemoteRequest): Promise<unknown>
  /**
   * Open one live stream Remote method without assuming a physical carrier.
   * @param request - decoded endpoint, named wire arguments, and the Client uplink when the carrier has one.
   * @returns a cancellation-aware iterable over the business results.
   */
  stream(request: InvokeRemoteRequest): Promise<AsyncIterable<unknown>>
}
```

## 消費方 Remote

`ctx.remote` 只暴露由已匯入 `/remote` 產物貢獻的 namespace。`$mount()` 會把生成的 descriptor 與具體方法作為一項由 fiber 持有的操作統一註冊。每個 namespace 都是可追蹤的 `remote.<namespace>` Cordis 子服務，其生命週期覆蓋已掛載的方法；JavaScript Proxy 與 Host 業務服務型別都不會進入消費方。

```ts type-equiv
/** Client Remote capability implemented by the Gateway and consumed by Remote assemblies. */
interface TypertClientRemote extends TypertRemoteNamespaceMap {
  /**
   * Mount one generated Host-for-Client contribution in the caller's fiber.
   * @param contribution - explicitly selected Remote package artifact.
   * @returns disposer after namespace services and concrete methods are ready.
   */
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>
  /**
   * Subscribe to one forwarded Host event. Notifications run in registration
   * order and isolate failures; scoped waterfalls return, delegate through
   * `next()`, or reject the Host dispatch.
   * @template Event - forwarded event name selected by the Host assembly.
   * @param event - forwarded Host event name, unchanged on the wire.
   * @param listener - receives the Client projection of the Cordis `Events` declaration.
   * @returns disposer owned by the calling fiber.
   */
  $on<Event extends TypertRemoteEvent>(event: Event, listener: TypertClientEventListener<Event>): () => void
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtypert--typertregistry"></a>

### `ctx.typert` — `TypertRegistry`

Registry of generated schemas, package reflection, invocations, and Remote dependency providers.

```ts cordis-catalog
/**
 * Register one generated contribution atomically for the calling fiber.
 * Duplicate package-face identities, schemas, invocation ids, or endpoints
 * reject the whole batch.
 * @param contribution - generated schemas, reflection, and Host invocations.
 * @returns the exact effect disposer that removes this contribution.
 */
register(contribution: TypertContribution): TypertDisposer

/**
 * Look up one schema by `<package>#<name>`.
 * @param key - global schema key.
 * @returns a record containing the cached schema, or `undefined` when absent.
 */
get(key: string): TypertSchemaRecord | undefined

/**
 * Resolve one required schema.
 * @param key - global schema key.
 * @returns a record containing the cached schema.
 * @throws when the key is malformed, the package face is absent, or the schema is not contributed.
 */
resolve(key: string): TypertSchemaRecord

/**
 * Enumerate live schemas in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching records containing the cached schemas.
 */
list(filter: TypertSchemaFilter = {}): TypertSchemaRecord[]

/**
 * Look up generated reflection for one package face.
 * @param packageName - exact npm package name.
 * @param face - face to query; defaults to the host runtime.
 * @returns the live package record, or `undefined` when absent.
 */
getPackage(packageName: string, face: TypertFace = 'host'): TypertPackageRecord | undefined

/**
 * Enumerate generated package reflection in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching package records.
 */
listPackages(filter: TypertPackageFilter = {}): TypertPackageRecord[]

/**
 * Project a live Zod schema to JSON Schema without caching the result.
 * @param key - global schema key.
 * @param params - Zod projection parameters.
 * @returns a fresh JSON Schema document.
 */
toJSONSchema(key: string, params?: z.core.ToJSONSchemaParams): z.core.JSONSchema.BaseSchema
```

Types: [TypertContribution](invariants.zh.md) · [TypertFace](invariants.zh.md) · [TypertPackageFilter](invariants.zh.md) · [TypertPackageRecord](invariants.zh.md) · [TypertSchemaFilter](invariants.zh.md) · [TypertSchemaRecord](invariants.zh.md)

Source: [`packages/typert/registry/src/service.ts`](../../packages/typert/registry/src/service.ts)

<a id="ctxtypertgateway--typertgatewayservice"></a>

### `ctx.typertGateway` — `TypertGatewayService`

Resolve strict generated definitions or conservative SRC markers against current Cordis Services and Typert providers.

```ts cordis-catalog
/**
 * Register the sole application-selected forwarded-event source.
 * @param source - stream factory installed by the Remote assembly.
 * @param host - stable Host facts included in each Client generation's opening frame.
 * @returns disposer removing this source and cancelling its active streams.
 */
registerRemoteEvents( source: TypertRemoteEventSource, host: RemoteEventHostInfo, ): () => Promise<void>

/**
 * Invoke one live Remote method through strict generated reflection or SRC markers.
 * @param request - decoded endpoint and exact named wire arguments.
 * @returns the business result without output decoding.
 * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
 */
async invoke(request: InvokeRemoteRequest): Promise<unknown>

/**
 * Open one live stream Remote method without assuming a physical carrier.
 * @param request - decoded endpoint, named wire arguments, and the Client uplink when the carrier has one.
 * @returns a cancellation-aware iterable over the business results.
 */
async stream(request: InvokeRemoteRequest): Promise<AsyncIterable<unknown>>
```

Source: [`packages/api/gateway/src/index.ts`](../../packages/api/gateway/src/index.ts)
<!-- END GENERATED cordis-surface -->
