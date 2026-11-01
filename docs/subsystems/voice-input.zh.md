# 語音輸入

[English](voice-input.md) | 中文

實驗性語音識別包含三個角色：[服務定義](../../packages/experimental/speech-to-text/README.zh.md)路由具名 Provider，[SenseVoice Provider](../../packages/experimental/speech-to-text-sensevoice/README.zh.md)擁有本地推理，[Remote 消費者](../../packages/experimental/api-speech-to-text/README.zh.md)服務瀏覽器。[可選 Bundle](../../packages/experimental/voice-input-bundle/README.zh.md)將它們與麥克風 UI 組合。

## Provider 選擇

`SpeechProviderId` 為註冊標識新增型別品牌。`SpeechProviderInfo` 攜帶顯示名稱、支援的 `languages` 語言提示及 `host-local` 或 `cloud` 處理位置。`SpeechRequest` 包含 WAV 位元組和可選的 Provider、語言選擇；`resolve()` 生成捕捉一個 Provider 實例的 `SpeechSpec`。缺失的 Provider 或不支援的語言會報錯；替換或撤銷會使已解析的任務失效。音訊不會退回到其他 Provider。

`SpeechProvider.transcribe()` 接收完整的 `SpeechInput` 與 `AbortSignal`。`Transcript` 返回純文字 `text`、`audioSeconds` 和 `inferenceSeconds`。Provider 回應取消，並在登出完成前結束其任務。本地 Provider 序列執行呼叫、限制佇列，並獨立於 Session 管理工作程序生命週期。

## 瀏覽器與 Host 所有權

瀏覽器擁有麥克風軌道與未傳送的草稿。`TranscriptionRequest` 透過帶認證的 Remote 傳送規範 base64 PCM16 WAV。`SpeechCatalog` 公佈可用 Provider、預設選擇及錄音位元組和時長限制。API 在識別前驗證這些程序輸入。

輸入門面在錄音前捕捉帶版本的選區。`InputActions.insertText()` 僅在選區版本仍有效且提交狀態允許編輯時，插入一次可撤銷的純文字編輯。插入被拒絕時，轉寫文字保留以供顯式插入。切換 Session 或釋放外掛使遲到結果失效。識別本身不寫入 Session 事件；普通使用者提交擁有最終的模型可見文字。

## 準備與設定

`SpeechProviderInfo.downloadSources` 公佈準備階段的源。`SpeechPreparationOptions.downloadSource` 為單次任務選擇一個源；省略時保留提供者策略。SenseVoice 驗證公佈的選項，固定使用手動指定的源而不退回，並拒絕在準備期間改源。UI 為目前卡片中的重試保留選擇，但不會將其儲存為識別偏好。

Host Provider 在頁面和 Session 變化期間擁有同一個準備任務。Client 在輸入框、安裝引導彈出視窗、Bundle 詳情之間共享一份 `follow()` 訂閱。可選 `SpeechSetupEstimate` 中繼資料提供各 Provider 的資源預期，與實測進度分開。`SpeechPreparationStepKind` 標識有序資源操作；`SpeechPreparationStep` 記錄各步驟狀態與開始時間。完整 `SpeechPreparationState` 在取消或失敗後保留這些步驟。摺疊 UI 顯示目前操作，展開後列出所有步驟，僅進行中步驟顯示位元組進度或等待時間。關閉觀察者不會取消準備。已驗證檔案在重試及空閒程序回收後繼續複用。

準備失敗時可包含 `SpeechDownloadFailure`，提供檔案、下載源、原因分類以及可選錯誤碼或 HTTP 狀態。Client 將恢復建議在地化；原始下載錯誤留在 Host。

麥克風佔用模型選擇器與傳送按鈕之間的 `conversation.input.activity`。點選開始錄音並展開工具欄；停止後轉寫並插入草稿。活動欄保留編輯器與提交按鈕，擁有區域性回饋，並在解除安裝時釋放展開狀態。取消、Escape 或隱藏頁面會丟棄錄音。波形歷史展示實測麥克風音量。Bundle 詳情包含識別偏好、準備狀態和進度。顯式啟用時透過 `plugins.bundle.activation` 引導缺少模型的使用者前往安裝；列表只顯示 Bundle 描述和開關。

## 設計依據

[語音輸入決策](../../.agents/notes/implemented/architecture/2026-09-16-experimental-voice-input.zh.md)解釋臨時音訊、顯式 Provider 選擇和延遲準備本地執行時。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspeechcontroller--speechcontroller"></a>

### `ctx.speechController` — `SpeechController`

Speech calls never activate or submit to an Agent.

```ts cordis-catalog
/**
 * Read provider choices without preparing a recognizer.
 * @returns available providers, resolved default, and recording limits.
 */
@Remote catalog(): SpeechCatalog

/**
 * Follow provider readiness independently of Session and preparation lifetimes.
 * @param signal - Client observation lifetime.
 * @returns initial and subsequent complete readiness snapshots.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<SpeechCatalog>

/**
 * Persist the user's recognition preferences.
 * @param patch - changed preference fields.
 * @returns after preferences are saved.
 */
@Remote configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join one Host-owned preparation task.
 * @param providerId - selected recognizer.
 * @param options - task-local source selection validated by the provider.
 */
@Remote prepare(providerId: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel resource preparation.
 * @param providerId - selected recognizer.
 * @returns after the preparation task settles.
 */
@Remote cancelPreparation(providerId: SpeechProviderId): Promise<void>

/**
 * Validate and transcribe one recording through the explicit provider selection.
 * @param request - canonical WAV encoded as base64, provider id and language hint.
 * @param signal - Client cancellation or Remote contribution disposal.
 * @returns final transcript without adding a Session event.
 */
@Remote async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/api-speech-to-text/src/index.ts`](../../packages/experimental/api-speech-to-text/src/index.ts)

<a id="ctxspeechtotext--speechtotext"></a>

### `ctx.speechToText` — `SpeechToText`

Registry shared by all transcription consumers in one Host composition.

```ts cordis-catalog
/**
 * Register one recognizer; duplicate ids fail without replacing the original.
 * @param provider - recognizer owned by the contributing fiber.
 * @returns idempotent disposer which rejects admission, cancels, and joins accepted work.
 */
register(provider: SpeechProvider): () => Promise<void>

/**
 * Read the current recognizer roster.
 * @returns available provider facts in registration order.
 */
listProviders(): readonly SpeechProviderInfo[]

/**
 * Observe complete readiness snapshots; a slow reader coalesces intermediate progress.
 * @param caller - observer lifetime, independent of any preparation task.
 * @returns an initial snapshot followed by the latest provider states.
 */
async *follow(caller: AbortSignal): AsyncIterable<SpeechSnapshot>

/**
 * Read provider readiness and current user preferences together.
 * @returns one detached complete observation.
 */
snapshot(): SpeechSnapshot

/**
 * Persist changed selection fields into this plugin's profile entry; the resulting language must be accepted by the selected provider.
 * @param patch - explicit provider or language changes.
 * @returns after the profile write and the live update it applies.
 */
async configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join provider-owned preparation.
 * @param id - exact registered provider identity.
 * @param options - task-local source selection validated by the provider.
 */
prepare(id: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel provider preparation without tying it to a browser connection.
 * @param id - exact registered provider identity.
 * @returns after the preparation task settles.
 */
async cancelPreparation(id: SpeechProviderId): Promise<void>

/**
 * Apply composition defaults and capture the selected provider. Missing providers and unsupported languages fail explicitly.
 * @param request - complete recording and optional selection.
 * @returns provider-pinned input for transcribe().
 */
resolve(request: SpeechRequest): SpeechSpec

/**
 * Execute exactly the resolved provider; no fallback sends audio elsewhere.
 * @param spec - resolved input; a withdrawn or replaced registration is rejected.
 * @param signal - caller cancellation.
 * @returns final transcript after provider settlement.
 */
async transcribe(spec: SpeechSpec, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/speech-to-text/src/index.ts`](../../packages/experimental/speech-to-text/src/index.ts)
<!-- END GENERATED cordis-surface -->
