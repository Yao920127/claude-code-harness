---
description: "Web \"Open In...\" 控制元件：工作階段頭部在記住的應用中開啟 workspace 目錄的分體按鈕，以及文件預覽裡用預設應用開啟、顯示單個檔案位置的控制元件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-open-in-app

[English](README.md) | 中文

## 概述

本包提供 open-in-app 功能的瀏覽器表面。工作階段頭部的分體按鈕在記住的應用中開啟目前工作階段的 workspace 目錄（工作階段摘要的 `cwd`），下拉箭頭列出主機探測到已安裝的全部 catalog 應用；可用性、圖示與啟動均來自 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 的主機路由，所以兩個包要一起掛載。在右側 Sidebar 的文件預覽裡，一個「開啟」分體按鈕和一個空態按鈕經由 Session Remote 用預設應用開啟目前檔案或顯示其位置。主機沒有這項能力時，這些控制元件一個都不渲染。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本外掛與 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 並排掛進 Web 組合；這對包用兩行 cordis.yml 組成完整功能，本行不接受任何設定。只要主機探測到至少一個已安裝的 catalog 應用且工作階段有已知的 workspace 目錄，工作階段頭部就會出現 "Open In..." 分體按鈕。只要 Host 透過 Session Remote 的 `session.canOpenWorkspacePath` 報告有桌面，[`ui-sidebar-documentpreview`](../ui-sidebar-documentpreview/README.zh.md) 的文件預覽就會長出檔案控制元件；刪掉這一行會一次去掉所有控制元件。

### 預期行為

工作階段標題欄和文件標題欄共用同一個高 24px、圓角 9px 的分體按鈕。兩個標題欄都只顯示圖示，懸停提示顯示預設應用名稱或檔案定位動作。兩者都顯示預設動作的圖示，在選單的預設應用後標註“（預設）”，僅在自己的操作執行期間停用，並透過短暫提示報告失敗。目錄介面卡使用已有的跨平臺應用列表，將最後一次成功選擇儲存在 `dsh.open-in-app.choice` 中；原選擇不可用時退回到第一個可用應用。

**在本地開啟**快捷鍵捕捉主工作階段的目錄，並使用與頭部按鈕相同的已記住應用。按鈕 tooltip 和 `aria-keyshortcuts` 顯示目前有效繫結；Web 遵循[快捷鍵服務的平臺預設值](../shortcuts/README.zh.md)。只有選中工作階段介面、且頭部按鈕有可開啟的目錄和已安裝應用時，命令才執行。啟動尚未結束時也會阻止命令。滑鼠與鍵盤操作共享 controller 的啟動狀態，重複操作不會啟動兩次，也不會在啟動期間更改已記住的選擇。

檔案選單列出已發現的關聯應用，不單列“用預設應用開啟”。“顯示檔案位置”固定在選單底部，透過分隔線與滾動的應用列表分開。查詢成功且只有一個可用操作時顯示單按鈕，不再顯示下拉箭頭。檔案關聯首次載入時使用灰色骨架圖示。Host 識別出預設應用時，選單將該項標註為“（預設）”，主按鈕開啟該應用；否則第一個關聯應用佔據該位置，只有在一個關聯應用都沒有時主按鈕才執行檔案定位。目錄選單不包含定位項。選擇檔案應用不修改系統預設應用。無法預覽檔案時，空態使用同一選單，按鈕增大到 40px 高並顯示圖示和動作文字；根據預設動作顯示“開啟”或“顯示檔案位置”。

使用同一查詢函式和檔案的已掛載控制元件共用查詢與結果，開啟任一選單會重新整理所有相關控制元件。最後一個控制元件釋放後取消查詢並清除狀態。已取消的查詢不會覆蓋其他檔案的結果。查詢失敗時選單顯示提示，並以檔案定位作為預設動作。檔案關聯查詢的平臺支援範圍見 [native-command](../../util/native-command/README.zh.md)；查詢結果為空時，包括平臺尚無查詢介面卡的情況，控制元件統一使用定位動作，不按作業系統分支處理。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內幕——點選展開</summary>

外掛透過標準 slot/inject 機制把分體按鈕註冊到 `conversation.session.header.utilities`，並以一個 effect 註冊 `open-in-app` 詞典。一個頁面生命週期的 controller（[`src/client/controller.ts`](src/client/controller.ts)）擁有每頁一次的可用性讀取、持久化選擇的 snapshot store 與啟動 POST；元件經 inject 的 `hooks` 隔間接收共享源，因此所有工作階段頭部共享同一份事實。文件相對的路由形式與 wire 載荷型別來自主機包的瀏覽器安全子路徑 `@deepseek-ai/dsh-host-open-in-app/shared`。controller 守衛執行中的啟動，並行布所捕捉的目錄與狀態；頭部控制元件從該源派生延遲出現的等待態和短暫錯誤態。

目錄和檔案介面卡把應用資訊與操作交給 [`OpenTargetButton`](src/client/OpenTargetButton.tsx)，由它統一管理選單順序、預設標記、圖示、尺寸和操作回饋。檔案標題欄和空態共用 `FileOpenTarget`，`OpenPathInjected.applications` 透過 [`open-path.ts`](src/client/open-path.ts) 查詢 `session.workspacePathApplications`。開啟操作使用 `session.openWorkspacePath`，Host 在啟動前重新驗證指定的關聯應用。`FileRouteAction` 透過 `deliverables.file.actions` 和 `deliverables.review.file.actions` 為交付卡片和變更對比頁提供同一控制元件，其認證路由保留工作階段檔案驗證。目錄介面卡繼續使用已有的應用列表路由，檔案查詢失敗或不可用時無需增加平臺專用的介面實作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [dsh-host-open-in-app](../../host/open-in-app/README.zh.md)——提供可用性、圖示與啟動的主機路由，及其背後的目錄。
- [dsh-session-log-export](../../session-query/session-log-export/README.zh.md)——工作階段頭部的姊妹動作。
- [ui-sidebar-documentpreview](../ui-sidebar-documentpreview/README.zh.md)——宣告檔案控制元件所佔頭部與空態子 slot 的文件預覽。
- [ui-deliverables](../ui-deliverables/README.zh.md)——交付卡片，仍透過自己的路由開啟宣告過的檔案。
- [Web client 架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無。分體按鈕是瀏覽器 chrome；這裡沒有任何東西進入模型請求。

#### KV Cache 影響

無；本包從不組裝或傳送提供者請求。

## 已知限制與延後工作

Host 在開啟或定位前透過目前檔案系統驗證路徑。沒有對應 Host 對映的路徑會失敗，不會啟動原生應用。預設開啟遵循檔案型別關聯，包括 HTML 和 SVG。

<a id="known-limitations-and-deferred-work"></a>

- **詞典把守選單。** 主機目錄的新條目若在兩份詞典中沒有對應的 `app.<id>` 條目，將保持不可見而不是顯示裸 id；擴充功能目錄意味著同時擴充功能 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 與本包的 locale。
- **可用性每頁只讀一次。** 頁面開啟期間安裝的應用要重新載入頁面後才出現（主機側還需主機重新啟動）；檔案控制元件背後的桌面回答同樣每頁只讀一次。
- **所有平臺共用一個定位標籤。** Session Remote 只報告有沒有桌面，不報告它跑的是哪個檔案管理器，所以選單寫「顯示檔案位置」，而不像交付卡片那樣點名訪達或檔案資源管理器。
- **交付卡片保留自己的開啟器。** [`ui-deliverables`](../ui-deliverables/README.zh.md) 仍透過自己按 Session 與事件定位的路由開啟宣告過的檔案；把這些卡片併到這裡的檔案控制元件上，延後到 [Agent Note](../../../.agents/notes/implemented/feature/2026-09-16-open-in-default-app-for-sidebar-files.zh.md) 記錄的後續工作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作語境——點選展開</summary>

功能層面的各項決定，包括拆分為主機包與本表面包，記錄在[轉正 Agent Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.zh.md)；文件預覽的檔案控制元件記錄在[預設應用 Agent Note](../../../.agents/notes/implemented/feature/2026-09-16-open-in-default-app-for-sidebar-files.zh.md)。

</details>

**執行時不變式：** 不釋出伴生入口。外掛註冊一個詞典 effect 和五個 slot 條目，HMR 安全性 spec 證明它們都會在資源釋放時撤銷；應用可用性、選擇與桌面回答儲存在控制器的快照儲存中，不存在可能與之分歧的第二份副本。
