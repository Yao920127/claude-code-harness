---
description: "面向側欄的官方 DeepSeek Harness 品牌填充，僅在官方建置中生效；供選擇或替換品牌呈現的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本包讓以 `official` profile 建置的用戶端在側欄顯示 DeepSeek Harness 標誌與名稱。其他建置 profile 保留外殼的魚形標誌與本地建置標籤，工作階段首屏則始終使用動畫魚。品牌為 DeepSeek Harness 的部署應選擇本包；使用其他品牌的部署應提供替代品牌包。本包不保留執行時狀態，也不影響模型請求。

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

在採用 DeepSeek 自有品牌的部署中，將本外掛掛載到瀏覽器外掛名單，然後以 `official` profile 建置用戶端，讓填充得以註冊。

### 選擇 profile

`DSH_CLIENT_BUILD_PROFILE` 決定渲染哪個品牌。`official` 建置在側欄顯示官方標誌與名稱；任何其他取值都讓外殼退回——魚形標誌與本地建置標籤——保持原樣。工作階段首屏無論 profile 如何都顯示來自 `dsh-client-ui-conversation` 的動畫首屏魚，因為這個退回本身就是官方標誌。兩種情況下外掛都會照常載入並透過驗證；只有註冊受 profile 門控。

### 替換品牌

自有身份的部署不組合本包，而是組合另一個佔據側欄 slot——以及本包留給退回的首屏 slot——的包。佔據 slot 是唯一的組合路徑；這裡不存在任何品牌設定面。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

兩個填充作為一組宣告感知的註冊安裝：巢狀的 `ctx.slots.inject()` 呼叫等待側欄宣告，因此無論本行在宣告者之前還是之後啟用，這組註冊都能工作；宣告消失時兩個填充一併撤回，HMR 期間也不會留下殘缺的品牌混合。瀏覽器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一個空 Loader 座位。瀏覽器標題是建置環境的事（`DSH_CLIENT_TITLE`），不在 slot 系統之內。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當品牌面不夠用時閱讀以下頁面。它們從本包占據的 slot 進入渲染這些 slot 的外殼。

- [ui-sidebar](../ui-sidebar/README.zh.md)——宣告 `sidebar.brand.mark` 與 `sidebar.brand.name` 並渲染其退回。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏宣告 `conversation.hero.brand.mark`。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包只貢獻瀏覽器呈現；這裡沒有任何內容進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了品牌呈現的供給方式。它們是目前包約束，不是品牌設計對比或任務積壓。

- **只有一組填充**——替代呈現屬於佔據相同 slot 的另一個 Cordis 包。
- **瀏覽器標題獨立**——`DSH_CLIENT_TITLE` 在建置時選擇標題文字，而非透過 UI slot。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包不保留可變狀態，三個 slot occupant 透過同一個事務性 effect 安裝和釋放。
