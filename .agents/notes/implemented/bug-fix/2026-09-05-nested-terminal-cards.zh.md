# Agent Note: 巢狀 terminal 卡片

Status: implemented

[English](2026-09-05-nested-terminal-cards.md) | 中文

## 問題

經 `run_code` 分發的 shell 命令攜帶 terminal 卡片所需的參數與渲染輸出，但對所有帶有 `parentCallId` 的塊一律拒絕，會僅因呼叫巢狀而隱藏這類展示。該拒絕也影響執行中的命令提示行與選中子呼叫的 Details。

## 決策

`terminalCardModel` 對根呼叫與 PTC dispatch 呼叫應用相同的適用檢查，不因 `parentCallId` 拒絕呼叫。受支援的執行中與已完成的 `bash`、`pwsh` 和 `terminal_send` 呼叫使用現有 terminal 卡片。後臺呼叫、工具錯誤、格式錯誤的輸入、缺失的呼叫頭和不受支援的結果內容保留通用退回。持久 shell 在執行中仍可使用 terminal，完成後使用通用展示；非零程序退出仍是 terminal 結果資料，而非工具錯誤。

本文僅部分取代 [Client 派生工具展示](../architecture/2026-08-23-client-derived-tool-presentation.zh.md)中的 terminal 子呼叫卡片禁令。該文繼續負責 Client 展示所有權及 diff/read/search/web 子呼叫限制。無需更改 Host 展示轉換器、事件、schema、中繼資料、呼叫樹或模型上下文。[規範工具輸出](../architecture/2026-07-20-canonical-tool-output-contract.zh.md)與 [PTC 型別化回傳值](../feature/2026-07-20-ptc-typed-tool-returns.zh.md)中的中繼資料和執行期值決策保持不變；省略中繼資料不禁止 Client 派生 terminal 卡片。

以已識別的 spill 策略提示結尾的 shell 輸出使用通用展示：在 `BashRow` 中可展開，在 Details 中使用原始退回。提示可能位於退出標記之後或取代它，因此末尾缺少退出標記不能作為 terminal 成功狀態的依據。瀏覽器安全入口 `@deepseek-ai/dsh-spill-policy/notice` 負責文字約定：生產方呼叫 `formatSpillNotice(omitted, ref)`，Client 呼叫 `hasSpillNotice(text)`。兩者共用分隔符，省略資訊驗證複用 `describeOmitted`，不複製其文案。格式化函式逐位元組保留持久化拼寫；現有 Session 結果位元組保持不變，不更改 Session 格式，也不執行遷移。

## 考慮過的替代方案

**保留對巢狀呼叫的一律拒絕。** 不予採用，因為巢狀不會移除 terminal model 已消費的原始事實。這會隱藏可用的 shell 輸出，而同一呼叫位於根時卻可渲染為 terminal。

**啟用所有巢狀結構化卡片。** 不予採用，因為其他 card model 有獨立的中繼資料要求與子呼叫限制。本修復只改變 terminal 適用性。

**解析 spill 字尾附近的退出標記。** 不予採用，因為截斷可能移除真實狀態；保守的通用輸出避免從不完整結果猜測成功。

**維護獨立的 UI 通知正規表示式。** 不予採用，因為它複製生產方的文字約定，可能與持久化輸出偏離。共享的瀏覽器安全模組統一負責格式化與識別，無需在瀏覽器中載入 Host 外掛。

## 後果

行與 Details 對巢狀呼叫共享 terminal 派生，不增加第二個渲染器或展示提示欄位。通用退回與已完成持久 shell 的行為仍獨立於 terminal 卡片適用性。父子關係仍控制樹中的位置，而非 terminal 渲染。文字識別無法認證輸出來源：工具也能列印相同的提示。匹配結果只選擇保守的通用展示，不能證明 spill 來源或程序狀態。

## 驗證

[Terminal 卡片測試](../../../../packages/client/ui-tool/tests/terminal-card.client.spec.tsx)覆蓋根／子呼叫適用性、執行中與已完成的 Details 以及退回情況。[組裝後的 PTC dispatch 測試](../../../../packages/client/ui-tool/tests/chat-ptc-subcalls.client.spec.tsx)覆蓋經對話樹渲染的巢狀 terminal。[通知測試](../../../../packages/spill/spill-policy/tests/notice.spec.ts)使用獨立於格式化函式的字面量 fixture（測試前置資料）固定歷史拼寫。[spill-policy 到 UI 的測試](../../../../packages/client/ui-tool/tests/spill-policy-terminal.client.spec.ts)覆蓋真實的根呼叫與 PTC spill 生成、保持不變的完整文字和程式化值、位元組上限、僅含通知的輸出以及 terminal 退回。瀏覽器回放負責驗證可見的巢狀卡片變化；非 terminal 子呼叫行為不屬於本修復。
