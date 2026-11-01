---
description: "面向 Bash、LSP 及 Node 執行時消費方，說明託管 SSH 子程序與終端行為。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-ssh

[English](README.md) | 中文

## 概述

`dsh-subprocess-ssh` 使用共享 SSH 輔助程序實作 `ctx.subprocess`。可執行檔案查詢、普通程序、fd 7 控制流及終端工作階段與 SSH 檔案系統在同一環境中執行。遠端原生程序管理器負責終止與靜止狀態；消費方繼續負責命令語義、輸出上限與執行截止時限。

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

將本提供者與 [`dsh-ssh`](../ssh/README.zh.md) 及其檔案系統提供者一同掛載。本提供者沒有獨立部署設定。`resolveExecutable()` 檢查遠端可執行檔案名稱空間；完整的 spawn 請求提供遠端 cwd、環境、流處置方式及清理寬限期。

普通 spawn 在遠端分配過程中返回控制代碼。管道 stdin 和可選雙工控制端點在分配過程中接受寫入。終端分配、寫入、前臺檢查、訊號及終止均保留非同步介面。

終端請求將 `shellActivity` 轉發給執行 provider，`inspectActivity()` 返回經驗證的狀態和 revision。啟用後，根程序退出的終端仍可存取，直到 owner 明確終止；連線級清理仍由 SSH helper 租約控制。

`done` 報告的直接程序退出並不證明託管程序範圍已經靜止；`waitForExit()` 單獨觀察該狀態。其可選訊號約束整個觀察過程，包括等待分配和終止；取消返回 `false`，不會停止程序。已確認清空的範圍返回 `true`，實際觀察故障則拒絕。`terminate()` 針對同一個遠端管理器。連線丟失會拒絕未確認的操作；啟動或修改結果不明確時絕不自動重放。

-----

終端 shell 資訊與可執行檔案驗證來自遠端 helper。查詢未命中與 SSH 故障分別報告。PTY 建立傳遞呼叫方的 `terminalType`，`resize()` 更新遠端終端尺寸，不替換程序。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

輔助程序在啟動前預留並認證全部所需流。stdout、stderr、stdin 與 fd 7 使用獨立 SSH 通道。收集輸出會發布最終的有界原始位元組尾部與完整流位元組偏移，因此網路延遲不會改變已完成的觀測。可選 spill 檔案使用遠端本地提供者的私有保留輸出目錄。

遠端執行委託給 [`subprocess-local`](../../subprocess/subprocess-local/README.zh.md)。因此，原生程序歸屬及平臺降級方式與該遠端作業系統上的本地執行具有相同含義。SSH 承載請求與觀察結果，本身不限制程式權限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [子程序子系統](../../../docs/subsystems/subprocess.zh.md) — spawn、輸出收集、終端及生命週期 API。
- [SSH 沙箱提供者](../sandbox-ssh/README.zh.md) — 遠端檔案效果限制。

-----

<a id="model-experience"></a>
## 模型體驗

間接透過 Bash、終端、LSP 和 PTC 執行時消費方產生影響，由它們展示既有結果與遠端路徑。

#### KV Cache 影響

本提供者不貢獻請求字首內容。面向模型的工具與結果由消費方負責。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 已完成的 spill 檔案在連線釋放後繼續保留，直至外部臨時檔案清理。
- 呼叫方必須消費或關閉原始輸出流。銷燬公開的 stdout 或 stderr 會關閉對應傳輸，即使銷燬發生在遠端分配之前也是如此。獨立通道允許在 stdout 暫停時繼續傳輸控制訊息，但不會消除逐流背壓或共享網路擁塞。
- SSH 連線丟失後，用戶端無法確認遠端終止；租期清理是遠端動作，不等於用戶端收到了成功確認。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

本包不釋出不變式伴隨入口。訊息驗證及所屬檔案系統、子程序和沙箱提供者執行可觀察的約束；此介面卡沒有增加可獨立觀察的狀態關係。

</details>
