---
description: "面向組合 compaction 的部署的圖片省略執行器說明：支援圖片的路由以請求超出圖片預算拒絕時會發生什麼。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-image-offload

[English](README.md) | 中文

## 概述

當較早的圖片超出模型路由的預算時，圖片密集的工作階段仍可繼續。本外掛永久將這些圖片替換為註明附件及其可用只讀路徑的文字，然後重試，不消耗提供者重試預算。後續請求在切換路由、恢復和回放時都保留這一選擇。token 計量隨日誌記錄的選擇更新，提供者快取只能複用到第一條被修改的訊息之前。

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

凡是執行 agent loop（智慧代理迴圈）並帶有支援圖片的路由的組合，都應掛載本外掛，隨附的 `dsh` 基礎設定已經掛載。沒有它，`IMAGE_OFFLOAD_REQUIRED` 失敗會進入普通恢復並以錯誤結束該輪次。本外掛沒有設定：DeepSeek 介面卡執行其 file 模式和內聯退回預算，pi-ai 介面卡執行其 base64 上限，各自上報需要省略的數量。

### 最小可用組合

```yaml
- name: '@deepseek-ai/dsh-compaction-image-offload'
```

### 你可以觀察到什麼

每次決定追加一條 `image/offload` 事件，透過目前訊息事件的序號和訊息內深度優先的圖片序號指定省略位置。訊息事件和表層節點標識保持不變。agent 重試前會追加新的 `request/header`，標明新的訊息序列。摘要重試保留在同一對壓縮標記內。

### 失敗與恢復

本外掛只處理帶 `offloadImages` 的 `IMAGE_OFFLOAD_REQUIRED` 失敗。它按模型請求順序遍歷表層，跳過 assistant 節點和已經標記的圖片，給指定數量的出現位置打標記。沒有可省略的圖片時在 `agent/request-error` waterfall 上委派下游，由下游恢復或普通的輪次錯誤處理。這次重試不佔提供者重試預算，也不追加 `llm/retry` 事件。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部——點選展開</summary>

本包擁有事件宣告、引用驗證、不可變圖片投影、選圖和重試策略。它在接受圖片省略事件前向 Session 註冊 `imageOffloadProjection`。相同的瀏覽器安全處理器透過 `./projection` 匯出，供獨立回放使用，目前格式目錄為離線讀取器裝配該處理器。缺少註冊時拒絕即時恢復，解除安裝已經使用的處理器後拒絕繼續派生訊息。token 測量應用同一份選擇，不依賴替換影子價格。

摘要失敗使用同步的 `compaction/summary-error` waterfall。外掛只在傳入的摘要選區內選圖，記錄省略後返回 true。壓縮後端重新派生該選區並計價，然後重試。每次重試都會繼續省略保留的圖片，沒有可省略的位置時結束恢復。取消或無關的選區變更會使摘要失敗。已經記錄的省略在後續失敗或取消後仍然有效。

本包不釋出執行時 invariant 伴生外掛：純投影在 Session 提交事件前拒絕無效或重複省略的圖片引用，執行器不維護獨立可變的省略狀態。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [獨立的圖片省略事件](../../../.agents/notes/implemented/architecture/2026-09-10-image-offload-events.zh.md)，記錄持久選擇、職責和被否決的方案。
- [compaction seam](../compaction/README.zh.md)，相鄰的摘要和文字剪枝操作。
- [compaction-tool-result-pruner](../compaction-tool-result-pruner/README.zh.md)，保留圖片選擇並修剪工具輸出的兄弟執行器。
- [dsh-llm](../../llm/llm/README.zh.md)——`ImageBlock.offloaded`、`IMAGE_OFFLOAD_REQUIRED` 與佔位投影。
- [llm-deepseek 介面卡](../../llm/llm-deepseek/README.zh.md)與 [llm-pi-ai 介面卡](../../llm/llm-pi-ai/README.zh.md)——上報省略數量的路由預算。

-----

<a id="model-experience"></a>
## 模型體驗

### 已省略的請求圖片

#### 模型看到的內容

每個選中的圖片出現位置以佔位文字（`offloadedImageText`）到達模型，文字註明附件及其可用只讀路徑，未選中的位置仍是圖片。選擇在後續請求中持續生效。新的工具讀取可以引入同一附件的新出現位置，不會恢復舊位置。

#### Token 影響

被省略的出現位置只花費佔位文字，不再花費視覺 token。token meter 為每個節點定價時應用日誌記錄的選擇。僅針對引用的啟發式計數不計入省略中繼資料。

#### KV Cache 影響

一次選擇把較早的圖片換成佔位文字，該請求的提供者快取複用因此止於第一張被修改的圖片。所選位置之後仍保持省略。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **被省略的圖片不會自動迴歸**——更大的預算、更大的路由或 compaction 降低總量都不會移除標記；恢復手段是佔位文字中的只讀路徑。
- **每次省略都要先失敗一次**——傳送前沒有任何規劃，路由的拒絕就是訊號，這和計劃中改由 provider 報告無法快取圖片的方向一致。
- **臨時的小預算會永久省略**——迫使內聯退回的 Files 故障，或臨時切到小預算路由，會省略後來的路由本可以傳送的圖片。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

本開發備註是非權威的工作背景：給維護者的備註和未決問題。已交付的行為與被接受的理由見上文各節、包程式碼和連結的 Agent Note。

- 產生 `IMAGE_OFFLOAD_REQUIRED` 的路由本地位元組檢查是過渡實作：provider 自己報告無法快取的圖片之後，adapter 把該報告換算成數量，本執行器保持不變。

</details>
