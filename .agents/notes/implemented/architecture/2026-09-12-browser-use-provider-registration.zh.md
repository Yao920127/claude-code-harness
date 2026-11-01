# Agent Note: 瀏覽器操作提供者註冊與 Session 所有權

Status: implemented

[English](2026-09-12-browser-use-provider-registration.md) | 中文

## 問題

瀏覽器控制後端暴露不同的操作與觀測格式。在可移植消費方存在之前，通用瀏覽器動作 API 會約束這些實驗。瀏覽器工作階段可以隔離，而附加現有已登入瀏覽器必須保留其狀態，並防止一個提供者內出現並行所有權。

## 決策

[`dsh-browser-use`](../../../../packages/browser-use/browser-use/README.zh.md) 擁有 `ctx.browserUse`，註冊一個提供者擁有的名稱並返回其 effect 清理器。第二次註冊無論名稱為何都會失敗。服務不包含瀏覽器物件、共享操作型別、分派方法、資源生命週期或執行時選擇器。[計算機操作註冊決策](2026-09-12-computer-use-provider-registration.zh.md)仍獨立擁有桌面提供者註冊與共享桌面協調規則。

[Playwright MCP](../../../../packages/experimental/browser-use-playwright-mcp/README.zh.md)、[Chrome DevTools MCP](../../../../packages/experimental/browser-use-chrome-devtools-mcp/README.zh.md) 與[原生 Stagehand](../../../../packages/experimental/browser-use-stagehand-native/README.zh.md) 擁有自己的瀏覽器工具，並透過常規 DSH 工具管線整合。它們是公共實驗性可選功能。DSH 擁有任務規劃與任務迴圈；Stagehand 提供單項 AI（人工智慧）輔助操作。Profile 或 preset 設定為每次提供者啟用選擇啟動或附加模式。

瀏覽器資源屬於確切的即時 Agent 與 Session，而非僅憑可複用的 Session id。呼叫跨輪次保留狀態。執行時釋放會關閉啟動的資源，重新載入或 fork 不會繼承啟動的 profile。附加保留現有瀏覽器狀態，並在該提供者實例內將外部瀏覽器獨佔保留給一個 Session。清理斷開連線而不關閉外部瀏覽器。

[實驗性執行時輔助庫](../../../../packages/experimental/browser-use-runtime/README.zh.md)擁有共享資源生命週期與附加保留機制，而不向瀏覽器操作服務引入這些方法。取消呼叫方對資源取得的等待後，初始化及其保留仍歸 Session 所有。活動操作收到 Agent 釋放的取消訊號時，在 Agent 等待空閒之前啟動資源關閉，因為瀏覽器呼叫可能只有在連線關閉後才能結束。提供者清理停止接收工具呼叫，並保留註冊，直到資源清理與活動呼叫完成。服務保持獨立於所有實驗包。

Stagehand 的啟動器繼承其程序環境，SDK 初始化可能在清理完成前超時。提供者 Host 使用 `@puppeteer/browsers` 在 CDP 或 SDK 就緒前取得所啟動 Chromium 及其臨時 profile 的所有權，並清理子程序環境。啟動和附加模式都由隔離的 Worker 執行 SDK，且只透過 CDP 連線。原生推理不接受 abort signal。SDK 關閉會等待活動工作；清理成功後可重新連線並保留瀏覽器狀態。SDK 工作未能結束時，只要 Chromium 仍在執行，就阻止複用。最終清理可在自有 Chromium 和 Worker 終止後釋放啟動瀏覽器的佔用。附加模式下 SDK 工作未能結束、Worker 終止失敗或自有程序清理失敗時，保留佔用。Host 僅終止自己擁有的 Chromium 程序，等待子程序關閉後才刪除 profile；外部擁有的瀏覽器保持執行。

Stagehand 使用顯式設定的固定版本 SDK 目錄內原生模型。設定的 API 金鑰與可選請求頭會轉發到瀏覽器擴充功能，由 Stagehand 在擴充功能內執行推理。瀏覽器工具輸入和返回資料使用現有 Session 日誌，包括 SDK 結果中繼資料。DSH 模型路由、憑證複用、底層推理請求/回應捕捉，以及與 Session 用量計量的整合仍屬暫緩工作；本整合不增加持久化事件或 Session schema 變更。

MCP 用戶端啟用會等待連線和工具發現，但提供者可能在任何 Session 存在之前就完成啟用。該啟用 promise 無法代表未來各 Session 擁有的用戶端。每個 MCP 瀏覽器提供者在現有的序列 `agent/created` 事件中等待一次用戶端啟動嘗試。[等待 Agent 建立的決策](2026-09-09-awaited-agent-creation.zh.md)負責排隊輸入順序與建立復原。建立或恢復成功後，提示片語裝與直接呼叫方即可讀取完整目錄。

啟動失敗或取消會拒絕建立或恢復，並觸發 Agent 及其用戶端資源的復原。附加連線被佔用時，本次啟用永久跳過啟動，但其他工作繼續執行；連線釋放後，新建立或恢復的 Agent 可以取得連線。較晚安裝和重新載入只作用於後續啟用，與 [Schedule 的掛載策略](../../../../packages/schedule/schedule/README.zh.md#use-this-package)一致。成功用戶端的瀏覽器工具與資源請求共享 Session 佇列；其他 Session 不能執行這些請求，也不能收到該伺服器的指導。

## 考慮過的替代方案

**統一瀏覽器動作 API。** Playwright、Chrome DevTools 與 Stagehand 的原生語義不同。目前沒有消費方要求可互換的動作方法，因此由提供者擁有工具以保留這些語義。

**提供者自有的啟動階段。** 現有的序列 `agent/created` 等待 Session 自有設定，並向建立方報告失敗。獨立維護任務會重複這份生命週期所有權。

**在提示片語裝期間發現。** 提示詞和工具收集需要已就緒的註冊。此時啟動發現要麼暴露不完整目錄，要麼要求再次收集；等待建立會在輪次開始前完成發現。

**多個 Session 共享一個瀏覽器。** 瀏覽器標籤頁、導航與登入狀態可以按 Session 隔離。共享它們會引入桌面整合通常無法避免的跨 Session 干擾。

**附加時建立全新 context。** 新瀏覽器 context 不繼承現有登入狀態。獨佔使用附加的瀏覽器可保留附加所支援的工作流。

**隨 Session 恢復瀏覽器 profile。** 持久瀏覽器狀態引入 Session 日誌之外的 profile 儲存與遷移所有權。啟動的狀態僅在即時執行時存續；外部擁有的瀏覽器保留自己的持久化策略。

**僅支援隔離啟動。** 使用者既需要乾淨的瀏覽器工作階段，也需要存取現有身份驗證狀態。設定顯式選擇所有權策略。

**委託瀏覽器 agent。** 這些實驗比較瀏覽器控制後端。將整個任務委託給另一規劃器會改變 DSH 對任務迴圈的控制。

**DSH 模型橋接。** 原生 Stagehand 設定使瀏覽器整合獨立於 DSH 模型請求適應和持久化。Session 模型選擇、憑證複用、底層推理捕捉與 Session 用量計量作為一個協調整合暫緩。

## 影響

提供者獨立演進自己的工具，而共享服務保持僅註冊名稱。三個提供者及其執行時輔助庫作為實驗性包釋出，但不在內建預設設定中啟用。瀏覽器包組不依賴實驗性執行時程式碼。

附加保留機制作用於單個提供者實例；它不協調獨立 DSH 程序或外部瀏覽器用戶端。Session 重放不包含瀏覽器狀態，取消不會撤銷已交付的瀏覽器操作。提供者 README 擁有引擎支援、模型要求與上游限制。
