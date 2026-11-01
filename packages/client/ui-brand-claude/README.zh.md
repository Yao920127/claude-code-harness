---
description: "用於 Web 用戶端的 Claude 品牌佔位者、頁面圖示以及 Claude 配色與字型，面向透過 harness 使用 Claude Code 的使用者，以及替換品牌呈現的維護者。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-ui-brand-claude

[English](README.md) | 中文

## 概述

安裝這個 Profile Bundle，即可以 Claude 標記與 Claude Code Harness 文字標識取代外殼的魚形標記。它佔用側邊欄的標記與名稱 slot，以及空白工作階段主視覺的標記與文字標識 slot，在載入期間把頁面圖示指向 Claude 標記，並套用 Claude 的配色與字型。為透過 [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.zh.md) 與 Claude Code 對話的 Profile 選擇本包；Claude 標記是 Anthropic 的商標，因此提供給他人的部署需要取得 Anthropic 的許可才能顯示。

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

把本包安裝進 Profile，然後重新啟動該 Profile。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-client-ui-brand-claude
```

Bundle 補丁插入一個瀏覽器行 `ui-brand-claude`。側邊欄在 Claude Code Harness 名稱旁顯示 Claude 標記，側邊欄窄於名稱寬度時以省略號截斷而不換行；新 Session 主視覺以 Claude 襯線展示字型把同一名稱顯示為文字標識，旁邊是 Claude 標記；瀏覽器分頁以 Claude 標記作為圖示。移除本包後，下次啟動 Profile 時每個位置都會回到之前的佔位者。在 `official` 建置中不要同時掛載 [`dsh-client-ui-brand-official`](../ui-brand-official/README.zh.md)，因為兩者佔用相同的單一佔位側邊欄 slot。

載入期間，本包還會按 Claude 的設計為整個 Web 用戶端換裝：奶油色畫布與暖色深色表面、珊瑚色的主要按鈕、開關、連結與焦點環、Inter 正文字型，以及用於主視覺標語與 Markdown h1 至 h3 標題的 EB Garamond。設定 → 外觀仍然選擇淺色、深色或跟隨系統，Claude 配色隨之切換。中文等非拉丁文字保留平臺字型。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

[`src/client/index.ts`](src/client/index.ts) 註冊 `brand.claude` 詞典，把兩個側邊欄 slot 作為一組感知宣告的註冊集合填充，並把 `conversation.hero.brand.mark`（取代主機所請求尺寸的 44px 標記）與 `conversation.hero.brand.headline`（翻譯後的名稱，以主視覺文字標識呈現）作為第二組填充。頁面圖示 effect 把每個 `link[rel~="icon"]` 的 `href` 改寫為該標記的 SVG data URL，並在解除安裝時還原每個原先的 `href`；沒有 document 的執行會跳過此步。[`src/client/mark.ts`](src/client/mark.ts) 儲存標記的路徑與顏色，[`src/client/Brand.tsx`](src/client/Brand.tsx) 渲染標記、主視覺標記與文字標識，以及側邊欄名稱——它用自己的 CSS class 截斷而不是換行進入側邊欄的固定高度行。node 半側是空的 Loader 席位。

[`src/client/theme.ts`](src/client/theme.ts) 把 Claude 取值作為一個 `ctx.theme.overrideTokens` 層儲存，每個 token 各有淺色與深色取值。它以暖色中性色替換共享的 `neutral-bluish` 色階，以珊瑚色替換 `deepseek` 強調色階，因此直接讀取這些色階的元件樣式會與別名一起變化；它還設定品牌、連結、表面與字型 token。解除安裝時移除該層。[`src/fonts/fonts.css`](src/fonts/fonts.css) 以 data URI 內嵌同目錄下 Inter 與 EB Garamond 的拉丁子集，因為用戶端 bundle 把樣式表內聯為文字，而主機不提供外掛字型檔案；一個測試會把內嵌位元組與 `.woff2` 檔案比對。Desktop 歡迎視窗改為複製 `eb-garamond-latin.woff2`，因為其內容安全策略會阻止 data URI 字型。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md)——宣告 `sidebar.brand.mark` 與 `sidebar.brand.name` 並渲染它們的退回內容。
- [ui-conversation](../ui-conversation/README.zh.md)——在主視覺中宣告 `conversation.hero.brand.mark` 與 `conversation.hero.brand.headline`。
- [dsh-llm-claude-code](../../llm/llm-claude-code/README.zh.md)——本品牌所搭配的 Claude Code 模型路由。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包只貢獻瀏覽器呈現；這裡沒有任何內容進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **瀏覽器標題獨立設定**——`DSH_CLIENT_TITLE` 在建置時選擇標題文字，而不是透過 UI slot。
- **伺服器提供的圖示檔案不變**——頁面圖示在用戶端載入後才改變；應用 manifest 與伺服器傳送的圖示檔案仍是之前的標記。
- **字型覆蓋範圍**——內嵌字型只覆蓋拉丁文字；正文與襯線標題字型棧中的中日韓文字都退回到平臺字型。

- **商標**——Claude 標記屬於 Anthropic；在提供給他人的部署中顯示它需要取得 Anthropic 的許可。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

無。

</details>

**執行時不變數：** 不釋出配套模組。除了會還原的圖示連結外，本包不保留可變狀態，其 slot 佔位者、主題層與字型樣式表透過外掛 effect 安裝與離開。
