# Agent Note: 按 alpha 路由的圖片品質階梯取代按色數分類的編碼路由

Status: implemented

[English](2026-08-24-alpha-routed-image-quality-ladders.md) | 中文

## 問題

`@deepseek-ai/dsh-attachment-local` 的圖片規範化和請求版本編碼此前按 5-bit 色數取樣選擇編碼器：128×128 最近鄰取樣量化後不超過 256 色的圖片先走 palette PNG（libimagequant）再退 WebP，其他透明圖片走 WebP，其他不透明圖片走 JPEG。高頻攝影類 JPEG 的量化取樣經常落在閾值以下，issue #2885 的 8000×8000 復現圖片取樣色數為 175 和 184，實際色數為 2145 和 4077，而 palette PNG 是管線裡最慢的編碼器，在這類內容上產物還比 JPEG 大約 4 倍（2048px master 尺寸實測 2657ms/3.95MiB 對 26ms/0.95MiB）。取樣本身因 `fastShrinkOnLoad: false` 必須全尺寸解碼，64MP 源圖上每張都要付出 86 至 192ms。當所有候選都超過位元組上限時，兩個編碼器還會進入按比例縮圖重試的迴圈，最終以 `IMAGE_TOO_LARGE` 報錯，而實測最壞輸入（均勻噪聲）在預設預算下第一檔品質就能裝下。

## 決定

兩個編碼器只按一個解碼事實路由：帶 alpha 通道的源圖編碼為 effort 0 的有損 WebP，不透明源圖編碼為 JPEG（libjpeg-turbo），共用品質階梯 85、75、60（`encoding.ts` 的 `IMAGE_ENCODING_QUALITIES` / `WEBP_ENCODING_EFFORT` / `encodingLadder`）。色數分類器和 palette PNG 分支被刪除而不是修復，誤判這一 bug 類別因此不可能復發，也不再有圖片付出分類解碼成本。`normalizedImageMaxBytes` 和路由 `maxBytes` 的語義從上限改為階梯目標：階梯仍在第一個裝得下的品質檔停下，但全部檔位都超過目標時保留最小產物，縮圖重試迴圈被刪除。提供者位元組硬限制（DeepSeek 單圖 32MiB、inline 預算）仍在傳輸位元組的位置執行。master 尺寸規則從長邊上限改為總畫素預算：`normalizedImageMaxPixels`（預設 2048×2048）按比例縮放，`normalizedImageMaxDimension`（預設 8192，與准入單邊上限一致）隨後夾住長邊，因此長頁面截圖這類極端長寬比保留短邊解析度（2000×20000 的源圖短邊保留約 647px 而不是 204px），正方形源圖的規範化結果與之前完全一致。請求變換版本升到 `request-image-v5`，已有變體快取按身份自然重建；內容定址的 master 無需遷移，繼續有效。請求快取讀取不再拒絕超過位元組目標的條目，因為階梯耗盡的產物就是該 variant id 的確定性結果。

對 issue #2885 復現集的 Pareto 實測（PR #2989 附錄）支撐這個選擇：攝影類內容上 JPEG 比其餘所有編碼器快 1 至 2 個數量級，effort 0 的 WebP 在圖形類內容上體積與 palette PNG 相當且不會被誤判；均勻噪聲最壞輸入在不透明鏈的 q85 一檔即落入預設 4MiB/1MiB 目標，只有對抗性的隨機 alpha 平面會耗盡 WebP 階梯（約 6.3MiB，距提供者上限還有 5 倍）。

本決定部分取代[統一圖片請求管線記錄](../feature/2026-08-20-unified-image-request-pipeline.zh.md)：其規範化與請求編碼章節現在以本路由為準；其耐久版本拆分、Files 生命週期與解除安裝投影不變。

## 考慮過的替代方案

**修復分類器（提高取樣解析度、加入梯度統計）並保留 palette PNG。** 否決：任何內容分類器都保留一類誤判和每張圖的分類解碼成本；palette PNG 唯一的前沿生態位（圖形類）WebP 用遠少的編碼時間即可達到。

**全部走單一 WebP 階梯。** 否決：JPEG 在不透明攝影內容（真實負載的大頭）上快 4 至 6 倍，而 alpha 探測只是零成本的中繼資料讀取。

**為階梯耗盡的產物保留縮圖重試迴圈。** 否決：實測最壞情況表明該迴圈在預設預算內是死程式碼，其唯一可達效果是把對抗性輸入一路縮到 1×1 再報錯。

## 後果

- 不透明的低色數圖形（圖表、文字截圖）現在存為 JPEG：在幾百 KB 量級上比 palette PNG 大 2 至 3 倍，銳利邊緣有 JPEG 振鈴；模型可見的請求版本本就被畫素預算縮尺寸主導，可讀性影響很小。將來若需要圖形類專用編碼，正確做法是給不透明階梯加一檔 WebP，而不是恢復分類。
- GIF 源圖經 gifload 解碼後帶 alpha 平面，因此靜幀 GIF 規範化走 WebP 階梯。
- `IMAGE_TOO_LARGE` 不再產生於編碼環節；它仍是超大源圖的准入錯誤。
- 階梯耗盡的附件可能以超過位元組目標的大小寫入磁碟和上行，直到提供者上限拒絕；實測只有對抗性隨機 alpha 輸入可達。把這樣的超目標 master 再次作為新上傳提交時，直通的位元組檢查不透過，會再走一遍有損階梯，因此規範化對這一僅對抗性可達的類別不冪等，每輪都會累積代際損失。
- 測試證據：`packages/attachment/attachment-local/tests` 用真實編碼器釘住路由、階梯耗盡和文字可讀性行為，包括 issue #2885 誤判特徵（高頻攝影內容離開慢路徑）。
