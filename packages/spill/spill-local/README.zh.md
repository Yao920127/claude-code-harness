---
description: "本地檔案系統 spill 後端：spill 文字如何儲存到私有工作階段級檔案，並用 read 或 grep 取回。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-local

[English](README.md) | 中文

## 概述

`dsh-spill-local` 把呼叫方的超大文字儲存到主機檔案系統中私有的工作階段級檔案，並以該檔案路徑作為定位資訊返回，同時給出告訴模型讀取或搜尋它的取回指引。只要組合需要在 agent（智慧代理）執行所在的同一臺機器上進行 spill 儲存，就掛載它。檔案對目前使用者私有、名稱不可預測，且每個工作階段的檔案歸入穩定的目錄，因此共享根目錄既不會洩露輸出，也不會被預置的符號連結重定向。設定選擇根目錄與啟動清理保留期；預覽與 spill 決策由其他包負責。

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

在需要把文字 spill 到本地檔案系統的組合中掛載此後端。它註冊為 `dsh-spill-policy` 外掛與其他呼叫方使用的 `ctx.spillStore` 服務。

### 最小設定

不帶設定載入外掛是安全的：檔案會落在作業系統臨時目錄下延遲建立的私有（0700）每程序目錄中。當檔案必須位於已知位置時，設定 `root`。

```yaml
- name: '@deepseek-ai/dsh-spill-local'
  config:
    root: /absolute/path/to/spill
    cleanupPeriodDays: 30
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `root` | 私有 0700 臨時目錄 | spill 檔案的根目錄；設定後可將檔案儲存在已知位置 |
| `cleanupPeriodDays` | `30` | 檔案在一次性啟動清理中可被刪除前需經過的天數；`0` 停用清理 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-spill-local)是每個受支援欄位的窮盡式真源。

### 你會得到什麼

每次 `saveText` 呼叫都會把完整文字寫入一個新檔案，並返回三個欄位：`locator`（檔案路徑）、`bytes`（精確的 UTF-8 位元組數）與 `retrievalHint`——"Use read with offset/limit, or grep this path to search within it."。消費方把該提示展示給模型，模型隨後可以用其常規檔案工具讀取或搜尋該檔案。

### 檔案存放位置

檔案存放在 `<root>/session-<hash>/<random>-<safeName>`：`session-<hash>` 是所屬工作階段 id 的短雜湊（讓同一工作階段的檔案歸在一起），`<random>-<safeName>` 把不可預測的十六進位制字首與清理為單個安全路徑段的呼叫方建議名配對。相對 `root` 從程序工作目錄解析。

<a id="startup-cleanup"></a>
### 啟動清理

一次盡力而為的掃描會在啟用後啟動，不延遲服務可用性。它掃描設定的根目錄和作業系統臨時目錄下先前的預設 `dsh-spill-*` 根目錄，刪除修改時間嚴格早於設定截止時間的常規檔案，修剪空工作階段目錄，並只刪除已經變空的先前預設根目錄。長期執行的程序要到重新啟動時才會再次掃描。dispose（資源釋放）會等待掃描結束；如果清理移除了工作階段目錄，並行寫入會重新建立它。

掃描會解析檔案系統身份，絕不跟隨或刪除符號連結，並跳過無關條目。在 POSIX 上，它只接受目前使用者擁有、組使用者和其他使用者不可寫、且祖先路徑能防止替換的根目錄與工作階段目錄；`/tmp` 等帶 sticky 位的可寫臨時目錄仍然允許使用。不安全路徑會產生警告並保持不變。檔案系統和警告接收方故障都會被後備，因此清理無法使啟用或並行 spill 寫入失敗。

### 故障與恢復

真實儲存故障——權限不足、磁碟已滿、根目錄不可寫——會讓 `saveText` 呼叫以拒絕結束；由呼叫方決定如何降級。隨附策略把拒絕當作盡力而為處理並保留原始內聯結果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋此後端背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

後端只負責儲存細節，建立在一個原則之上：**spill 產物必須私有且不可重定向**。根目錄私有（0700）、工作階段目錄是穩定雜湊、檔名不可預測、寫入採用排他且僅所有者模式。儲存機制放在與 Cordis 無關的模組中，以便無需上下文即可單元測試。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config`、`LocalSpillStore` 服務、清理生命週期、定位資訊與取回提示的組裝 |
| [`src/cleanup.ts`](src/cleanup.ts) | 一次性按年齡掃描、檔案系統身份檢查、符號連結和所有權保護 |
| [`src/store.ts`](src/store.ts) | 與 Cordis 無關的儲存機制：私有根目錄、工作階段目錄、安全名稱編碼、排他寫入 |
| — | 不釋出執行時不變式伴生入口；除由所屬 seam 強制執行的約定外，本包不暴露獨立事件序列或可變資料關係。 |

### 檔案命名與寫入

`suggestedName` 是不可信輸入，因此 `encodeSegment` 會把 `[A-Za-z0-9._-]` 之外的每個字元以及 `~` 本身轉義成 `~XXXX` 形式，使對映對所有 JS 字串都是單射：分隔符、`../`、NUL 與絕對路徑永遠無法逃出單個路徑段，整段 token `.`/`..` 也會被轉義。寫入採用 `open(path, 'wx', 0o600)`——任何已存在路徑（無論是否符號連結）都會失敗，因此預置目標無法重定向寫入。對同一建議名的兩次儲存會得到不同的隨機字首。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。

- [spill 儲存服務](../spill/README.zh.md)——此後端實作的 `saveText` 約定與詞彙。
- [spill 包對映](../README.zh.md)——三包家族與各自職責。
- [dsh-spill-policy](../spill-policy/README.zh.md)——結果過大時呼叫此後端的策略。
- [spill 子系統](../../../docs/subsystems/spill.zh.md)——窮盡式詞彙與歸屬。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過把已儲存檔案路徑與 read/grep 取回指引渲染給模型的 spill 消費方。

#### KV Cache 影響

無直接失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本地後端何時不合適或需要特別的運維注意。它們是目前的包約束。

- **長期執行的部署要等到重新啟動才會被掃描**——一次性掃描只在啟用後執行，因此執行期間超過年齡截止值的檔案會在下次啟動時回收。
- **定位資訊需要與其位於同一檔案系統的消費方**——遠端或虛擬部署需要另一個 `SpillStore` 後端，其定位資訊與取回提示在該環境中有明確含義。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放方向。它明確不具權威性。

#### 未來：工作區隔離的互動

取回模型假定模型的 `read`/`grep` 工具可以檢查返回的路徑，即使 spill 目錄在工作階段工作目錄之外。未來的工作區隔離策略必須顯式允許本地 spill 路徑，或者改用非檔案 spill 後端。

</details>
