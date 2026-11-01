# Agent Note: LLM 流的終止失敗

Status: implemented

[English](2026-07-29-terminal-llm-stream-failures.md) | 中文

本說明僅取代[有界 LLM（大語言模型）請求恢復](2026-06-21-bounded-llm-request-recovery.zh.md)與[呼叫後上下文溢位恢復](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.zh.md)中關於丟擲錯誤身份和呼叫區域性 sidecar 的機制。上述說明繼續規定結構化失敗事實、重試策略、持久嘗試與壓縮（compaction）恢復。

## Problem

介面卡失敗曾有兩種公共表示：選擇、分發、iterator 建構或迭代丟擲的異常，以及帶內的 `finish { kind: 'error' | 'aborted' }`。`LlmRuntime` 會在以流為鍵的 sidecar 中標記丟擲物件，使 agent loop（智慧代理迴圈）能將其與 middleware 和消費方失敗區分開。消費方仍需用 catch 包圍迭代、signal 檢查、分片日誌記錄和組裝；正確性因此取決於證明是哪條語句拋錯，並查詢附著於所返回的那個 iterable 的中繼資料。

重試策略也採用同樣的間接歸屬。儘管 `prepareCall()` 已捕捉服務註冊，策略仍要在分發後透過流 sidecar 查詢。因此，由包裝層提供服務的路由與由介面卡提供服務的路由共用一個不透明查詢 API，儘管兩者的權威不同。

## Decision

`LlmRuntime` 是一次介面卡嘗試的規範化邊界。它只捕捉最終介面卡選擇、同步分發、iterator 建構與 `next()` 失敗，將丟擲值轉換為不可變 `LlmFailure`，並行出一個終止 `finish`。呼叫方取消或 `ABORTED` 失敗選擇 aborted 結束原因；其他介面卡失敗選擇 error 結束原因。介面卡也可以直接發出任一終止原因。

介面卡所屬的 catch 會在每個分片被 yield 前結束。來自 `llm/stream` middleware、巢狀呼叫、介面卡清理、分片消費方、日誌記錄、signal 檢查與組裝的錯誤仍作為缺陷或生命週期失敗丟擲；它們絕不進入模型請求恢復。部分 delta 之後的傳輸失敗可能留下未關閉塊，因此流 invariant 只允許在終止 finish 的結束原因為 error 或 aborted 時存在未關閉塊。不會從這些不完整輸出組裝 assistant 訊息或工具呼叫。

`PreparedLlmCall` 公開隨其設定和註冊捕捉的不可變重試策略。一次性控制代碼複用與設定不匹配仍是同步的 `INVALID_PREPARED_CALL` 誤用錯誤。完全由 `llm/stream` middleware 提供服務的路由沒有準備完成的註冊，因此也沒有服務策略。

agent loop 只消費一種失敗表示。它不再使用分類 catch，而是直接迭代並記錄分片、檢查終止 finish，再把其中的失敗事實與準備完成的策略傳給 `agent/request-error`。公共的 `isLlmAdapterFailure`、`llmFailureOf` 和 `llmRetryPolicyOf` sidecar API 不再存在。

## Alternatives considered

**保留呼叫區域性錯誤標記。** 這會保留丟擲物件身份，但要求每個消費方用 catch 包圍一段包含自身易失敗工作的區域，並讓分類依賴 iterable 包裝層的身份。原始錯誤物件無法在恢復中發揮持久作用；規範化事實才是有用的邊界值。

**要求所有介面卡發出失敗分片，並禁止丟擲。** 庫 iterator、transport 與 JavaScript 分發仍可能拋錯。要求每個介面卡複製同一 catch 邊界會造成職責重複，也無法保護 `LlmRuntime` 的直接消費方免受不完整實作影響。

**在 agent loop 中捕捉所有迭代錯誤。** 如果不重新建立從流物件到建立該物件的介面卡呼叫的 sidecar 對映，loop 無法可靠區分提供者失敗與 middleware、工作階段追加、取消或組裝失敗。分類應由發起介面卡呼叫的位置負責。

**在流式輸出前返回 `Result`。** 流前結果無法表示部分輸出之後的傳輸失敗，除非增加第二套回應生命週期。現有終止分片已能表示早期和後期嘗試結果。

## Consequences

所有 `LlmRuntime.stream()` 消費方都透過一種帶型別的終止協定接收介面卡執行失敗，而程式設計與生命週期失敗保留普通異常語義。恢復放棄精確丟擲物件身份，只暴露與原物件分離的提供者無關事實。流服務承擔略多的介面卡處理工作，但消費方刪除了用於判斷哪個介面卡丟擲異常的 catch，也刪除了以流為鍵的中繼資料。準備完成的呼叫顯式攜帶策略，而完全由 middleware 提供服務的路由仍明確沒有策略。
