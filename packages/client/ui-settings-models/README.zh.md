---
description: "dsh Web 用戶端的模型設定與產品引導外掛：提供商行、API 金鑰管理、模型列表與 DeepSeek 首次執行彈出視窗。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-models

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-models` 是 dsh Web 用戶端的 Models 設定頁面：使用者可以設定 API 金鑰（以只寫方式存入 profile 的憑證引用之下）、編輯每個提供商的模型列表，並手工宣告自定義 pi-ai 路由；頁面以提供商行展示，一次只展開一張編輯卡片。該頁面把提供商目錄、設定文件與憑證描述合併為一個共享快照，因此行的狀態在三個方面始終一致。它還會帶首次執行的使用者走兩個有序彈出視窗——版本化內測宣告，以及按條件顯示的官方 DeepSeek 憑證步驟。

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

儲存憑證或自定義提供者時保留已選模型。使用者可在 composer 中選擇可用模型。

提供者列表中 DeepSeek 帳號排第一，DeepSeek 排第二；第三方提供者保留目錄中的相對順序。

從設定導航開啟 Models 頁面，即可看到每個已設定的提供者都有一行。其設定鍵未在任何位置設定的整分節提供者會渲染為其展開的設定卡片而非一行，但僅限首次執行姿態，且僅持續到使用者關閉該卡片為止。每一類卡片各自持有自己的展開狀態，因此關掉其中一張絕不會丟棄另一張裡的草稿。

存在已儲存目錄錯誤的提供商仍顯示診斷以及編輯、刪除入口。新增操作只面向已註冊的 settings 名稱空間，因此不可用的名稱空間不會留下無法開啟編輯器的按鈕。儲存被拒絕時，編輯器保持開啟並展示 Host 診斷。

Host 設定 `credentialOnboarding` 預設為 `true`。Electron preload 標記會抑制自動憑證引導和 Web 歡迎須知；模型設定頁與顯式 API Key 編輯仍然可用。[帳號外掛](../ui-settings-account/README.zh.md#desktop-onboarding)負責 Desktop 引導。其他原生殼可以透過 `credentialOnboarding: false` 僅停用憑證步驟。Host 透過 `webserver/index-inject` 釋出這個公開的布林值，Client 在註冊彈出視窗前驗證它。它是頁面初始化資料，不是持久化的完成標記。

### API 金鑰

API 金鑰輸入框初始為空，並透過 `autocomplete="new-password"` 請求瀏覽器不要自動填入已儲存的登入密碼。

編輯卡片上的主欄位是單獨一個 **API 金鑰**輸入框——頁面從不詢問環境變數名。鍵入的金鑰經 `credentials.set` 以**只寫**方式存入 profile 的引用之下，profile 沒有引用時便派生 `<ROUTE>_API_KEY`，pi-ai profile 會把這次派生記錄為 `apiKeyEnv`，因此 `cordis.patch.yml` 從不攜帶金鑰值。為新的 pi-ai 提供商留空金鑰會儲存一個不帶引用的 profile，從而保留提供商原生認證（例如 Bedrock 憑證鏈或 Vertex ADC）。只有確認引用的憑證已設定時，行才會以綠色實心點標示 API 金鑰狀態；只有確認具名引用缺失時，才會以紅色實心點標示。「應用」成功後會發出本地無障礙狀態訊息，且絕不回顯任何機密內容。

### 編輯提供商

收起的「自定義設定」摺疊區承載精選的額外欄位：兩個家族都有 `baseURL`（deepseek 的預留位置顯示公共端點）、各介面卡自己的模型目錄，以及介面卡未提供的 pi-ai 路由的**顯示名稱**與 **API 協定**。Profile `headers` 仍是 `cordis.patch.yml` 或 Cordis 設定中的部署設定，Models 頁面不提供編輯器。Provider ID 保持固定：它是 settings 的鍵、其他每個 namespace 與每一條已記錄工作階段引用的名字，也是頁面讀不回、因而搬不走的憑證引用詞幹。推理等級刻意不在可編輯欄位之列：它是按模型的能力，提供商級的控制元件只可能被設成某些模型會拒絕的值。每個模型行可編輯 `id`、可選顯示 `name`、可選 `contextWindow`/`maxTokens` 和輸入型別；無關的模型欄位在編輯後仍會保留。

`llm-deepseek` 的 DeepSeek 卡片編輯端點、憑證和模型目錄。它使用 Messages，預設端點預留位置為 `https://api.deepseek.com/anthropic`。

展開**自定義設定 → 模型選項**編輯模型。兩個提供商家族共用相同的模型行佈局、標籤和圖示：上下文視窗與最大輸出 token 數分為兩列，**輸入型別**獨佔下一行，提供**文字**和**圖片**核取方塊。未宣告輸入型別的模型行優先顯示已安裝模型的輸入型別，其次是提供商預設值，最後退回為文字。已知 pi-ai 提供商會載入已安裝目錄，不向端點傳送請求；開啟模型行不會寫入覆蓋值。顯式輸入選擇具有優先權，包括為視覺模型設定的僅文字覆蓋。修改核取方塊會儲存所選型別，且至少保留一種。DeepSeek 寫入 `inputModalities`，pi-ai 寫入 `input`。DeepSeek 取消勾選圖片時，還會移除 `imagePixelBudget` 和 `imageMaxBytes`，因為介面卡在沒有圖片輸入時拒絕這些限制。在 `cordis.patch.yml` 中清除輸入欄位可恢復介面卡繼承；**恢復預設模型**會重置整個模型目錄覆蓋。僅宣告上游模型實際能夠處理的輸入型別。

### 新增與刪除提供商

**新增模型提供商**是新增卡片的唯一入口：只要任一帶編輯器的設定 namespace 已掛載就會出現，下述兩種方式任一可繼續時才可點選。卡片開啟後頂部是分段式的方式切換，下方一行小字說明所選方式的用途：**第三方模型提供商**承載休眠目錄提供商選擇框與提供商編輯器——裸掛載的 `llm-pi-ai` 在任何路由存在之前就能提供其完整的已安裝 catalog；**自定義模型 API**承載為 pi-ai 不提供的路由（中轉站、自部署服務或其他相容 OpenAI / Anthropic 協定的介面）準備的建立表單。某種方式只在其 namespace 已掛載時提供；只剩一種方式時卡片以該方式為標題直接顯示錶單；namespace 已無可採用的提供商或沒有可宣告的協定時，對應方式會被停用並把原因作為懸停提示。面板在其方式首次顯示時掛載，之後在卡片開啟且該方式仍被提供期間保持掛載但隱藏，因此切換方式不會丟掉任何一邊的草稿；任一面板有寫入或端點探測進行中時滑塊鎖定，因為此時切換會讓結果落到看不見的面板上。每個 tab 透過 id 控制其面板，關閉任一面板都會忘記目錄草稿的目標。自定義表單會索要唯一的 **Provider ID**、端點、協定與至少一個可唯一識別的模型，因為沒有東西能為它們後備。協定選擇框以產品名稱顯示各協定——OpenAI Chat Completions、OpenAI Responses、Anthropic Messages——儲存的值仍是 schema 識別符號；介面卡新增而本頁尚未命名的協定直接顯示其識別符號。端點佔位範例隨所選協定變化：OpenAI Chat Completions 與 Responses 顯示 `https://gateway.example/v1`，Anthropic Messages 顯示 `https://gateway.example`，因為其 SDK 會追加 `/v1/messages`。切換協定會保留已輸入的地址。端點必須是可解析的 HTTP 或 HTTPS URL；localhost、IPv4 與 IPv6 字面地址以及自定義埠仍然有效。語法錯誤會在欄位處阻止詢問與建立，請求失敗則繼續作為獨立的提供商錯誤顯示。**取得可用模型**透過 `llm/discoverModels` Remote 查詢表單顯示的端點，因此新增提供商一次即可完成，而非先儲存再返回；回覆開啟的是可搜尋選擇器而非直接寫入，只有點選**新增所選**才會寫入。候選項使用等寬字型顯示原始模型 id，以區分同名模型。每行保持單行，懸停可檢視模型名稱，未提供名稱時退回到完整 id。勾選與設定仍使用原始模型 id。每個選中候選會在提供商公佈相應資訊時，把 id、顯示名、上下文視窗、最大輸出 token 數和已公佈的輸入型別複製進可編輯行；已經存在的行保留使用者調整過的值。搜尋會匹配模型 id 與可選顯示名稱，且不會清除隱藏項的勾選狀態。**全選**會加入可見結果，而**取消全選**會清空全部勾選，以免意外採用隱藏結果。只有使用者層單獨攜帶某行時，該行才可刪除（刪除會恢復組合基線），其確認對話方塊會指名該提供商。

### 首次執行彈出視窗

版本化宣告步驟完成後，DeepSeek 步驟從同一份合併快照投影首次執行就緒狀態。使用者已經能夠到達的**任何**提供商都會直接結束該步驟、不做渲染；只有沒有任何提供商的使用者才會被詢問官方 DeepSeek 金鑰。「稍後設定」只完成這次協調器遍歷；介面卡缺失、路由不活動、合併失敗、只讀部署或能力不可用時，該步驟不渲染即完成——Models 仍是診斷介面。

### 擴充功能 slot

本分割槽為儲存庫外分發的外掛宣告兩個席位，型別定義在 [`src/client/slot-contract.ts`](src/client/slot-contract.ts) 並從 `./client` 匯出。`settings.models.provider-card`（keyed）渲染在每張展示目錄行的卡片內部——已儲存行的卡片、其首次執行 setup 形態、以及「新增提供商」草稿卡——以 `entryKey = settingsNs` 分發，owner props 攜帶該行的 `ConfigurableProviderView`、其 configured 狀態與已確認的 api-key 憑證狀態，因此以某介面卡家族的 namespace 註冊一次即可收到該家族的全部卡片，含手工宣告的路由；手工宣告的草稿卡尚無目錄行，儲存之前不分發。`settings.models.footer`（list）渲染在行列表與新增控制元件之後。註冊方透過 `ctx.slots.inject` 啟用，並以 type-only import 引入本包 `/client` 入口；沒有註冊方時兩個席位均不渲染任何內容。

Models 頁面包含 **DeepSeek 帳號**（`deepseek-account`，英文為 **DeepSeek Account**）。其編輯器展示共享的 DeepSeek 模型目錄，不提供 API Key 或 Base URL 輸入框；目錄儲存到帳號路由自己的設定段（預設為 `llm-deepseek-account`），因此帳號側的編輯不會改寫 official 路由讀取的 `llm-deepseek` 段。帳號可用模型目錄為空時隱藏帳號行，包括登入前和退登後；帳號模型恢復可用時重新顯示。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

頁面只持有脫敏後的描述符，從不持有完整設定分割槽：因此每次編輯都以 `settings.mutate` 路徑操作落到已存分割槽上——每個改動欄位一次 set、每個清除欄位一次 unset、刪除提供商行則一次 unset。

### 驗證

鍵入的 API 金鑰按其自身欄位判定：去除首尾空白後必須非空，且每個字元都必須是可列印 ASCII（`[\x21-\x7E]`），這正是 HTTP 頭值能夠攜帶的字元集——與 `@deepseek-ai/dsh-llm` 中的 `normalizeApiKey` 互為映像，此處復刻是因為源平面拆分禁止匯入它。與貼上的 `NAME=value` 環境行一致或包裹在匹配引號內的值，會作為同樣的格式失敗被拒絕。空 id、重複 id、空顯式名稱以及不可讀、非正數或小數的容量都會在任何寫入之前失敗。DeepSeek 的 `models` 是一個按值整體替換的陣列：編輯器先顯示繼承的有效行，直到第一次模型編輯把完整陣列物化進使用者層，重置則取消該覆蓋。

### 並行與憑證

每次 settings 寫入都攜帶卡片目前的 `revision`，因此來自另一個標籤頁或外部 `cordis.patch.yml` 編輯的並行寫入會以 `settings/conflict` 被拒絕。settings 提交後，卡片會在儲存憑證前採納返回的脫敏使用者子樹與 revision，因此失敗的憑證階段只重試該階段。刪除只會在 profile 指名本頁派生的 `<ROUTE>_API_KEY` 目標時移除已設定且可寫的憑證，然後 unset 該 profile；兩個操作都冪等。載入完成後，頁面訂閱轉發的 `settings/document-updated`、`credentials/reference-updated` 與 `llm/adapters-updated` 屬主事件，以及本地 `connection/reset`，因此外部編輯無需輪詢即可收斂。

### 引導協調器

宣告步驟在 `src/client/locales.ts` 中持有精確文案，並在 `src/onboarding-copy.ts` 中持有確認版本；迴環時它透過既有 settings API 比較並寫入 `ui-settings-general.welcomeNoticeVersion`，且只有顯式點選「繼續」才會記錄目前版本。非迴環瀏覽器無法使用這個僅限主機的 namespace，因此確認只保留在程序內，重新整理後宣告會再次出現。DeepSeek 步驟面向 `llm-deepseek` 中的 `deepseek-official`，在共享引導模態框內以僅憑證模式渲染既有 `ProviderEditor`；`credentials.set` 仍是唯一的機密寫入，且不改變任何提供商設定。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設定底座、本頁所合併的 seam 與設計依據。

- [ui-settings](../ui-settings/README.zh.md)——本頁所依賴 scope 與 schema 服務所在的領域底座。
- [settings](../../settings/README.zh.md)——持久化使用者設定 seam 及其檔案提供者。
- [credentials](../../credentials/README.zh.md)——本頁寫入金鑰所經的憑證引用 seam。
- [llm](../../llm/README.zh.md)——本頁所設定提供商所在的介面卡註冊表。
- [Web 設定平面](../../../.agents/notes/archived/architecture/2026-07-30-web-config-plane.md)——手寫編輯器的設計依據。

-----

`settings.models.sign-in` 插槽讓帳號登入在憑證編輯器之前提供選擇；沒有貢獻者時直接顯示編輯器。關閉帳號選擇彈出視窗會結束整個引導步驟。從帳號選單顯式重新開啟時，即使已有提供者設定，也會進入同一個編輯器。

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供商請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義編輯器的欄位覆蓋範圍與本頁的觸達範圍；它們是目前包約束，不是設定路線圖。

- **卡片上只有 API 金鑰與精選摺疊欄位可編輯**：手寫編輯器以 schema 通用欄位覆蓋換取了 mockup 佈局。重試策略、超時、DeepSeek 模型說明及其他進階欄位仍留在 `cordis.patch.yml` 中；編輯器未展示的現有模型欄位會予以保留。
- **憑證清理範圍刻意保持狹窄**：刪除一行時，僅當其引用與頁面派生的 `<ROUTE>_API_KEY` 目標完全一致，才會清除已設定且可寫的憑證。自定義引用、環境憑證與無法識別的目標會保留，因為該行無法證明自己擁有它們。
- **只有 pi-ai 路由可以手工宣告**：自定義模型 API 表單寫入 `llm-pi-ai`——唯一一個其 profile 描述整個提供商的 namespace。`llm-deepseek` 路由是組合面的事實，不是本頁能建立的東西。
- **目錄選擇框列出的是路由識別符號**：`moonshotai`、`zai` 等 pi-ai catalog id 原樣顯示，沒有產品名、別名或搜尋。一個把自定義表單作為置頂項的可搜尋選擇器可以取代方式切換；前提是目錄先攜帶顯示名稱。
- **詢問覆蓋 OpenAI 相容與 Anthropic Messages 端點**：OpenAI 協定接受標準 `data` 陣列或富資訊 `models` 物件，Anthropic 則使用原生模型列表路由；其餘協定會報告自己無法被詢問，其模型需手工填寫。
- **未宣告的存活路由無處渲染**：未附帶可設定提供者宣告即註冊的路由沒有 settings 地址；它在各選擇器中仍然可見，但不會出現在本頁的行裡。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是隻貢獻 nav entry 的 section 外掛，渲染固定空 content column，不發出 Cordis 事件，也不持有跨外掛可變關係。
