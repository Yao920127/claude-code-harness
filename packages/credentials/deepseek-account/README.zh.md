---
description: "帳號使用方可讀取本地登入狀態、發起或取消瀏覽器登入，並在保留 API Key 的情況下退出。Host 模型使用方僅能為提供者設定的推理來源解析帳號憑證。"
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-account

[English](README.md) | 中文

getPlatformSession 為原生 Platform 內嵌提供僅限 Host 的 origin/token 快照，退登時返回 null。其 userId 複製最近一次成功 getProfile 得到的穩定帳號 ID；尚無一次成功讀取或資料不含 ID 時為 null。快照複用該 ID，不自行發起資料請求，因此 ID 未知時只會讓 userId 為 null，而不會延遲呼叫方；資料讀取首次取得穩定 ID 或該 ID 變化時會通知 watch 訂閱者，供標識使用方重新讀取快照。使用方以 origin 和 userId 作為持久化瀏覽器偏好儲存的鍵，userId 為 null 時改用臨時儲存。帳號控制器 RPC 和 Client 狀態不包含此方法及快照。帳號變化時，使用方銷燬持有舊快照的文件。快照只攜帶部署請求頭；Platform 用戶端身份由發起請求的內嵌用戶端自行組裝。

`platformClientHeaders` 依據單次呼叫的 `AccountClientMetadata` 與組合出的桌面平臺生成五個 Platform 用戶端請求頭：`x-client-bundle-id` 有意保持為空字串，`x-client-platform` 在沒有 Desktop profile 提供 `darwin` 或 `win32` 時為 `web`，`x-client-version` 為呼叫方建置的版本，`x-client-locale` 透過匯出的 `platformWireLocale` 將目前介面語言歸約為 `zh_CN` 或 `en_US`，`x-client-timezone-offset` 為東為正的整秒偏移。請求正文需要同一個線上語言值時，消費方複用 `platformWireLocale`，使請求頭與正文不會不一致。

getUnnotifiedBonuses 返回平臺尚未記錄為已展示的贈金及其所屬帳號；ackBonusNotified 記錄使用者實際看到的那一筆贈金。確認請求攜帶該帳號，因此在一個帳號下讀取的通知絕不會被確認到另一個帳號。

`rejectToken` 接收 Host 推理請求被拒絕的 token，僅刪除與它匹配的目前登入憑證；延遲返回的拒絕不能清除替換後的憑證。

`deepseek-account/session-expired` 在移除被拒絕的憑證後，向目前訂閱方通知一次。帳號快照不攜帶失效提示，因此重新連線不會重複彈出 toast。

## 概述

帳號使用方可讀取本地登入狀態、發起或取消瀏覽器登入，並在保留 API Key 的情況下退出。Host 模型使用方僅能為提供者設定的推理來源解析帳號憑證。

## 目錄

- [使用此包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用此包

本地成功退出登入後發出 `deepseek-account/signed-out`。Platform 提供者安裝帳號模組的取消監聽器，根據執行中 Agent 的 `session.requestContext().provider` 判斷帳號任務，取消時保留收件箱。帳號控制器的確認彈出視窗複用同一判斷，不維護額外 Agent 狀態。新輪次繫結首請求前，該判斷仍讀取上一輪的提供者。

`AccountProfile.avatarUrl` 是可選的帳號大頭貼 URL；為空或缺失時表示沒有大頭貼。

該服務定義帳號操作和可重連的狀態快照。平臺提供者負責協定和授權記錄。憑證僅限 Host；API 控制器只匯出狀態與操作，不匯出 resolveToken。

帳號模型請求以 `ACCOUNT_SIGN_IN_REQUIRED` 失敗時，發出 `deepseek-account/model-sign-in-required`，Client 接收該即時事件以提示登入。其他請求錯誤不觸發此事件。

<a id="understand-the-implementation"></a>
## 理解實作

服務只定義帳號操作，不維護第二份憑證索引，因此不釋出 invariant。提供者負責持久化和登入生命週期檢查。

<a id="further-exploration"></a>
## 深入探索

[憑證子系統](../../../docs/subsystems/credentials.zh.md)定義儲存介面；[架構](../../../docs/architecture.zh.md)說明應用組合。

AccountDetails.balance 就緒時，value 儲存充值錢包，bonusWallets 儲存贈送錢包；兩個陣列均保留十進位制金額字串和幣種。查詢失敗不提供金額。

<a id="model-experience"></a>
## 模型體驗

無，因為帳號憑證隻影響 HTTP 認證，不進入模型提示、Session 日誌或工具結果。

#### KV Cache effect

不改變模型請求字首。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- 帳號 token 沒有過期或重新整理流程。退出時先移除本地授權，再由提供者在後臺撤銷；遠端退登失敗不會恢復本地登入態。資料和餘額查詢失敗保留已儲存授權。getProfile / getBalance 分別報告資料和餘額的查詢結果。

<a id="dev-note"></a>
### 開發備註

[桌面登入決策](../../../.agents/notes/implemented/architecture/2026-09-14-deepseek-account-login.zh.md)記錄取消和儲存的職責。

PlatformSession 可將僅限 Host 的 requestHeaders 從 Host 傳至 Electron 主程序，其中只有部署請求頭，因為內嵌文件的用戶端身份在其語言、時區和版本可知處組裝。消費者必須從渲染層 bootstrap 排除這些請求頭，並將其限定於設定來源。userId 同樣僅限 Host，絕不進入渲染層 bootstrap。mergePlatformCookies 替換同名 Cookie，同時保留其他 Cookie。
