# Agent Note: Session 行 action 即 slot 列表

Status: implemented

[English](2026-09-17-session-row-menu-actions-slot.md) | 中文

## 問題

Session 行的 "..." 選單和行尾懸停按鈕原本是 `ui-workspace` 持有的封閉列表：browser 按行狀態拼選單 `items`、自己渲染置頂和歸檔按鈕、把每個動作的回呼一路傳下去，連這些動作需要的 toast 和重新命名對話方塊也由它持有。用戶端外掛可以自己新增側邊欄控制元件，卻無法在不修改 owner 包或複製選單互動的情況下把 action 放到內建項旁邊。

## 決策

`ui-workspace` 在其 `sidebar.workspaces` 註冊項下宣告兩個 root-scoped `list` slot——選單行用 `sidebar.workspaces.session.menu.item`，懸停按鈕用 `sidebar.workspaces.session.row.action`——並在 `apply` 裡以用戶端外掛的同一方式註冊自己的 action：`pin`（選單 100、按鈕 200）、`rename`（200）、`fork`（300）、`archive`（選單 400、按鈕 100）。列表就是選單和按鈕條：條目按 `order` 升序渲染，外掛 action 落在其 order 所指的位置，以另一個 `priority` 複用內建 id 則按註冊表的普通 cell 規則遮蔽。沒有單獨的"擴充功能分組"：owner 不畫分隔線，分組起點是條目自己的 `separatorBefore`。

條目只接收行身份 `{ sessionId, displayTitle }`，其餘一切自己負責。它用自己 face 注入的 hook 讀自己關心的 Host 狀態（`usePinned` 與 `useArchived`，每次 Workspace 快照只派生一次的 Set），並據此決定是否顯示：Host 規定兩個集合互斥，所以 pin 在歸檔行上不渲染；archive 從不參考 pin。整套行為放在註冊項自己的 `inject` face 裡，元件只調一個回呼：`pinSession` 委託給 `uiWorkspace.pinSession`——先做 Host 置頂，成功後用 `pinSessionOrder` 把工作階段推到其記帳儲存順序的最前，成員關係在完成時刻從物件層快照讀取（`pin-order.ts`）——和這個服務原本就持有的 `archiveSession` 並列；歸檔 action 的回呼在此之上加上提示。服務經 apply 自己建立、並作為 handle 交給 browser 註冊項的那個 viewing store 實例寫入檢視順序，與 `ui-layout` 處理 layout store 的方式相同。置頂與歸檔集合以 Set 形式經 face 的 `hooks` 到達條目，每次 Workspace 快照變化只重建一次，行讀自己那一位只需一次查詢。

action 發起的浮層必須活得比行選單久，所以它們是本包註冊在 `shell.overlay` 的條目：重新命名對話方塊和行 action 提示。action 經本外掛 apply 閉包裡的觀察源到達自己的浮層：action 一側注入為回呼（`requestSessionRename`、`notify`），浮層一側注入為 `hooks` 源（`useRenameRequest`、`useToast`）。browser 在標題雙擊時發出同一個重新命名請求，在點選歸檔行時發出同一種提示；歸檔提示的第二個動作經同一個 store 實例把歸檔篩選切到"顯示"，因為 browser 的檢視選項選單已不在鏈結上。

本包自己的選單條目渲染 `MenuItemButton`——`ui-primitives` 為"行是元件"的選單提供的行元件，只是一行普通 markup 與樣式。任何 `role="menuitem"` 的按鈕都能加入選單的鍵盤走位、子選單互斥與焦點歸還，因為 `Menu` 從 DOM 上統一決定這三件事（方向鍵走位查詢行元素；子選單收起與選中後的焦點歸還都在列表自己的冒泡上執行，資料行與元件行一視同仁）——無法 import 該 primitive 的 `cordis-client-runner` 閉包直接渲染這樣一個按鈕。兩類行的關閉都是 owner 的狀態：資料行透過 owner 的 `onSelect`，元件行透過 slot 級 `useMenuOpenState` hook——宣告帶 `inject: { hooks: { menuOpenState } }`，`SessionNodeItem` 把自己的 `[open, setOpen]` 作為該次渲染的 `hookContext` 傳入，factory 把這一對原樣交回。這正是 `sidebar.right.pane.tab` 用於 `useTabInfo` 的通道。

## 考慮過的替代方案

**在 `Menu` 與行元件之間放一個 React context。** 否決：業務元件不接觸任何 React context（[client 規則](../../../../packages/client/AGENTS.md)）；Menu 與行是經 slot 系統建立的父子關係，控制權就該走 slot 的通道。

**由 owner 提供行能力。** 把 `pinned`/`archived` 和 `pin`/`archive`/`rename`/`fork` 回呼經 owner props 或 slot 級 hook 交給條目，會讓 browser 繼續擁有每個動作，內建 action 淪為薄封裝。否決：這些不是選單的能力，每個 action 的行為屬於它自己，需要的 Host 狀態條目可以直接讀。

**在內建行下方追加一個專用 slot。** 否決：它把內建行變成外掛只能跟在後面的特權分組，還要在 primitive 裡為本來只是一個有序列表的東西開第二條渲染路徑。

**讓條目自己算置頂順序寫入。** pin 條目為了拼 `pinSessionOrder` 的輸入訂閱整個 Session 列表和 Workspace 快照，列表一變所有可見行都重渲染，排序細節還進了選單行。否決：寫入歸注入的回呼，在完成時刻讀一次快照。

**用宣告式共享 store 傳重新命名請求與提示。** 請求與提示是本外掛自己的瞬時事實，所以經條目自己的 inject face 以 apply 閉包觀察源傳遞。

## 後果

外掛無需修改 `ui-workspace` 即可在選單和懸停條裡新增、重排或遮蔽 Session 行 action，內建 action 遵循相同規則、走相同註冊路徑。`WorkspaceBrowser` 不再傳遞 action 回呼、渲染 toast 或承載重新命名對話方塊；`Menu` 新增 `children`，`items`/`onSelect` 變為可選；`shell.overlay` 多了兩個 `ui-workspace` 條目。歸檔提示直接應用"顯示已歸檔"篩選，不再開啟檢視選項選單。
