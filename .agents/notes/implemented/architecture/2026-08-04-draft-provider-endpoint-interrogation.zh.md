# Agent Note: 詢問草稿中的提供者端點

Status: implemented

[English](2026-08-04-draft-provider-endpoint-interrogation.md) | 中文

## Problem

當 pi-ai 路由變成[一份宣告而非 catalog 查表](../../archived/architecture/2026-08-03-pi-ai-declared-provider-catalog.md)之後，要接入一個相容閘道的人，必須先知道它的模型 id 才能完成設定。介面卡不再把人限制在已安裝 catalog 裡——這正是那次改動的目的——但也意味著沒有任何東西告訴使用者該端點究竟服務什麼，而 OpenAI 與 Anthropic 相容端點會透過各自協定的模型列表路由公佈這份資訊。

顯而易見的答案——後臺重新整理的執行時動態 catalog——已隨下層一併被拒絕：它會把路由的模型列表變成需要快取、失效語義與離線路徑的外部可變狀態，而產品需求要窄得多。真正需要的是*一次性詢問*，其答案由使用者採納進 `settings.yaml`，從而讓 `settings.yaml` 始終是決定路由服務內容的唯一真源。

麻煩之處在於，被問的物件還不存在。正在新增的提供者沒有路由、沒有已存 profile、也沒有已存憑證；端點與金鑰都是使用者尚在輸入的表單值。而現有的每個 LLM（大語言模型）Service Definition 操作都以已註冊的提供者路由為鍵，因此沒有一個能承載它。

## Decision

詢問以 **settings namespace** 為鍵，而不是提供者路由：

- `ctx.llm.registerModelDiscovery(settingsNs, discover)` 讓介面卡外掛為自己擁有的 namespace 提供「詢問端點」的能力，`ctx.llm.discoverModels(settingsNs, request)` 發起詢問。沒有任何辦法列舉哪些 namespace 註冊過：詢問不了的介面會從那句拒絕裡知道，而一份無人消費的列表只會變成一個什麼都不做的必填協定欄位。以 namespace 為鍵是對的，因為設定介面已經從可設定提供者目錄裡拿到了它，也因為正在新增的提供者沒有路由可點名。
- `LlmModelDiscoveryRequest` 攜帶草稿——可選的 `provider`、可選的 `baseURL`、可選的 `api`、可選的 `apiKey`，以及一個 signal——且 `provider` 與 `baseURL` 至少要有一個，才有東西可答。`provider` 之所以存在，是因為介面卡已經描述過的路由直接由它自己的註冊表作答、完全不聯網；只有它未描述的路由才會抵達某個端點。自定義提供者卡片會解析非空的 `baseURL`，且只允許 HTTP 或 HTTPS，之後才會呼叫該操作或寫入 profile。這條路徑不寫 settings 與 credentials。已設定且具名的路由會在 Host 內讀取已存憑證和部署方持有的 profile `headers`：憑證只寫，而精選的 Models 頁面不編輯 headers，因此頁面草稿無法重建兩者。鍵入的金鑰優先於已存憑證，profile headers 則仍隨請求傳送。
- `LlmDiscoveredModel` 除 `id` 外每個欄位都可選，因為大多數列表只公佈 id。回覆是候選而非 catalog：採納其中一條的介面仍要補上介面卡所需的容量。
- `llm.discoverModels` 把同一份草稿送過協定層。它的 `apiKey` 是可承載機密的第三個、也是最後一個載荷（另兩個是 `settings.update`/`mutate` 與 `credentials.set`），且絕不被儲存或回顯。它確實會像其他承載機密的載荷一樣隨用戶端外發信封同行，`subscribeEnvelopes()` 觀察者看得到；把那個抽頭脫敏是整個設定面的改動，不該由這一個方法獨自決定。Connection 用與完整 Host API 相同的工作階段認證該方法：它讓主機向呼叫方選定的 URL 發起 GET 並回報結果，匿名呼叫者絕不能獲得這類探測能力。每一種拒絕都摺疊為 `model-discovery-failed`，其訊息是介面卡自己的文字，details 點名被詢問的端點，絕不點名所提供的憑證。

`dsh-llm-pi-ai` 會應用[`dsh-llm-pi-ai` README](../../../../packages/llm/llm-pi-ai/README.zh.md)記錄的列表路由、認證、URL 歸一化、回應格式與中繼資料規則。Profile 解析會拒絕 Fetch 無法表示的名稱與值，因此格式錯誤的部署 header 會在詢問前以設定錯誤報告。已設定的 profile headers 最先裝入；固定協定 headers、鍵入或已存的協定憑證以及 Harness attribution 隨後分別以大小寫不敏感方式贏得相應衝突。沒有文件化列表約定的協定會以 `DISCOVERY_UNSUPPORTED` 回答，讓介面退回到手工填寫，而不是把猜錯的回應欄位報成一個空提供者。`baseURL` 按字首而非待解析 URL 處理，因此部署路徑段會保持不變。回覆在四兆位元組上限下讀取，且上限落在實際收到的位元組上——端點是使用者自己填的 URL，因此會先看宣告的 `content-length` 作為善意提示，但絕不把它當作邊界；這與 `dsh-web-fetch` 面對自己的呼叫方提供 URL 時所用的兩段式模式一致。

### 為什麼不用 pi-ai 自己的 refresh 機制

pi-ai 提供了 `createProvider({ fetchModels })` 加上 `Models.refresh()` 與 `ModelsStore`，而下層本來就在建構 pi-ai `Provider` 物件。把詢問接到它們上面，意味著每問一次就要建構一個用完即棄的提供者與集合，而那個 store 的全部目的——跨執行持久化 catalog——恰恰與「`settings.yaml` 擁有 catalog」的決定相牴觸。而且它什麼也換不來：**沒有任何一個 pi-ai 內建提供者實作了 `fetchModels`**，因此 HTTP 呼叫及其回應解析無論如何都是本包的程式碼。直接 fetch 才如實說出正在發生的事。路由已存的憑證由本外掛自己那套逐請求解析器取出，且只在真正要聯網的那條分支上進行，因此 catalog 路由作答時既不觸碰憑證，也不會因為一把這次詢問根本用不上的金鑰而失敗。

## Alternatives considered

**以提供者路由為鍵。** 與其他每個 LLM Service Definition 操作對稱，也能讓請求省去端點。但催生該功能的情境——新增提供者——沒有路由，於是這個操作只對已設定好的提供者可用，而它們恰恰最不需要它。

**把能力掛在 `LlmAdapter` 上。** 介面卡要經由路由註冊才能抵達，因此問題相同；而且這會讓一個介面卡實例去回答它並不服務的端點的問題。

**讓 Host 讀取整個已存 profile，而不是接受草稿。** 對已設定好的提供者來說，不會有機密跨越協定層。但這樣一來新增提供者就必須先儲存一份不可用的設定，而端點已改卻尚未儲存的表單會靜默地去詢問舊地址。草稿仍是端點和協定的權威來源。Host 側的狹窄例外是隻寫的已存憑證，以及仍屬部署設定、而非 Models 頁面欄位的 profile headers。

**詢問每一種 pi-ai 協定。** 根據便利的回應相似性選擇覆蓋範圍會顯得武斷，也會讓猜錯的回應與「提供者沒有模型」無法區分。Anthropic 僅透過其文件化原生列表約定納入支援，具體由[`dsh-llm-pi-ai` README](../../../../packages/llm/llm-pi-ai/README.zh.md)記錄；Google 的欄位集合與 Azure 的請求約定不同，Codex 則使用 OAuth。不支援的協定會把使用者送去手工填寫，這仍是既定退回路徑。

**用 `response.text()` 緩衝整個回覆再判斷長度。** 更簡單，但上限會在位元組已經到達之後才生效，而端點是使用者隨手填的任意 URL。

## Consequences

接入閘道的人可以直接問它服務什麼，而不必去翻它的文件；答案以候選形式抵達，由使用者自己挑選，而不是被揹著寫進設定。缺少 scheme、不支援的 scheme 或 URL 格式錯誤都會直接在欄位處失敗，不會發起 Remote 呼叫；localhost、IPv4 與 IPv6 字面地址以及自定義埠仍然有效。提供者與網路失敗仍是獨立的詢問結果。當端點公佈了更豐富的中繼資料時，採納候選會把 id、名稱、上下文視窗與最大輸出 token 數填進 Web 的可編輯行。搜尋會保留隱藏項的勾選狀態，全選會加入可見結果，而取消全選會清空全部結果，因此篩選後的選擇器不會意外提交隱藏模型。已設定的企業閘道會為詢問與模型請求使用同一組部署 headers 和 Harness `User-Agent`，而無需給瀏覽器協定增加 header 注入欄位。seam 因此多了一個刻意保持很小的註冊表：每個 namespace 一份、不儲存、生命週期不超出 fiber。

代價是：協定層多了第三個承載機密的載荷，設定面的只寫介面從兩個方法變成三個。發現覆蓋範圍仍按協定而非按提供者劃分，使用不受支援請求約定的端點仍須手工填寫。由於沒有任何環節會重跑該詢問，模型列表的新鮮度依舊只到最近一次編輯為止；這與下層刻意做出的取捨是同一個。

## Testing

`packages/llm/llm/tests/topology.spec.ts` 覆蓋註冊表：每個 namespace 一份、隨 fiber dispose（資源釋放）、丟棄重複與不可用 id 且不憑空補容量的歸一化、`NO_DISCOVERY`/`INVALID_DISCOVERY` 兩種拒絕，以及 `model-discovery-failed` Remote 對映。`packages/llm/llm-pi-ai/tests/discovery.spec.ts` 針對本地 HTTP 伺服器驅動探測——包括採用每種受支援中繼資料拼寫的標準陣列與富資訊物件、Anthropic 原生路徑、headers 與容量欄位、不同於巢狀規範 id 的路由鍵、名稱退回、被保留的部署路徑、無憑證、已設定路由提供自己的已存憑證與 headers 且鍵入的金鑰無需解析已存憑證便可壓過它、catalog 路由完全不解析憑證即作答、被丟棄的行、401/403 與伺服器故障之別、非列表與非 JSON 回應、不可達端點、呼叫方取消、不支援的協定，以及尺寸上限的「宣告長度」與「流式」兩種形態。`packages/llm/llm-pi-ai/tests/loader-composition.spec.ts` 透過 Loader 啟動 settings 與 credentials，並證明僅設定在 settings 中的 headers 會抵達 `GET /models`，且請求所持有的 headers 贏得衝突。`packages/llm/llm-pi-ai/tests/adapter.spec.ts` 拒絕 Fetch 無法表示的 profile headers，`packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts` 證明 settings 寫入會報告該設定錯誤，同時上一組可用路由仍繼續服務。`packages/client/connection/tests/node-half.host.spec.ts` 固定 `llm/discoverModels` 的 `/api` 承載註冊，而設定頁的元件測試和建置後 Web 測試則驗證完整草稿抵達 Remote、格式錯誤和非 HTTP(S) 的自定義提供者 URL 不會發起請求、帶自定義埠的 localhost 與 IP 字面地址仍然有效、提供者失敗與 URL 錯誤保持區別、缺席欄位保持缺席、所選中繼資料填滿四個可編輯模型欄位、使用者調整過的行優先於重新發現結果、篩選後的取消選擇會清除隱藏候選項，以及選擇前沒有 settings namespace 或憑證被寫入。
