# Agent Note: 憑證記錄與授權 flow

Status: implemented

[English](2026-08-13-credential-records-and-authorization-flows.md) | 中文

## Problem

harness 的憑證平面只能表達一種機密：藏在某個環境變數名之後的值。`CredentialRef` 是一個 POSIX 識別符號，解析時按程序環境、受管檔案、`.env` 退回分層，每個消費方按操作讀取。這恰好覆蓋 API key，此外什麼都不覆蓋。

有些憑證不是"可以讓部署方去存"的值。它們是被**取得**的——與人對話：對方開啟頁面、批准帳號、把碼粘回來——產出的是一份帶 refresh 半邊、會在使用者背後輪換的 token 文件。pi-ai 直接建模了這一點（`Credential = ApiKeyCredential | OAuthCredential`、由應用擁有的 `CredentialStore`、`Models.login()`），而 harness 無處安放其中任何一項。`PiAiAdapter` 用不帶參數的 `createModels()` 建構集合，於是那個 store 就是 pi-ai 的記憶體預設實作：每次啟動為空，每次設定變更被丟棄。只以 OAuth 認證的 `openai-codex` 因此每個請求都以 `Provider is not configured` 失敗——[被目錄withheld](../../archived/bug-fix/2026-08-13-oauth-only-providers-withheld.md) 作為釋出前修復，它移除了錯誤的供給，但沒有補上能力。

同一處缺失還帶來另外兩個缺口。提供者自帶的憑證發現是對著裸程序環境跑的，因此憑證 seam 保管的金鑰對它不可見，本地憑證檔案更是從未被查詢過。而登入沒有任何介面可以發起，因為 harness 裡沒有任何東西能代替外掛向人發問。

## Decision

三個 seam，各自擁有一個問題；所有 pi-ai 概念都藏在 `llm-pi-ai` 內部的介面卡背後。

**`dsh-credentials` 長出第二個鍵空間。** `CredentialRef` 回答*這個環境變數名背後是什麼*；`CredentialKey` 回答*這個外掛為這個 id 持有什麼憑證*。記錄聯合體是 `{ kind: 'api-key', key?, env? } | { kind: 'grant', payload }`——api-key 那半是結構化的，因為 seam 能描述它；grant 那半是不透明的，因為擁有 token 格式的庫應當繼續擁有它。對 payload 的唯一約束是它能原樣透過一次 JSON 往返，讀寫兩個方向都會驗證。

鍵的形式是 `<scope>/<id>`，其中 scope 是**擁有該記錄的外掛的註冊名**，不是提供者名。使用者知道的是 `openai-codex`；究竟哪個 adapter 家族為記錄裡的位元組負責，恰恰是裸提供者名會丟掉的資訊。服務同一個提供者名的兩個外掛會互相讀到對方的 payload，已解除安裝外掛留下的記錄也無法與仍在使用的區分開。`/` 同時讓兩種文法互斥，兩個鍵空間因此不可能相撞。這以"同一個 provider 路由只由一個 adapter 註冊"為前提，而 LLM 註冊表本就強制了這一點。

記錄不分層。授權 grant 沒有任何"環境"可供讀取，因此記錄是否存在就是全部事實，管轄引用的空值規則在此不適用：一條既無 key 也無 env 的 `api-key` 記錄，陳述的是其擁有者確認了環境認證可用，這屬於已設定。

**`dsh-authorization` 擁有對話，從不擁有協定。** 知道如何取得自己那份憑證的外掛，以該 flow 寫入的 `CredentialKey` 註冊。seam 對每個鍵同時只跑一次嘗試，路由一套中立的 notice/prompt 詞彙，然後結算。第二種授權協定以另一個 flow 的形式到來，而不是另一個 seam；能渲染一個 flow 的介面就能渲染全部 flow。

兩個選擇承擔了主要分量：

- **寫入由 flow 擁有。** `run()` 返回即表示記錄已透過 `ctx.credentials` 提交；seam 核實的是本次嘗試期間觀察到的提交——只看記錄存在與否，會讓重新授權把陳舊記錄冒充成新鮮的——並拒絕返回時沒提交記錄的 flow。正是這一點讓 `Models.login()`——它把持久化當作登入的一部分，經由 store 介面卡完成——保持為唯一寫入方，而不是把憑證複製出來再寫第二遍。
- **互動隨請求傳入，而非註冊表。** 發起授權的一方才是能與人對話的一方，因此提示恰好抵達發問的那個頁面，無頭呼叫方傳入一個直接拒絕的互動實作，也不存在"環境提供者缺席"或"該歸兩個已開啟標籤頁中哪一個"的問題。

**三處翻譯全都留在 `llm-pi-ai`。** `credentialStoreFrom` 把 pi-ai 的 `CredentialStore` 對映到記錄；`authContextFrom` 先查憑證 seam 再查啟動環境來回答 pi-ai 的環境提問，檔案存在性則按主機程序的檔案系統判斷；`registerPiAiFlows` 把 pi-ai 的 `AuthEvent`/`AuthPrompt` 重述為中立詞彙並執行 `Models.login()`。每個集合都用前兩者建構，正是這一點讓已登入的提供者在設定變更導致集合重建之後仍然處於登入狀態。有了行得通的姿態之後，目錄不再扣留僅 OAuth 的路由，`openai-codex` 重新被提供。

憑證平面仍是可選的，正如它在引用解析上一貫如此。沒有憑證服務時讀取回答"未儲存"，因為這樣的組合確實不持有任何憑證；寫入則指名拒絕，因為一次 grant 憑空蒸發的登入會先報告成功、再讓每個請求失敗。flow 註冊透過 `ctx.inject` 限定在授權 seam 之下，因此 headless 或 ACP 組合掛載後沒有登入能力，其餘一切不變。

### seam 底下需要的兩處機制

`withFileLock` 接受按呼叫宣告的等待上限。pi-ai 在 `credentials.modify()` **內部**執行 OAuth 重新整理，因此記錄寫入路徑要跨越一次網路往返持鎖；2 秒的預設值是按"渲染並 rename"的量級選的，會讓該文件的每一個其他寫入方失敗。重試節奏保持固定——那是協定常數——而等待時長按爭用方可能遇到的最長持鎖方來定：refs 與 records 共享同一份檔案、同一把鎖，因此該文件的每一個寫入方（`DOCUMENT_LOCK_WAIT_MS`，含引用寫入與記錄刪除）都要等得起一次 OAuth 重新整理，而不只是執行重新整理的那個 mutation。

seam 的邊緣與寫入路徑同一紀律。prompt 被拒是結果而非故障——互動實作以 `AuthorizationDeclinedError` 拒絕，嘗試以 `cancelled` 結算；渲染不了 notice 的介面只丟那條 notice、絕不拖垮 flow；`authorization/settled` 按 credentials seam 的條款以遏制方式分發監聽器故障。儲存側，api-key 記錄在渲染前先行准入（`parseRecord` 下次啟動會拒絕的，寫入時就拒絕），`llm-pi-ai` 在定址記錄前先問 `isCredentialKeySegment`，任意手寫路由鍵讀作「沒有儲存任何東西」，而不是在解析途中拋錯。

撤銷會結算一次嘗試，無論其 flow 是否回應訊號。flow 本應在訊號觸發時停止，但不停止的那個會把鍵佔到程序結束，而被卡住的鍵從外部看與忙碌中的鍵無法區分。被遺棄的執行體聽任其自行結束。

## Alternatives considered

- **把 pi-ai 的 `CredentialStore` 形狀直接放進 seam。** 那是行得通且已經設計好的形狀。它同時把 `api_key`/`oauth` 定為世上僅有的兩種憑證類別，並以 provider id 為鍵，也就是上文那種所有權丟失；第二個 adapter 家族將不得不假裝自己是 pi-ai 才能參與。記錄聯合體刻意只在兩處更抽象一步——鍵，以及 grant 的不透明性。
- **在 `user-questions` 旁再建一個專用登入互動 seam。** 授權提示看起來就像問題，複用 `ctx.userQuestions` 很有誘惑力。但那個 seam 是為"模型的工具呼叫代表 agent 暫停"而建的：它驗證呼叫方 agent、拒絕被委派的呼叫方、只有一個環境 UI 提供者。授權提示沒有 agent，必須抵達發起它的設定頁面，還可能被瀏覽器回呼贏得競速後按單個提示撤下。詞彙重疊，生命週期不重疊。
- **把 `~/.codex/auth.json` 讀進一個 store。** 這能讓 Codex 在不做上述任何事的情況下工作，重新整理也由 pi-ai 負責。它同時為了一個提供者把 harness 綁死在另一個工具的私有檔案格式上，且其餘所有登入仍然沒有著落。
- **讓第二次 `begin()` 併入已在執行的嘗試。** 比拒絕更友好，直到兩個人在回答同一個 flow 的問題為止。以 entry 上的 `inFlight` 配合拒絕，介面得以停用按鈕，而不是靠報錯才發現狀態。
- **把"僅 OAuth 則扣留"當安全網保留。** 它現在會藏起一個能用的提供者。該判定被刪除而不是留成惰性程式碼；`docs/subsystems/credentials.md` 與包 README 承載了取代它的內容。

## Consequences

`.credentials.yaml` 增加了版本與兩個分割槽。啟動時會把能精確識別的釋出前扁平佈局原地升級——全字串的扁平 mapping 在寫鎖下逐字下沉到 `refs:` 之下——因為早期內測建置經模型頁面存下的金鑰必須在佈局變更後繼續可用，不能要求手工編輯，也不能讓模型請求失敗。識別器無法證明自己理解的扁平形態仍被指名拒絕，遷移辦法寫在報錯資訊裡；解析器本身始終只讀一種佈局，遷移步驟將隨釋出前立場在首個正式版本時移除。儲存庫中所有寫扁平文件的 fixture 都已改寫；llm 各套件的 fixture 被記錄改動本身漏掉了，在此補上。

`openai-codex` 回到提供者選擇器與 Models 頁目錄。全部 38 個已安裝提供者都提供登入入口：31 個經 pi-ai 自己的提示收取金鑰，6 個在此之外還提供訂閱登入，Codex 只提供訂閱登入。

尚未包含的是介面：把 notice 與 prompt 送到瀏覽器的 wire 契約，以及 Models 頁上發起登入的控制元件。在那之前，flow 只能在程序內觸達，部署方仍然透過在設定表單裡輸入金鑰來設定。

有兩項限制記在包 README 裡而非就地修復。一次嘗試不可持久，登入途中重新整理頁面會丟棄它。登出即 `deleteRecord`，它只在本地遺忘而不通知簽發方；需要伺服器端吊銷的提供者無處宣告這一點。

## Testing

seam 自己的套件釘住它擁有的生命週期：單飛的拒絕與釋放、flow 啟動前與進行中的撤銷、一個忽略自身訊號的 flow、提交核實，以及包含"呼叫方看到的是丟擲錯誤"那種 `failed` 情形的結算事件。invariant companion 釘住"已結算的鍵就是空閒的鍵"，因為被卡住的鍵否則不可見。

`llm-pi-ai` 針對一份真實的 `$DSH_HOME` 文件覆蓋三處翻譯——逐欄位的 api-key 憑證、連 refresh 半邊一起原樣儲存的 OAuth 憑證、按 scope 跳過的他外掛記錄，以及沒有憑證服務時的寫入拒絕——外加每一個 `AuthEvent` 與 `AuthPrompt` 成員的重述；`Models.login()` 在集合邊界處被 mock，因為真實登入會開啟瀏覽器。兩個真實組合測試分別在掛載與不掛載授權 seam 的情況下啟動外掛。

`models-settings` 與 `onboarding-usable-provider` 兩條 web e2e golden 恰好收回了被扣留時失去的那一行 `openai-codex` 選項——這是本決策記錄的唯一裝配後應用差異，因為 Models 頁還沒有可錄製的登入控制元件。
