# Agent Note: 僅在 Host 驗證 Remote 輸入

Status: implemented

[English](2026-09-15-host-only-remote-input-validation.md) | 中文

## Problem

生成的 Client Remote 方法公開 TypeScript 簽名，並透過 Connection 把呼叫轉給 Host Gateway；Host Gateway 已經在 lookup 或業務呼叫前檢查精確參數欄位、執行每個嚴格輸入 codec，並驗證 JSON 資料。Client 再為每個參數執行對應 schema 會重複這次驗證，在 Client 中實例化原本惰性建立的 Zod schema，還會讓無效 JavaScript 呼叫根據哪一側先拒絕而走不同的失敗路徑。

Client 仍需要 descriptor 中繼資料來檢查位置參數數量、把值對映為具名 wire 欄位、繫結 scoped Context identity、省略顯式為 undefined 的可選值，以及合併取消訊號。這些操作都不需要執行執行時 schema。

## Decision

Client Remote 在掛載 contribution 時驗證 descriptor 完整性，隨後直接轉發帶型別的參數與繫結的 Context identity，不呼叫 invocation codec factory。位置參數數量錯誤與 Client Context binding 缺失仍在本地拒絕。成功的一元結果與流項同樣不經 Client 側型別解析直接傳遞。

Host Gateway 擁有執行時輸入驗證。它檢查精確具名欄位、執行嚴格參數與 identity codec、驗證 JSON 值，並在呼叫業務程式碼前完成 lookup。繞過生成 TypeScript API 的 JavaScript 呼叫方，其請求到達 Host 後會收到 Host 的 `gateway/input-invalid` 結果；無法進入載體的值則可能在序列化時失敗。

生成的 Remote contribution 繼續攜帶 codec 中繼資料，因為 Host 與 Client 產物仍共享 `InvocationDescriptor`，Client 掛載也仍要求每個 Client 供值欄位具備嚴格 codec。完整 Remote 架構見 [Typert 生成的 Remote 方法呼叫](../architecture/2026-08-02-typert-remote-method-calls.zh.md)；本決策只取代其中 Client 側執行呼叫 codec 的部分。

## Alternatives considered

- **同時保留 Client 與 Host 輸入解析。** 這樣能讓畸形 JavaScript 呼叫方更早收到本地錯誤，並在傳輸前剔除物件中的未宣告屬性；但即使 Host 必須獨立驗證，每次有效呼叫仍要重複實例化並執行 schema。
- **從 Remote Client 產物中移除 codec 中繼資料。** 這樣可以進一步縮小生成的 Client 程式碼，但會改變共享 descriptor 與 generator 協定。保留惰性 factory 能繼續檢查嚴格 contribution，同時不產生執行時 schema 建構成本。

## Consequences

正常 Client 呼叫不再分配 invocation schema，也不再重複執行 Zod parse。Host 驗證仍是 lookup 與業務執行前的權威檢查，Client 程式碼則保留參數數量、Context binding、取消與 contribution 生命週期故障。

畸形執行時值會比以前更晚失敗。未宣告的物件屬性可能在 Host codec 剔除它們之前經過可信載體，因此從不可信物件或含秘密物件派生請求的呼叫方必須建構已宣告 DTO，不能把 Client 解析當作脫敏步驟。Client 測試固定原樣轉發行為，Host 測試固定嚴格輸入與 JSON 輸入拒絕。
