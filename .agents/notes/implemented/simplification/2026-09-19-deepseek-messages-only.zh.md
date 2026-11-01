# Agent Note: One Messages transport for the official DeepSeek route

Status: implemented

[English](2026-09-19-deepseek-messages-only.md) | 中文

## 問題

官方 DeepSeek 路由需要 Messages 思考回放、圖片上傳與歷史內更新。選擇第二種傳輸會重複序列化器、流處理、Files 協定格式、設定分支與夾具，卻沒有為這條路由增加必需能力。

## 決策

`dsh-llm-deepseek` 僅使用 Messages。一個介面卡解析請求區域性的設定快照並執行請求。設定暴露一個端點，不提供協定選擇器。Files 用戶端直接使用 Messages 認證、中繼資料與分頁；配額清理掃描全部頁面後再選擇最舊的自有檔案。

[Messages 介面卡決策](../feature/2026-09-07-deepseek-messages-adapter.zh.md)繼續擁有原生思考回放、系統訊息位置、圖片恢復與請求擴充功能接受規則。回放判別值和上傳索引名稱空間標識持久資料，並保留現有值。獨立的 pi-ai 介面卡保留各提供者協定。

## 考慮過的替代方案

**在可選選擇器後保留 Chat Completions。** 即使官方路由只需要 Messages，這仍會保留重複實作與測試矩陣。

**保留只有一個實作的通用協定分派器。** 分派器增加第二種依賴表示，並轉發每個介面卡操作，卻沒有進行任何選擇。

## 後果

官方路由要求相容 Messages 的端點。其基於 mock 的恢復、Loader、CLI 與 Web 測試使用 Messages；移除一種協定實作不會移除這些行為檢查。已提交的 Session 代際繼續透過提供者無關內容與保留的 Messages 回放中繼資料讀取。
