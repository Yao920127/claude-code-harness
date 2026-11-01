---
description: "從外掛管理頁啟用實驗性語音輸入。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-voice-input-bundle

[English](README.md) | 中文

## 概述

此可選 Bundle 組合語音服務定義、本地 SenseVoice Provider、帶認證的 Remote 與瀏覽器麥克風控制元件。隨包設定預設停用。

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

開啟 Web 側欄的外掛管理頁並啟用帶藍色聲波圖示的“語音輸入”。模型需要準備時，彈出視窗提供“前往安裝”和“稍後”選項；“前往安裝”開啟 Bundle 詳情。快取完整時不會提示安裝。在詳情中選擇“下載並準備”；預設摺疊的目前步驟摘要可展開為完整步驟列表。下載報告真實位元組，總和檢查碼載入顯示等待時間。就緒後點選模型選擇器與傳送按鈕之間的麥克風，再點選停止以插入轉寫文字。Bundle 詳情透過 Settings 服務儲存識別器和語言。停用 Bundle 會取消目前任務；快取資源保留在磁碟上。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>維護者資訊 — 點選展開</summary>

靜態 `cordis.patch.yml` 新增四個語音條目，選擇 `sensevoice-local` 作為預設識別器，並透過 `dshHomePath` 提供 Provider 快取目錄。可選 Bundle 安裝使外掛管理器能夠發現此包，但不會在預設設定中選擇它。瀏覽器貢獻擁有其生成 Remote 的掛載；穩定 API Remotes 不匯入實驗性程式碼。此純設定包沒有獨立可變的執行時狀態，因此不釋出不變數伴隨模組。

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

- 此 Bundle 提供一個本地識別器。額外 Provider 使用不同 id 註冊到同一服務；雲端識別需要顯式增加 Provider 與憑證設定。Bundle 不增加模型工具或修改智慧代理迴圈。
- 安裝 dsh 時會一併安裝 `sherpa-onnx-node` 及其平臺原生執行時（含 ONNX Runtime），即使此 Bundle 處於停用狀態。執行時的磁碟佔用和下載量獨立於“下載並準備”所下載的模型；原生包體積隨平臺和版本變化。

-----

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者資訊 — 點選展開</summary>

無。

</details>
