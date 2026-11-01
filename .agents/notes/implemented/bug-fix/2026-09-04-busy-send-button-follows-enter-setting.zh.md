# Agent Note: 繁忙態 Send 按鈕跟隨 Enter 設定

Status: implemented

[English](2026-09-04-busy-send-button-follows-enter-setting.md) | 中文

## 問題

Web composer 為 agent（智慧代理）執行期間的提交只提供一個面向使用者的選擇：`ui-conversation.busyEnter` 設定在 Queue 與 Steer 之間選擇。[執行中草稿取得主 Send 操作](../../archived/bug-fix/2026-08-20-running-draft-primary-send.md)（已歸檔）為執行中的草稿提供了指標 Send 按鈕，有意讓它不跟隨該偏好，以避免一個只標註為 Send 的按鈕攜帶不可見模式，並把每次點選都路由到公共的 `InputActions.submit()` 介面，而 `SessionInputShell.actions` 把該介面固定為 `'queue'`。使用者在設定中選擇 Steer 後，Enter 得到 Steer，同一草稿旁的按鈕卻得到 Queue，且按鈕只標註為"傳送訊息"。composer 中沒有任何內容解釋這一分歧，設定行的標題和描述也只提到 Enter 鍵，因此該設定看起來像是失效，而不是有意只覆蓋一部分。

## 決策

執行中的 Send 按鈕按與 plain Enter 相同的模式投遞。`InputBar` 每次渲染計算一次 `resolveSubmitMode(busyEnter, running, 'enter', steeringAvailable)`，其中 `steeringAvailable` 與鍵盤路徑使用同一個"普通 Session 或可繼續 child"判定；用它透過 `ComposerKeyboard.submit(mode)` 執行主按鈕點選，並且僅在點選會投遞一條普通訊息時用它決定主按鈕標籤：composer 執行中且可 steering、按鈕可用（沒有仍在上傳的檔案）、草稿非空、未被認領且不是將進入命令 adjudication 的 `/` 行。該狀態把 `input.send.queue`（"Queue message" / "排隊傳送"）或 `input.send.steer`（"Steer message" / "插話傳送"）同時用作 tooltip 與可存取名稱；該位置仍為 Send 按鈕的其餘所有狀態——空閒工作階段、one-shot child、鎖定的 composer、可繼續 child 的空草稿、帶待上傳附件的草稿，以及點選會執行命令而非投遞訊息的命令草稿——保留 `input.send`（"Send message"）；普通執行中工作階段在空草稿或 owner block 時該位置顯示的是 Stop。Cmd/Ctrl+Enter 仍解析為相反模式，空草稿下的加速手勢仍對整個佇列執行 steering（中途引導）。[可繼續 subagent 中斷 Agent Note](../feature/2026-08-06-continuable-subagent-interrupt.zh.md)以此投遞方式描述 child 的 Send。

composer bar 的 inject 介面攜帶即時偏好，而不是解析閉包。`ComposerBarInjected.hooks.busyEnter` 釋出 `ComposerSubmissionPolicy.busyEnter`，因此 bar 獲得 `useBusyEnter` 選擇器 hook，並在設定行或 Host 設定更新改變該值時重新渲染標籤。`resolveSubmitMode` 是 `submission-policy.ts` 中匯出的純函式，顯式接收偏好值；policy 類只保留 store 及其 Host 採納與寫回。

設定行重新命名以覆蓋兩種輸入："Send behavior while busy" / "繁忙時的傳送行為"，描述為 agent 執行時 Enter 與 Send 按鈕的行為，並保留 Cmd/Ctrl+Enter 使用相反模式的說明。`busyEnter` 欄位名、其 `queue` 預設值和 Host schema 均未改變，因此現有 `settings.yaml` 文件保持原有含義。

## 驗證

`input-bar.client.spec.tsx` 斷言執行中草稿的按鈕在兩種偏好下都按模式標註並以該模式提交，切換偏好 store 會在下一次點選前重新標註已掛載的按鈕，空閒 Send 無論偏好如何都保留普通標籤與 Queue 投遞，可繼續 subagent 的 Send 與普通 Session 遵循同一模式與標籤，而其空草稿下的停用按鈕與 one-shot child 保留普通 Send，執行中的 `/` 行、已認領命令與帶仍在上傳檔案的草稿也保留普通 Send。`submission-policy.client.spec.ts` 釘住 `resolveSubmitMode` 在偏好、執行狀態、手勢與 steering 可用性所有組合下的結果。`enter-behavior-row.client.spec.tsx` 與 `settings-chrome` ARIA golden 攜帶新的設定文案。無金鑰的 `live-interactions` Web 情境在停住的執行中草稿上等待"Queue message"，並斷言此刻不存在"Send message"按鈕，其 `running-draft.expected.md` golden 記錄了新名稱。

## 備選方案

**保持按鈕使用 Queue，只改寫設定行文案。** 這保留了先前決策，但讓同一設定下的同一草稿擁有兩條提交路徑。偏好 Steer 的使用者仍無法透過指標得到它，而改寫後的設定行必須記錄一種其他 composer 控制元件都不具備的僅鍵盤生效範圍。

**增加第二個執行中按鈕，每種模式一個。** 兩種投遞模式都可以透過指標到達且沒有隱藏狀態，但普通工作階段只有一個主操作位置，且已在 Stop 與 Send 之間交替；永久增加第二個控制元件會佔用空間，並引入草稿本身不需要的層級。單一設定已經表達了使用者預設值，Cmd/Ctrl+Enter 仍是逐條訊息的覆蓋手段。

**透過 `InputActions.submit(mode)` 傳遞模式。** 拓寬公共 provide 通道介面會讓任何 session 作用域的 slot 都能選擇投遞模式，而沒有其他消費者需要它，並且會把 composer 的呈現決策推入機器的公共契約。包內私有的 `ComposerKeyboard.submit(mode)` 正是為此存在，因此按鈕直接使用它。

**在 inject 介面上保留 `resolveSubmitMode` 閉包，僅為標籤另加一個 `busyEnter` hook。** 同一事實有兩個來源，會讓標籤所說與點選所做之間產生偏差。只發布一次偏好並在 bar 中解析，可以讓標籤與投遞在同一次渲染中源自同一個值。

## 影響

該設定約束使用者能以訊息觸發的每一種繁忙態提交，且按鈕會宣告它執行哪種投遞，因此選擇 Steer 後不再會從草稿旁的按鈕產生 Queue 行。此前在設定為 Steer 時依賴按鈕作為始終 Queue 逃生口的使用者，現在改用 Cmd/Ctrl+Enter。執行中的 Send 標籤對每位使用者都會變化，包括預設的 Queue 偏好下，執行中點選 Send 的 Web e2e 情境已相應處理；空閒工作階段流程和 one-shot subagent composer 沒有變化。已歸檔的執行中草稿 Agent Note 中"指標操作忽略偏好"的條款在此被反轉；其主操作位置、owner block 與 subagent 控制元件決策按已交付狀態繼續有效，並由 `ui-conversation` README 描述。
