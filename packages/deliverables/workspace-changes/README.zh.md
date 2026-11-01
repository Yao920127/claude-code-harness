---
description: "用 git 工作樹快照和檔案工具編輯前後的整檔案捕捉彙總每個頂層輪次改動的檔案，以 workspace/changes Session 事件宣告，並在 Session 存活期間提供摘要和逐檔案對比；設定、儲存庫要求與覆蓋規則。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workspace-changes

[English](README.md) | 中文

## 概述

本外掛彙總每個頂層輪次改動了哪些檔案、每個檔案的行數，並提供每個所列檔案在輪次開始與結束時的內容對比。比較輪次開始和結束時的 git 工作樹快照；檔案工具編輯的每個檔案在首次編輯之前和輪次結束時各複製一份整檔案，以此覆蓋 git 覆蓋不到的檔案。沒有儲存庫或沒有 git 時，只列檔案工具的編輯。Session 日誌只收到一條寫明輪號的 `workspace/changes` 事件；摘要和對比留在 Host 上，直到 Session 釋放。Web 的改動檔案卡片渲染它們。

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

正式提供的 Web bundle 掛載本外掛。任何具備 `subprocess` 能力且 Host 上有 git 可執行檔案的組合都可以掛載它：

```yaml
- name: '@deepseek-ai/dsh-workspace-changes'
  config:
    maxFiles: 500
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `timeoutMs` | `30000` | 單條 git 命令允許執行的毫秒數，超時則放棄本輪記錄 |
| `outputMaxBytes` | `8388608` | 每條命令保留的 git 輸出位元組數，diff 列表更大時放棄本輪記錄 |
| `maxFiles` | `500` | 單份摘要攜帶的最大檔案數；`total` 仍報告完整數量 |
| `maxFileBytes` | `2097152` | 檔案在檔案工具編輯前後被捕捉、或從快照讀出做對比所允許的最大位元組數；更大的檔案不提供對比，其中在檔案工具編輯前後被捕捉的也不帶行數 |
| `diffTimeoutMs` | `100` | 逐行對比允許執行的毫秒數，超時後退化為整檔案替換 |

有工作目錄且不是子代理來源的 Session 都會被記錄；子代理 Session 不記錄。快照透過私有 index 寫入 Session 自己擁有的臨時物件目錄，儲存庫自己的物件庫以只讀 alternate 的方式掛接；儲存庫的 index、物件、工作樹和 ref 保持不變，使用者此前未提交的改動也不會進入摘要。Session 釋放時刪除該目錄。工作目錄內的巢狀儲存庫和 submodule 記錄為 gitlink，其內部改動不會出現。不在任何 git 儲存庫內的工作目錄不做快照。沒有 git 時——或者 macOS 上只有 `/usr/bin/git` 的開發者工具樁程式時——同樣定位不到儲存庫，外掛記錄一次日誌。兩種情況下摘要都只列下文所述的檔案工具編輯，並以工作目錄作為工作區；shell 的改動不會出現。

在 `write`、`edit` 或有修改作用的 `str_replace_editor` 呼叫執行之前，記錄器把該路徑上的檔案複製到 Session 的臨時目錄，每輪每個路徑只複製第一次，輪次結束時再複製一次；副本按其位元組的 SHA-1 命名，相同內容只存一份。這一步不需要 git。快照覆蓋到的路徑保留 git 的行數；其餘路徑由副本提供，也就是匹配忽略模式的檔案、儲存庫之外的檔案，以及沒有快照時的每一次檔案工具編輯，行數來自兩份副本的逐行對比，因此同一檔案的重複編輯只計一次，檔案工具編輯之後的 shell 改動也包含在內。輪次結束時內容沒有變化的路徑不會列出。超過 `maxFileBytes` 的副本不會儲存：該檔案列出時帶 `oversized`，沒有行數；兩側都這麼大的路徑同樣列出，因為沒讀過的內容永遠不能認定為沒有改動。只差一個末尾換行的路徑對比為兩側相同，而 git 仍會把那一行計入行數。`/tmp` 與平臺臨時目錄下的檔案被排除，除非它們位於儲存庫內。快照覆蓋範圍之外只透過 shell 命令做出的改動不會被記錄。

每個檔案攜帶持久的 `path`——位於工作目錄內時為相對路徑，否則為絕對路徑——以及用於排序和標籤的 `display` 路徑：相對路徑，儲存庫內位於工作目錄之上的檔案為 `../` 路徑，家目錄下的檔案為 `~` 路徑，其餘為絕對路徑。檔案按 `display` 的碼元順序排序，因此上級路徑和絕對路徑排在工作目錄自身檔案之前。`workspace/changes` 事件只攜帶輪號；`ctx.workspaceChanges.summary(sessionId, seq)` 返回該序號的事件宣告的摘要，Session 已釋放或本 Host 程序從未記錄時返回 undefined。`ctx.workspaceChanges.diff(sessionId, seq, index, signal)` 對比該下標所列的檔案：從兩棵快照樹或兩份副本得出帶三行上下文的 hunk；git 報告為二進位制或某一側含 NUL 位元組時返回 `binary`；某一側超過 `maxFileBytes` 時返回 `oversized`。逐行對比執行超過 `diffTimeoutMs` 時退化為一個替換全部行的 hunk，並標記 `coarse`。因此 Host 重新啟動後重新開啟的對話，先前輪次既沒有卡片也沒有對比。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

每個 Session 一個 `TurnRecorder`，序列化其 git 工作。`turn/start` 排入基線：`rev-parse` 每個 Session 只定位一次儲存庫並建立 Session 的臨時物件目錄，然後以儲存庫 index 為種子在臨時 index 上執行 `add --all --ignore-errors` 與 `write-tree` 得到 tree id；不可讀的檔案被跳過並以 git 的結束代碼 1 報告，快照接受這個結束代碼。每輪持有自己的狀態物件，因此被中斷的輪次仍在執行的記錄會在下一輪開始後保留自己那一輪的檔案。每條命令都帶 `GIT_OBJECT_DIRECTORY` 指向臨時目錄、`GIT_ALTERNATE_OBJECT_DIRECTORIES` 指向儲存庫的 objects，因此已提交內容從儲存庫讀取，新物件不會落進儲存庫。每次 `tools/pre-execute` 都等待該佇列，因此沒有修改能先於其基線發生；同一步驟還排入對 `write`、`edit` 或有修改作用的 `str_replace_editor` 呼叫所指路徑的整檔案捕捉，因此副本先於編輯，`tool/result` 事件只標記本輪有結果需要記錄。`agent/turn-stopping` 在輪內記錄：第二次快照、兩棵樹之間的 `diff-tree -r -M --numstat`、對工作樹內已捕捉路徑的 `check-ignore`、對每個未覆蓋路徑的第二次複製與逐行對比、追加事件，以及按事件序號儲存摘要和每個所列檔案兩側的內容來源，即快照樹中的路徑或一份副本。對比在被請求時計算：`ls-tree -l` 定位快照一側並取其大小，`cat-file blob` 在 `maxFileBytes` 之內讀出，副本從磁碟讀取，兩側隨後走同一個帶超時的逐行對比。`turn/end` 僅在最後一次記錄嘗試之後仍有工具結果結束時再次記錄，這覆蓋了中止、失敗和被轉向的輪次，且不會重複一次失敗的嘗試；早先記錄之後的空列表會取代它。儲存庫的 index 只讀取。

git 透過 `subprocess` 能力執行，使用淨化後的環境、`GIT_CONFIG_COUNT=0`（憑證清理會移除索引設定的鍵，因此不繼承這些環境設定）、`GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、設定的超時與有界輸出。任何步驟失敗都會放棄本輪記錄並給出警告；下一輪重新開始。Session 釋放與外掛釋放會中止排隊的工作、忘記摘要並刪除臨時目錄。

**執行時不變式：** 不釋出伴生入口。事件監聽歸 effect 所有，記錄器在其 Session 存活期間同時擁有摘要、快照樹與捕捉的副本；沒有獨立觀察會與它們分歧。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Web 產出物](../../client/ui-deliverables/README.zh.md)——讀取所提供摘要並開啟其檔案的改動檔案卡片。
- [子程序能力](../../subprocess/README.zh.md)——git 執行所經過的接縫。
- [本輪改動檔案卡片決策](../../../.agents/notes/implemented/feature/2026-09-11-turn-changed-files-card.zh.md)——快照設計、覆蓋規則、暫緩的影子儲存庫與被否決的備選方案。

<a id="model-experience"></a>
## 模型體驗

無，因為記錄器只追加一條僅寫日誌、只有用戶端讀取的 `workspace/changes` 事件，不註冊任何面向模型的內容。

#### KV Cache 影響

這裡的內容不會進入模型請求，因此不影響提供者快取複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 摘要、快照樹與捕捉的副本只在本 Host 程序內隨其 Session 存活；Host 重新啟動後重新開啟的對話，先前輪次既沒有卡片也沒有對比。這是既定行為：Host 已經打不開內容的卡片不顯示。
- 有兩個 git 功能在快照期間仍會寫入儲存庫自己的 git 目錄：`core.splitIndex` 會寫 `sharedindex.*` 檔案，git-lfs 會對改動檔案執行 clean 過濾器並把物件存到 `.git/lfs` 下。
- 需要 git 2.13 或更高版本以支援 `rev-parse --absolute-git-dir`；不支援的儲存庫格式或其他 git 失敗會帶著警告放棄本輪，而不是被當成普通目錄。
- Session 的首次快照會把工作樹裡所有未跟蹤且未被忽略的檔案寫進 Session 的臨時目錄；沒有 `.gitignore` 卻帶著大體積建置產物的儲存庫，在 Session 釋放前會佔用同等的臨時空間。
- 使用者在輪次進行中自己做的編輯會被算到該輪。
- 不在任何 git 儲存庫內的工作目錄只列檔案工具的編輯，卡片裡因此沒有 shell 改動；Harness home 下的影子儲存庫暫緩，直到其排除規則能可靠地代替缺失的 `.gitignore`。
- 快照覆蓋範圍之外只捕捉檔案工具點名的路徑：那裡只被 shell 命令改動的檔案不會出現，在首次檔案工具呼叫之前被兩者都改過的檔案從該呼叫起開始對比。
- 每次檔案工具編輯都會把整個檔案複製一次，每輪每個路徑一次，上限 `maxFileBytes`，即使快照也覆蓋該路徑；副本隨 Session 的臨時目錄一起刪除。
- 對比會把所列檔案的完整文字送到用戶端，包括被忽略的檔案、工作目錄之上的儲存庫檔案和工作區外的檔案；摘要路由只送路徑和行數。必須把這類內容留在 Host 上的部署應把本外掛組合出去。
- 退化為整檔案替換的對比攜帶兩側的全部行，最多兩倍 `maxFileBytes`。
- Windows 路徑在 `path` 中保留原生分隔符；`display` 始終用斜槓分隔。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
