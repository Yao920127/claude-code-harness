# Agent Note: 透過 Anthropic Messages 協定呼叫 DeepSeek

Status: implemented

[English](2026-09-07-deepseek-messages-adapter.md) | 中文

## 問題

Messages 以原生協定欄位表示思考、簽名、工具呼叫、工具結果和累計用量。僅替換端點或壓平助手歷史會丟失後續工具輪次需要的資訊。

## 決策

[DeepSeek 介面卡](../../../../packages/llm/llm-deepseek/README.zh.md)在唯一的 `deepseek-official` 路由和 `llm-deepseek` 設定名稱空間下提供 Messages。[單協定決策](../simplification/2026-09-19-deepseek-messages-only.zh.md)擁有傳輸範圍。`PreparedAdapterCall` 固定端點、憑證引用與模型能力；重試保留該代設定，後續呼叫讀取新設定。

介面卡遵循 [DeepSeek 相容文件](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api) 和 [Anthropic 流協定](https://platform.claude.com/docs/en/build-with-claude/streaming)。pi-ai 的 Anthropic 實作為相鄰使用者訊息、累計用量、工具參數分片和可選思考簽名的處理提供參考。DeepSeek 透過 `output_config.effort` 設定思考強度；Anthropic 思考 token 預算不控制 DeepSeek 思考強度。介面卡轉發顯式 `temperature` 值；DeepSeek 在啟用思考時接受該參數但忽略其值，因此呼叫方可以保留已有思考設定。

助手內容塊保留持久化的模型可見內容。帶版本的 `ReplayEnvelope` 僅儲存協定格式、模型標識、對齊的塊型別以及內容塊未包含的簽名。同模型續接原樣恢復簽名，包括空簽名；外部歷史不生成虛構簽名。不可用的中繼資料遵循現有[回放降級規則](../architecture/2026-07-14-provider-routed-llm-adapters.zh.md)：請求省略簽名並記錄警告，保留持久化內容；Messages 無法表示歷史工具參數時使用[空輸入後備](../bug-fix/2026-09-16-messages-historical-tool-input.zh.md)。提供者回放資料對迴圈保持不透明，同時能夠隨 Session 持久化和內容塊裁剪保留。

介面卡優先使用確定性請求圖片的 Files 引用，並管理上傳快取、重新整理、配額恢復與附件省略。Files 用戶端遵循[精確 `/v1` 根地址規則](../bug-fix/2026-09-15-messages-v1-base-url.zh.md)併傳送必需的 beta 標頭。快取 id 按解析後的 Files 根地址與憑證限定作用域，因此等價的 `/v1` 與無版本根地址共用上傳。中繼資料不含過期時間，因此本地複用以原始上傳時間為界，不斷言遠端刪除。Files 解析失敗會按獨立內聯圖片預算重建完整請求；呼叫方取消會停止它。圖片策略在請求和 token 計量中保留 128 MiB 保留圖片預算、20 MiB 內聯 base64 預算及最舊字首省略。

成功 HTTP 回應之後的 JSON 語法錯誤不足以證明傳輸故障。Files 解碼複用已有的 `INVALID_RESPONSE` code 並補充操作上下文，不將其改標為 `TRANSPORT` 或新增重試；錯誤欄位由 [provider README](../../../../packages/llm/llm-deepseek/README.zh.md) 維護。

系統提示詞更新在端點與模型顯式宣告支援時，使用現有[路由能力](2026-09-02-in-history-system-prompt-replacement.zh.md)。Messages 保留初始頂層 system，在對應的使用者或工具結果輪次之後，將後續快照傳送為原生 system 輪次，保留此前傳送的字首。這個位置不同於迴圈先 system、後 user 的接納順序；序列化既不改寫持久化日誌，也不改變對話輪次的順序。未宣告能力的路由將最新快照歸併到頂層，直接壓縮呼叫也如此。僅憑協定或模型名稱推斷能力並不充分，因為支援情況和更新語義取決於實際部署的端點。

Web 顯示 DeepSeek，並提供端點與憑證引用。沒有端點覆蓋時，解析使用 `https://api.deepseek.com/anthropic`。覆蓋地址必須支援 Messages。介面卡遵循精確 `/v1` 根地址規則，不從其他類似版本的字尾推斷相容性。單一模型目錄公佈各條目宣告的能力。

介面卡在原生序列化後使用現有[請求擴充功能註冊表](../architecture/2026-08-21-deepseek-llm-api-request-extensions.zh.md)，並在 HTTP 2xx 後、讀取流之前接受已捕捉貢獻。工作階段日誌投遞和外掛清單仍由原有包負責，並留在模型輸入之外。輔助 [web 搜尋提供者](../../../../packages/web/web-search-deepseek/README.zh.md)保留獨立的端點、請求與設定。

## 考慮過的替代方案

**獨立的 Messages 提供者身份。** 這會重複憑證、目錄與設定卡，並迫使使用者在採用 Messages 時重新選擇模型。`deepseek-official` 身份使這些使用者選擇保持穩定。

**把新路由委託給 pi-ai 或 Anthropic SDK。** 兩者均提供持續維護的協定實作，但所需的直接介面卡需要 DeepSeek 專屬設定、附件策略、憑證解析和重試所有權。小型流轉換器配合持續維護的 SSE 解析器使這些職責保持明確；庫實作介面卡仍可獨立使用。

**持久化完整原生回應，或把思考壓平為文字。** 完整回應重複已記錄內容，並使截斷對齊複雜化。壓平會改變下一次模型輸入。最小化的對齊回放中繼資料可以保留缺失的協定資訊，無需新增 Session 格式。

**始終重寫頂層系統提示詞。** 這會丟棄支援該能力的路由上能夠保留快取的原生更新方式。顯式選擇能力既保留該方式，也為其他端點保留普通替換；將 system 指令轉成 user 文字還會失去其優先順序。

## 結果

該包負責協定驗證、停止原因對映、取消和錯誤分類，因此協定變化需要維護介面卡。使用者與工具結果輸入遵循[已儲存輸入相容規則](../bug-fix/2026-09-18-messages-input-history-compatibility.zh.md)；其他不支援的內容和不完整的流會明確報錯。現有重試消費者負責重試；現有裝配器在輸出達到上限時丟棄未完成的工具呼叫。Messages 服務共享 base、Web 和獨立的官方組合。顯式端點覆蓋必須支援 Messages。

驗證覆蓋協定夾具、真實 Loader 組合、逐檔案單元覆蓋率、[已記錄 Session 回放](../../../../snapshots/session/deepseek-messages-replay/snapshot.yml)與[未知回放版本](../../../../snapshots/session/deepseek-messages-degraded-replay/snapshot.yml)，Web Messages Session 回放，以及憑證控制的文字、思考、工具續接、圖片和取消請求。真實閘道檢查證明與已設定閘道的相容性，不能證明與所有 Anthropic 代理相容。
