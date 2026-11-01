---
description: "Web GUI 的輸入觸發流水線：游標處的 / 與 @ 檢測、分組候選選單，以及把 pick 路由到已註冊 source；供斜槓命令與引用的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-input-trigger

[English](README.md) | 中文

## 概述

當使用者在 Web GUI 的游標處鍵入 `/` 或 `@` 時，本包會為斜槓命令、檔案引用和工作階段引用開啟分組選單。它支援鍵盤和指標選擇，包括下鑽候選項，以及在目前選區上開啟單個候選分組的 launcher。pick 會觸發命令流程或插入引用，具體結果由消費方輸入表面處理。本包隻影響瀏覽器呈現；它既不組裝也不傳送模型請求。

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

與 `ui-conversation` 一起掛載本外掛；使用者在游標處鍵入觸發器時，選單隨即出現在輸入浮層中。分組候選項渲染在標題行之下，或渲染在 source 附加在自己各行上的小節標題之下；pick 路由到 source，消費方表面應用其結果——斜槓命令開啟其彈出視窗或執行，引用插入其行內 token。選單圖示和導航箭頭使用 `--dsw-alias-menu-icon` 文字色。每一行顯示圖示、標題（候選項的 `label`，沒有 label 時顯示 `name`）、當標題不是 `name` 的另一種大小寫寫法時跟在標題後的 `name` 別名，以及右對齊的說明；查詢同時匹配 name 與 label。

### 鍵盤與滑鼠

選單開啟期間 composer 表面保持焦點：行在 mousedown 時完成 pick，高亮由 `aria-activedescendant` 承載，指標落在選單與所在 composer 卡片之外即關閉選單。從 launcher 按鈕開啟選單時會先把鍵盤還給編輯器再開選單，因此方向鍵在那裡同樣可用。空格與回車裁決按註冊序輪詢可選的 `matchSpace`／`matchEnter` 掛鉤；第一個非 undefined 的應答勝出，source 也可以拒絕它無法整體消費的提交。Tab 會作用於高亮補全項：宣告 `drill: true` 的候選項以 `action: 'drill'` 進入 `onPick`，普通候選項則以 `action: 'pick'` 完成選定；沒有高亮項時 Tab 原樣放行，原生焦點遍歷不受影響。Escape 與 Shift+Tab 則是離開選單——它們從不選定，因此退出動作不會消耗或改寫草稿。被關閉的選單保持關閉：同一個 token 以同一查詢重新 track 時選單不會重開——因此指標關閉之後恢復游標、或已選定的命令關閉它自己開啟的介面，都不會把選單召回來；輸入新的查詢或移到另一個 token 才會重新武裝。可下鑽行尾的 chevron 向指標使用者提供同一個動詞。實作可選 `header` 掛鉤的 source 還會在其分組上方釋出麵包屑：流水線在每次命中時用即時查詢、以及該查詢由下鑽還是由鍵入產生這一事實重新詢問它，點選麵包屑經 `onPick` 以 `action: 'drill'` 回到該 source。

來源可以實作 `openReference(session, reference)`，開啟草稿引用而不提交。來源可以先接受預覽請求，再非同步載入目錄。標籤按來源名稱路由；可編輯文字按來源目前的詞表路由。返回 `false`、來源缺失或控制器已釋放時，保留編輯器原有的手勢處理。

-----

<a id="understand-the-implementation"></a>
## 理解實作

選單採用共享 `MenuSurface` 材質，包括用於背景模糊的 macOS 底層；自定義內容遵循[選單規則](../../../docs/web-styling.zh.md#component-rules)。

<details>
<summary>實作細節——點選展開</summary>

`src/core/` 是純核心——觸發器檢測、選單歸約與精確匹配，零 React／DOM／cordis——而 `src/client/service.ts` 把核心接到選單快照儲存、逐 hit 候選拉取（以 generation 把關、被後繼請求透過 `AbortSignal` 取代、失敗的 source 靜默丟棄並留一條 console 記錄）與 pick 路徑上。每個工作階段 scope 各解析一個 `InputTriggerController`（`sessionOf`）；對話接線層在控制器上驅動 `track`／`arbitrate`／`onSpace`／`adjudicate`。source 會被預熱進它能觸達的每個工作階段控制器；`lexicon` 名錄在預熱後變化的 source 實作 `subscribeLexicon`，控制器每收到通知就重拉。`MenuView` 自注冊進 `conversation.input.overlay`（列表類，工作階段 scope），選單關閉期間渲染 null。`listbox` 角色落在其滾動視口而非有界外殼上，因為麵包屑頭部不是選項，listbox 也不得承載它；麵包屑走選單儲存之外的獨立快照儲存，凍結的歸約器因此對它一無所知。overlay 的 SlotMap 合併放在本包，因為依賴方向（ui-conversation → ui-input-trigger）不允許反向的型別匯入。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當觸發流水線不夠用時閱讀以下頁面。它們從流水線延伸到註冊進其中的 source，以及擁有輸入的工作階段外殼。

- [ui-commands](../ui-commands/README.zh.md)——把 `/` 命令 source 註冊進本流水線並擁有命令彈出視窗外殼。
- [ui-reference](../ui-reference/README.zh.md)——註冊 `@` 檔案與工作階段引用 source。
- [ui-conversation](../ui-conversation/README.zh.md)——宣告輸入浮層 slot 並擁有 composer 與輸入狀態機。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無。觸發流水線只是瀏覽器呈現——pick 產出命令宣告與引用插入，其模型可見後果由消費方主機與輸入狀態機包負責。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前觸發流水線。它們是目前包約束，不是通用選單對比或任務積壓。

- **只有全域 source 層**——工作階段 scope 的 source 註冊（逐工作階段遮蔽）已有設計但未啟用；臺帳記錄著觸發條件，即真實的逐工作階段 source 需求。
- **overlay 的 SlotMap 合併歸屬與 slot 所有權分離**：唯一的 `conversation.input.overlay` 合併放在本包，而 ui-conversation 擁有其錨點、children 宣告與生命週期，因為依賴方向是 ui-conversation → ui-input-trigger。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。觸發流水線是瀏覽器側純核心（檢測／歸約／匹配）加一個註冊表，其資源釋放已由 HMR（熱模組替換）安全性測試證明；它不發出 Cordis 事件，也不持有跨外掛可變狀態。
