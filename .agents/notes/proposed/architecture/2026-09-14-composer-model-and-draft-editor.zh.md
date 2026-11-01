# Agent Note: Composer 與 DraftEditor 隔離的兩階段重構

Status: proposed

[English](2026-09-14-composer-model-and-draft-editor.md) | 中文

## 問題

同一個 Client 需要在不同檢視中編輯同一個 Session 的草稿和待傳送附件。Lexical 的一個 editor 只能繫結一個 DOM root；多個呈現位置需要多個編輯實例，但不能各自擁有互不相干的草稿和上傳任務，也不能讓 Session Controller 理解游標、輸入法或 DOM。

目前 [SessionInputShell](../../../../packages/client/ui-conversation/src/client/input/facade.ts) 同時包含 Lexical 操作、草稿投影、提交狀態機和失敗恢復。[InputBar](../../../../packages/client/ui-conversation/src/client/skeleton/InputBar.tsx) 同時包含編輯區呈現、DOM 繫結、附件入口和傳送控制元件。直接在這兩個檔案中實作多實例會讓程式碼提取與行為差異混在一起。

附件實體和上傳任務已經由 [ConversationController](../../../../packages/client/ui-conversation/src/client/service.ts) 集中管理，shell 只保留有序附件 IDs。skill（技能）選擇插入普通 `/name` 文字，高亮由詞表派生；檔案和 Session 的原子引用則使用帶來源身份的 chip。共享草稿不能只同步文字而丟失這些引用，也不需要複製附件實體。

本提案細化 [#3951](https://github.com/deepseek-ai/deepseek-harness/pull/3951) 的編輯器隔離，遵循 [Client Session 與 UI 所有權](../../implemented/architecture/2026-08-20-client-session-conversation-ownership.zh.md)。Session 活躍檢視、駐留狀態與回收策略獨立設計；[#4138](https://github.com/deepseek-ai/deepseek-harness/pull/4138) 僅作為 Host 生命週期參考。本提案不實作這些功能，也不重複 #3984 的 Conversation 元件拆分。

## 提案

採用兩個獨立 PR（Pull Request）。第一階段集中既有編輯實作，為行為改動準備明確位置；第二階段只修改行為。`DraftEditor` 專指草稿編輯區，Composer 指包含附件和傳送控制元件的完整編寫區域。保留 `input/`、`skeleton/`、`InputBar`、`InputHub` 和 `SessionInputShell`，不以改目錄或改名作為重構成果。

### 第一階段：五處機械職責提取

以下 ui-conversation 路徑相對 `packages/client/ui-conversation/src/client/`。每個新檔案必須承載目前已經執行的邏輯，不建立佔位介面或未來功能。

| 原位置 | 提取位置 | 後續行為修改的落點 |
|---|---|---|
| `input/facade.ts` 的 Lexical 建立、註冊、投影、節點操作和清理 | `input/editor/runtime.ts` | 單個 editor 的實作及其建立、繫結和釋放 |
| `skeleton/InputBar.tsx` 的文字區域 JSX | `input/editor/DraftEditor.tsx` | 單份編輯區的呈現，不包含附件欄和提交編排 |
| `InputBar.tsx` 的 focus、selection reveal、wheel、keymap、picker 繫結函式 | `input/editor/view-binding.ts` | 單個掛載檢視的 DOM 互動和編輯器繫結 |
| `contract/input.ts` 的範圍、引用、鍵盤介面型別 | `contract/draft-editor.ts` | 編輯器對外資料與操作型別；提交和共享狀態仍留原檔案 |
| `ui-attachment/src/client/ComposerAttachments.tsx` 的 document drop effect 實作 | `ui-attachment/src/client/drop-events.ts` | document 拖放監聽的註冊、路由和清理 |

`runtime.ts` 內部物件由現有 shell 建立並委託呼叫。它保管原 editor、NodeKey 對映、投影和 Lexical 註冊；不複製這些狀態，也不獨立決定能否編輯或提交。shell 繼續持有 SubmitMachine、draft revision、附件 IDs、通知、attempt、序列化以及成功/失敗恢復決策。

同時涉及判斷和節點操作的方法在原位置保留判斷。例如 beginCommand 的 span/phase 檢查、節點替換、machine dispatch 的順序不變；失敗恢復的批次排序、revision 保護、恢復標誌和 history 清理時點不變。editor 更新仍在原同步位置回呼 shell 釋出狀態，不增加 Promise、effect 或通知輪次。

`DraftEditor.tsx` 是無額外 DOM 包裝的呈現提取。所有既有 React 掛鉤、refs、依賴陣列和 effect 相對順序仍留在 InputBar；effect 只在原呼叫位置委託普通函式。CSS 檔案、class keys、React keys、placeholder 與 decorator 順序均不變。新元件不接管 editor 建立或持有另一份草稿。

`contract/draft-editor.ts` 移入 `TokenSpan`、`ReferenceInsert`、`ArbitrateKey`、`ArbitrateOutcome`、`ComposerKeyboard`、`EditSelection` 和 `Occurrence`。名稱和成員不變，所有消費方從實際宣告處匯入；既有公開出口保持原名稱和可見集合。`ComposerKeyboard` 仍暫時依賴共享 `InputState`，這不是獨立受控編輯協定。

#### 第一階段不變項

- InputHub 仍按 Session 建立一個 shell 和一個 editor，建立、複用、dispose（資源釋放）的時點及次數不變。
- 草稿真值仍在 Lexical，Undo/Redo、NodeKey 身份、span 檢查和 revision 規則不變；不增加第二份文件或儲存。
- `useInput`、`inputActions`、Slot、事件、inject 及公開 API 的名稱、載荷和行為不變；不改 Host 協定和持久化格式。
- 附件選擇、上傳時機、圖片預覽、提交批次、成功清空、失敗恢復及通知規則不變。
- document drop 仍在每個原元件的同一 effect 中註冊；單 picker、重複 drop、單 editor/root 的限制原樣保留。
- 測試只修改實際需要的型別匯入；不改測試檔名、斷言、錄製 Session 或預期輸出，不重新整理快照。
- 不搬已有檔案，不改已有私有名字，不改 CSS，不增包、依賴、renderer scope 或通用狀態框架。

#### 第一階段實際隔離程度

| 內容 | 完成後的狀態 |
|---|---|
| 編輯器實作 | 節點和投影操作歸 runtime，呈現歸 DraftEditor，DOM 繫結歸 view-binding |
| 提交與附件編排 | 仍由原 shell 和 ConversationController 管理，不落入 DraftEditor |
| 不同 Session 的狀態 | 繼續按原規則隔離 |
| 同 Session 的共享狀態 | 繼續複用原 shell；沒有雙份附件或上傳任務 |
| 同 Session 的獨立編輯實例 | 未實作，仍共享一個 Lexical editor |
| 獨立 selection、IME、Undo 和選單來源 | 未實作；程式碼位置分開不代表執行時歸屬已改變 |
| picker、focus、document drop 的多檢視路由 | 未實作；繫結程式碼已有單獨修改位置 |

### 第二階段：只調整行為

第二階段直接在上述位置實作共享草稿和多編輯實例。禁止移動已有檔案或目錄、純改名、純提取 helper/class/component、重排已有測試，以及格式或註解清理。新增行為需要的新型別、實作和測試可以增加，但不得複製舊程式碼到新檔案後刪除原文來規避約束。

如果行為實作仍需要結構準備，必須先補第一階段：未合入時修改第一階段 PR；已合入時單獨增加機械前置 PR。行為 PR 以該機械結果為 base，不能夾帶機械準備。

#### 最終狀態歸屬

共享 Composer 模型是現有 SessionInputShell 的職責演進，不要求再次改名。Session Controller 繼續只管理工作階段業務，不 import DraftEditor、Lexical 或共享草稿文件。

| 狀態 | 最終 owner | 多檢視要求 |
|---|---|---|
| 草稿正文、語義引用、內容 revision | Session 關聯的共享 Composer 模型 | 任一處編輯後，透過同一個回應式來源釋出給所有檢視 |
| 有序附件 IDs、認領、提交 attempt 和失敗恢復 | 共享 Composer 模型 | 每個提交只結算一次，任一檢視的操作作用於同一批輸入 |
| File、Blob URL、上傳任務、進度和憑證 | 既有附件管理 owner | 不隨檢視複製；解除安裝一個檢視不取消其他檢視所用資源 |
| Lexical、DOM、NodeKey 對映、selection、IME preedit | 各 DraftEditor 實例 | 兩個獨立 editor/root；解除安裝一處不解綁另一處 |
| 選單錨點、檔案對話方塊和焦點 | 發起操作的檢視 | 按操作來源路由，不以 Session 唯一 picker 代替來源 |
| Session 歷史、running、queue | Session Controller | 繼續讀取現有來源，不複製進草稿模型 |

React 掛鉤仍由 renderer 從裸 observable 繫結，業務元件透過現有標準 props 讀寫。共享模型不接收 DOM、Lexical NodeKey 或輸入法中間態；DraftEditor 不接收 Session/Context 或上傳服務，只接收草稿資料、顯示資料與編輯/意圖回呼。

#### 共享內容和同步要求

草稿內容必須能獨立於 Lexical 表示普通文字、換行和帶完整 `ReferenceInsert` 資訊的原子引用。引用的共享身份不能依賴某個 editor 的 NodeKey；各實例私有對映到自己的節點。skill 保持普通 `/name` 文字，兩處從同一文字和詞表派生高亮，不引入額外的已選 skill 列表或改變 Host 識別規則。

草稿文字量小，可以使用完整語義文件同步，不要求協同編輯演算法。共享模型負責接受編輯、分配 revision 和釋出，編輯器區分本地產生的變化與外部呈現，避免回聲迴圈。舊 revision、舊模型生命週期和已解除安裝檢視的回呼不能覆蓋新內容。提交凍結、成功清空、失敗恢復和附件變化必須透過同一共享來源到達所有檢視。

IME preedit 屬於本地實例，遠端檢視更新不能直接破壞正在組合的文字。來自另一檢視的修改、傳送清空和模型釋放如何與組合態相遇，必須在第二階段定義並驗證。Undo/Redo 也必須作用於同一份邏輯草稿，不能讓兩份 Lexical history 互相恢復陳舊整篇文件；具體同步與歷史實作不屬於機械階段。

程式化插入、選單選擇、檔案選擇器和焦點恢復要攜帶發起檢視的臨時身份。檢視關閉後不能把遲到的 UI 操作轉發給另一個同 Session 檢視。document drop 必須明確一次拖放選哪個目標並保證僅處理一次；來源路由和去重均是第二階段行為。

重新整理後的既有文字草稿恢復應保留，但不預設新增結構化引用、File 或跨瀏覽器協作的持久化承諾。Session 活躍檢視及 LRU/時限策略不與這份編輯協定繫結。

## 考慮過的替代方案

**僅把 input 改名或平移到 composer。** 不能分離 Lexical 操作、檢視繫結和提交決策，後續行為實作仍需從大檔案中提取舊程式碼，因此不作為第一階段成果。

**讓一個 Lexical editor 同時掛兩個 DOM root。** 與 Lexical 的單 root 模型衝突，不能用 React 複製呈現來獲得兩個可獨立互動的編輯器。

**每個 Composer 獨立草稿和附件。** 不滿足同一 Session 共享編輯的要求，還會引入附件和提交所有權分歧。

**機械階段直接實作共享 DraftDocument、Undo 或 drop 去重。** 改變真值、生命週期或事件處理次數，無法作為行為不變的前置改動審查。

## 驗收標準

第一階段必須完成五處提取及必要匯入、JSDoc 和 README 更新；逐項核對原方法體、分支、回呼次序、Hooks、DOM 和清理。現有編輯、引用、認領、附件、提交、失敗恢復和解除安裝測試繼續透過；用建置產物執行針對性瀏覽器迴歸，預期輸出不變。型別和文件檢查覆蓋移動後的宣告與雙語配對。不以新雙實例功能作為第一階段驗收條件。

第二階段必須用同一 Session 的兩個真實掛載 Composer 驗證雙向文字和 chip 同步、skill 高亮、共享附件和進度、傳送清空/失敗恢復、IME/Undo、來源路由，以及任一檢視解除安裝後另一處繼續工作。其差異必須僅包含行為實作及相應測試，不包含機械整理。

## 風險

無狀態 JSX 提取仍可能改變 ref 或 effect 時序；因此 Hook 和 ref 的主機保持不變，DOM 不增加包裝。Lexical 提取可能改變巢狀 update、projection 快取或 history 清理順序；因此保留原操作體並對照執行次序，而非重寫演算法。

第一階段仍不能同時掛載同 Session 的兩個編輯器，且保留原 picker/drop 限制。後續若誤把目錄隔離當成狀態隔離，會造成 root 相互解綁、重複附件接收或錯誤焦點路由；這些限制必須由第二階段的雙實例行為測試關閉。
