# Agent Note: locale 歸屬的 client UI 文案

Status: implemented

[English](2026-08-23-locale-owned-client-ui-copy.md) | 中文

## Problem

typed locale namespace 與雙語字典對等性可以證明已註冊字典完整，卻無法證明展示程式碼使用了字典。JSX 文字、無障礙屬性、格式化函式回傳值和 zero-Cordis 原子元件預設值都可能繞過 `t`，而全部 locale 檢查仍保持綠色。[最初的全量接入決策](../../archived/architecture/2026-07-30-client-locale-full-rollout.md)中緩做或假定為語言無關的例外逐漸形成混合語言 UI，trajectory 檢查面和通用工具卡尤為明顯。

## Decision

**所有產品編寫的 client UI 措辭都由 locale 字典持有。** 可見文字、無障礙名稱、tooltip、placeholder、空狀態、狀態標籤、單位和格式範本必須經 typed `t` 席位或已在地化 prop 到達展示層。由使用者、模型、提供者、外掛、wire 對端或作業系統編寫的值仍是資料並原樣渲染；協定 tag、工具名稱、路徑、URL、JSON/JavaScript 字面量和穩定內部 id 不翻譯。

產品持有的目錄說明遵循同一規則。client 將完全匹配的內建提供者、模型與說明對映到 locale key；說明發生變化或來自外部提供者時，它仍是提供者資料並原樣渲染。

**Cordis-free 原子元件要求完整的在地化文案 prop，且自身不持有語言回落值。** `MarkdownText`、`JsonTree`、`TerminalBlock`、`DiffBlock`、`ReadBlock`、`SearchBlock`、`WebBlock`、`CodeBlock`、`JsonBlock`、`HoverCard` 與 `ConnectionIndicator` 的 chrome 均由功能渲染點傳入。這樣既保留原子元件包的執行時獨立性，也讓遺漏成為型別錯誤，而不是靜默選擇中文或英文。共享用詞進入 `common` namespace；功能專屬短語留在決定其語義的功能側。

**在地化展示文字絕不承擔身份。** 模型與儲存保留判別欄位、穩定 id 和非展示 marker。渲染器先匹配再翻譯，請求對映透過穩定的組成員關係進入 trajectory ledger。必須儲存在檢視模型中的 client 合成錯誤使用穩定 marker，只在展示時翻譯。因此語言切換隻改變措辭，不改變選擇、分組、搜尋身份或生命週期狀態。

**`verify-client-ui-i18n` 強制原始碼歸屬。** 基於 TypeScript AST 的檢查會發現每個包含 TSX 的 package `src/client` 目錄樹、`packages/client/ui-*` 下的所有輔助 TS 檔案和 web 應用原始碼；它拒絕自然語言 JSX 文字、承載文案的屬性與元件 prop、JSX 字面量分支、label/copy 資料、具名文案輔助函式、返回字串的展示格式化函式和解構預設值。locale 字典 owner 與不可變語言 token 是嚴格的語法級排除項。發現範圍縮窄會直接失敗，單元 fixture 固定納入與排除形態，檢查加入靜態 CI 與 `hygiene` 圖。字典 key 對等性仍由獨立檢查負責：一道門禁證明文案進入 locale 路徑，另一道門禁證明兩種釋出語言都實作該路徑。

[最初接入決策](../../archived/architecture/2026-07-30-client-locale-full-rollout.md)中的產品自產錯誤與設計字面量例外、原子元件預設文案和 trajectory 緩做均由本決定取代；其 label thunk、typed 席位、瀏覽器 locale、日期格式化和搜尋佔位行決定仍有效。

## Verification

AST 檢查自身的 Vitest spec 固定直接 JSX、範本分支、語義文案 prop、label 資料、格式化函式回傳值、locale key 呼叫、結構屬性和字典 owner。locale 字典對等性固定 `zh`/`en` key 一致。client 測試覆蓋直接翻譯席位、locale prop 介面卡，以及不改變外部說明的內建目錄說明在地化。組裝 web 回放和規定的真實伺服器 GIF 在實際 trajectory 介面上展示釋出的語言切換。

## Alternatives considered

**只依賴評審與 AGENTS.md。** 否決。既有規則和 typed 字典與數百個繞過點同時存在；評審者需要在引入行收到原始碼級失敗。

**使用文字正則，或禁止所有字串字面量。** 否決。TypeScript 與 JSX 中包含 import、CSS class、判別值、事件名、SVG 資料和使用者/wire 值。按語法上下文檢查可在不擴張檔案 allowlist 的情況下保持有效訊號，而最小發現數量可防止掃描範圍縮小後偽綠。

**為方便直接使用而保留原子元件回落文案。** 否決。回落值本身就是隱式 locale 選擇。必填 label prop 讓原子元件保持框架無關，並迫使每個產品渲染點明確文案 owner。

**翻譯所有進入 DOM 的字串。** 否決。外部編寫的資料和協定/程式碼 token 並非產品措辭。翻譯會破壞證據、識別符號、命令、路徑、URL 和提供者診斷；只有其周圍的產品 chrome 屬於 locale 系統。

## Consequences

- 新增或修改 client UI 文案時，必須在兩種 locale 中新增 typed 字典 key，併為受影響渲染路徑提供行為證據。
- 純原子元件的顯式 prop 型別變大，測試需提供有意選擇的 label fixture；這項成本換來無隱藏 locale 行為。
- AST 檢查可以抓到產品編寫的字面量繞過，卻無法證明任意動態字串 prop 已翻譯。型別、字典對等性、元件測試和評審仍共同負責這一語義區分。
- locale 服務之前渲染的 boot 標記和外部編寫的執行時資料仍在字典路徑之外；locale 啟用後，產品 UI 會替換 boot 文案。
