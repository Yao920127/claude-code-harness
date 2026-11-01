---
description: "Web @file 與 @session 引用 source：候選項、排序，以及原子行內引用（統一的檔案/工作階段選取）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-reference

[English](README.md) | 中文

## 概述

Web 使用者需要從同一個 `@` 補全選單提及檔案、資料夾或工作階段時，可以使用 `dsh-client-ui-reference`。選單先列出檔案，再列出工作階段；其中一組無法載入時，另一組仍然可用。選擇檔案、資料夾或工作階段會插入帶穩定剪貼簿形式的原子引用；資料夾行還允許使用者在不關閉補全的情況下繼續下鑽。檔案行省略多餘的根目錄位置，工作階段行僅在工作區與目前工作區不同時顯示該工作區。工作階段 mention 會在捕捉模型上下文前接受驗證，而瀏覽候選項不會影響模型。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

只要組合掛載了本包且存在主機 `ctx.fileReferences` 提供者，該 source 即處於活動狀態。輸入 `@` 後跟一個未加引號的 token，會先看到檔案、再看到工作階段；開啟 `@"…` 則只搜尋檔案。候選列表是補全選單，不是搜尋結果頁：選一次、繼續輸入即可。

### 選擇後會插入什麼

選擇檔案會關閉補全，並顯示為帶檔案圖示與業務色檔名的原子行內引用。目錄行攜帶兩個動詞：選定 pick（點選行主體或 Enter）把資料夾本身解析為同類原子引用——資料夾圖示、帶尾斜槓的標籤、以規範 `@dir/` mention 為序列化形式；鑽取動作（Tab 或行尾 chevron）則保持帶資料夾圖示的可編輯路徑純文字，並讓選單在尾部斜槓處保持活躍，使用者可以繼續進入下一層。包含空白的路徑使用 `@"path with spaces"`，使用者顯式開啟的引號會繼續保留。

選擇工作階段會插入一個原子的行內引用，其隱藏 `ref` 與剪貼簿表示均為主機返回的規範 `@[label](dsh-session:…)` mention；可見形式為聊天氣泡圖示加工作階段標題。傳送會經 `session.prompt` 攜帶該 mention，session-reference 服務會在 `agent/pre-step` 驗證它並捕捉模型上下文。

### 失敗行為

某個候選領域不可用或失敗時，該領域不產生任何行，另一領域仍正常列出。工作階段引用準備失敗發生在提示詞接受後，並會終止該 agent 輪次。

點選輸入框中的檔案引用，可在右側欄預覽檔案目前的內容。帶引號路徑中的空格會保留，路徑按輸入框所屬 Session 解析。資料夾和 Session 引用保留原有的編輯行為。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

該 source 把候選編碼保留在註冊 effect 內部：`/client` 匯出介面只包含外掛主體（`apply`/`inject`）。

### 候選流程

對於未加引號的 token，瀏覽器會同時啟動 `fileReferences/list` 與 `sessionReferenceResolver/candidates` Remote 呼叫，再按檔案、目前 Session 的直接 subagent、其他 Session 的確定性順序排列。各行使用 resolver 的顯示標題；subagent 優先使用建立標籤，普通 Session 保持投影標題，並渲染在 locale 管理的分組標題下，不顯示重複的原始 `reference` source 標題。工作階段行用主機工作階段列表的 `updatedAt` 經該列表相同的相對時間分檔標註時間，因此同一個工作階段在兩處讀到的時長一致；列表中沒有的工作階段回落到候選自帶的建立時間。下鑽後的查詢會發布一條從工作區根目錄到目前目錄的麵包屑；每一節攜帶的下鑽載荷與資料夾行相同，因此「回到某一步」與「進入某一層」是同一個結果。

候選請求要求用戶端已持有該工作階段，並共用一個臨時的 `referenceCandidates` 引用。兩個發現呼叫都等待該工作階段首次歷史開啟成功；未持有工作階段或開啟失敗時，均不傳送 RPC。候選請求的取消訊號同時覆蓋歷史等待和兩個呼叫，查詢結束時釋放臨時引用。

### 序列化

檔案選擇把共享 `@path` 語法所定義的自然文字保留為隱藏的序列化與剪貼簿形式。工作階段選擇使用規範的 `@[label](dsh-session:…)` mention；序列化永遠不會根據可見標題重建身份。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋建議機制、引用 seam 與輸入流水線。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——該 source 註冊進的行內建議機制。
- [file-reference](../../context/file-reference/README.zh.md)——`@file` seam 及其提供者約定。
- [session-reference](../../context/session-reference/README.zh.md)——`@session` seam 與準備後快照的語義。
- [Web 輸入機器與 slash 流水線](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)——引用與命令如何共享輸入機器。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：透過主機擁有的提供者實作，本包的引用選擇把檔案指引與工作階段快照準備委託給它們。

#### KV Cache 影響

瀏覽候選項不會影響模型。選擇檔案或工作階段只會改變新使用者訊息的字尾，以及緊隨該訊息、由主機準備的工作階段引用上下文；目標工作階段更早的歷史保持不變。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明引用 source 何時幫不上忙；它們是目前包約束。

- **候選失敗有意保持靜默**：Remote 發現呼叫不可用或失敗時，該領域不產生候選行。工作階段引用準備失敗發生在提示詞接受後，並會終止該 agent 輪次。
- **瀏覽器側不掃描檔案**：Web 補全需要掛載主機 `ctx.fileReferences` 提供者；瀏覽器無法退回到自身檔案系統。
- **工作階段搜尋仍僅使用中繼資料**：發現流程透過 `ctx.sessionReferenceResolver` 篩選 session id、cwd 與以日誌為依據的最新標題；不搜尋訊息主體或完整 transcript。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛只註冊一個 slash source，HMR 測試覆蓋釋放；它不發出 Cordis 事件，也不持有跨外掛可變狀態。
