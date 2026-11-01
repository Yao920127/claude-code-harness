---
description: "面向使用 SSH 檔案系統和子程序提供者的組合，說明遠端檔案效果限制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-ssh

[English](README.md) | 中文

## 概述

`dsh-sandbox-ssh` 為 SSH 子程序提供者啟動的程序提供 `ctx.sandbox`。遠端主機選擇其已安裝的本地沙箱後端，並在遠端執行每次呼叫的策略。Bash 與 Node 獲得同一後端的執行完整性等級、拒絕特徵及執行器失敗分類。

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

將本提供者與共享 [SSH 連線](../ssh/README.zh.md)、SSH 檔案系統及 SSH 子程序提供者一同掛載。本包沒有專用設定。等待 `confine(argv, policy, signal)`，由正在執行的遠端輔助程式解析每次呼叫的策略與命令。

傳入完整的 `read-only` 或 `workspace-write` 策略。工作區路徑在遠端主機解釋並規範化。消費方在 `danger-full-access` 模式下繞過 `confine()`；連線不額外引入本地／遠端策略標記。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

正在執行的輔助程式規範化策略根路徑，再向已載入的沙箱提供者取得強制執行限制的 argv、執行完整性等級與執行器失敗證據。SSH 子程序提供者直接執行返回的 argv，並負責 fd 7 傳輸及託管程序生命週期。取消請求或後端不可用時，會在呼叫方取得可啟動命令之前拒絕請求。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [程序沙箱子系統](../../../docs/subsystems/sandbox.zh.md) — 策略含義及執行完整性披露。
- [本地沙箱提供者](../../sandbox/sandbox-local/README.zh.md) — 遠端主機繼承的後端及平臺限制。

-----

<a id="model-experience"></a>
## 模型體驗

間接透過現有沙箱消費方產生影響，由它們報告模式、拒絕及執行完整性，並負責審批展示及模型參數。

#### KV Cache 影響

本提供者不貢獻請求字首內容。面向模型的工具與結果由消費方負責。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 檔案效果模式不限制網路存取或程序可見性。遠端 `partial` 後端仍屬於部分執行。
- SSH 主機與已安裝輔助程式屬於可信基礎設施。摘要檢查與檔案效果限制不構成對抗惡意主機的安全邊界。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

本包不釋出不變式伴隨入口。訊息驗證及所屬檔案系統、子程序和沙箱提供者執行可觀察的約束；此介面卡沒有增加可獨立觀察的狀態關係。

</details>
