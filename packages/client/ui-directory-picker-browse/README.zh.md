---
description: "應用內目錄瀏覽表面：填充工作區目錄流程的 Miller 分欄「選擇工作區目錄」對話方塊；供 Web 拾取體驗的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-browse

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的應用內目錄瀏覽表面：一個「選擇工作區目錄」對話方塊，透過本地主機列出、導航並建立資料夾，不涉及任何作業系統選擇框。它填充 `ui-workspace` 宣告的兩個目錄流程槽位，用一行 cordis.yml 組合出瀏覽拾取互動的用戶端一側。當瀏覽器為遠端或程序內、沒有本地作業系統選擇器時選擇它；本地部署可優先選擇 [`-native`](../ui-directory-picker-native/README.zh.md) 表面。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

與 `ui-workspace` 及主機後端 [`dsh-host-directory-picker-browse`](../../host/directory-picker-browse/README.zh.md) 一起掛載本外掛；一行 cordis.yml 隨即組合出完整的瀏覽拾取互動。當工作區流程發起目錄請求時，使用者看到應用內對話方塊：頭部承載路徑麵包屑與可編輯路徑區，未選中行時是一整欄層級，選中後該行分為層級與子項兩欄。

### 導航與建立

逐級進入資料夾、直接編輯路徑，或用字首過濾最後一欄；主機標記的隱藏條目預設不顯示，直到頁尾開關揭開。**新建資料夾**開啟一個巢狀建立對話方塊，目標為選中的資料夾，並選中它建立出來的那個；**開啟**採納選中的資料夾，沒有選中時回落到目前層級。確認一個目錄即為選中的路徑；關閉對話方塊即為取消。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

對話方塊是 680×500 的 Miller 分欄檢視（在較矮或較窄的視口中限制尺寸），經 `ctx.workspaces` 驅動主機的 `listDirectory` 與 `createDirectory` 原語。兩處註冊經巢狀的 `ctx.slots.inject()` 呼叫作為一次事務性效果安裝，因為任一宣告條目都可能晚些啟用或替換其宣告；對話方塊文案註冊在本包自己的 locale 名稱空間下，讓兩份字典作為一個單元落實。瀏覽類失敗留在對話方塊自己的提示區內，因此本填充從不驅動持有方的 `onError` 分支。node 半部是一個空 `apply`，讓外掛留在主機名單上。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當拾取面不夠用時閱讀以下頁面。它們從瀏覽器半部進入主機後端與它所填充的槽位。

- [dsh-host-directory-picker-browse](../../host/directory-picker-browse/README.zh.md)——本表面驅動的目錄列出後端。
- [ui-workspace](../ui-workspace/README.zh.md)——宣告目錄流程槽位並擁有拾取對話。
- [ui-directory-picker-native](../ui-directory-picker-native/README.zh.md)——面向本地部署的原生作業系統選擇器替代方案。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊槽位。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為目錄瀏覽器屬於瀏覽器介面；本包中的任何內容都不會進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前瀏覽表面。它們是目前包約束，不是通用檔案瀏覽器對比或任務積壓。

- **無搜尋、無多選、無重新命名或刪除**——對話方塊只負責列出與建立目錄；到達目標靠導航、編輯路徑，或用字首過濾最後一欄。
- **隱藏條目的過濾在用戶端**——主機始終列出隱藏條目並加標記，因此開關只改變對話方塊渲染什麼。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個工作區目錄流程持有方，其資源釋放由 HMR（熱模組替換）安全規範驗證；它顯示的每個目錄列表都會按需從 Host 重新讀取，而不會儲存在本包中。
