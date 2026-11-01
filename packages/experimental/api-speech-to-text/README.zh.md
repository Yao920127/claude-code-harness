---
description: "透過帶認證的 Web Remote 提供有界臨時轉寫。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-speech-to-text

[English](README.md) | 中文

## 概述

`speech` Remote 將瀏覽器錄音連線至 `ctx.speechToText`，提供 Provider 發現和完整錄音轉寫呼叫。

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

與語音服務定義和 Typert 組合。`maxAudioBytes` 與 `maxDurationSeconds` 限制接收的錄音。瀏覽器 UI 啟用時掛載本包生成的 `/remote` 貢獻。

`prepare(providerId, { downloadSource })` 將公佈的一個下載源轉發給提供者，省略時保留其設定策略。目錄透過 `downloadSources` 提供選擇器選項。提供者拒絕不可用的源，以及對進行中任務的源變更。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>維護者資訊 — 點選展開</summary>

`catalog()` 暴露 Provider 標識、預設選擇與錄音限制。`transcribe()` 在解析指定 Provider 前驗證規範 base64 與 16 kHz 單聲道 PCM16 WAV。現有閘道負責認證和取消傳輸。音訊是臨時資料，不成為 Session 事件或附件；只有使用者之後的普通提交才記錄識別文字。不釋出執行時不變數伴隨模組，因為驗證無狀態，準備屬於 Provider。

`follow()` 推送包含準備狀態和目前偏好的完整目錄。`prepare()` 啟動或加入 Host 任務；`cancelPreparation()` 顯式取消任務。`configure()` 持久化傳入的偏好欄位。觀察連線斷開不會取消準備。

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

- 不提供檔案上傳、持久化轉寫歷史或流式協定。Base64 會增加傳輸開銷；錄音受公佈的限制約束。

-----

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者資訊 — 點選展開</summary>

無。

</details>
