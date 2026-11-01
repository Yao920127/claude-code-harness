---
description: "面向使用者與維護者的計劃模式說明：用於選擇、設定或排查帶部署引導、/plan 命令與經使用者評審退出的逐 agent（智慧代理）規劃功能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plan-mode

[English](README.md) | 中文

## 概述

計劃模式要求 agent 先探索和設計再執行，然後把完成的計劃呈交你批准。用 `/plan` 進入，並可附帶一條訊息或按順序排列的圖片與檔案附件；用 `/plan off` 離開，批准評審以繼續執行，或回饋意見以要求繼續規劃。部署方定義的引導控制規劃行為，但每個工具仍然可用，因此請用沙箱模式與審批提示施加強制限制。啟用狀態會在工作階段恢復和 fork 後保留。當你希望 agent 行動前先提交一份經評審的計劃時，選擇計劃模式。

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

計劃模式啟用時，agent 會按你的指令行事，並先呈交計劃供評審，而不是立即執行。常用路徑：設定引導文字，用 `/plan` 進入計劃模式，agent 呼叫 `exit_plan_mode` 時評審完成的計劃。

### 何時選擇

當希望 agent 先探索和設計再執行、並且想先批准計劃時，選擇計劃模式。它不限制 agent：每個工具仍可呼叫，因此需要強制限制時請使用沙箱模式與審批提示。當 agent 應立即按你的請求行事、無需規劃階段時，跳過它。

### 最小設定

唯一必需的設定是 agent 規劃期間遵循的引導文字；新增任何其他設定都會在載入時失敗。

```yaml
- name: '@deepseek-ai/dsh-plan-mode'
  config:
    section: |
      You are in plan mode. Explore and design before presenting the complete
      plan through exit_plan_mode.
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `section` | 必填 | 計劃模式啟用時作為 `plan:policy` 提示詞段落渲染的引導 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-plan-mode)完整列出了所有受支援的欄位及其 JSDoc。

<a id="model-and-human-interactions"></a>
### 進入與離開計劃模式

輸入 `/plan` 進入計劃模式，或輸入 `/plan <message>` 連同一條指令一起進入——該訊息會成為你在計劃引導下的下一條請求。輸入 `/plan off` 直接離開計劃模式；它還會取消尚未生效的計劃模式進入。

你可以在 `/plan` 訊息中附帶圖片與通用檔案，它們按選擇順序隨指令一起提交。帶附件的 `/plan off` 會在模式變更前被拒絕，因此草稿和附件卡仍可繼續使用。`/plan` 命令在支援斜槓命令的介面中可用，例如 Web 用戶端。

### 經評審的退出

agent 完成計劃後，會以 markdown 形式、從標題開頭書寫計劃並呼叫 `exit_plan_mode`。你評審該計劃的原文，選擇 `Approve` 離開計劃模式，或選擇 `Keep planning` 帶回饋把 agent 送回去。

選擇 `Keep planning`（可附自由文字回饋）會讓 agent 回去修訂計劃；關閉評審改為發言，則告知 agent 等待你的下一條訊息。若沒有可用的互動評審，`exit_plan_mode` 無法執行，你仍可用 `/plan off` 離開計劃模式。

### 觀察計劃狀態

介面可以顯示計劃模式是否啟用，以及你請求的模式變更是否仍在等待生效。該狀態在每個標籤頁中一致，並能在重新啟動後保留。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋本包背後的設計決策並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

計劃模式是產品包，而不是能力 seam：沒有可替換的後端，因此狀態、引導、命令與退出工具都集中在一處。持久化方案採用單一僅記日誌、整值替換的事件，絕不使用即時映像，因此恢復、fork 與壓縮（compaction）都透過摺疊日誌復原它。引導是軟性層——本包註冊一個提示詞段落和一個工具，透過文字而非過濾能力來約束。

### 持久狀態與步驟邊界追加

本包持久化一條僅記日誌、整值替換的事件 `plan/mode`，最後一條已記錄值即為狀態。沒有輪次開啟時，模式變更會立即追加；輪次開啟期間，它保持待生效，直到下一個被接受的輪內 pre-step——agent 執行時唯一的追加點——且追加失敗不能阻塞輪次。`set`/`get` 服務方法及其確切返回狀態見 [`src/index.ts`](src/index.ts)，並讀取已註冊的 `plan` 投影；註冊表或 key 缺失時，第一次依賴它們的存取會顯式失敗。

### `/plan` 命令

命令子外掛只在組合了命令服務時啟用。它把不帶參數的 `/plan` 對映為啟用，把恰好為 `off` 的參數對映為未啟用且不傳送模型輸入，把其他非空參數對映為啟用並把去除首尾空白的文字透過 `agent.steer()` 作為下一步驟的普通已記錄使用者訊息提交。已准入的圖片塊與檔案塊按選擇順序進入這條訊息；帶附件的 `/plan off` 會在模式變更前失敗。命令以外的入口可以直接驅動 `ctx.planMode`；確切的分支處理見 [`src/index.ts`](src/index.ts)。

### 退出工具

`exit_plan_mode` 在計劃模式未啟用時仍保持註冊，因此進入或離開只改變提示詞段落，絕不改變請求的工具目錄。經批准的評審會記錄一個靜默的待生效退出，由下一個被接受的輪內 pre-step 追加，目前這批工具呼叫剩餘部分仍保留計劃引導。缺少使用者互動通道，或評審等待期間服務過載，呼叫都會以拒絕方式失敗，`/plan off` 仍是手動退路。

### 工作階段投影單元

組合了 `ctx.sessionProjections` 時，本包透過可選注入註冊 `plan` 單元。該單元把已記錄的 `/plan` 命令執行轉為候選目標，在 `plan/mode` 上提交已記錄狀態，併為 `view` 推導 `{ active, pending }`，其中 `pending` 僅在未結算或已成功的選擇與已記錄狀態不同時為 true——這是僅憑日誌即可恢復的純回放量。key 由 [`src/types.ts`](src/types.ts) 的宣告合併加入 `SessionProjectionMap`；框架負責驅動該單元，解除安裝外掛 fiber 會登出該 key。plan-mode 讀取要求該單元與 `turnBoundary` 單元存在；註冊表或任一 key 缺失時都會顯式失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、`ctx.planMode` 服務、`plan:policy` 段落、`/plan` 命令、`exit_plan_mode` 工具 |
| [`src/types.ts`](src/types.ts) | `plan` 投影 key 宣告與 `PlanProjection` 協定值 |
| [`src/client.ts`](src/client.ts) | types 出口的用戶端名稱空間再匯出 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：驗證 `plan/mode` 載荷結構 |

審批意圖攜帶發起工具呼叫的標識，讓 Web 用戶端在審批關閉後重新開啟同一份計劃。完整 Markdown 保留在已有的原生呼叫或 PTC dispatch 日誌中。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從子系統語義逐步進入生成的目錄與設計決策。

- [計劃模式子系統參考](../../../docs/subsystems/plan.zh.md)——計劃模式的行為、設定與退出工具的約定。
- [plan/ 包對映](../README.zh.md)——本組及其唯一的包。
- [`exit_plan_mode` 工具目錄條目](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode)——模型收到的確切 schema。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-plan-mode)——每個受支援設定欄位及其含義。
- [plan 專用協作狀態](../../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.zh.md)——計劃模式背後的設計決策。

-----

<a id="model-experience"></a>
## 模型體驗

### Plan 策略系統提示詞

#### 模型看到什麼

計劃模式啟用時，模型會在 first-party 提示詞順序 500 處看到部署方提供的原樣 `section` 文字；未啟用模式不貢獻任何文字。

##### 設定範例

```markdown
You are in plan mode. Explore and design before presenting the complete plan through exit_plan_mode.
```

#### Token 影響

未啟用模式不增加 token；啟用模式把已設定的段落加入每個請求。

#### KV Cache 影響

該段落在計劃模式內保持穩定，但進入或離開會從 first-party 順序 500 起改變系統提示詞。

### 人類命令

#### 模型看到什麼

`/plan`、`/plan off` 及其終端結果留在模型歷史之外。除恰好為 `off` 以外的非空字尾會在選擇計劃模式後，透過 `agent.steer()` 成為一條使用者訊息：已准入的圖片塊與檔案塊按選擇順序排列，之後是去除首尾空白的文字塊。不帶參數的 `/plan` 若帶有已准入附件，會透過 `agent.steer()` 提交一條只含這些塊的使用者訊息。計劃模式已啟用時選擇 `/plan off`，只會在最後記錄的請求頭描述了計劃模式的情況下追加標準的已記錄使用者切換通知；取消待生效條目不貢獻通知，因為沒有請求觀測到它。

#### Token 影響

可選訊息的歷史 token 成本與單獨提交該內容相同。不帶附件的 `/plan` 與 `/plan off` 不增加 token；帶附件的 `/plan` 產生常規圖片與檔案控制代碼成本。一次帶有通知的啟用狀態退出會追加一條簡短且會保留的切換通知。

#### KV Cache 影響

使用者塊是僅追加的對話增長。進入或離開計劃模式會改變更早的策略段落；用於說明退出的通知會追加在可複用請求字首之後。

### 退出工具 schema 與評審互動

#### 模型看到什麼

[`exit_plan_mode` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode) 在兩種狀態下均可用；在計劃模式之外執行會失敗，而計劃模式內經批准的評審返回規範的 `{ approved: true }` 值，並渲染既有的確認文字。拒絕仍是攜帶評審回饋的失敗呼叫，放棄評審則是一次指明使用者接手的失敗呼叫。

#### Token 影響

穩定 schema 的成本取決於 ToolRuntime 模式，每次傳入的 plan 參數與評審結果都會保留在對話歷史中。

#### KV Cache 影響

模式轉換不改變工具目錄；plan 參數與評審結果按常規方式擴充功能對話。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述計劃模式在哪些情況下不符合你的預期，或需要額外的注意。它們是目前包約束，不是路線圖。

- **引導而非強制**——計劃模式只透過文字約束；需要強制限制的部署要分別設定沙箱模式與審批策略。
- **待生效選擇只存在於程序內**——某輪最後一個被接受的 pre-step 之後作出的選擇，若程序在另一個被接受的輪內 pre-step 之前退出就會丟失；UI 必須重新應用它。
- **沒有建立時 plan 選項**——fork 的 agent 繼承已記錄的計劃狀態，新 spawn 的 agent 則從未啟用開始。
- **存活的子級無法開啟評審**——由另一個存活 agent 所有的子級呼叫 `exit_plan_mode` 會失敗，並被要求把尚未解決的決策包含進最終結果；僅有持久化 fork 譜系並不能阻止恢復為執行時根的工作階段開啟該評審。
- **只有一個專用評審渲染器**——只有 Web UI 具備 `plan-review` 呈現；其他互動提供者透過其通用選項流程呈現同一請求。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放的設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：第二種協作模式

設計說明拒絕了通用命名模式註冊表，因為產品只交付了 `plan`；未來的協作狀態只應在出現兩個具體案例後建立共享 seam，任何抽取都必須保持 `plan/mode` 的僅記日誌摺疊、邊界追加與經評審的退出不變。

</details>
