---
description: "使用者互動式終端：執行環境預設 shell、有界螢幕恢復和型別化 Remote 控制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-terminal-controller

[English](README.md) | 中文

## 概述

從 Web 終端面板在工作階段工作區開啟執行環境的預設 shell。重新連線已有程序，並關閉 provider 管理的完整程序範圍。終端輸出不進入 Agent 對話記錄。保留終端會佔用程序和有界螢幕快取。

## 目錄

- [使用此包](#use-this-package)
- [瞭解實作](#understand-the-implementation)
- [延伸閱讀](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

Web bundle 將此包與 subprocess provider、sandbox policy 和 Typert Gateway 一起掛載。Sandbox policy 僅為沒有 cwd 的 Session 提供預設工作目錄。`remote.terminal` 提供 `environment`、`shells`、`list`、`create`、`retain`、`follow`、`write`、`resize`、`rename` 和 `close`；每個操作均按 Session 標識限定範圍。列表直接讀取 Host 保留的終端，因此檢視離線 Session 不會啟用 Agent，也不會產生恢復錯誤。

Shell 探測結果首先列出執行環境宣告的預設 shell。僅當 provider 未宣告預設值時，才在 POSIX 使用 `/bin/sh`，在 Windows 使用 `cmd.exe`。可選的 `shell` profile 透過可執行路徑 `path`、顯示名稱 `name` 和參數 `args`（預設 `[]`）覆蓋這一選擇。選擇器還會透過執行 provider 探測 `shellCandidates`，僅省略確定未找到的候選。建立請求接受探測返回的 `shellPath` 並再次驗證；解析或傳輸失敗會直接報告，不啟動其他 shell。環境查詢只返回工作目錄和限制，不解析 shell，因此預設 shell 不可用時仍可重新連線已有程序。POSIX 自動 profile 以互動模式啟動，PowerShell 使用 `-NoLogo`，補全和啟動設定仍由 shell 提供。初始目錄來自 Session 工作區。使用者終端使用執行環境中系統使用者的權限，獨立於 Agent 的沙箱模式和審批策略。作業系統和容器的限制仍然生效；DSH 不提升使用者權限。Subprocess provider 繼續清除環境中的憑證變數。

| 設定 | 預設值 | 含義 |
|---|---|---|
| `shell` | 省略 | 使用執行環境預設 shell，或指定一個 profile |
| `shellCandidates` | `zsh`、`bash`、`fish`、`pwsh`、`powershell`、`cmd` | 已安裝時供使用者選擇的額外可執行名稱或路徑 |
| `maxTerminals` | `8` | 每個 Session 保留的終端和建立請求上限 |
| `maxCols`、`maxRows` | `500`、`200` | PTY 最大尺寸 |
| `scrollback` | `1000` | 螢幕歷史行數 |
| `maxBufferedBytes` | `2097152` | 單個訂閱者的輸出排隊上限 |
| `maxInputBytes` | `65536` | 單次輸入請求的位元組上限 |
| `disposeGraceMs` | `1000` | provider 終止寬限期，單位毫秒 |
| `unattendedTimeoutMs` | `7200000` | 無視窗持有且持續確認空閒後開始清理的時長；`0` 停用自動回收 |
| `activityPollIntervalMs` | `30000` | 無視窗持有時的活動觀察間隔 |
| `cleanupRetryMs` | `60000` | 清理失敗後的重試間隔 |

任何已連線視窗中的開啟標籤頁都會持有其終端，包括隱藏標籤和非目前 Session。最後一個持有關係消失後，只有明確確認空閒的時間才計入回收期限。執行中、停止、等待輸入和後臺執行的任務都會受到保護；活動狀態未知時清除空閒截止時間。任務完成後重新給予完整寬限期。Host 使用單調時鐘，在清理前重新檢查持有關係和目前活動；觀察間隔超過輪詢週期的兩倍時丟棄舊證據。時間欄位使用毫秒和安全整數，輪詢及重試間隔必須為正數。

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節</summary>

Host 透過 `ctx.subprocess.spawnTerminal` 建立 `TERM=xterm-256color` 的終端，不啟動桌面終端應用。流式 UTF-8 解碼保留跨塊字元和開頭的 BOM，並在 EOF 將不完整的尾部位元組替換為替代字元。控制請求走 Gateway，`follow` 使用其複用的 Remote stream。Headless xterm 和序列化 addon 在此前輸出寫入後生成初始螢幕，後續增量攜帶單調序號。過慢的訂閱者明確失敗；重新連線恢復目前螢幕。

最新連線持有輸入和尺寸控制權。斷開連線只釋放輸入權，不結束程序。顯式關閉等待程序清理和最後輸出；清理失敗時保留資源以便重試。Session 記住已關閉的標識並拒絕遲到或重複的建立請求，包括關閉到達時仍在進行的建立。新終端使用新標識。取消建立且清理失敗時，已分配的程序仍有所有者。Session owner 和 controller 解除安裝也會終止所擁有的程序。改變 Session 的沙箱模式時，使用者終端繼續以原有權限執行。控制權轉移或程序退出後被拒絕的輸入和尺寸請求保留輸出連線並停用輸入，不重發被拒絕的輸入。

Client 在分配前將每條 Session/內容與終端身份的關聯儲存到獨立的 localStorage key `dsh.terminal.binding.v1.*`。內容身份全域唯一；面板內的 tab key 只標識活動檢視 occurrence。逐條記錄的寫入和刪除會保留其他視窗的關聯。恢復檢視複用該身份；終端面板先恢復自己的檢視，再查詢尚無檢視的 Host 終端。新檢視可以建立程序，恢復檢視在目標缺失時顯示錯誤，不建立替代程序。顯式關閉先儲存清理請求，再刪除關聯。目前程序中繼資料和螢幕內容由 Host 提供，不儲存在瀏覽器中。Client 模型在瀏覽器完成螢幕解析後確認幀，按序傳送輸入，並忽略舊連線遲到的回應。Client 自產錯誤攜帶在地化鍵。外掛解除安裝等待活躍及先前斷開的輸出流結束，不關閉 Host 程序。

獨立的 `retain(sessionId, id, signal)` Remote 流確認視窗持有關係，不啟用 Agent、傳送螢幕輸出、轉移輸入權或建立程序。終端面板提供所有 Session 已儲存的標籤頁，Client 將其與自己儲存的身份取交集。同一視窗中的重複 occurrence 共用一個持有流；孤立的舊關聯不會保活任何終端。恢復輸出連線前必須等待目前持有關係確認。傳輸取消只釋放對應的物理流代次；外掛解除安裝等待全部持有流結束。清理失敗時保留所有權並重試，不重新接受連線，也不重新計算空閒寬限期。

新檢視自動啟動，使用開始頁明確選中的 shell，或上次選擇且仍可用的 shell。上次選擇的路徑儲存在目前站點 localStorage 的 `dsh.terminal.shell` 中。預設啟動透過 Host 探測驗證儲存的路徑，不可用時回到目前預設項。開始頁在開啟標籤頁前記錄選擇，每個新標籤頁保留自己的 shell 路徑和分配身份。儲存失敗不影響啟動。恢復已有終端既不讀取這一偏好，也不探測 shell。

關閉時先儲存未完成的清理請求並釋放標籤頁，再在後臺等待 Host 清理。失敗時提供重試通知。每個請求使用獨立的終端 ID localStorage key，清理成功或收到明確的 `session/not-found` 回應後刪除；啟動時重試已儲存的請求。傳輸失敗時保留請求。清理請求獨立於標籤關聯和麵板狀態持久化。瀏覽器儲存不可用時，記憶體中的清理仍可工作，但重新整理後無法恢復該請求。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [Subprocess](../../subprocess/subprocess/README.zh.md)
- [Terminal panel](../../client/ui-terminal-panel/README.zh.md)
- [使用者終端權限](../../../.agents/notes/implemented/architecture/2026-09-16-user-terminal-permissions.zh.md)
- [Web terminal decision](../../../.agents/notes/implemented/feature/2026-09-09-web-sidebar-terminal.zh.md)

<a id="model-experience"></a>
## 模型體驗

無；此包只處理使用者互動式終端，不向模型請求新增內容。

#### KV 快取影響

無；終端輸出只在瀏覽器與 Host 之間傳輸。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 瀏覽器重新整理保留程序和螢幕；Host 或 Session owner 解除安裝不保留。不提供持久終端恢復或自動重新啟動 shell。 已退出的終端仍計入 `maxTerminals`；關閉不用的標籤頁可釋放其螢幕和名額。
- 原生 PTY 可用性和程序樹清理保證由 subprocess provider 決定。找到可執行檔案並不保證 PTY 分配成功。
- 自動回收依賴 provider [支援的 shell 活動觀察](../../subprocess/subprocess-local/README.zh.md#running-terminal-sessions)。不支援的 shell、自定義啟動參數和不確定的程序觀察可能讓資源一直保留到明確關閉或 owner 解除安裝。執行中的命令沒有強制最長執行時間。
- 螢幕恢復只保留有界歷史，不保留完整記錄。同一時刻只有一個連線可輸入或調整尺寸。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護說明</summary>

不釋出執行時 invariant companion。終端中繼資料與螢幕更新由同一物件按序寫入，沒有獨立的程序尺寸觀測可供比較。

</details>
