# Agent Note: 基於提供者路由的 LLM 介面卡與通用 pi-ai 後端

Status: implemented

[English](2026-07-14-provider-routed-llm-adapters.md) | 中文

## 問題

`dsh-llm` 按精確模型名稱註冊介面卡。外掛在 Cordis 啟動時提供模型列表，`LlmRuntime` 為列表中的每個字串儲存一個介面卡，`GenerateOptions.model` 同時選擇介面卡與提供者模型。兩個隨附的介面卡都只面向相同的兩個 DeepSeek 模型時，這種方式可以工作，但它混淆了兩個獨立決策：由哪個上游提供者承接請求，以及該提供者應執行哪個模型。

這種混淆使提供者閘道無法提供開放的模型目錄。例如，OpenRouter 是一個包含大量模型 ID 的提供者，私有 OpenAI 相容端點也可能在不修改 Harness 外掛樹的情況下增加模型。目前，每個新選擇的模型都必須在外掛啟動期間完成註冊。同一個模型 ID 還可能存在於多個提供者中，因此僅按模型註冊無法表達呼叫方預期使用的提供者。

`dsh-llm-pi-ai` 沒有暴露 pi-ai 的提供者抽象。它以內聯方式建構 DeepSeek `openai-completions` 模型，應用 DeepSeek 專用的 payload 補丁，並將每條回放的助手訊息標記為 DeepSeek。pi-ai 自身提供提供者/模型目錄，能夠選擇 `openai-responses`、`anthropic-messages`、`google-generative-ai` 等 API，並保留提供者專用的回應 ID，以及後續輪次所需的推理和工具簽名。Harness 轉換丟棄了提供者／模型路由和提供者回應欄位，因此僅將內聯模型替換為目錄查詢，會導致同模型回放與跨提供者移交不完整。

介面卡設定同樣假定只存在一個 DeepSeek API 金鑰和端點。通用後端需要為各提供者分別設定憑證和端點覆蓋，同時繼續由 pi-ai 處理 AWS、Google ADC、OAuth 等環境認證機制。

## 決策

### 提供者作為介面卡註冊鍵

`GenerateOptions` 與 `LlmCallConfig` 在 `model: string` 之外攜帶 `provider: string`，`AgentOptions` 則攜帶對應的可選建立欄位。只有兩個值都非空時，agent loop（智慧代理迴圈）請求才有效；兩個值也都會寫入請求頭日誌。`agent/request` 可以在任意步驟返回替換後的欄位組合，因此工作階段可以切換提供者與模型，無需改變 Cordis 外掛生命週期。

`LlmRuntime` 按提供者註冊和解析介面卡。`registerAdapter(providers, adapter)` 在修改註冊表前檢查整個提供者列表，遇到重複項時返回 `DUPLICATE_ADAPTER`，並以一個 effect 為單位整體 dispose（資源釋放）。模型 ID 不作為註冊鍵；仍由選中的介面卡負責驗證或轉發。後續的 [LLM 目錄與 ACP 模型選擇 Agent Note](../../archived/architecture/2026-07-15-llm-model-catalog-and-acp-selection.md) 增加了建議性的 `listProviders()` / `listModels()` 發現介面，但不會把目錄成員關係變成請求驗證規則。

在一個 Cordis 上下文中，一個提供者只能有一個介面卡所有者。`dsh-llm-deepseek` 註冊 `deepseek`；`dsh-llm-pi-ai` 也可以註冊 `deepseek`，但同時載入兩個所有者屬於設定錯誤，不採用順序規則或退回行為。若部署選擇手寫的 DeepSeek 實作，需從 pi-ai 設定中排除 `deepseek`；若部署選擇 pi-ai 的 DeepSeek 實作，則不掛載 `dsh-llm-deepseek`。

`dsh-llm-deepseek` 移除模型註冊列表，接受透過 `deepseek` 提供者路由的任意模型字串。其請求序列化、`/chat/completions` 端點、thinking 選項、SSE（Server-Sent Events）解析和錯誤行為保持不變；`options.model` 仍會原樣傳送。

### 顯式 pi-ai 提供者設定

`dsh-llm-pi-ai` 接受一個非空的提供者設定列表。列表內的提供者名稱必須唯一，並且存在於 pi-ai 的 `getProviders()` 結果中。每項設定包含提供者名稱，以及可選的 `apiKey`、`baseURL`、headers、推理級別和預算、快取保留設定、傳輸方式、SDK 超時、Harness 流空閒超時，以及由提供者擁有的 `retryPolicy`。介面卡強制將 pi-ai 的 `maxRetries` 設為零，使一次 `stream()` 呼叫只發起一次可見的提供者請求；`dsh-llm-retry` 則在 agent 失敗步驟擴充功能點上執行解析後的策略。憑證不設全域值：顯式金鑰僅對所屬設定生效；未提供金鑰時，pi-ai 使用標準環境變數、OAuth token、AWS 憑證鏈、Google ADC 或其他提供者原生環境認證。顯式空金鑰屬於無效設定，不會退回到環境認證。

外掛透過一次原子呼叫，將已設定的提供者名稱註冊到同一個 `PiAiAdapter`。每個不可變請求快照組合有效 profile 與可服務模型的描述符。目錄外模型需要顯式指定或可推斷的協定與端點。根據[設定目錄恢復決策](../bug-fix/2026-09-07-pi-ai-settings-catalog-recovery.zh.md)，已儲存的目錄錯誤保持可見、可修復，寫入仍會驗證已修改提供者，請求則在網路 I/O 前拒絕所選錯誤模型。

介面卡呼叫 pi-ai 的 `streamSimple()`，因此每個目錄模型會選擇其註冊的 API 實作；描述符為 `openai-responses` 時使用 OpenAI Responses，而非 Chat Completions。Harness 的 temperature、最大 token 數、signal、session ID，以及提供者設定中的通用流選項均直接傳遞。設定 headers 與 Harness 強制歸因 headers 合併；發生保留名稱衝突時，以 Harness 歸因為準。介面卡不再維護 DeepSeek 專用 payload 重寫或提供者協定矩陣。

pi-ai 的通用流選項不支援停止序列。若 Harness `stop` 選項已定義，`dsh-llm-pi-ai` 會以 `UNSUPPORTED_OPTION` 拒絕請求，不會靜默忽略，也不會增加第二套提供者專用 payload 實作。`dsh-llm-deepseek` 繼續透過原生請求序列化器支援 `stop`。

### 已記錄的助手路由與回放狀態

助手訊息攜帶請求的 `provider` 和 `model`，以及可選的 JSON 可序列化介面卡回放狀態。成功的 `assistant/message` 工作階段事件記錄這些欄位，`deriveMessages()` 返回助手訊息時也會包含它們。使用者、系統、上下文與工具結果訊息不攜帶助手路由欄位。提供者/模型欄位是 agent loop 的權威資料；介面卡僅擁有其不透明回放狀態 payload。

成功的終止 `finish` 分片可以以 `ReplayEnvelope` 形式攜帶回放狀態：不透明的回應級中繼資料，加上與發射塊序列對齊的可選逐塊條目。`BlockAssembler` 對內容與中繼資料只做一次保留/丟棄決定——max-token 組裝丟棄工具呼叫時，資料同一位置的條目一併丟棄——因此 agent loop 附加到已組裝助手訊息模型來源中的狀態始終描述儲存的塊，見 [max-token 回放狀態對齊決定](../../archived/bug-fix/2026-08-15-max-token-replay-state-alignment.md)。agent loop 不公開回應改寫掛鉤。錯誤或中止回應不會生成正常助手訊息，因此不會進入後續模型歷史。

pi-ai 回放狀態用其成功 `AssistantMessage` 的帶版本最小投影填充該結構：一個回應半區（源 API/提供者/模型、回應 ID/模型、可選的提供者原生 effort、停止原因），以及逐塊的文字簽名、thinking 簽名和工具呼叫簽名。[pi-ai 升級相容性決定](../bug-fix/2026-09-05-pi-ai-upgrade-compatibility.zh.md#decision) 定義請求模型與 Anthropic 原生模型身份的區別，以及 effort 的保留規則。它不會重複 Harness 內容塊中已有的文字或工具參數，也不包含診斷資訊、時間戳、用量或錯誤。後續請求中，只有歷史提供者和目標提供者目前歸同一個介面卡實例所有時，`LlmRuntime` 才會把回放狀態交給目標介面卡。介面卡在能夠恢復歷史回應時，將 Harness 記錄的內容與回放狀態組合，並負責所需的跨模型或跨提供者轉換。持久化內容保持權威：介面卡收到無法使用的回放狀態——未知 kind 或版本、格式錯誤的中繼資料、或與內容不再匹配的塊結構——會把該訊息降級為提供者無關轉換並帶出診斷；其他介面卡只能收到提供者無關的內容以及提供者/模型欄位。

該狀態屬於模型可見的回放輸入，因此遵循現有的[請求可重建規則](2026-07-05-reconstructable-requests.zh.md)：它同時存在於終止 `finish` 分片和驅動派生的已組裝 `assistant/message` 模型來源中。恢復和 fork 會原樣保留該狀態。壓縮（compaction）遮蔽助手訊息時，也會從活動 surface 中移除其回放狀態；摘要屬於普通的提供者無關內容。

### 在所有請求生產方中傳播目標

每條模型選擇路徑都同時攜帶 provider 與 model：宣告式 agent、ACP（Agent Client Protocol）和 stdio 應用設定、JSON-RPC initialize 請求、subagent 覆蓋與繼承、工作流子 agent 覆蓋，以及直接壓縮摘要。subagent 先從父 agent 繼承兩個欄位，再應用請求覆蓋。系統提示詞變數集合在 `model` 之外增加 `provider`。

壓縮設定在 `summarizationModel` 之外增加 `summarizationProvider`。兩個值均為空時繼承，均非空時選擇顯式目標；只設定其中一個會導致載入失敗。繼承優先使用最近一次記錄的請求目標，沒有時退回到 agent 建立選項。`compaction/summary` 使用現有模型呼叫 envelope 記錄兩個欄位。

JSON-RPC 執行時顯式接收提供者與模型。僅當 `deepseek` 提供者沒有註冊所有者時，其便利退回才會掛載 `dsh-llm-deepseek`；其他缺失的提供者會直接失敗，不會猜測介面卡。

目前的 seed/load 驗證會拒絕省略必需提供者／模型欄位的請求頭和助手訊息。凍結的 v0-to-v1 遷移邊要求遷移前已具備同一套可重建路由身份；它絕不會猜測缺失的提供者或模型，畸形結構會在釋出前被拒絕。

## 考慮過的替代方案

**繼續以模型名稱作為註冊表鍵，並增加通配介面卡。** 通配機制會在精確註冊與後備外掛之間引入退回順序，使重複所有權取決於監聽器順序；若不再增加其他約定，仍無法區分不同提供者中相同的模型 ID。

**將提供者與模型編碼到一個字串中。** OpenRouter 的 `openai/gpt-*` 等值已經包含類似提供者的字首和斜槓。分隔符約定會把路由語法洩漏到每個模型選擇器，並需要轉義規則；兩個顯式欄位更清晰，也可以分別記錄日誌。

**增加 `backend + provider + model`。** backend 鍵可以讓 `dsh-llm-deepseek` 與 pi-ai 的 DeepSeek 實作共存，並按請求切換。最終採用的部署規則是一個提供者對應一個介面卡所有者：同一上游的不同實作屬於由外掛組合選定的替代項。第三個路由維度會增加每個請求與設定的負擔，卻沒有目前消費方。

**讓 `dsh-llm-pi-ai` 自動註冊所有 pi-ai 提供者。** 這種方式會佔用部署無意暴露的環境憑證和提供者名稱，並與 `dsh-llm-deepseek` 等原生介面卡衝突。顯式設定可以審查能力和憑證範圍。

**每個提供者掛載一個 pi-ai 外掛實例。** 獨立實例可以隔離設定，但會重複外掛宣告，也無法實作設定註冊的原子性。每個請求本就向同一個介面卡提供提供者，因此經過驗證的設定對映具有更小的生命週期介面。

**接受任意內聯 pi-ai 模型描述符。** 這種方式可支援目錄外的私有模型 ID，但會將 pi-ai 的模型與相容性 schema 暴露為 Harness 設定，並要求介面卡驗證協定專用組合。目前版本透過覆蓋目錄模型的 `baseURL` 支援自定義端點；只有實際出現目錄外部署需求後，才會另行決策是否支援自定義描述符。

## 影響

- 提供者名稱是部署範圍內的路由所有權鍵：兩個提供者可以使用相同的模型字串，但為同一個提供者掛載兩個介面卡會在載入時失敗，不會形成退回順序。
- 模型選擇不再改變 Cordis 外掛圖。目錄型介面卡可以接受啟動後選擇的任意已安裝目錄模型，原生 DeepSeek 介面卡則會轉發任意 DeepSeek 模型 ID。
- 自定義 `baseURL` 會保留所選目錄模型的協定與能力，但不會讓目錄外模型 ID 變為有效。私有端點必須實作該目錄項對應的協定。
- pi-ai 憑證、傳輸選項、SDK 超時，以及預設五分鐘的 `streamIdleTimeoutMs` 空閒超時機制均按提供者設定隔離。系統停用隱藏的提供者重試；有界重試由單獨組合的 agent 恢復策略負責。
- pi-ai 的通用流 API 無法表達停止序列，因此 `dsh-llm-pi-ai` 會拒絕停止序列；原生 DeepSeek 介面卡仍支援停止序列。
- 僅當歷史提供者與目標提供者歸同一個介面卡實例所有時，回放狀態才可移植。介面卡負責跨提供者和跨模型恢復；其他介面卡只接收不含不透明狀態的提供者無關歷史。
- 目前 Session JSONL 要求請求頭和助手訊息都包含提供者／模型。v0 邊只遷移已經攜帶可重建請求身份的凍結結構。

## 測試

- 單元測試覆蓋註冊表衝突、請求重建、工作階段驗證、設定解析、單次請求的選項轉發、包括 OpenAI Responses 在內的原生 API 選擇、轉換、回放驗證、錯誤對映、呼叫方取消、空閒超時導致的傳輸終止、內容重寫，以及同一實例與不同實例間的回放分發。
- 無金鑰的 agent loop/工作階段測試和 ACP 快照覆蓋持久化提供者/模型中繼資料、恢復與 fork 傳播、工作流/subagent 覆蓋，以及不變的使用者可見 transcript（文字記錄）；金鑰門控的 DeepSeek e2e 測試保留真實提供者的流式輸出與工具後續呼叫覆蓋率。
- 公共 JSDoc、package README、架構與子系統文件、生成目錄、範例、工作階段 fixture（測試前置資料）和 Python SDK 配對文件統一使用提供者/模型目標，並由儲存庫文件與型別等價門禁驗證。

## 風險

這項變更在引入時是覆蓋全儲存庫的 API 破壞性變更：僅模型的請求建構、介面卡註冊、應用協定、fixture，以及持久化 v0 事件結構同時變化，不提供相容別名。已釋出歷史恢復現在屬於相鄰 Session 格式邊。提供者排他規則有意禁止同一上游的兩個實作共存於同一上下文。pi-ai 依賴升級可能改變可接受的提供者／模型目錄，因此鎖檔案與介面卡 e2e 矩陣定義已驗證集合。自定義 `baseURL` 端點會繼承所選目錄模型的協定假設，無法修復不相容的代理。目錄外模型描述符與多模態內容仍不受支援。pi-ai 回放狀態可能包含不透明的加密推理簽名；提供者需要該資訊維持連續性，因此係統會持久化該狀態，但不會在現有工作階段記錄之外渲染或記錄它。
