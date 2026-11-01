---
description: "Target-neutral 對話裝配與瀏覽器 shell：事件和檢視註冊表、逐工作階段 binding、輸入狀態、slot 與臨時 composer takeover。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-conversation

[English](README.md) | 中文

## 概述

`ui-conversation` 擁有與 target 無關的 Conversation 組裝和共享瀏覽器 shell。它消費 Session Controller 的 `SessionEventLikeEntry` feed，透過 `ctx.uiConversation` 暴露不依賴 React 的註冊表與逐 Session binding，並透過 `ctx.uiSession` 提供 `useConversation`、`useInput` 和 `inputActions` 標準 props。它還擁有按工作階段的持久化圖片 URL 快取：`ctx.uiConversation.imageUrl(sessionId, attachment)` 為每個附件解析一個經工作階段授權的瀏覽器 URL，並隨 Session binding 釋放而撤銷，因此所有 Conversation target 共享一次 `session.attachment` 讀取。Chat 等具體 target 位於獨立包，由各自包註冊 Definition、快照 builder、View 和 renderer。

## 目錄

- [Conversation 組裝](#conversation-assembly)
- [Shell 與標準 props](#shell-and-standard-props)
- [臨時 composer entry](#temporary-composer-entries)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="conversation-assembly"></a>
## Conversation 組裝

`UiConversation.events` 是 event Definition 的唯一 registry，`UiConversation.views` 是 target snapshot builder 的唯一 registry。兩者都拒絕重複 key、保持註冊順序、返回冪等 disposer，並在 contribution roster 變化時重建現有 binding。`UiConversation.binding(bindingOrSessionId)` 為目前 Session Controller binding 返回 identity 穩定的 Conversation binding，不會另開事件源。 View Definition 可以宣告 `toolCallFocus`，將工具呼叫 id 轉換為自身的焦點標識。僅當此目標擁有可見的 View 條目時，Conversation 才提供 Inspect 回呼；Chat 直接使用回呼，不選擇目標。

`ConversationBinding.openTurn` 是物件標識穩定的只讀來源：最新輪次的開始事件已載入且尚未結束時提供其編號，否則為 `undefined`。觀察到的輪次變化同步釋出，即使沒有活動檢視也是如此。固定停止輸入同時讀取這個來源、工作階段執行狀態和待處理互動狀態。解除安裝工作階段繫結會解除其事件源訂閱。

介面卡把每個 `SessionEventLikeEntry` 直接交給 assembler。外層 `type` 區分持久事件與 Client-only transient event，內部 `event` 則統一公開 `type`、`seq`、`time` 與 `data`；Definition 接收這個內部 `SessionEventLike`。replacement window 可以包含兩種 entry，歷史 prepend 攜帶持久 entry，即時 append 則可以攜帶任一種。持久與瞬態事件使用同一組 match/start/update 介面。目前最早的 start 初始化 State；後續所有 Match，包括同一身份的其他 start，都用於更新。不消費 Assistant delta 的 Definition 對 `assistant/live-chunk` 返回 `null`。replace window 或 revision 斷檔從完整已載入視窗重建；連續 revision 的 append、prepend 與 Assistant settlement 使用增量組裝。settlement 只刪除具名 attempt 的 transient match，應用可選持久 entry，並從剩餘最早的 start 重算受影響的 Context，重新整理前序索引及 dependent，不替換無關 target node。沒有剩餘 start 的 Context 不保留 State，但其 key 和已釋出節點仍保留，供後續證據複用，直到完整視窗重建；所屬 Definition 可以隱藏這些節點。assembler 擁有 Context 匹配、Turn/Step location、target node 物化、target activity 和穩定 target source。`ConversationSnapshot` 只包含與 target 無關的 View 與 active-target 事實；Session lifecycle 狀態仍屬於 `SessionSnapshot`。

shell 選擇解析出 target 或 target source 收到首個 subscriber 時，該 target 進入 active 狀態。assembler 從目前 Context 對它執行一次 replace，並使它參與後續增量 flush；建立 source 不會啟用 target，取消訂閱也不會停用 target。

`UiConversation.groups` 為每個已註冊目標註冊一個可選的業務 Group Definition。它在節點物化後消費投影后的節點變化、變化輪次及已索引的目標位置，覆蓋首次啟用，並擁有全部分段規則與組資料。按索引讀取 Turn 時保留相鄰 Node 造成的分隔，使業務更新可以限制在受影響輪次和組內。assembler 先驗證並安裝根引用和按鍵索引的組快照，再發布 Node、Group 和 Location 資料來源。未分組目標保持原有路徑。[分組](../../../docs/subsystems/conversation.zh.md#group-definitions)定義輸入有效期、型別化註冊、原子更新及渲染器職責。

Group 註冊時缺少 View 目標會報錯。已註冊的 View Definition 被移除後，其分組計算暫停並清空已釋出結果，但保留 Group Definition；重新註冊該 View 後，沿現有替換流程從目前已載入時間線重建。切換 View 頁籤不會移除 View Definition。

target package 透過 declaration merge 擴充功能 snapshot 與 Location data map，再呼叫 `ctx.uiConversation.events.register(...)` 和 `ctx.uiConversation.views.register(...)`。target 透過 `ctx.uiConversation.binding(binding).target(targetId)` 讀取其 Session-owned source。註冊屬於 Cordis effect，返回的 disposer 從同一個 registry 移除 contribution。共享的請求檢查服務於每個 target：`ctx.uiConversation.inspectSystemPrompt(previous, event)` 將系統訊息與位置替換解釋為不可變的已載入 surface 狀態。它按 surface 順序選擇最後一個非空的存活系統節點，為連續重寫只保留存活的替換位置；遇到未建立索引的更早端點後，提示詞保持不可用，直到向前補頁回放提供其順序。target 自有的 Definition 獨立保留歷史卡片。`ctx.uiConversation.inspectRequestPrompt(previous, header, system)` 根據該有效提示詞分類請求變更；普通訊息與流式分片無需處理系統狀態。

<a id="shell-and-standard-props"></a>
## Shell 與標準 props

共享圖片插槽屬性將展示選擇與持久化引用分開：`thumbnail` 請求完整縮放的附件列表縮圖，`compact` 請求裁剪的圖片方塊。每張圖片可透過可選的 `label` 提供無障礙展示名稱；載入和快取標識仍使用原始附件引用。[ui-attachment](../ui-attachment/README.zh.md) 負責渲染與燈箱。

控制元件組的尺寸、內容、可見性或字型載入狀態變化後，composer 測量展開狀態下的控制元件組。若無法排在同一行，控制欄為模型位設定 `--dsh-composer-model-text-display: none` 和 `--dsh-composer-model-icon-display: block`；兩者預設值分別為 `block` 和 `none`。若連圖示也放不下，仍允許換行。

上下文佔用按鈕在輸入卡片下方、工作階段統計右側顯示圓環和百分比。點選按鈕可在視口內的面板檢視 token 構成，沒有統計項時面板也不會越界；上下文用量和容量尚不可用時，按鈕保持隱藏。

關閉程式碼工作工具時，外殼僅隱藏 Trajectory；其他外掛貢獻的 View 仍然可用。可用 View 少於兩個時隱藏 View 標籤欄。在 Trajectory 啟用時關閉程式碼工作工具會返回 Chat；已儲存的 View 偏好和 Session 記錄保持不變。開啟後，Trajectory 恢復可用。View 所有者接收可用列表，使導航操作跟隨相同的可見性。

輸入框註冊「檔案」命令動作，負責其標題、可用性和原生檔案選擇器回呼。選單可用性與實際呼叫都讀取已掛載輸入框目前的附件接收策略。輸入框解除安裝或鎖定後該動作不可用，外掛 dispose（資源釋放）時移除註冊。回呼繫結留在輸入模組內部。

`SessionInputShell` 透過私有 [DraftEditorRuntime](src/client/input/editor/runtime.ts) 為每個 Session 持有一個 Lexical editor，同時保留提交、附件選擇和恢復決策。[DraftEditor](src/client/input/editor/DraftEditor.tsx) 呈現借用的 editor；InputBar 保留掛鉤與 refs，並透過 [view-binding](src/client/input/editor/view-binding.ts) 安裝 DOM 行為。編輯器型別位於 [draft-editor.ts](src/client/contract/draft-editor.ts)，共享輸入和提交型別位於 [input.ts](src/client/contract/input.ts)。編輯器後臺更新會保留草稿選區，不修改文件選區或從其他控制元件奪回焦點；顯式聚焦 Composer 時恢復其選區。這一拆分不支援同一 Session 同時掛載多個可編輯 root；[兩階段隔離提案](../../../.agents/notes/proposed/architecture/2026-09-14-composer-model-and-draft-editor.zh.md) 定義剩餘工作。

已認領的命令在僅刪除參數和末尾分隔空格時保留身份與高亮，改動命令名才會釋放認領。所有命令和語言使用相同規則，包括 `/goal`、`/目標`、`/plan` 和 `/計劃`。輸入法組合輸入期間，命令提示和普通佔位文字持續隱藏，直到編輯器提交最終文字且對應輸入為空時才重新顯示。

工作區選擇使用 `uiWorkspace.openWorkspace` 準備目標並提交導航。草稿文字和附件僅在該請求仍為目前請求時，透過它的同步準備回呼搬移；後續導航或所有者釋放會保留原草稿。

本包占據 root 作用域 `main` 中的 `conversation` key。其 `main.conversation` 外殼將常駐的 `conversation.header` 放在可選 Session 的 `conversation.content` Component Factory 外。未選中 Session 時，頭部仍承載根作用域導航；標題、操作和 View 標籤保留在嚴格 Session 子元件中。Factory 擁有共享正文與 Composer，透過其標準 Hook 讀取目前 Session，並公開 strict-Session `views` 與 root-scoped `widthControls` 兩個區域性位置。預設 adapter 渲染現有 `conversation.session` entry，主 occurrence 選擇寬度拖拽條；嵌入式 occurrence 可以替換 `views`、省略拖拽條，且不渲染主 Header。共享正文與 Composer 註冊 queue dock 和 Todo dock。Todo dock 在 composer 上方使用共享面板 elevation；其中的行分別以共享 idle、ongoing 與 done 標記表示待處理、進行中與已完成。`ctx.uiSession.provide()` 從同一個 Session binding 物化 Conversation 與 input source，並將 `inputActions` 作為穩定標準 prop 提供。

blank Session 保留 header 的 leading 與 corner 控制元件，包括右側欄展開入口，同時隱藏標題、actions、utilities 和 View tabs。選擇 Workspace 會建立這些控制元件所需的 Session，無需先傳送訊息。沒有選中 Session 時，strict header 不掛載；常駐 header 在 macOS 桌面保留 40px 的視窗頂條，由它自己作為拖拽行持有，在 Web、Windows 或 Linux 上不預留空白高度。側欄各入口仍遵循自身的資料與執行環境要求。 已開始的 Session 在可用 View 少於兩個時使用單行標題欄，僅在渲染標籤行時保留其高度。

View 選擇規則固定：有效且已註冊的持久化選擇優先，其次是已註冊的 `chat`，否則不渲染 View；絕不選擇第一個已註冊 View。Shell phase 只組合 Session lifecycle 與 active-target set，不讀取任何 target-specific 快照。

Session 首次繫結或快取的 Session 成為 current 時，shell 會在渲染前讀取持久化 View 偏好，啟用已註冊的偏好 View 或 Chat fallback，並在後續 tab 或 focus 選擇寫入 store 前先啟用對應 target。blank Session 仍不渲染 `conversation.view` slot；未選中的 target 不會啟用。

主 occurrence 的活躍 transcript 只在未被內容覆蓋的兩側溝槽中提供正文寬度拖拽條；嵌入式 occurrence 省略這些拖拽條。View 如果繪製進溝槽，只將具體的可見元素提到拖拽條上方；透明的全寬包裝層保持在下方，不會佔用空白溝槽。該規則要求此元素與 Conversation body 之間不能引入中間堆疊上下文；瀏覽器情境固定了交付 Chromium 的行為。Chat 將該規則用於表格元素，其限定在閱讀列內的工具卡片無需提高層級。指標位於拖拽條上時，滾輪仍會滾動 transcript，Ctrl+滾輪則保留為瀏覽器縮放手勢。粘滯 composer 刻意擁有完整的底部區帶，該區域不是寬度調整目標；已捕捉的拖拽會將指示線提高到鬆開為止（[拖曳手柄樣式](src/client/skeleton/ConversationRoot.module.css)）。

寬度拖拽條的指示線只在已捕捉指標的拖拽期間跟隨指標，普通懸停不改變其位置。

常駐 composer 在無 Session 與有 Session 之間保持掛載。輸入空白字元會隱藏佔位提示；沒有附件的純空白草稿無法傳送。無 Session 時，同一個編輯器表面保持 inert，Workspace picker 連線 blank Session。該表面是 shell 所有的 Lexical 編輯器：引用 chip 是攜帶 owner 序列化身份的原子 decorator 節點（提交時經 owner codec 展開），已認領的 slash command 保持為帶樣式的行首文字，資料夾文字引用以圖示字首攜帶資料夾圖形，草稿的剪貼簿投影映像到逐 Session Conversation store。QueueDock 從 Session 的 `inbox` 投影讀取 `next-turn`，包含從冷狀態恢復的訊息，僅排除仍由本地 transcript 提交承接的 requestId。其他排隊行保留正常展示和操作。Queue 操作透過 scoped `ctx.conversation` service 定址準確的 queue occurrence；queue 預覽經 `ui-primitives` 的共享行內引用投影渲染已傳送文字（wire 工作階段形式摺疊為其標籤），並按原始附件順序展示本地或持久化的圖片和檔案。圖片使用縮圖，檔案使用緊湊的名稱與大小卡片。編輯態在可隨內容增高的 textarea 中展示字面傳送文字，因此重新編輯不會丟失換行；Enter 儲存，Shift+Enter 換行，Escape 取消。持久化縮圖透過工作階段圖片 URL 快取解析。繁忙時 Enter 行為儲存在 Host-backed `ui-conversation` settings namespace。 composer 鍵盤對映經斜槓流水線裁決觸發選單的按鍵——Tab 確認高亮補全項（可下鑽項則下鑽），Escape 與 Shift+Tab 離開選單且不選定——其餘按鍵交給編輯器自身。 接管鍵盤的浮層透過 `SessionInput.focus()` 把鍵盤還回來，該路徑走 Lexical 自己的 focus，因此游標回到草稿原來的位置而不是開頭。

普通 Enter 使用已設定的投遞模式，嚴格的 Ctrl+Enter 或 Cmd+Enter 使用互補模式，Shift+Enter 插入換行。帶 Alt、AltGraph、同時帶 Ctrl 與 Cmd，或 Shift 與 Ctrl/Cmd 的 Enter 保持草稿和指令選單不變，並將 DOM 事件留給應用快捷鍵。Conversation 外掛註冊傳送、換行、互補投遞、命令選單和引用選單的固定條目，並在解除安裝前保留這些鍵位。

預設傳送採用樂觀提交：Enter 在同一事務裡清空草稿、occurrence 表和撤銷歷史，composer 保持 `plain`，傳送作為 detached attempt 執行，傳送期間可以繼續輸入和提交。`sendSession` 在序列化之前用投遞模式註冊 Session 提交回顯（`session.beginSubmission`），並在 `pendingSubmissions` 中保留圖片與檔案的選擇順序；Session 根據該模式與目前執行狀態推導位置，因此空閒傳送進入 transcript（文字記錄），繁忙時 Queue 進入 QueueDock，繁忙時 Steer 進入 pending-steering 區域。隨後讓出一幀，圖片經瀏覽器原生 `FileReader` data-URL 路徑編碼，檔案則引用已暫存憑證。命令提交也用同一憑證表示通用檔案，因此傳送 `/goal` 或 `/plan` 時不會再次讀取這些瀏覽器檔案。提示詞複用提交 `requestId`；Session 按同一 `rpcId` 關聯展示接管，並僅退休回顯一次。多個並行傳送失敗時，在使用者編輯還原內容之前按提交順序合併還原；命令提交保持凍結的 `submitting` 階段。Detached attempt 持有附件 id，直到 admission 完成或 Session scope 銷燬。回顯以 observed 退休時，durable 圖片快取立即公開每個預覽 URL，讀取 admitted 附件後用規範化 URL 替換預覽，並在各 URL 停止使用後撤銷，同時釋放檔案卡。選中的通用檔案進入同一個先進先出的後臺上傳佇列；`maxConcurrentFileUploads` 預設允許兩個 Worker transport 同時執行，Conversation 服務在切換 Session 時繼續持有排隊和執行中的傳輸操作及位元組進度，移除草稿會跳過排隊中的傳輸或中止正在執行的傳輸。瀏覽器 shell 暴露 `__DSH_HOST_PATHS__` 時（桌面應用），拖入或貼上的資料夾以及拖入、選擇或貼上的帶真實路徑的非圖片檔案會成為 `@路徑` chip；圖片仍然上傳。拖放和貼上透過瀏覽器 entry API 識別目錄；該 API 不可用或沒有返回 entry 時，貼上項沿用普通檔案處理。檔案選擇器不能選擇目錄。引用需要啟用 `ui-reference` 外掛，原路徑也必須仍可由模型的檔案工具讀取。工作區內的路徑使用相對形式，其他路徑保留絕對形式。整批檔案先驗證再插入，保留來源順序和已選中的文字，引用之間有空白分隔，含空格的路徑使用閉合引號。沒有該橋的瀏覽器會拒絕拖入或貼上的資料夾，桌面端無法取得資料夾路徑時單獨報錯。continuable 子代理停用附件入口，也不建立本地回顯，因為其 transport 不保留瀏覽器 request id。

排隊提交的本地回顯在停用的編輯、刪除、插話按鈕旁顯示“傳送中…”；摺疊後的佇列在標題欄保留髮送狀態。匹配的 Host 佇列行替換回顯後，各操作按原有的純文字內容和執行狀態要求啟用。僅收到提示詞確認不會啟用佇列操作。提交失敗會移除回顯並顯示錯誤；輸入框為空或仍保留上一次自動恢復的內容時，composer 恢復失敗草稿，保留使用者隨後輸入的文字。

Send 和 Stop 按鈕停用時不顯示提示氣泡，輪次結束後由 Stop 切換成停用 Send 的按鈕也遵循此規則。普通 composer 執行時，如果草稿為空或輸入不可用，主指標操作保持為 Stop。可提交的文字或附件會把同一位置切換為 Send；清空或成功提交草稿後恢復 Stop。繁忙態 Enter 設定為普通 Session 與可繼續 child 選擇 Queue 或 Steer 投遞，執行中的 Send 按鈕按 plain Enter 解析出的同一模式投遞；當它在普通訊息草稿上可用（沒有待上傳檔案）時，其標籤以該模式命名（排隊傳送或插話傳送），因此該設定同時約束 Enter 與按鈕，而 Cmd/Ctrl+Enter 仍使用另一模式；空閒工作階段、空草稿與 `/` 命令列保留普通的 Send 標籤（[決策](../../../.agents/notes/implemented/bug-fix/2026-09-04-busy-send-button-follows-enter-setting.zh.md)）。它們的 QueueDock 行共享 Edit、Remove 與 Steer，空草稿也共享 steer-all 組合鍵。One-shot child 繼續只讀。Plan Mode 與 active goal 不改變附件入口。可繼續 child 保留獨立的 Send 與 Stop 操作，但不提供「檔案」選單項、貼上或拖放入口；parent 離線時，Send 與 composer 手勢鎖定，但線上 inbox 的 QueueDock 控制仍可使用（[決策](../../../.agents/notes/archived/bug-fix/2026-08-20-running-draft-primary-send.md)、[inbox 控制](../../../.agents/notes/implemented/feature/2026-08-27-continuable-subagent-human-inbox-control.zh.md)）。

檔案標籤和可編輯的 skill 引用共用覆蓋整個引用的懸停背景，並跟隨輸入框的行高與文字基線。首次點選立即由已註冊的引用來源負責開啟預覽，包括雙擊序列的第一次點選。後續點選保留原生文字選擇行為；已有非摺疊選區時，指標點選不開啟預覽。預覽不改變草稿、剪貼簿文字或提交內容。

當工作階段被其他寫控制代碼佔用時，傳送失敗的 toast 提示使用者退出其他正在執行的 DSH 後重試。

在獲得焦點的 Chat 或 Composer 中連續獨立按下兩次 Esc，可停止目前執行輪次並保留排隊訊息。間隔由 shortcuts 外掛的 `stopSequenceMs` 設定決定，預設 500 ms。選單、審批、模態層、終端、內嵌網頁、輸入法、重複按鍵，以及輸入區域、Session 或輪次變化會清空序列。快捷鍵與 Stop 按鈕呼叫同一作用域取消操作。外掛將 Stop 註冊為 `input` 展示分組中的固定操作。該註冊使普通 Esc 不能分配給可編輯快捷鍵，併為 Stop 按鈕的懸停和鍵盤聚焦提示提供 `Esc Esc` 序列。

<a id="temporary-composer-entries"></a>
## 臨時 composer entry

`conversation.composer` 是通用 chain，其完整 owner currency 為：

```ts type-equiv
/** Owner values used to elect a composer takeover. */
interface ComposerChainProps {
  /** Current Session identity used by temporary business-owned entries. */
  sessionId: SessionId | undefined
  /** Current Session lifecycle state, absent without a selected Session. */
  session: SessionSnapshot | undefined
  /** Effective business-owned interaction awaiting the user in this Session. */
  pendingInteraction: SessionPendingInteraction | undefined
}
```

業務包僅可在一個 Remote waterfall request pending 期間安裝 entry：

```tsx
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChainSelect, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

interface Request {
  readonly sessionId: SessionId
}

type RequestComposerProps =
  PropsRuntime<'conversation.composer'> & { matched: Request }

const select: ChainSelect<ComposerChainProps, Request> = owner =>
  owner.sessionId === request.sessionId ? request : null

const dispose = ctx.slots.register(
  { name: 'conversation.composer', select },
  RequestComposer,
)

try {
  return await request.result
} finally {
  dispose()
}
```

selector 必須是 owner currency 的純函式。非 null 回傳值作為 `matched` 傳給元件；`PropsRuntime<'conversation.composer'>` 提供標準 Session 與 global props。Chain 順序仍按 `priority` 升序，再按註冊順序；首個返回非 null 的 selector 獲選。Shell 會在 takeover 下保持預設 composer 掛載。Request 狀態、listener、response encoding 和任何 request-specific child slot 都屬於業務 package，不進入 `SessionSnapshot`，也不由 core 包宣告。

`InputActions.captureInsertion()` 捕捉草稿選區與版本；`insertText(text, span)` 僅在版本未變且編輯器允許編輯時，插入一次可撤銷的純文字編輯。非同步消費者在插入被拒絕後負責保留結果，等待使用者操作。

`conversation.input.activity` 在模型選擇器與傳送按鈕之間承載一個控制元件。其 `onActiveChange` 回呼將控制元件展開至整條工具欄並隱藏普通輔助控制元件和上下文用量按鈕，同時保留編輯器與提交按鈕。關閉活動後恢復這些控制元件，上下文詳情保持關閉。首頁輸入框下方沒有內容時，該區域保持收起。佔用者在解除安裝時釋放展開狀態，並擁有活動專屬回饋。

<a id="model-experience"></a>
## 模型體驗

無，因為本包渲染瀏覽器狀態，並透過 Session Controller API 傳送使用者確認提交的輸入，而不建構模型請求。

#### KV Cache 影響

無；Conversation 組裝和瀏覽器輸入狀態不會改變提供者側的 prompt cache。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **只有已註冊 target 可以渲染**——除已註冊的 `chat` 偏好外，shell 刻意不提供隱式 fallback target。
- **Factory occurrence 繼承渲染位置的 Session**——`conversation.content` 不接受獨立定址的 Session；該能力需要單獨的 Session provider。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。Conversation Definition、target builder 與 View 已由其所屬註冊表和 Slot ledger 驗證。
