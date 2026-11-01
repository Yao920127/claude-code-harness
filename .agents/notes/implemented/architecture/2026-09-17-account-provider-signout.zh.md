# Agent Note: 帳號提供者與目前請求取消

Status: implemented

[English](2026-09-17-account-provider-signout.md) | 中文

## Problem

根據登入態選擇憑證會改變現有提供者路由的計費身份。退登也需要停止依賴帳號的任務，不能根據請求或工具執行期間可能已經改變的設定判斷歸屬。

## Decision

`deepseek-official` 和 `deepseek-account` 是獨立路由，共享 DeepSeek 協定實作。每個介面卡僅有一個憑證解析器和認證請求頭模式。兩條路由均不退回到另一憑證。帳號服務保留[登入決策](2026-09-14-deepseek-account-login.zh.md)定義的來源及簽發方驗證。

帳號取消讀取執行中 Agent 最近的 `Session.requestContext()`，不維護額外提供者欄位。該已記錄值在工具和重試階段保留，隨下一次繫結請求更新；空閒 Agent 不計入。新輪次首次準備期間，它仍可能指向上一輪的帳號路由，因此退登也可能打斷尚未繫結新請求的 API key 輪次。沒有歷史上下文的首請求若缺少帳號憑證，會在傳輸前失敗。

本地退登成功後釋出帳號事件。Platform 帳號提供者安裝帳號模組的監聽器，遍歷 Agent 註冊表，透過 `Agent.cancel` 取消匹配的帳號路由並保留收件箱。帳號控制器的退登確認複用同一判斷函式。每個已註冊子代理獨立分類；生命週期繫結到已取消父代理的子代理仍受現有父級取消規則約束。現有 HTTP 訊號將取消傳遞到傳輸層。

## Alternatives considered

歷史提供者集合會在輪次切換到 API Key 路由後仍錯誤取消它。目前設定會誤判更早的在途請求。額外的提供者欄位或模組級全域對映重複儲存請求上下文中已有的資訊。登入級取消訊號重複現有 Agent 與 HTTP 取消鏈結。

## Consequences

模型選擇展示兩條路由，即使存在 API Key，選擇帳號路由仍要求登入。兩個路由分別由 `llm-deepseek-account` 和 `llm-deepseek-api-key` 註冊，擁有獨立的模型目錄與連線設定，共用 `llm-deepseek` 協定實作。取消保留排隊輸入，不自動喚醒。已記錄的 hook 原因生成在地化對話提示，無須改變持久事件型別。

行為測試覆蓋憑證分離、首請求準備、工具階段取消及路由替換。SDK account-provider-signout 情境啟動隨附 profile，記錄被中斷的輸出和取消原因。
