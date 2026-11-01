---
description: "面向與 SSH 子程序共享檔案的消費方，說明遠端檔案系統語義。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-ssh

[English](README.md) | 中文

## 概述

`dsh-fs-ssh` 在 SSH 輔助程序的檔案系統中提供 `ctx.fs`。檔案工具讀寫的檔案與遠端 Bash、終端、語言伺服器和 Node 程式看到的檔案一致。遠端路徑規範化、版本保護及原子修改使用輔助程式旁安裝的本地檔案系統實作。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

將本提供者與 [`dsh-ssh`](../ssh/README.zh.md) 及 `sandboxPolicy` 一同掛載，並使用配套 SSH 子程序與沙箱提供者執行程式。本提供者沒有設定欄位：連線身份和預設工作區屬於 `dsh-ssh`，檔案效果模式屬於 `sandboxPolicy`。

`resolve()` 在遠端主機上規範化路徑。`processPath()` 與 `fileUrl()` 在同一個遠端名稱空間中標識檔案，並不授予主機側存取能力。檔案 URL 對字面的百分號、反斜槓和換行進行編碼，保留原檔名。`processPathFromHostPath()` 返回 `undefined`，因此需要已安裝可執行檔案或載入程式的消費方必須顯式提供遠端產物。

讀取保留共享檔案系統錯誤碼。寫入和編輯將已解析的逐次呼叫策略傳送給輔助程式，由其規範化工作區並在原子修改所在位置執行策略。傳輸丟失報告 I/O 失敗；修改可能已經提交，不會自動重試。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

輔助程式複用 [`fs-local`](../../fs/fs-local/README.zh.md) 與 [`fs-sandbox`](../../fs/fs-sandbox/README.zh.md)，保留符號連結身份、陳舊版本拒絕、差異基線及釋出語義。UTF-8 流使用有界拉取請求，在消費方提前停止時關閉遠端迭代器。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md) — 共享操作及錯誤含義。
- [SSH 連線](../ssh/README.zh.md) — 部署與斷連行為。

-----

<a id="model-experience"></a>
## 模型體驗

間接透過現有檔案系統消費方產生影響，由它們展示遠端路徑及檔案內容，並負責每個工具與提示。

#### KV Cache 影響

本提供者不貢獻請求字首內容。面向模型的工具與結果由消費方負責。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 輔助程式將整段文字讀取及單次位元組視窗限制為 8 MiB。更大的讀取需使用文字流或多個位元組視窗；其他 JSON 傳輸也受連線訊息大小上限約束。
- 不支援檔案系統監聽：提供者不覆寫 `watch()`，由基類以 `FS_IO_ERROR` 拒絕；不使用輪詢，也不為遠端路徑建立本地監聽。普通讀取與消費方提供的手動重新整理仍可用。
- 遠端檔案 URL 是執行座標，不是主機檔案系統控制代碼或 Web 下載連結。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

本包不釋出不變式伴隨入口。訊息驗證及所屬檔案系統、子程序和沙箱提供者執行可觀察的約束；此介面卡沒有增加可獨立觀察的狀態關係。

</details>
