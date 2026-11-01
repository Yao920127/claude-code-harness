---
description: "動態 Cordis 包的 host 半說明，供選擇、組合或排查註冊表、沙箱與執行往返的 agent（智慧代理）與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-host-runner

[English](README.md) | 中文

## 概述

`dsh-cordis-host-runner` 提供執行時檢查，併為程式呼叫方和瀏覽器控制元件保留程序內動態定義。Host 部分在 `node:vm` 中執行；瀏覽器部分使用 Client runner 和審批 UI。定義在重新啟動後消失。Agent 透過 `tool-cordis` 發現 API，透過 Plugin Manager 安裝持久化 bundle；沒有模型工具建立動態定義。

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

需要檢查註冊表或程式側動態包生命週期時掛載此外掛。瀏覽器生命週期消費者還需要 Client runner 和 UI 包。內建 Creator 流程使用已安裝 bundle，不使用此定義註冊表。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-cordis-host-runner'
  config:
    vmTimeoutMs: 5000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `vmTimeoutMs` | `5000` | host 半在 vm 中同步執行的那部分被中止求值前可執行的毫秒數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-cordis-host-runner)是每個受支援欄位的窮盡式真源。

### run 會做什麼

程式呼叫方使用 `define`、`run`、`stop` 和 `undefine`；瀏覽器面板操作已有定義。僅含 Host 的包在本程序啟用。帶瀏覽器部分的包等待審批或取消，批准後先載入 Host 再載入 Client。`mode: "run"` 啟動目前版本，`mode: "update"` 替換版本。Stop 釋放執行中的 effect 並保留定義；undefine 還會移除定義。

### 定義的去向

定義按工作階段隔離且僅在程序記憶體在：其他工作階段無法讀取，重新啟動會清空。歷史日誌保留工具參數和回執，但不會恢復註冊表。瀏覽器頁面過載後，需要再次顯式執行才能載入 Client 部分。

### 信任立場

沙箱隔離全域變數，但不是安全邊界：Node 全域變數不存在，或重定向到 Cordis 服務（`ctx.fs`、`ctx.web`、`ctx.bash` 與定時器 helper），host 半收到的是不含框架內部機制的 façade，但它宣告的服務仍會觸達存活執行時。對待動態包要像對待 bash 存取一樣，參見[自引用工具集 Agent Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 runner 背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

runner 基於兩項職責劃分。**註冊表與沙箱是同一個服務。** `DynamicCordisRunnerService` 擁有定義註冊表、vm 沙箱、host 半 fiber 生命週期與 invoke handler 表，因此一個定義的整個生命週期只有一個 owner。**版本是不可變的包。** 外掛持有 `define` 之後永不變化的包；`currentPackageId` 與 `nextPackageId` 指向執行中與目標版本，`mode: "run"` 與 `"update"` 編碼目標是否等於目前版本。瀏覽器往返之所以存在，是因為瀏覽器半隻能由頁面執行：服務 emit 請求並掛起，由頁面的結論結算，呼叫方的 `AbortSignal` 是唯一的另一條出路。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務入口：`Config`、註冊表接線、生命週期動詞、steering（中途引導）訊息 |
| [`src/registry.ts`](src/registry.ts) | 定義儲存：外掛與包標識、執行嘗試、審批請求 |
| [`src/sandbox.ts`](src/sandbox.ts) | `node:vm` 求值：全域變數、Node API 陷阱、define 時語法預檢 |
| [`src/guard.ts`](src/guard.ts) | 註冊邊界：schema 規範化、沙箱 `ctx` façade、外掛形態檢查 |
| [`src/lifecycle.ts`](src/lifecycle.ts) | 在 `cordis-dynamic` fiber 組下啟動 host 半 |
| [`src/inspect-registry.ts`](src/inspect-registry.ts) | `ctx.cordisInspect` 註冊表：host 提供者加映像的 client manifest（中繼資料清單） |
| [`src/types.ts`](src/types.ts) | `dynamicCordisRunner` remote namespace 與轉發事件共享的 client 安全載荷形態 |

### 一次 run 的流程

`define` 對中繼資料做首尾去空白與必填驗證，用編譯預檢每一半的語法（不執行任何程式碼），鑄出外掛與包標識，並把定義登記在發起呼叫的工作階段名下。`run` 對照 `currentPackageId` 與 `nextPackageId` 解析目標：純 host 包在沙箱中求值並立即提交，帶瀏覽器半的包則建立一次審批請求、emit `cordis/request-run` 並掛起。作答頁面依次走 `runHostHalf`、`getClientCode` 與 `resolveRequestRun`；命名存活 revision 的成功會提交啟用、設定 `currentPackageId`，`cordis/request-run-resolved` 讓其他每個頁面撤下待作答入口。`stop` 退回存活下發——handler disposer、fiber dispose（資源釋放）與 `cordis/dynamic-retract` 廣播——並讓定義保持可執行。四條轉發事件（`cordis/request-run`、`cordis/request-run-resolved`、`cordis/dynamic-package`、`cordis/dynamic-retract`）宣告在 client 安全的 `./types` 子路徑上，並由 `@deepseek-ai/dsh-api-remotes` 的白名單准許投遞——正是這一點讓瀏覽器能經 `ctx.remote.$on` 收到它們。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 runner 逐步進入呼叫它的工具、應答它的瀏覽器半與生成的表面。

- [工具包](../tool-cordis/README.zh.md)——使用其檢查註冊表的只讀工具。
- [Client runner](../cordis-client-runner/README.zh.md)——應答執行請求並裝載瀏覽器半程式碼的瀏覽器半。
- [UI 包](../ui-cordis/README.zh.md)——使用者批准並操作執行的面板。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-cordis-host-runner)——每個受支援設定欄位。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.cordisInspect` 與 `ctx.dynamicCordisRunner` API 及 `cordis/*` 事件。
- [自引用 Cordis 工具集 Agent Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)——沙箱語義、生命週期與組合的理由。

-----

<a id="model-experience"></a>
## 模型體驗

### 轉達給所屬工作階段的執行結果、拒絕與診斷

#### 模型看到的內容

本包不註冊工具或提示。程式側 `run` 呼叫和瀏覽器控制元件可向所屬工作階段傳送結果與診斷；停止和移除操作注入使用者訊息。內建模型工具無法建立或更新動態定義。

#### Token 影響

有條件且隨資料而定：訊息只在事件發生時到達，每條都攜帶一段有界的說明；沒有固定的每請求成本。

#### KV Cache 影響

本包自身沒有。註冊工具的 host 半會改變下一次請求的工具檢視，從第一個變化的 schema token 起使字首複用失效；執行或停止一個不註冊任何工具的包對字首不產生影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 runner 何時需要特別小心。它們是目前包約束，不是任務積壓。

- **執行成功不代表 UI 已渲染**——React 在載入回執之後渲染；失敗透過 steering 傳送到所屬工作階段，並顯示在瀏覽器面板中。
- **帶瀏覽器半的包在沒有頁面連線的地方掛起**——headless 與 ACP（Agent Client Protocol）部署會把 run 一直掛到提問的輪次被取消；純 host 包不受影響。
- **掛起的 run 請求沒有超時**——它一直等人，直到提問的輪次被取消，因此無人值守的自動化用不了帶瀏覽器半的包。
- **`vmTimeoutMs` 只約束同步求值**——async 的 host 半函式體會逃出該上限，這與工具集基於協作的信任立場一致。
- **陳舊成功的拒絕會讓請求繼續掛起**——作答頁面點名的 revision 已被註冊表越過時，該結論會被拒絕（`accepted: false`），請求保持可作答，直到另一個頁面作答或呼叫方取消；瀏覽器半不讀這個 ack。
- **執行播報不攜帶服務宣告**——瀏覽器半宣告的 `inject` 是從它在頁面裡返回的外掛上讀出的，因此 `cordis/request-run` 只攜帶中繼資料，絕無程式碼或服務清單。
- **`zod` 是生成的 Typert 契約面的執行時依賴，不是 `src` 的依賴**——`./typert` 與 `./remote` 解析到未打包的 `lib` 檔案，其中帶有裸的 `import { z } from 'zod'`，所以即使 `src` 裡沒有任何程式碼 import zod，本包也要宣告它。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。definition registry 位於程序記憶體中且沒有可觀察的事件流；它唯一負責的關係是執行中的 definition 擁有已結算的 host-half fiber 及其 handler table，該關係在單個等待完成的操作中建立和解除，因此由包測試直接斷言。
