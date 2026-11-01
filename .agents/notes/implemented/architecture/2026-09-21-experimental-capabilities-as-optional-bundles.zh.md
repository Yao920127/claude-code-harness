# Agent Note: 將實驗能力作為可選 bundle 釋出

Status: implemented

[English](2026-09-21-experimental-capabilities-as-optional-bundles.md) | 中文

## 問題

Web 外掛頁只提供兩個可選 bundle：Agent Teams 與語音輸入。Auto review 與 Inspector 都是已釋出的實驗包，使用者必須按名稱安裝或手寫 profile patch 才能掛載，儘管兩者已經宣告瞭 bundle patch 或附帶可掛載的 overlay。

## 決策

`OPTIONAL_BUNDLES` 列出 Agent Teams、語音輸入與 Auto review。每個可選 bundle 都宣告 `icon` 並匯出帶 `meta.title` 與 `meta.description` 的 `./locale/*.json`，官方分組因此能渲染在地化標題、描述和圖片；`verify-default-product-isolation` 會拒絕缺少這些宣告的可選 bundle。Inspector 的 `cordis.patch.yml` 直接寫包名而非建置產物路徑，所以同一檔案既是 bundle patch，也是已建置 Web 啟動的 `--patch` overlay。

可選 bundle 是安裝的執行時依賴，其依賴圖會隨每次 `dsh` 安裝一起下載。因此名單隻接納依賴圖已在安裝閉包內的包；Auto review 不增加任何依賴。Inspector 保留顯式安裝方式，不在預設外掛列表中顯示。瀏覽器操作與電腦操作提供者仍保持顯式組合：Playwright MCP、Chrome DevTools MCP 與原生 Cua Driver 執行時二進位制會讓每次安裝多出約 85 MB、21 個包，無論 bundle 是否啟用；而隨附的 Cua Driver MCP 開關會提供一個安裝本身並不攜帶其可執行檔案的能力。這些提供者包保留 locale 顯示中繼資料，供元件行使用。另有兩個包因其他原因不納入：`ptc-runtime-python` 會替換 PTC 執行時，而 `workflow-ptc` 在載入時拒絕非 TypeScript 執行時，且 Web preset 內含 bundle patch 無法觸及的 `workflow-ptc` 行；`browser-use-stagehand-native` 在 schema 驗證時就要求原生模型名稱與 API 金鑰，而外掛頁沒有對應的設定表單。

## 考慮過的替代方案

**把所有提供者都做成可選 bundle。** 組合與展示都正確，但會為多數安裝從不啟用的能力把提供者執行時塞進每次安裝；語音輸入的 `sherpa-onnx-node` 是唯一被接受的先例。

**在 `dsh-base` 中掛載僅負責註冊的 `computer-use` 與 `browser-use` 服務。** 共享組合將攜帶只有可選提供者 bundle 才需要的行；提供者 bundle 可以從自己的 patch 和依賴插入服務行。

## 後果

官方分組從兩項增至三項，每項都因實驗包名而帶實驗性標籤。安裝的執行時依賴閉包保持不變。瀏覽器操作或電腦操作提供者仍需在 profile patch 或組合中同時掛載其 Service Definition 與提供者。
