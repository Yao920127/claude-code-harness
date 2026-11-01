---
description: "面向組合 POSIX 檔案、程序與沙箱提供者的部署者，說明 OpenSSH 連線設定及遠端輔助程序生命週期。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh

[English](README.md) | 中文

## 概述

`dsh-ssh` 將 POSIX Harness 主機連線到 POSIX SSH 主機上已安裝的輔助程式。部署方持有的 OpenSSH 主機別名提供認證與主機身份；配套的檔案系統、子程序和沙箱提供者共享該連線。連線在就緒前驗證已安裝產物的摘要；輔助程式在連線關閉或租期到期時負責遠端清理。

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

在自定義 `dsh` 設定組合中，將本服務與 [`fs-ssh`](../fs-ssh/README.zh.md)、[`subprocess-ssh`](../subprocess-ssh/README.zh.md) 和 [`sandbox-ssh`](../sandbox-ssh/README.zh.md) 組合。主機執行 Harness、模型傳輸和 Session 儲存；遠端機器提供檔案與程序。headless 設定組合支援這種安排。

### 部署前提

兩端均需執行 Linux 或 macOS。本地 `ssh` 命令必須支援連線複用與 Unix 套接字轉發，伺服器也必須允許該轉發。啟動前設定主機別名、憑證與已知主機記錄：本服務啟用 `BatchMode`、要求嚴格檢查主機金鑰、停用認證代理轉發，且不提供互動認證流程。

在遠端主機安裝已建置的輔助程式及其匹配的執行依賴。Node、輔助程式、載入程式及其依賴必須位於工作區和可寫臨時目錄之外，也必須位於後端會替換的臨時目錄樹之外，例如 bwrap 的私有 `/tmp`；工作區仍可位於 `/tmp` 下。摘要驗證在輔助程式啟動後發現非預期的已安裝產物；它不能保證可寫部署檔案的執行安全，也不能認證惡意 SSH 主機。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `host` | 必填 | 已有的 OpenSSH 主機別名 |
| `node`、`helper`、`workspace` | 必填 | 遠端 Node 可執行檔案、輔助程式打包入口和預設工作區的絕對路徑 |
| `helperHash` | 必填 | 已安裝輔助程式入口的小寫 SHA-256 |
| `bootstrapPath`、`bootstrapHash` | 省略 | 成對提供的遠端 PTC 入口及其小寫 SHA-256 |
| `requestTimeoutMs` | `30000` | 連線與管理請求的截止時限，範圍為 1 至 2,147,483,647 毫秒 |
| `maxFrameBytes` | `67108864` | 每條 JSON 訊息的負載上限，最大為 64 MiB |
| `maxPending` | `128` | 普通未完成請求的數量上限；心跳與有界清理請求使用預留容量 |
| `leaseMs` | `30000` | 輔助程序心跳租期，範圍為 3000 至 600000 毫秒 |

使用 PTC 時，設定兩個引導欄位，並將驗證後的 `ctx.ssh.nodeExecutable` 與 `ctx.ssh.bootstrapPath` 傳給 [`NodePtcRuntime`](../../ptc-runtime/ptc-runtime-node/README.zh.md)。僅使用檔案系統和 Bash 時可以省略這對欄位。未設定 PTC 部署時，`bootstrapPath` getter 會拒絕存取。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節 — 點選展開</summary>

OpenSSH 主連線承載私有管理 RPC。每條程式流使用獨立轉發的 Unix 套接字和獨立 SSH 通道。程式 stdout 無法偽造管理回覆，也不會佔用控制流的通道視窗；SSH 傳輸擁塞仍會影響共享連線。

每個流預留項都有一個隨機 256 位 TLS 預共享金鑰，僅由管理 RPC 傳遞。TLS 認證兩端並保護流中的每個位元組；金鑰絕不作為流字首傳送。套接字目錄為私有目錄（`0700`），套接字使用 `0600` 權限。替換可寫套接字路徑無法冒充端點或獲知流金鑰；攻擊者仍可中斷服務或轉發不透明的 TLS 記錄。

連線釋放會先等待轉發與取消子程序，以及尚在建立的流結束，再刪除本地資源。傳輸丟失會拒絕待處理操作並使連線失效。輔助程序在 SSH EOF、終止訊號或心跳到期時啟動託管清理。斷連用戶端無法確認遠端結果；操作不會自動重連或重放。

啟動或程序結果失敗後，預留項在原生程序範圍清空後釋放；有界完成快取保留原始拒絕結果，供後續讀取。輔助程式關閉也會等待已在進行的端點與目錄清理。

終端啟用 shell 活動觀察時，根程序退出會保留 reservation 及其剩餘工作。活動 RPC 繼續存取 provider；明確終止時先等待程序範圍完全停穩，再釋放端點並記錄完成結果。helper 連線解除安裝和租約到期仍保留原有的終止權限。

輔助程式以 `--disable-sigusr1` 啟動，因此同使用者程序傳送的訊號無法開啟其 Node 偵錯程式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [SSH 子系統](../../../docs/subsystems/ssh.zh.md) — 執行座標、傳輸語義及生命週期歸屬。
- [POSIX SSH 決策](../../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md) — 理由、替代方案及必要驗證。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為主機別名、認證與流能力權杖屬於私有部署細節，每項面向模型的操作均由消費方負責。

#### KV Cache 影響

本提供者不貢獻請求字首內容。面向模型的工具與結果由消費方負責。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

- 不提供 Windows 端點、自動設定遠端環境、重連或重放。
- Web 工作區介面的路徑仍假定可存取主機檔案系統；請使用 headless 或所有消費方都遵守提供者路徑語義的自定義組合。
- TLS 流金鑰不防禦遠端作業系統級程序記憶體檢查或除錯。檔案效果策略保留所選沙箱後端的限制。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

本包不釋出不變式伴隨入口。訊息驗證及所屬檔案系統、子程序和沙箱提供者執行可觀察的約束；此介面卡沒有增加可獨立觀察的狀態關係。

</details>
