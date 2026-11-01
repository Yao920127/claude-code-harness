---
description: "編輯前讀取的檔案系統策略外掛：面向選擇或排查受防護寫入/編輯行為的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-observation-policy

[English](README.md) | 中文

## 概述

`dsh-fs-observation-policy` 要求 agent（智慧代理）先讀取檔案，檔案系統工具才可覆蓋或編輯它。如果檔案自讀取後發生變化，它也會拒絕變更，並清楚提示重新讀取後重試。讀取缺失路徑會授權帶防護的建立，同時仍防止覆蓋並行建立的檔案。需要編輯前讀取安全性的部署請選擇它；由於觀察記錄不持久化，恢復的工作階段必須重新讀取目標。

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

當部署希望模型在覆蓋或編輯檔案之前先讀取該檔案時，把本外掛與 `ctx.fs` 後端及 `dsh-tool-fs` 工具一起載入。外掛無需設定，也不注入任何服務；它只監聽工具分派的 `fs/*` 事件。

### 最小組合

先載入後端，再載入本外掛，最後載入工具。策略監聽器應當是 `fs/*` 意圖 slot 上第一個註冊的決策器。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-fs'
```

### 對模型而言的變化

掛載策略後，`write` 可以建立新檔案，但拒絕覆蓋工作階段未讀取過的現有檔案；`edit` 要求先讀取目標；自讀取以來發生變化（包括缺失）的檔案以 `FS_STALE_VERSION` 失敗。缺失也會被記錄：讀取缺失檔案會把它標記為確認缺失，因此隨後的 `write` 可以透過防護建立流程重新建立它。工作階段恢復後不攜帶任何已觀察狀態，因此必須重新讀取檔案，防護變更才能再次成功。

### 失敗與恢復

沒有先前觀測的編輯以程式碼 `FS_NOT_OBSERVED` 和策略原因 `edit requires reading "<path>" first` 失敗；編輯被觀測為缺失的目標以 `FS_NOT_FOUND` 失敗。工具把策略和提供者的未讀失敗統一為 `cannot modify "<path>": file has not been read — read the file, then retry`，同時保留錯誤碼和原始原因。在外部刪除的檔案上遵循該恢復指令會記錄缺失，因此下一次防護寫入可以重新建立它，而不會覆蓋並行建立者。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋策略外掛背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

外掛建立在兩個想法之上：

- **事件門禁，而非方法服務。** 外掛只透過 `fs/*` 事件影響外部世界，因此不註冊 `ctx.fsPolicy` 服務，也沒有公開方法。移除它不會在服務注入邊界破壞 `dsh-tool-fs`——工具會直接落到裸提供者。
- **已觀察狀態是先前觀察記錄。** 一張以所有者為弱鍵、記錄各目標的對映表持有三種邏輯狀態——未見、確認缺失、存在於某個版本。外掛本身不執行任何檔案系統 I/O；它把記錄的狀態轉換為提供者的可選防護，由提供者執行原子新鮮度檢查。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 三個 `fs/*` 監聽器與已觀察狀態門禁 |
| [`src/types.ts`](src/types.ts) | 不透明事件參與者形態，從中派生所有者工作階段 |

### 決策流程

`fs/write-intent` 把未見或確認缺失解析為 `{ kind: 'createIfAbsent' }`，把已觀測存在解析為 `{ kind: 'replaceIfVersion', version: vObserved }`。`fs/edit-intent` 以 `FS_NOT_OBSERVED` 拒絕未見目標，以 `FS_NOT_FOUND` 拒絕確認缺失的目標，否則提供觀察到的版本作為比較並交換的基礎。`fs/observed` 為該所有者與目標記錄 `{ kind: 'present', version }` 或 `{ kind: 'absent' }`——同步、只有副作用的 `WeakMap.set`，因為成功的變更已經提交。

### 單 slot、先到者勝

每個意圖 slot 只容納一個決策器：本外掛會完整決策，絕不呼叫 `next()`。slot 按註冊順序先到者勝——由本外掛擁有 slot 只是預設部署約定，不是事件強制的不變式。分層權限、審計或沙箱攔截屬於 `tools/execute` waterfall（瀑布式事件）。

### 生命週期

已觀察狀態在外掛 dispose（資源釋放）時丟棄，以確保 HMR（熱模組替換）安全，且絕不跨工作階段持久化——恢復的工作階段從無觀察狀態開始。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從策略逐步進入它所組合的約定、工具與後端。

- [檔案系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供者約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——`ctx.fs` 約定與 `fs/*` 事件詞彙。
- [tool-fs](../tool-fs/README.zh.md)——分派 `fs/*` 事件的面向模型工具。
- [fs-local](../fs-local/README.zh.md)——本策略所防護的主機檔案系統後端。
- [fs-sandbox](../fs-sandbox/README.zh.md)——與本策略組合的沙箱強制後端。
- [Fsspec 風格 seam 拆分 Agent Note](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.zh.md)——策略為何是事件外掛而非提供者方法。

-----

<a id="model-experience"></a>
## 模型體驗

### 檔案系統工具結果

#### 模型看到的內容

該外掛不新增提示詞或 schema。沒有先前觀測時，它會以程式碼 `FS_NOT_OBSERVED` 和策略原因 `edit requires reading "<path>" first` 拒絕編輯；編輯被觀測為缺失的目標返回 `FS_NOT_FOUND`。正向觀測陳舊時，帶防護的變更會傳播由提供者擁有的 `FS_STALE_VERSION` 錯誤。[`dsh-tool-fs`](../tool-fs/README.zh.md) 擁有模型側錯誤包裝：它把所有 `FS_NOT_OBSERVED` 來源規範化為 `cannot modify "<path>": file has not been read — read the file, then retry`，而 `FS_STALE_VERSION` 保留提供者原因並追加 `— re-read the file, then retry`；兩者都保留錯誤碼和原始原因。外部刪除目標後，遵循陳舊恢復指令會記錄缺失：下一次帶防護的寫入可以透過 `createIfAbsent` 重新建立該目標，而提供者會以原子方式保留任何並行建立者寫入的檔案。

#### Token 影響

允許的操作除了普通工具結果外不增加 token。拒絕會新增少量保留的錯誤結果，並避免產生成功 payload。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本策略何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用檔案系統對比或任務積壓。

- **已觀察狀態無法在工作階段恢復後保留**：該記錄的持久化工作延期處理，因此恢復的工作階段必須重新讀取檔案，才能執行防護寫入與編輯。
- **沒有 agent 工作階段的參與者絕無法滿足策略**：它們的編輯會丟擲 `FS_NOT_OBSERVED`，寫入總會解析為 `createIfAbsent`，因此非 agent 呼叫方無法透過門禁覆蓋現有檔案。
- **直接 `ctx.fs` 讀取不會發出 `fs/observed`**：在 `read` 工具之外讀取的檔案仍未觀察；後續防護編輯會以 `FS_NOT_OBSERVED` 拒絕，直到工具讀取該檔案。
- **授權依據是版本新鮮度，而非檢視完整性**：任何視窗讀取都會授權對未變檔案執行全檔案覆蓋，這有意弱於完整檢視規則（見[seam 拆分 Agent Note](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.zh.md)）。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。
