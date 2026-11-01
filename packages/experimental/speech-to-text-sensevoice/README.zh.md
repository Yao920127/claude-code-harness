---
description: "按需準備和執行本地 CPU SenseVoice 工作程序。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-sensevoice

[English](README.md) | 中文

## 概述

此 Provider 在 Host CPU 上使用 SenseVoiceSmall ONNX 與 Silero VAD 識別語音。各平臺的 sherpa-onnx Node 包包含 ONNX Runtime；使用者無需 Python、編譯器或模型轉換。啟用時檢查快取資源，不載入模型或下載資源。

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

[Bundle](../voice-input-bundle/README.zh.md) 在 DSH 主目錄下提供絕對 `dataRoot`。準備會下載固定修訂的模型檔案，驗證大小與 SHA-256，再載入模型。`precision` 預設為 `int8`，`fp32` 選擇較大的參考權重。`modelDirectory` 提供包含所選 ONNX 檔案和 `tokens.txt` 的已有絕對目錄，`vadModelPath` 選擇已有 Silero ONNX 檔案。取消或失敗後複用已完成並透過驗證的檔案。

下載每個缺失檔案前，Host 會比較相容 Hugging Face 的 `modelOrigins`，預設為 `https://huggingface.co` 和 [HF-Mirror](https://hf-mirror.com)。並行 HEAD 請求沿用固定檔案路徑，透過 Host 的 fetch 代理跟隨重定向，先返回 2xx 的源優先下載。`modelProbeTimeoutMs` 預設為 3000 毫秒；所有探測均失敗時按設定順序下載。網路、HTTP、憑證或完整性驗證失敗會嘗試其他源；取消、儲存錯誤和未分類錯誤會停止準備。所有源都必須符合固定修訂、大小和 SHA-256 驗證值。回應延遲不代表下載吞吐量，完整下載仍受準備階段的總超時約束。

顯式 `modelOrigin` 僅使用指定源，不探測也不退回到公共源。只有一個地址的 `modelOrigins` 同樣跳過探測。已驗證的快取和顯式離線路徑無需請求下載源。語音 UI 在準備或重試前提供已公佈的下載源。手動選擇僅覆蓋本次任務，只使用指定源而不退回，且不能替換進行中任務的源。Host 拒絕設定之外的源；完全離線部署不公佈下載源。

下載失敗會標明檔案與下載源，並提供原因分類，以及可用的 HTTP 狀態或錯誤碼。公開狀態不包含 URL 憑證、查詢參數和原始底層錯誤訊息。重試複用已驗證檔案，未完成的檔案重新下載。

每次啟用都會檢查磁碟上的所選模型、詞表與 VAD。快取完整且驗證透過後立即恢復就緒，首次錄音再喚醒工作程序。檔案缺失或託管檔案驗證不符時需要顯式準備；路徑不可讀時報告錯誤。顯式部署路徑只檢查可存取性，檔案內容由部署者負責。停用外掛或重新啟動 Host 後，無需重新下載完好的快取。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>維護者資訊 — 點選展開</summary>

一個託管 Node 子程序序列執行推理。喚醒期間提交的錄音進入有界佇列。工作程序在執行時要求資源處於就緒或待喚醒狀態。轉寫不會啟動準備下載。`threads`、`segmentSeconds`、`vadThreshold`、`minSpeechSeconds` 和 `minSilenceSeconds` 調節 CPU 推理與分段；`maxPending` 限制已接收任務數。準備和推理分別有截止時間。無效語言或 WAV 輸入在原生推理前被拒絕，保留已載入的工作程序；推理失敗、回應格式錯誤和傳輸失敗會回收程序。取消會終止執行中的工作程序並等待其程序範圍退出；已取消的排隊錄音不會執行。`idleTimeoutMs` 在空閒後釋放程序，零表示保留至外掛釋放。模型繼續保留在快取中。帶認證的環回請求僅在記憶體中儲存音訊。Electron 工作程序使用 Node 模式，並複製 VAD 緩衝區以相容 V8 記憶體籠。`dsh-subprocess` 擁有程序範圍觀測；本包沒有需要協調的獨立投影，因此不釋出不變數伴隨模組。

Host 在頁面和 Session 變化期間擁有準備任務：檢查資源、下載識別權重與詞表、下載 VAD、驗證檔案、載入工作程序。顯式模型路徑會省略對應下載步驟。下載報告位元組，其他步驟報告等待時間。空閒程序保留已準備路徑，喚醒時只需載入模型。準備結果釋出後再取消，只等待任務收尾，不會覆蓋該結果。

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

- 僅使用 CPU。原生包面向 macOS arm64/x64、Linux glibc arm64/x64 和 Windows x64；Windows ARM64 與 Linux musl 尚非已驗證部署目標。INT8 權重約 239 MB，FP32 約 938 MB，另需執行時和 VAD。模型記憶體大於檔案大小，並隨錄音長度增長；安裝提示屬於估算。語言提示包括自動、中文、英語、粵語、日語和韓語。停用外掛保留模型快取。桌面發行包仍需各平臺簽名和麥克風權限驗收；Linux 桌面分發不屬於此 Provider。

-----

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者資訊 — 點選展開</summary>

無。

</details>
