---
description: "可選的按輪次 tmux 位置上下文，供啟用或調優 agent（智慧代理）的工作階段、window 與 pane 感知的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tmux-context

[English](README.md) | 中文

## 概述

`dsh-tmux-context` 讓模型識別其 agent 程序所在的 tmux 工作階段、window、pane 和 pane 樹佈局。它僅在位置發生變化時，於每輪的第一個步驟追加一條持久、帶來源的讀數。若終端只繼承了 tmux 環境變數，卻並未在所指名的 pane 中執行，則不新增任何內容；查詢失敗同樣不新增內容，也不會使該輪失敗。本包需主動啟用，且不包含在隨附的 Web 或無頭 profile 中。

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

當 agent 程序執行在 tmux 內、且模型需要知道其 window 與 pane 位置時，掛載此外掛。每條讀數都是持久歷史中額外的一條 user 角色訊息；位置未變化時不新增任何內容，因此長時工作階段累積很少。

### 模型能得到什麼

在 tmux 狀態發生變化的每一輪，模型會收到一條帶來源標記的上下文訊息，包含工作階段名稱、window 索引與名稱、pane 索引與 id、活動標誌，以及緊湊的 pane 樹佈局。讀數只發生在每輪的第一個步驟；輪次中途移動或縮放的 pane 會在下一輪反映。畫素尺寸有意省略，相鄰 pane 的可見內容從不採集。

### 設定

最小掛載無需任何設定。`refreshIntervalMs` 為正值時，會額外抑制距最近一次注入不足該毫秒數的注入；省略或設為 `0` 時，只要 tmux 狀態自上次注入以來發生變化就注入。

```yaml
- name: '@deepseek-ai/dsh-tmux-context'
  config:
    refreshIntervalMs: 60000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `refreshIntervalMs` | `0`（每個變化輪次） | 同一工作階段中兩次持久注入之間的最小毫秒數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tmux-context)是所有受支援欄位及其 JSDoc 的完整真源。

### 何時知道位置

只有當程序的控制終端與 pane 的 `#{pane_tty}` 一致時，才視為位於 tmux 中；從 tmux shell 啟動的終端（VS Code 整合終端、桌面啟動器）會繼承變數但不在 pane 內，因此被視為不在 tmux 中。`ctx.shell` 缺失、環境變數不存在或讀數格式非法時是空操作；執行器拒絕會被兜住並記錄為警告，而不會使該輪失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋外掛的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

外掛前置註冊一個 `agent/pre-step` 監聽器，僅在每輪的第一個步驟執行。需要注入時，它透過 `ctx.shell` 執行器服務執行一條只讀命令——部署方的沙箱與策略都會應用，外掛不擁有任何子程序程式碼。命令在輸出製表符分隔欄位前，會比較 `$TMUX_PANE` 的 `#{pane_tty}` 與本程序自身的控制終端，因此繼承的環境會被視為不在 tmux 中。外掛只在渲染出的狀態與上次注入不同時重新注入。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：第一步監聽器、shell 查詢、變化抑制、排程 |
| — | 不釋出執行時不變式伴生入口；每次讀取都是外部 tmux 狀態的單輪快照，工作階段沒有可檢查的跨事件關係；排程與格式由流水線測試負責。 |

### 主要流程

在每輪的第一個步驟，監聽器檢查注入是否到期，透過 `ctx.shell` 查詢位置，並把渲染狀態與該來源最近一次持久注入比較。變化抑制與間隔排程會掃描原始持久工作階段事件，因此排程可跨壓縮（compaction）與恢復的程序存續，無需程序內快取狀態；各工作階段獨立排程。下游在步驟前執行的監聽器拒絕或失敗時，該讀數不會被記錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。這些頁面從設計決策講到查詢所經由的執行器以及完整設定。

- [tmux 位置上下文決策記錄](../../../.agents/notes/archived/feature/2026-07-27-tmux-location-context.md)——基於 tty 的檢測與讀數形狀的設計理由。
- [shell 子系統](../../../docs/subsystems/shell.zh.md)——只讀查詢所經由的執行器服務。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tmux-context)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 準備期 tmux 位置

#### 模型看到的內容

在 tmux 狀態發生變化的每一輪，注入一條帶來源標記、含以下三行的上下文訊息。`<window-layout>` 是 tmux 緊湊的 pane 樹描述；pane 與 window 的畫素尺寸有意省略，相鄰 pane 的內容從不採集。

##### 變化輪次讀數

```markdown
tmux location (turn <turn>):
session <session>, window <index> "<name>", pane <index> <pane-id>
window active=<0|1>, pane active=<0|1>, layout <window-layout>
```

#### Token 影響

每條三行讀數會累積，直到壓縮將其遮蔽。位置未變化以及間隔抑制不會新增內容。

#### KV Cache 影響

僅追加；新增可見內容位於可複用的請求字首之後，不會使已有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 tmux 位置上下文何時不合適。它們是目前包約束。

- **僅第一個步驟**——輪次中途移動或縮放的 pane 會在下一輪反映，而非在步驟之間。
- **僅自身位置**——外掛從不採集相鄰 pane 的可見文字。
- **只有佈局，沒有尺寸**——省略 pane/window 畫素尺寸；僅報告佈局樹與活動標誌。
- **製表符分隔欄位**——若 tmux window 名稱包含字面兩字元序列 `\t`，會使讀數分割錯誤並作為非法讀數跳過；常規名稱不受影響。
- **基於 tty 的 pane 判定**——只有當程序的控制終端與 `$TMUX_PANE` 的 `#{pane_tty}` 一致時，才視為「位於 tmux 中」。這會有意排除從 tmux 祖先程序繼承 `$TMUX`／`$TMUX_PANE` 的終端（如 VS Code 整合終端）。`ps -o tty=` 屬於 POSIX；在其或 `#{pane_tty}` 不可用的環境中，該檢查即為空操作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
