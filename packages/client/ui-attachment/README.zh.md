---
description: "對話 UI 的附件呈現：混合草稿附件欄、文件拖放目標、歷史圖片畫廊與原圖燈箱；供 Web 附件體驗的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-attachment

[English](README.md) | 中文

## 概述

本包渲染對話 UI 中與附件相關的一切：composer 下的一條有序草稿附件欄、全視口拖放提示層、Chat、Trajectory 與工具結果中的長期保留的圖片，以及檢視原圖的燈箱。附件資料、上傳狀態、圖片載入與回呼來自宣告這些 slot 的持有方。需要 DeepSeek Chat 風格的附件體驗時選擇它。

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

與 [`ui-conversation`](../ui-conversation/README.zh.md) 一起掛載本外掛，工具結果需要圖片相簿時也要掛載 [`ui-tool`](../ui-tool/README.zh.md)。外掛等待這些 slot 的宣告，並把元件註冊進去。使用者會看到混合草稿附件欄、帶上傳控制元件的 DeepSeek Web 檔案卡、帶限制說明的拖放遮罩、按數量定尺寸的訊息圖片、工具卡片相簿，以及支援 Escape、遮罩和關閉按鈕的燈箱。

### 草稿附件

圖片與通用檔案按選擇順序進入同一條不換行的橫向附件欄。所有條目均為 64px 高：圖片是 64px 方形縮圖，通用檔案是 240px 寬的 DeepSeek Web 卡片，帶 16px 圓角、藍色漸變文件圖示、檔名，以及大寫副檔名與位元組大小。溢位隱藏時由邊緣箭頭翻頁，捲軸保持隱藏，新增條目會滾動到欄尾展示。檔案上傳時圖示位置顯示 spinner，傳輸層報告位元組時顯示進度，首次報告前使用不定態進度條；失敗時顯示重試。移除按鈕在懸停或鍵盤聚焦時出現，在觸控裝置上保持可見。單擊圖片會開啟原圖。

### 訊息圖片與燈箱

Chat 中的一條使用者訊息把檔案與圖片放在同一個靠右、可換行的排列中，並保持來源順序。訊息僅有一張圖片且沒有其他附件時，圖片按長邊 240px 渲染（寬高比鉗制在 [0.25, 4]，從不放大）；訊息有多個附件時，每張圖片顯示為固定 64px 方塊，與 240×64px 檔案卡同排。載入完成的圖片單擊開啟文件級燈箱；載入失敗則顯示重試控制元件。燈箱按 Escape、按下遮罩或點關閉按鈕關閉，並把焦點還給開啟者。

Trajectory 附件行使用 48px 方形縮圖，完整縮放圖片而不裁剪。載入與重試圖示保持相同尺寸，提供在地化的工具提示和可存取名稱；圖片開啟同一個燈箱。插槽持有方可以為縮圖與燈箱提供僅用於展示的圖片名稱，而不改變持久化引用或快取查詢。

### 拖放遮罩

檔案拖到頁面上方時，全視口遮罩顯示拖放提示，包括插畫和標題；接受拖放時還會顯示一行限制說明。遮罩只呈現狀態，是否接受由持有方的文件級監聽器決定，拖放處理器透過 entry API 報告放下的成員中哪些是資料夾，以便持有方引用或拒絕它們。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

外掛透過 `ctx.slots.inject` 等待 `conversation.input.attachments`、`conversation.message.images`、`conversation.trajectory.images` 與 `tool.call.images`。隨後它註冊 composer rail、文件拖放目標、供 Chat、Trajectory 與工具結果共用的歷史圖片 gallery，以及原圖燈箱。呈現元件僅依賴 props：slot 持有方提供附件資料、圖片載入、回呼與語言包翻譯器；包入口不匯出任何元件。

| 檔案 | 職責 |
|---|---|
| [`src/client/ComposerAttachments.tsx`](src/client/ComposerAttachments.tsx) | 有序圖片／檔案欄＋拖放遮罩的組裝 |
| [`src/client/drop-events.ts`](src/client/drop-events.ts) | 每個已掛載附件檢視的 effect 安裝的 document 拖放監聽 |
| [`src/AttachmentRail.tsx`](src/AttachmentRail.tsx) | 附件橫向溢位、滾輪轉換、邊緣箭頭 |
| [`src/client/MessageImages.tsx`](src/client/MessageImages.tsx) | 每訊息畫廊＋燈箱的組裝 |
| [`src/MessageImage.tsx`](src/MessageImage.tsx) | 單圖尺寸、載入／重試、點選開啟；本地提交回顯預覽直接顯示其 object URL |
| [`ImageLightbox`](../ui-primitives/src/ImageLightbox.tsx) | 鋪在共享遮罩上的文件級模態預覽 |
| [`src/DropOverlay.tsx`](src/DropOverlay.tsx) | 不接收指標事件的拖放提示 portal |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

如果附件介面本身還不夠，請閱讀以下頁面。這些頁面從本包填充的 slot 講到負責輸入流程的工作階段外殼。

- [ui-conversation](../ui-conversation/README.zh.md)——宣告附件 slot，並負責 composer 與圖片接收。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊 slot。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該外掛只渲染由對話 UI 提供的附件狀態，不貢獻模型可見輸入。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前附件功能範圍。它們是包約束，不是通用圖片檢視器對比或任務積壓。

- **燈箱無縮放與下載**——預覽僅以適應視口的尺寸渲染原圖。
- **燈箱不鎖定焦點**——它設定 `aria-modal` 並在關閉時歸還焦點，但 Tab 仍可移動到背後的頁面。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只貢獻由 effect 持有的 slot entry；slot 註冊表負責其生命週期並驗證宣告。
