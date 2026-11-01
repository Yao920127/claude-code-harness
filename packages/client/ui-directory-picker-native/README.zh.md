---
description: "原生目錄選擇表面：驅動本地 Desktop 或 Host 作業系統選擇器的瀏覽器半部，用於工作區目錄流程；供選擇拾取互動的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-native

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的原生目錄拾取表面：當工作區流程請求一個目錄時，一個無渲染的瀏覽器填充會在本地機器上開啟作業系統自帶的選擇器，並回報唯一結果——拾取的路徑、取消或失敗。它填充 `ui-workspace` 宣告的兩個目錄流程 slot，用一行 `cordis.yml` 組合出原生拾取互動的用戶端一側。當瀏覽器與 Host 執行在同一臺機器上時選擇它；程序內與遠端瀏覽器部署則需要 [`-browse`](../ui-directory-picker-browse/README.zh.md) 表面。

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

與 `ui-workspace` 及 Host 後端 [`dsh-host-directory-picker-native`](../../host/directory-picker-native/README.zh.md) 一起掛載本外掛；一行 `cordis.yml` 隨即組合出完整的原生拾取互動。當工作區新增或選擇器流程發起目錄請求時，使用者看到作業系統的資料夾對話方塊；拾取的路徑被工作區流程採納，取消則關閉對話方塊。

在本地 Electron 應用中，此流程使用 preload 提供的窄目錄選擇介面。取消和失敗都不會改用 Host 選擇器重試。普通 Web 使用 Host 呼叫；獨立的瀏覽組合始終列出 Host 目錄。

### 何時選擇

當瀏覽器與 Host 執行在同一臺機器上、作業系統對話方塊可以在那裡開啟時，選擇此表面。當瀏覽器為遠端或程序內、沒有本地選擇器時，選擇 [`-browse`](../ui-directory-picker-browse/README.zh.md) 表面。兩個表面填充相同的 slot，因此切換隻是組合改動，而非程式碼改動。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

兩個 slot 註冊經巢狀的 `ctx.slots.inject()` 呼叫作為一個事務性 effect 安裝，因為任一宣告條目都可能晚些啟用或替換其宣告。填充在每個上升沿 `open` 時只武裝一次，因此重渲染永遠不會再拉起一個選擇器；結算結果掛在 ref 上，讓答覆到達持有方最新的處理器。HMR（熱模組替換）導致填充被替換時，解除安裝會整體丟棄結算：wire 沒有按請求中止的機制，因此 Host 側選擇器會一直存活到被答覆，而它的答覆無處落實。node 半部是一個空 `apply`，讓外掛留在 Host 名單上。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當拾取面不夠用時閱讀以下頁面。它們從瀏覽器半部進入 Host 後端與它所填充的 slot。

- [dsh-host-directory-picker-native](../../host/directory-picker-native/README.zh.md)——本表面驅動的作業系統選擇器後端。
- [ui-workspace](../ui-workspace/README.zh.md)——宣告目錄流程 slot 並擁有拾取對話。
- [ui-directory-picker-browse](../ui-directory-picker-browse/README.zh.md)——面向遠端與程序內部署的應用內瀏覽替代方案。
- [Web 用戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器外掛行如何載入並註冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為目錄選擇器屬於瀏覽器介面；本包中的任何內容都不會進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了原生選擇器的適用時機。它們是目前包約束，不是通用選擇器對比或任務積壓。

- **無法取消已開啟的選擇器**——wire 沒有按請求中止的機制，因此已顯示在本地的選擇器無法從瀏覽器關閉；被丟棄的結算會被忽略。
- **僅限本地承載**——Electron 對話方塊選擇本地路徑；普通 Web 開啟 Host 選擇器。遠端瀏覽器與程序內部署使用 `-browse` 組合。平臺失敗經由持有方的可重試資料夾對話方塊呈現。
- **Linux 自動選擇**——缺少 zenity 或 kdialog 時，Host 即使在 Desktop 中也選擇瀏覽模式，不使用 Electron 對話方塊。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。外掛將一個無渲染 flow occupant 作為一個事務性 effect 註冊到兩個 workspace hole；HMR 安全性規範證明該 effect 的釋放行為，並且外掛在各次 pick 之間不保留狀態。
