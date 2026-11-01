---
description: "帳號頁面使用經過認證的 Remote 操作和快照流。控制器提供登入狀態，不返回 token 或 PKCE 私密資料。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-account-controller

[English](README.md) | 中文

## 概述

帳號頁面使用經過認證的 Remote 操作和快照流。控制器提供登入狀態，不返回 token 或 PKCE 私密資料。

## 目錄

- [使用此包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用此包

account 名稱空間提供 getState、getProfile / getBalance、getUnnotifiedBonuses、ackBonusNotified、startSignIn、cancelSignIn、signOut 和 watch。watch 先傳送完整初始狀態，隨後傳送完整狀態變化；斷開連線只停止觀察，不取消登入。取消操作必須指定嘗試 ID，防止舊頁面取消新登入。帳號缺失或已切換時 getUnnotifiedBonuses 返回 null、ackBonusNotified 返回 false；需要呼叫方重試的失敗以丟擲的 Remote 錯誤返回。

到達 Platform 的每個操作都接收呼叫介面的 `AccountClientMetadata`——用戶端版本、目前語言和以秒為單位的 UTC 偏移——因此 Host 報告的是發起請求的介面，而不是它上一次見到的呼叫方。取消和 watch 不接該參數，因為它們不會到達 Platform。

`watchExpiry` 僅傳送即時憑證失效通知，不傳送初始值，也不重放歷史通知。桌面端透過該流，在切換到 Welcome 時交接一次性 toast。

`hasRunningAccountTasks` 透過帳號模組的判斷函式，檢查執行中 Agent 最近記錄的請求上下文，包括工具和重試階段。空閒 Agent 及 API key 上下文不計入。移除憑證時，帳號提供者獨立取消匹配任務。

<a id="understand-the-implementation"></a>
## 理解實作

控制器向帳號服務轉發操作，不維護獨立的帳號狀態，因此不釋出 invariant。

<a id="further-exploration"></a>
## 深入探索

[憑證子系統](../../../docs/subsystems/credentials.zh.md)定義儲存介面；[架構](../../../docs/architecture.zh.md)說明應用組合。

<a id="model-experience"></a>
## 模型體驗

無，因為帳號憑證隻影響 HTTP 認證，不進入模型提示、Session 日誌或工具結果。

#### KV Cache effect

不改變模型請求字首。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- UI 斷線後可透過 watch 恢復狀態，但不能在 Host 退出後恢復登入嘗試。憑證和請求 token 解析不對 Remote 暴露。

<a id="dev-note"></a>
### 開發備註

[桌面登入決策](../../../.agents/notes/implemented/architecture/2026-09-14-deepseek-account-login.zh.md)記錄取消和儲存的職責。
