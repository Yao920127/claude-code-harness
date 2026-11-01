---
description: "錄製語音並將可確認的轉寫文字插入工作階段草稿。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-voice-input

[English](README.md) | 中文

## 概述

此可選瀏覽器外掛在模型選擇器與傳送按鈕之間新增空心麥克風圖示。識別就緒後，點選展開錄音欄，顯示實際音量以及取消、停止按鈕。聲波高度低於錄音按鈕高度。停止後轉寫到草稿。識別偏好和模型準備放在外掛設定中；語言選項來自所選 Provider。

## 目錄

- [使用此包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在外掛管理頁啟用[語音輸入 Bundle](../voice-input-bundle/README.zh.md)。快取檢查後，缺少模型時彈出安裝引導，可選擇“前往安裝”或“稍後”。“前往安裝”開啟 Bundle 詳情，再點選“下載並準備”才開始安裝。快取完整時不彈引導，也無需重複安裝。識別未就緒時不顯示麥克風懸停提示，點選後才開啟同一個引導彈出視窗；點選引導按鈕進入語音 Bundle 詳情，不會錄音或下載。快取檢查、正在準備、準備失敗或服務斷連時，彈出視窗改為引導檢視狀態、進度或錯誤詳情。彈出視窗將焦點移到導航按鈕，並將 Tab 切換約束在彈出視窗內；選擇“稍後”或按 Escape 關閉時恢復此前焦點，不改變或提交草稿。準備前，本地 Provider 可展示磁碟、記憶體與安裝時間的估算。準備摘要預設摺疊；展開後可檢視已完成、目前和未開始的步驟。就緒後點選麥克風，允許存取，再點選停止以轉寫。取消或 Escape 丟棄錄音。識別回饋留在工具欄內部。Provider 和語言偏好在 Bundle 詳情中透過 Settings 服務儲存。瀏覽器麥克風存取需要 HTTPS 或環回地址，以及作業系統權限。

下載或重試前，**模型下載源**提供自動選擇及 Host 公佈的源。SenseVoice 預設提供 Hugging Face 和 HF-Mirror；固定私有部署僅顯示設定的源。手動選擇只使用指定源，自動選擇沿用提供者的比較與退回策略。目前卡片中的重試會保留選擇，不修改部署設定或識別偏好。準備期間不能改源，資源就緒後隱藏源選擇器。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>維護者資訊 — 點選展開</summary>

原生 MediaRecorder 捕捉音訊，等待最後一塊資料後由 Web Audio 轉換為 Host 的 PCM 格式。等待麥克風授權時視窗失焦不會取消採集；錄音期間失焦會取消。採集失敗立即結束錄音介面，並在活動欄內提供重試。取消、失敗和外掛釋放共享同一個資源釋放 Promise；外掛保留所有權，直到 AudioContext 關閉任務結束。原編輯器選區攜帶草稿版本：草稿變化時，轉寫文字保留在麥克風旁，供顯式插入或丟棄。切換 Session、錄音期間隱藏頁面和釋放外掛會使遲到結果失效並釋放軌道。外掛擁有的一份準備狀態訂閱服務於輸入框、安裝引導和詳情。這些檢視使用既有 Slot 生命週期，不擁有準備任務。不釋出執行時不變數伴隨模組，因為準備狀態來自一份 Host 訂閱，錄音狀態屬於一個捕捉操作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

[語音輸入子系統](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型體驗

無，因為錄音與準備不進入模型請求；之後的文字由普通使用者提交擁有。

#### KV 快取影響

沒有直接影響；普通提交擁有訊息內容。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- 不提供自動傳送、常開麥克風、喚醒詞、流式字幕或語音合成。“本地”指 Host 所在機器，可能與瀏覽器所在機器不同。

-----

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者資訊 — 點選展開</summary>

無。

</details>
