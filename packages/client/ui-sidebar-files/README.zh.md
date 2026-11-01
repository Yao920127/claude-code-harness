---
description: "dsh Web 用戶端右側 Sidebar 的檔案樹 tab 型別：透過網路逐層列出工作階段工作區根目錄，按資源地址把檔案開啟到 Sidebar。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-files

[English](README.md) | 中文

## 概述

瀏覽 Session 的工作區目錄樹，並在 Sidebar 預覽中開啟檔案。根目錄與已展開目錄透過直接子項監聽自動重新整理，手動重新讀取仍可用。該 tab 從引導頁進入，不認領資源地址。

## 目錄

- [註冊了什麼](#what-it-registers)
- [樹](#the-tree)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="what-it-registers"></a>
## 註冊了什麼

命令 `workspace.files` 在焦點分欄內開啟或聚焦檔案頁；從聊天區觸發時使用目前工作階段的活動停靠分欄。檔案頁替換開始頁，同一分欄內重複開啟仍保留一個檔案頁。桌面預設鍵為 Mod+P。開始頁入口顯示有效快捷鍵；Windows 和 macOS Web 使用[快捷鍵服務的平臺預設值](../shortcuts/README.zh.md)；Linux Web 預設不繫結此命令。

- **型別**：`ctx.sidebarRightTabs.register(...)`，kind 為 `files`，id 為 `@deepseek-ai/dsh-client-ui-sidebar-files`，檔位 `builtin`，沒有 patterns，另有一個開啟該型別的引導頁入口（order 10，標題與描述取自 `sidebarFiles` 名稱空間，圖示為黃色資料夾）。
- **正文**：以該 id 為鍵的 `sidebar.right.pane.tab` slot：strip 下的一行標題行，然後是樹。共享的 [`PathLabel`](../ui-primitives/README.zh.md#component-catalog) 顯示根路徑，目錄使用弱化顏色，最後一段使用主色。路徑過長時保留尾部字元並在左側漸隱；懸停顯示完整路徑。重新讀取控制元件位於右端。
- **標籤頁標題**：以該 id 為鍵的 `sidebar.right.pane.tab.title` slot：型別標籤前的一枚 16px 共享 `FileTypeIcon` 資料夾圖示。樹本身的行不畫這枚圖示。

`src/client/` 下的原始檔：`definition.tsx`（型別是什麼）、`store.ts`（它儲存什麼）、`face.ts`（Remote 讀取與監聽）、`directory-node.ts`（開啟的目錄及其生命週期）、`FilesBody.tsx`（它畫什麼，含排序與失敗行兩個輔助函式）、`FilesTitle.tsx`（標籤頁標題）、`locales.ts`（它說什麼）、`index.ts`（接線）。

<a id="the-tree"></a>
## 樹

根是工作階段的工作目錄，讀自 `useSessions().byId[sessionId].cwd`。`/` 和 Windows 盤根等檔案系統根路徑均可作為樹的根。每一層以絕對路徑為鍵；子路徑是父路徑以 `/` 拼上條目名。一層在首次展開時經 `@deepseek-ai/dsh-api-workspace-files` 名稱空間的 `remote.workspaceFiles.list(sessionId, absolutePath)` 列出；介面卡保留列表的條目與截斷標誌，丟棄其工作區相對路徑。行序為目錄優先，其後按自然序、不分大小寫的名稱排列；dotfiles 與其他條目一樣顯示。

| 條目型別 | 行 |
|---|---|
| `directory` | 切換展開與摺疊；再次開啟時重新列舉，並恢復仍存在的已展開後代。摺疊期間保留已顯示條目的快取。 |
| `file` | 經 `useTabInfo().tab.actions.openResource` 開啟 `dsh-resource://file/session/<sessionId>/<encoded path relative to the root>`，地址由 `@deepseek-ai/dsh-util-workspace-path` 的 `fileAddressFor` 從條目的絕對路徑與樹的根生成，落在該 tab 自己的 pane 裡。 |
| `other` | 灰顯且不可點選，從而完整呈現目錄內容。 |

被端點條目上限截斷的層以一條標記收尾；空層如實說明；失敗的層按錯誤碼各顯示一行（`workspace-file/not-found`、`outside-workspace`、`not-directory`），其他情況顯示傳輸層自己的訊息。重新讀取就地重新整理根與展開中的層，讀取期間保留顯示條目，不重置整棵樹；摺疊的層在下次開啟時重新拉取。沒有工作目錄的工作階段只顯示一行說明，而不是樹。

狀態儲存在型別自己的儲存裡，按 tab id 分桶：`root`、`levels`（每個絕對路徑的 loading / ready / failed）、`expanded`、`autoRefresh` 與 `scrollTop`——滾動期間偏移由正文自己記錄，解除安裝時一次性寫入。儲存比 body 活得久，切到其他側欄 tab 再切回來時樹帶著已載入的層重新掛載，滾動位置也隨之恢復。owner 的 `signal` 終結一個桶：中止時忘掉該 tab，其後才結算的列表與解除安裝時的偏移提交都什麼也不寫。

每個開啟的 `DirectoryNode` 在 Tab 生命週期內持有自己的目標監聽；摺疊關閉該節點及其不可見後代。祖先恢復期間的展開狀態變化會更新儲存和待恢復節點，後代恢復時遵循最新展開偏好。自動重新整理預設開啟；獨立開關暫時隱藏，狀態、文案、樣式與切換邏輯保留。目錄讀取期間或收尾時收到的變化仍會留待下一次重新整理。

<a id="model-experience"></a>
## 模型體驗

無，因為本包在瀏覽器裡繪製工作區檔案樹，不註冊任何面向模型的內容。

#### KV Cache 影響

無；目錄列表經 Remote 傳輸，不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>
- **只有列目錄。**沒有搜尋、產物過濾、拖拽、重新命名、右鍵選單或目前檔案高亮。
- **只有一個根。**樹以工作階段工作目錄為根；沒有辦法瀏覽到它之上，而 Host 本來也拒絕工作區根之外的路徑。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

頁面重新整理快捷鍵透過常規目錄讀取器重新整理聚焦的檔案樹。重新讀取控制元件在懸停和鍵盤聚焦時顯示有效繫結。

</details>

**執行時不變數：** 不釋出 companion。tab 持有的 face 內部管理目錄讀取與監聽，並透過 Slot store 寫入顯示狀態；tab 取消時釋放二者。本包未暴露可用於執行時比對的獨立觀測源。
