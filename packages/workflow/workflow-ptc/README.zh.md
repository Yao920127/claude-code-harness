---
description: "透過共享的沙箱化 PTC Node 程序執行時執行工作流編排，保留工作流掛鉤、subagent 路由和呼叫方擁有的取消能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-ptc

[English](README.md) | 中文

## 概述

在全新 Node 程序中按呼叫 Session 的檔案沙箱策略執行 JavaScript 工作流。腳本保留 `agent()`、`parallel()`、`pipeline()`、`phase()` 和 `log()` 掛鉤，委派的工作由 subagent 完成。同一個執行提供者服務 PTC 與工作流，包括需顯式啟用的 Ralph 迴圈。執行沒有整體經過時間截止；取消會停止受管程序並釋放子 agent。所選沙箱與子程序提供者決定強制能力和清理限制。

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

在提供 subagent、沙箱策略和 [Node PTC 執行時](../../ptc-runtime/ptc-runtime-node/README.zh.md)的組合中掛載本引擎。它為 `dsh-tool-workflow` 及顯式啟用時的 `dsh-tool-ralph` 提供工作流執行。Ralph 在已釋出預設組合中保持停用。引擎在載入時拒絕非 TypeScript 的 PTC 提供者。Python PTC 組合必須停用 `workflow-ptc`、`tool-workflow` 以及任何已啟用的 `tool-ralph` 條目。

### 最小設定

上述依賴可用後，掛載引擎及其面向模型的消費方：

```yaml
- name: '@deepseek-ai/dsh-workflow-ptc'
- name: '@deepseek-ai/dsh-tool-workflow'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `provider` | `spawn` | `agent()` 呼叫使用的主機側 subagent 提供者。 |
| `maxConcurrentAgents` | `0` | 並行 `agent()` 上限；`0` 根據可用 CPU 並行度解析。 |
| `maxTotalAgents` | `1000` | 一次執行最多啟動的 `agent()` 呼叫數。 |
| `maxItemsPerCall` | `4096` | 一次 `parallel()` 或 `pipeline()` 呼叫接受的條目數。 |
| `syncTimeoutMs` | `5000` | 腳本最初同步片段的 VM 超時時間，單位為毫秒。 |

負責執行的消費方可以為一次執行設定 `WorkflowStartRequest.subagentProvider` 並降低 `WorkflowStartRequest.maxTotalAgents`。腳本掛鉤不能更改這兩項選擇。程序堆、輸出、控制通訊和終止限制由 Node PTC 提供者負責；引擎不增加整體經過時間定時器。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-workflow-ptc)定義可接受的引擎欄位。

Node PTC 提供者的 `maxPendingCalls` 也限制工作流並行：子 agent 啟動、結果等待與資源釋放會佔用這些名額。進度批次至多再佔用一個名額。設定 `maxConcurrentAgents` 時應預留餘量。

### 結果與失敗

腳本支援頂層 `await`；`meta` 和 `args` 作為 JSON 資料傳入。每次 `agent()` 呼叫使用設定的 subagent 提供者及執行固定的父級。最終的無損 JSON 回傳值成為執行結果；普通子 agent 失敗使 `agent()` 以 `null` 兌現。

無效中繼資料、無法解析的正文、不可用的提供者路由或高於上限的單次執行上限，在執行釋出前被拒絕。執行期間，掛鉤誤用與超出協作式上限會使工作流失敗。程序失敗、所需約束不可用，以及超出 PTC 輸出或控制限制也會使執行失敗。

### 檔案策略與取消

引擎為 PTC 執行解析呼叫 Session 的常設檔案策略與 cwd。VM 保留文件說明的輔助 API，但它不是安全邊界：觸達 Node 的程式碼仍受所選 OS 檔案策略約束。程式可見的環境為空。檔案策略不限制網路存取。

工作流向 PTC 請求 `timeoutMs: null`。最初的 VM 片段仍受 `syncTimeoutMs` 限制，呼叫方的中止訊號仍然生效，包括外層工具的截止。取消立即中止 PTC 程序及待啟動或活躍的 subagent。呼叫方必須釋放每次執行並等待子 agent 清理；不另設工作流清理定時器。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

工作流引擎負責編排；PTC 提供者負責程序啟動、OS 約束、分幀傳輸與受管程序清理。

### 設計理念

一個自包含的 guest 程式在 PTC Node 程序中執行既有 VM 與工作流輔助函式。Host 繫結將該程式連線到 `ctx.subagents` 和工作流觀察器。引擎在執行啟動時捕捉執行時與 subagent 服務，因此已接受的執行在引擎解除安裝後仍保有依賴。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 引擎設定、請求驗證與執行建立 |
| [`src/host.ts`](src/host.ts) | PTC 執行、子 agent 歸屬、結算與資源釋放 |
| [`src/guest.ts`](src/guest.ts) | 基於 PTC Host 繫結的 guest 介面卡 |
| [`src/guest-source.ts`](src/guest-source.ts) | 自包含 guest 程式原始碼 |
| [`src/runtime.ts`](src/runtime.ts) | VM 求值、輔助函式約定與組合器 |
| [`src/realm.ts`](src/realm.ts) | 跨 VM realm 的無損 JSON 物化 |
| [`src/meta.ts`](src/meta.ts) | 中繼資料驗證與規範化 |
| — | 不釋出執行時不變式伴生入口；工作流服務負責事件配對，PTC 負責受管程序觀測。 |

### 值與子 agent 歸屬

guest 在 PTC 傳輸前將出站值物化為無損 JSON。特殊原型、函式、symbol、迴圈、稀疏陣列、非有限數與巢狀 `undefined` 被拒絕。子 agent 結果以 JSON 返回；同程序觀察事件保留自身的克隆和回呼異常隔離規則。

Host 分別跟蹤待完成的提供者啟動與已釋出子 agent。共享中止訊號關閉這兩條路徑；取消後才就緒的子 agent 會被釋放。每個已釋出子 agent 的資源釋放由所有清理路徑共享。PTC 停止程式後，進行中的 Host 繫結仍由工作流介面卡負責。

### 取消與結果

第一個被接受的終態擁有執行結果。取消立即停止程序，不等待 guest 確認。程序結算與子 agent 清理仍是兩項獨立義務；公開資源釋放操作等待兩者。既有工作流開始／結束配對與子 agent 生命週期投影保持不變。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

共享執行保證與工作流約定見以下參考。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——請求、結果和事件定義。
- [工作流服務](../workflow/README.zh.md)——呼叫方擁有的執行與清理。
- [Node PTC 執行時](../../ptc-runtime/ptc-runtime-node/README.zh.md)——檔案策略、程序限制與部署選擇。
- [workflow 工具](../tool-workflow/README.zh.md)——面向模型的腳本編排。
- [Ralph 工具](../tool-ralph/README.zh.md)——需顯式啟用的固定全新 agent 迭代。
- [工作流沙箱複用](../../../.agents/notes/implemented/architecture/2026-09-13-workflow-ptc-sandbox-reuse.zh.md)——執行歸屬與取捨。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什麼

腳本每次呼叫 `agent()`，都會把提示詞原樣傳送給 subagent 提供者，並附帶可選模型或結構化輸出 schema。每個子 agent 看到該提供者自己的上下文；phase 與 log 敘述只留在觀察器事件中。

#### Token 影響

每個子 agent 消耗自己的模型上下文。協作式並行、agent 總數與條目上限限制普通腳本的扇出；子 agent 歷史不會直接加入父級歷史。

#### KV Cache 影響

與父級請求快取及同級子 agent 相互獨立。每個子 agent 只能在自己的提供者、模型、提示詞和 schema 下複用逐位元組相同的字首。

### 父級工具結果（間接）

#### 模型看到什麼

工具消費方呈現最終 JSON 值與子 agent 數量，或工作流失敗。中間子 agent 輸出仍可供腳本使用。腳本解析、輔助函式誤用、子 agent 基礎設施失敗與 PTC 執行失敗會產生錯誤；普通子 agent 失敗產生 `null`，由腳本處理。

#### Token 影響

引擎不直接向父級增加 token。PTC 限制外層程式結果，工具消費方負責其面向模型的渲染與保留。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制界定工作流執行與清理。

- **檔案約束與清理繼承提供者限制**——Node PTC 與子程序提供者定義強制能力完整度和受管程序範圍。
- **工作流上限是協作式的**——輔助函式計數器限制普通腳本；它們不是 Host 強制的安全配額或後代 token 預算。
- **沒有整體經過時間截止**——執行可以持續到完成、失敗或取消。呼叫方截止仍然適用。
- **子 agent 清理遵循提供者約定**——介面卡等待資源釋放與待完成啟動，不另設放棄等待的定時器。
- **VM 不是安全邊界**——不提供的全域變數用於指導腳本作者；OS 策略約束觸達 Node 的程式碼。
- **跨 realm 錯誤在腳本內無法透過 `instanceof Error`**——根據 `name` 與 `code` 等穩定欄位分支。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
