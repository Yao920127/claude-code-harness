---
description: "面向使用者與維護者的檔案型憑證提供者：選擇、設定或排查本地憑證儲存及其環境分層。"
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials-local

[English](README.md) | 中文

## 概述

`dsh-credentials-local` 把 API 金鑰和其他機密儲存在 harness home 下的私有檔案中。你可以透過設定介面儲存憑證，也可以直接編輯檔案；變更會自動過載，儲存的值也會跨重新啟動保留。憑證查詢採用固定優先順序：啟動環境優先，其次是儲存檔案、專案 `.env` 和 harness home 的 `.env`；新儲存的值會立即覆蓋 `.env` 中的舊值。只有你的 OS 使用者能讀取該檔案，但 agent（智慧代理）的工具程序以同一使用者身份執行，因此該儲存無法向 agent 隔離機密。

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

本包為組合提供本地憑證儲存：API 金鑰與其他機密只需儲存一次，之後每個按名引用它們的請求都會用到。常用路徑是顯式的：載入儲存、透過設定介面或 `ctx.credentials` 儲存金鑰，然後在需要時由產品解析。

### 何時使用

把它作為預設本地儲存：產品的基礎組合會載入它，你透過設定介面儲存的金鑰會立即生效。當部署必須讓提供者金鑰遠離自身 agent 時選擇其他儲存——檔案權限做不到這一點，因為 agent 的工具程序以你的 OS 使用者身份執行（見「誰能讀取該檔案」）。

### 設定

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `path` | `<harness home>/.credentials.yaml` | 憑證檔案所在位置 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | `path` 預設時使用的 harness home |
| `watch` | `true` | 檔案在磁碟上變化時自動過載 |
| `debounceMs` | `100` | 變化後等待這麼久再過載，單位為毫秒 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)完整列出了所有受支援欄位及其 JSDoc，是這些資訊的真源。

### 儲存與移除金鑰

用 `set` 儲存金鑰、用 `unset` 移除、用 `describe` 檢查金鑰是否已設定——與憑證 API 提供的操作相同：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')
await ctx.credentials.set(ref, 'sk-…')          // save
await ctx.credentials.describe(ref)             // { configured, source?, writable } — never the value
await ctx.credentials.unset(ref)                // remove
```

你儲存的金鑰會被下一個按名引用它的請求使用；`describe` 報告它是否已設定、來自哪裡、能否寫入——絕不回傳值本身。記錄也持久化在同一檔案中：外掛按 `<owner>/<id>` 定址一條記錄，並用 seam 的記錄操作（`readRecord`、`describeRecord`、`listRecords`、`modifyRecord`、`deleteRecord`）管理它。

### 金鑰從哪裡來

金鑰按一個固定順序解析——先有值的位置勝出：

| 位置 | 可寫？ | 優先於 |
|---|---|---|
| 你啟動時的環境（`DEEPSEEK_API_KEY=… dsh`） | 否 | 一切 |
| 儲存檔案 | 是（`set`/`unset`） | 兩個 `.env` 檔案 |
| 專案的 `.env`（`<invocation cwd>/.env`） | 不在此處 | 主目錄 `.env` |
| 主目錄的 `.env`（`$DSH_HOME/.env`） | 不在此處 | 無 |

啟動環境優先，因為按次覆蓋——`DEEPSEEK_API_KEY=… dsh`、CI 機密、容器 `-e`——代表本次執行的明確意圖；它無法從產品內部修改，因此被報告為只讀，寫入會被拒絕。其他一切來源都輸給儲存檔案，這正是你儲存的金鑰會立即生效的原因，即使某個 `.env` 裡還留著更舊的金鑰；沒有儲存任何東西時，那兩個 `.env` 層會參與解析。環境層是啟動時拍攝的啟動器[環境快照](../../util/launch-environment/README.zh.md)，因此啟動之後才匯出的變數不會被看到。

### 憑證檔案本身

帶版本的 YAML 文件，每個鍵空間一個分節，除此之外別無他物：

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-…
  OPENAI_API_KEY: sk-…

records:
  llm-pi-ai/openai-codex:
    kind: grant
    payload:                    # written verbatim; this provider does not interpret it
      type: oauth
      access: eyJhbGciOi…
      refresh: rft_9f8e7d…
      expires: 1786000000000
  llm-pi-ai/amazon-bedrock:
    kind: api-key               # environment values, no key: this route uses an AWS profile
    env:
      AWS_PROFILE: prod
  llm-pi-ai/amazon-bedrock-dev:
    kind: api-key               # neither: the owner confirmed the ambient credential chain
```

你可以直接編輯該檔案——儲存會自動過載並接收變更，包括你刪除的金鑰或記錄。`refs` 按環境變數名存放金鑰值；`records` 按 `<owner>/<id>` 存放各外掛的憑證，每條都帶 `api-key` 或 `grant` 標籤，其中 grant 的 payload 由儲存逐字保留，因為只有它的擁有者能解釋。產品寫入時會保留註解與未觸及條目的排版；直接位於某條目上方的註解屬於該條目的註解，會隨它一起刪除。檔案只存放憑證，因此任何其他內容都會被明確拒絕，而不是被靜默忽略：非 mapping 的根、未知的頂層鍵、在其鍵空間內不可定址的鍵、型別錯誤或空的值、未知的記錄標籤或欄位、重複鍵以及格式錯誤的 YAML 都會在啟動時失敗；執行期熱過載時則保留最後可用內容並告警。

金鑰的值可以是任意文字，包括多行值——不需要任何引號技巧。空值等於「沒有金鑰」，這正是檔案中的空字串被拒絕的原因：移除金鑰是刪除它，而不是把它置空。`grant` 的 payload 必須經受 JSON 往返，進出兩個方向都會強制這一點，因此儲存會拒絕無法逐字讀回的值。如果磁碟上的檔案已無法解析，儲存會失敗，而不是覆蓋產品讀不懂的內容。

### 誰能讀取該檔案

只有你的 OS 使用者能讀取該檔案：產品以僅屬主可存取的權限建立它，在 POSIX 上還會拒絕載入任何其他使用者可讀的檔案——錯誤會提示你執行 `chmod 600`。Windows 沒有可檢查的 mode，因此在那裡跳過該檢查而不是偽造它。agent 不是另一個使用者：它的工具程序以你的身份執行，因此它們讀這個檔案與讀你擁有的任何其他檔案毫無二致。產品絕不把檔案路徑交給 agent，也絕不把檔案載入環境，因此要拿到某個值，需要刻意去讀一條並未交給 agent 的路徑。這是審慎，不是邊界：必須讓提供者金鑰遠離自身 agent 的部署無法靠檔案權限做到。

### 可能出錯的地方

- **啟動環境提供的金鑰是隻讀的**——`DEEPSEEK_API_KEY=… dsh` 在本輪執行中優先，儲存或移除它都會被拒絕。請先在啟動 shell 中清除該變數。
- **空值無法儲存**——儲存空字串會被拒絕；請改為移除金鑰。
- **儲存拒絕載入它無法信任的檔案**——任何其他使用者可讀的檔案、格式錯誤的 YAML 或無法存取的路徑都會在啟動時失敗；執行期熱過載則保留最後可用內容並告警。
- **同一時刻的修改都會被保留**——如果你在產品寫入的同時編輯檔案，你的變更會被併入，而不是被覆蓋。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **一套明確的優先順序。** 繼承環境優先，因為它是本次執行的明確意圖且無法從程序內部修改；它之下的所有來源都輸給受管儲存，因此已存金鑰永遠不會被陳舊的 `.env` 擠掉。
- **文件只存放憑證。** 它是帶 `refs` 與 `records` 分節的版本化文件，而不是 dotenv 檔案：一個 harness 擁有、且絕不物化進環境的儲存，不能同時充當使用者的環境層，否則會以自己的優先順序遮蔽非機密條目。
- **寫入打補丁，過載整體替換。** 行編輯在跨程序寫鎖下保留註解與未觸及條目；過載整體交換解析後的快照，已刪除條目絕不在記憶體滯留。
- **信任攸關處明確報錯。** 啟動與過載都會拒絕不可讀、無效或可被屬主之外讀取的文件；執行期過載失敗時會保留最後可用快照並告警，而不是拖垮程序。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供者：層解析、嚴格文件解析、寫鎖下的引用與記錄寫路徑、watcher 生命週期、權限檢查 |
| — | 未釋出執行時不變式配套入口；Service Definition 的配套入口（`dsh-credentials/invariant`）負責 `credentials/reference-updated` 生命週期約定；本提供者的檔案與環境分層屬於非同步 I/O，並由其單元測試套件加以約束。 |

### 解析與寫入路徑

`resolve` 與 `describe` 按優先順序順序讀取繼承環境快照、已解析文件快照與 `.env` 後備層。`set`/`unset` 排入同一條獨佔操作鏈：入口檢查提前拒絕（已釋放、空值、被環境遮蔽），佇列在執行時會重新判定，隨後在寫鎖下執行讀-改-寫、提交，並恰好觸發一次 `credentials/reference-updated`。

`modifyRecord` 走同一條鏈與同一把鎖：它重新讀取文件、把目前記錄交給變更函式、准入其結果——非空的 API 金鑰、能經受 JSON 往返的 grant payload——整體渲染該記錄並提交，恰好觸發一次 `credentials/record-updated`。並非由產品 CLI（命令列介面）啟動的組合只有繼承環境這一層。

### 過載生命週期

watcher 事件或就緒時的對帳會將一次重新整理排到同一鏈條之後。`reconcileFromDisk` 重新檢查權限、重讀文字，文字有差異時整體替換兩個快照，並按變更引用或記錄逐個釋出事件；與文字快取一致的內容——包括提供者自己的寫入——是 no-op。釋放時設定關閉標誌、停止接收事件、關閉 watcher，並等待排隊操作結算完畢，確保資源銷燬後不再發布任何事件。

### 文件版本化

文件攜帶 `version: 1`，每次寫入都會蓋上版本戳。啟動時若識別出預釋出扁平佈局——沒有 `version` 的裸引用名 mapping——會在寫鎖下就地升級，把原始行巢狀到 `refs:` 之下，值、註解與拼寫逐位元組保留；任何其他無版本形態都會按名拒絕，而不會被當作空儲存。執行期熱過載絕不遷移：中途恢復的扁平文件會保留最後可用快照，直到下一次啟動。

### 診斷資訊絕不引用值

YAML 解析器自己的訊息會引用出錯的那行原始碼，而在這份文件裡那行就是機密本身。因此每條診斷只攜帶錯誤碼與位置——鍵名可以安全列印，值不行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供者級約定不夠用時閱讀以下頁面。它們從 seam 約定逐步進入環境快照、原子寫入原語與啟動期環境層。

- [憑證引用 seam](../credentials/README.zh.md)——`resolve`、`describe`、`set`、`unset`、記錄操作與 seam 的更新事件。
- [憑證子系統參考](../../../docs/subsystems/credentials.zh.md)——`CredentialRef`、按操作解析、對 UI 安全的 `CredentialInfo`、提供者層。
- [啟動環境快照](../../util/launch-environment/README.zh.md)——解析讀取的凍結層快照，而非 `process.env`。
- [原子寫入](../../util/atomic-write/README.zh.md)——每次寫入所用的寫鎖與原子替換。
- [應用啟動與 Harness home 各層](../../boot/app-boot/README.zh.md)——產品 CLI 如何把 `.env` 載入快照與 `process.env`。

-----

<a id="model-experience"></a>
## 模型體驗

經由 `ctx.credentials` 的消費方間接生效：消費方擁有儲存值所啟用的全部模型可見行為。

#### KV Cache 影響

無直接失效；儲存值絕不進入請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供者何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **同一引用的並行寫入是後寫勝出**——寫鎖加讀-改-寫讓並行寫入者不會丟掉彼此的條目，但兩個寫入者編輯同一個引用時仍以較後的寫入為準；沒有修訂檢查。
- **同 UID 程序可以讀取該文件**——檔案效果沙箱模式不會拒絕讀取，OS 鑰匙串提供者仍是延後項。
- **環境變化不可見**——快照在啟動時凍結，因此啟動之後 export 的變數既不會進入解析，也不會進入 `describe`；要更換來自環境的憑證需要重新啟動。
- **原子但不具備崩潰永續性**——繼承自 `dsh-atomic-write`；儲存在啟動時重新讀取。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

OS 鑰匙串提供者——一種模型程序根本無法讀取的儲存——是同 UID 限制的延後答案，應當作為平級包與本提供者並列。seam 的介面還為輔助命令與 KMS 後端提供者預留了空間；目前沒有任何一種隨附。

</details>
