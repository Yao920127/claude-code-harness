# Agent Note: 編譯器無關的 Typert 型別模型

Status: implemented

[English](2026-07-27-compiler-independent-typert-model.md) | 中文

## Problem

直接從 TypeScript AST 拼接 Zod 和反射文字，會把型別分析、業務語義識別與單個生成目標綁在一起。這樣的生成器只能回答“這段語法能否生成”，無法提供包、face、公開匯出、service、event、物件及其型別關係的標準表示，也無法供靜態檢查和後續生成目標複用。

host 與 client 屬於獨立 TypeScript project；把兩者放進同一個 `ts.Program` 會合並衝突的 Cordis `Context` 與 `Events` 宣告。與此同時，client 型別仍需顯式引用 host 型別，因此完全隔離或在兩邊複製型別都不能表達真實依賴。

## Decision

[`dsh-typert-generator`](../../../../packages/typert/generator/README.zh.md) 分別從 host 和 client project 建立 `ts.Program`，只把 compiler node、symbol 和 checker 當作提取工具。分析結束後，所有生成器和掃描器只消費 Typert 自有的 `WorkspaceModel`、`FaceModel` 與 `TypeGraph`，模型中不保留 AST 或 checker 物件。生成器不依賴 `@deepseek-ai/dsh-typert-registry`。

TypeGraph 儲存開發者寫下的計算前型別結構，包括泛型參數與應用、顯式繼承、conditional、mapped、遞迴引用和 JSDoc。無法無損表示的可達型別使分析失敗；某個 emitter 無法處理已經建模的節點時由該 emitter 失敗，而不是把型別展平或降級為 `unknown`。

每個 face 獨立擁有 PackageModel 和 TypeGraph。`tsconfig.host.json` 與 `tsconfig.client.json` 的直接 project references 決定 package 的 face 歸屬，`package.json#exports` 決定公開邊界。跨 face 關係只來自原始碼中的顯式 import 或 re-export，並作為獨立 link 保留；外部 npm 型別記錄為 External，不讀取或複製其宣告。

PackageModel 識別 Cordis service、event、`@typert object` 引用物件和 `@typert schema` 資料根。service 與 object 只暴露 public instance member，排除 constructor、static、private 和 protected；繼承邊保留在 TypeGraph 中，不復製為扁平成員。缺少 public property、parameter 或 return 型別標註時，`check` 模式報錯，`write` 模式寫入 checker 推斷結果後重建 project 並再次以嚴格模式分析。

[`dsh-typert-registry`](../../../../packages/typert/registry/README.zh.md) 提供 `ctx.typert`，且只負責執行時註冊：一個 contribution 原子攜帶 package-face reflection 與可選 Zod schema factory，並隨 Cordis effect 撤銷。註冊表驗證 factory 時不會呼叫它；首次 `get()`、`resolve()`、`list()` 或 JSON Schema 投影才會物化並快取各 schema。註冊表不分析 TypeScript，也不合並兩個 face。

包產物釋出仍透過 package exports 採用顯式 opt-in。`WorkspaceTypertGenerator` 僅在被呼叫時驗證所請求 face 的根目錄產物協定：host face 必須透過面向使用者的 subpath `package/typert` 暴露 `package/lib/typert.host.{js,d.ts}`，client face 必須透過 `package/client/typert` 暴露 `package/lib/typert.client.{js,d.ts}`；它不會修改這些 exports。後續的 [Typert Remote 設計](2026-08-02-typert-remote-method-calls.zh.md) 為根目錄 build、typecheck、lint 與文件型別檢查增加了全倉 Host 約定 pass。對於已 opt-in 的 Host 包，該 pass 會在消費方解析兩者之前生成本地反射產物與嚴格的 Host-for-Client `/remote` 約定。生成的本地宣告將 `TYPERT` 型別保持為 `unknown`，因此業務包不依賴註冊表。

建置期的 `CordisCatalogProjector` 一次消費分析後的 `FaceModel` 與 `TypeGraph`，生成 `docs/cordis-catalog/events.md`、`docs/cordis-catalog/services.md`，以及為 `tool-cordis` 提交的靜態 `SERVICE_API`、`EVENT_API` 和 `TYPE_API` catalog。`tool-cordis` 讀取該靜態 catalog，執行時不依賴 `ctx.typert`。[`dsh-typert-loader`](../../../../packages/typert/loader/README.zh.md) 與註冊表仍是獨立的執行時路徑：loader 監聽 Cordis Loader 設定項生命週期事件，匯入顯式釋出的 `./typert` host 產物，並透過 `ctx.typert` 註冊；兩者都不是目前 `cordis_inspect` catalog 的資料來源。

## Verification contract

提交內的小型雙 face project 對完整型別模型及其原始碼宣告索引做 snapshot。全倉分批分析與直接聚焦分析必須為相同 face 生成模型等價的 `FaceModel` 與 `TypeGraph`。型別級全集和執行時集合比較保證每種 node、target、declaration 與 member discriminant 都來自真實 TypeScript syntax；欄位語義矩陣覆蓋所有 keyword、type operator、literal value 類目，以及泛型、參數、tuple、mapped modifier、import attributes、abstract、predicate 和 enum initializer 的各個狀態。

`SyntaxZoo` 中每個 property 的原始碼型別經 TypeScript printer 標準化後，必須與 TypeGraph 渲染結果逐項相等，隨後所有渲染 declaration 再交給 TypeScript 編譯。這一層檢查節點內部資訊是否無損，包括無插值 template literal、帶 type argument 的 type query 和受約束 `infer`，不以 discriminant 覆蓋或程式碼覆蓋率代替結構等價。

邊界案例固定同 face 與跨 face 的顯式包匯入、跨 face 命名 re-export、精確 export alias、qualified `import()` link 和全域 `@types` External 歸屬，並拒絕 package 自有 TypeScript 診斷、相對路徑越界、`package.json#exports` 之外的引用，以及尚無模型 target 的跨 face namespace re-export。interface declaration merging 顯式保留每個 authored part，無法無損表示的其他 merge 失敗。

Zod emitter 對支援的節點和各類 literal 逐類執行成功與失敗 parse，對不支援的節點逐類斷言明確的 `TypertEmitError`。Emitter fixture 對生成的 Zod JavaScript 與 `.d.ts` 文字做快照，執行每個 schema factory，並對宣告做型別檢查。`dsh-typert-registry` 測試固定原子註冊、首次使用物化、成功結果快取、factory 失敗後重試、查詢、JSON Schema 和 effect 撤銷，`dsh-typert-loader` 測試還證明延遲掛載、解除安裝及未完成 dynamic import 的釋放行為。真實 `dsh-tools` 縱切從模型生成 contribution，經執行時註冊表載入後，將其服務、事件與關聯型別記錄同已提交的靜態 `SERVICE_API`、`EVENT_API` 和 `TYPE_API` 對照。全倉 projector 測試重新生成兩份 Cordis catalog 文件與 `tool-cordis` API catalog，並要求三份文字同已提交產物逐位元組一致。

## Alternatives considered

**直接儲存 TypeScript AST。** AST 能保留原始碼寫法，但會讓每個消費者依賴 compiler 生命週期、node identity 和 checker 上下文，無法形成穩定的架構邊界，因此只在提取階段使用。

**基於 checker 的最終型別生成。** 展平後的 `ts.Type` 便於直接遍歷，卻丟失泛型、conditional、mapped 和 alias application 的開發者表達，無法滿足反射與後續生成需要。

**合併 host/client project 或複製 host 型別。** 合併會汙染 Cordis declaration merging；複製會產生第二份型別事實源。獨立 face 加顯式 cross-face link 保留了 project 隔離與真實引用關係。

**讓 `dsh-typert-registry` 承擔型別解析和跨包合成。** 這會把 TypeScript compiler、Cordis 生命週期和具體 schema 策略重新耦合。註冊表保持為生成 artifact 的生命週期容器，複雜分析留在建置期模型。

## Consequences

新增生成目標或靜態檢查可複用同一 TypeGraph，業務類目也可在 PackageModel 上擴充功能，而無需再次解析 AST。保留計算前型別和獨立 face 的代價是模型比打平後的 schema 更復雜，emitter 必須顯式宣告支援範圍並對缺失能力失敗。

包級顯式 opt-in 使產物釋出與 exports 由各包自行管理。儲存庫編排仍可為每個已 opt-in 的包執行全倉 Host 約定 pass；該 pass 仍由後續 Remote Gateway Agent Note 負責說明。靜態 Cordis catalog 可從標準模型復現，同時不把 `tool-cordis` 與執行時註冊表狀態耦合。`ctx.typert` 只反映目前執行時中已掛載的產物；對於消費方物化後仍持有的 Zod 實例，解除安裝流程無法控制。
