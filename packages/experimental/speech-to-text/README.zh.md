---
description: "具名實驗性轉寫 Provider 及取消操作的所有權。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text

[English](README.md) | 中文

## 概述

此服務定義透過 `ctx.speechToText` 選擇具名語音識別器。消費者先解析請求再執行，Provider 獨立註冊。

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

透過[語音輸入 Bundle](../voice-input-bundle/README.zh.md)載入，或組合此服務、Provider 與消費者。`defaultProvider` 為必填項，選擇確切的註冊 id；Bundle 提供 `sensevoice-local`。`language` 提供省略的語言提示。缺失或重複的 Provider 會明確報錯。

提供者透過 `downloadSources` 公佈準備階段可用的源。`prepare(id, options)` 為單次任務轉發可選的 `downloadSource`；提供者驗證選擇，並拒絕在準備期間改源。省略時沿用提供者策略。下載源選擇不屬於持久化的識別偏好。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>維護者資訊 — 點選展開</summary>

`resolve()` 捕捉 Provider 實例、錄音和語言。`transcribe()` 拒絕已撤銷或替換的註冊。註冊的清理函式先拒絕新請求，再取消已接收的請求並等待 Provider 完成；Provider 必須回應取消。服務不會退回到其他識別器或上傳音訊。不釋出執行時不變數伴隨模組，因為註冊表是 Provider 與準備狀態觀測的唯一來源。

`defaultProvider` 與 `language` 是 volatile Config 欄位：`configure()` 透過 `settings` 服務把傳入的欄位寫入本外掛的 profile 條目，執行中的實例無需重掛載即可讀到更新值；儲存覆蓋值之前使用組合設定預設值。Settings 使用條目設定中的 id（`entry.options.id`）定位條目，不包含 Loader 的 Include 路徑。沒有 `settings` 或 profile 條目時 `configure()` 失敗，並在儲存前拒絕所選 Provider 不支援的語言。Provider 透過 `languages` 公佈支援的語言提示；`resolve()` 在轉寫前驗證所選提示。觀察者透過完整 `SpeechSnapshot` 接收 Provider 擁有的準備狀態；關閉觀察者不會取消準備。

`./wave` 輔助函式為 Remote 消費者與原生識別程序驗證規範的 16 kHz 單聲道 PCM16 WAV。兩者均在解碼取樣前拒絕不一致的頭部和長度。

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

- 僅支援完整錄音轉寫。服務沒有流式識別或語音合成方法。

-----

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者資訊 — 點選展開</summary>

無。

</details>
