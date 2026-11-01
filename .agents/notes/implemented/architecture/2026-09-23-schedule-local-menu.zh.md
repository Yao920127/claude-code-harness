# Agent Note: Schedule 詳情選單由 Schedule 用戶端自己擁有

Status: implemented

[English](2026-09-23-schedule-local-menu.md) | 中文

## Problem

Automation tasks 詳情需要一個列表頂部釘住控制元件的選單：Time zone 行的搜尋框必須停在滾動時區行之上。`@deepseek-ai/dsh-client-ui-primitives` 裡的共享 `Menu` 會渲染行、分隔線、標題行、選中標記和鍵盤走位，但沒有 header 槽。Delivery records 頁把一條已儲存記錄的 message id 放在 info 圖示背後，讀者要能讀到並複製這個 id。

用擴充功能 `ui-primitives` 來滿足其中任一需求，都會把單個功能的行為放進每個 client 外掛都消費的包裡。同一條分支此前已經因為 review 質詢“Schedule 的改動為什麼碰它們”而撤掉了無關的 `ui-layout` 與 `ui-sidebar-right` 編輯；而一個只為單一呼叫方擴充功能的共享原語，對之後每一個讀它的人都是成本。

## Decision

`packages/client/ui-schedule` 自己擁有選單。`src/client/TaskMenu.tsx` 與 `TaskMenu.module.css` 儲存一份 schedule 本地副本，渲染行、分隔線、標題行、disabled 與 dangerous 行、`selectedId` 尾隨標記、指標與鍵盤走位、portal 定位、釘住的 `header` 槽，以及 `data-menu-field` 焦點交接。它匯入共享的 `useAnchoredPosition` 與 `useDismissOnOutsidePointer` hook——任何錨定面板都需要的定位與關閉行為——不從 `ui-primitives` 匯入任何執行時值。詳情的四個選單都改用它。

Delivery records 頁用一個 info 按鈕給出並複製記錄的訊息 id。該按鈕的可存取名稱同時說明動作與記錄（`Copy message ID: <id>`），共享 `Tooltip` 在懸停與鍵盤聚焦時給出該 id，啟用時透過共享的 `writeClipboard` 複製，並在圖示旁用 status 區域報告 `Copied`。因此 `Tooltip` 保持 master 形態：那個讓氣泡在指標下保持展開的模式已不存在，Delivery records 頁也不使用只在指標下開啟的 `HoverCard`。

`packages/client/ui-primitives` 除時鐘圖示描邊外回到 master。`packages/client/tsdown.client.ts` 的 client bundle purity gate 是這條邊界另一方向上的相鄰規則：client 外掛只能以型別或 module-table request 的形式匯入另一個外掛的包，因此共享執行時詞彙要麼走 inline-safe 層，要麼走 cordis service，而不是包與包之間的邊。

## Alternatives considered

**給共享 `Menu` 加 `header` prop。** 這是分支最初的做法：一個可選槽加 `data-menu-field` 焦點交接，並在共享包裡帶測試。它的 diff 最小、只保留一份選單實作；被否決是因為唯一的呼叫方是 Schedule 詳情：`ui-primitives` 會背上只為單個功能存在的 API，而每個 client 外掛的 bundle 都要讀一份沒人使用的 header 契約。

**給共享 `Tooltip` 加 `interactive` 模式。** 先落實後撤除：錨點與氣泡之間的寬限期、指標停留、點選切換、可選中的文字，外加六個測試。被否決是因為共享 tooltip 本來就支援聚焦展開、共享剪貼簿助手本來就負責複製，這個模式只是為單一呼叫方多出了一種保持氣泡展開的方式。

**用 `HoverCard` 給出並複製訊息 id。** 第二個落實又被替換的版本：指標停在卡片上時保持展開、文字可選中、啟用即複製。被否決是因為 `HoverCard` 只在 `onPointerEnter` 開啟，於是那個本來就可聚焦的圖示對鍵盤讀者什麼都不顯示，也沒有複製入口。

**把時區搜尋框渲染在選單列表之外。** 放在觸發器上方的輸入框，或規則卡里的獨立一行，都不需要改原語。被否決是因為該輸入框會與它所過濾的列表分離滾動，或落在與它過濾的行不同的介面層上。

**用 schedule 本地的 `PickerPopover` 實作時區選擇器。** Date 與 Time picker 已經用它。被否決是因為 `PickerPopover` 只負責定位與關閉面板，不渲染列表語義：鍵盤走位、行 role、選中行標記都要在 Schedule 用戶端裡重建，那正是本 note 描述的副本，而且比它所替代的選單要維護更多東西。

## Consequences

Schedule 用戶端多出一份選單實作：346 行元件、189 行 CSS、403 行測試，換來 `ui-primitives` 除時鐘圖示描邊外回到 master。副本按詳情實際使用裁剪，缺失的能力保持缺失：submenu、元件渲染行、釘住的 footer、多個 selectedId、fill 選中模式、dense 與 compact 間距、掛載時 autofocus、呼叫方提供錨點矩形、指標離開即關閉，以及 side 參數。日後某個 Schedule 選單需要其中一項時，要麼擴充功能副本，要麼重新審視這個決定。

複製是一次啟用，而不是選中文字：tooltip 給出 id 但不接受指標，所以桌面端複製該 id 的手勢是點選圖示；這正是被撤掉的互動模式所具備、而目前形態放棄的能力。共享行為仍是共享的：定位、關閉、焦點交接、點名兩個 owner 的 duplication gate 排除標記，以及 per-file 覆蓋率都適用於這份副本。被複製的區域帶 `jscpd:ignore-start` 與 `jscpd:ignore-end` 並點名兩個 owner，遵循 [cross-package value dependencies note](../../archived/process/2026-08-23-client-cross-package-value-dependencies.md)；schedule 專有的 header、交接與 Tab 語義不在該區域內。

副本用 `useAnchoredPosition` 定位列表，它對四條邊都用同一個 12px margin，而共享選單的頂邊用的是 frame-top clearance helper。因此在 macOS 視窗頂部需要向上鉗制的列表，可能比共享選單原先的位置低約 12px；樣式表仍為該列表自身的最大高度保留 clearance，常見情形不變。

## Testing

`packages/client/ui-schedule/tests/task-menu.client.spec.tsx` 釘住指標與鍵盤走位、`header` 輸入框對 Home/End 的獨佔、落位後的 `data-menu-field` 交接、選中行標記、disabled 行、portal 定位、外部關閉與焦點回返；原先位於 `ui-primitives` 的三個選單 header 測試隨該能力一起遷入。`delivery-history.client.spec.tsx` 釘住鍵盤聚焦展開的工具提示、按鈕的可存取名稱、剪貼簿寫入，以及會自行清除的複製確認。覆蓋率門禁對 `packages/client/ui-schedule/src` 報告 per-file 100%，duplication 門禁在 `packages/client/ui-schedule` 與 `packages/client/ui-primitives` 上報告 0 克隆。
