---
description: "面向使用者與維護者的本地工作區 @file 補全提供者，用於啟用、調整規模或排查 ctx.fileReferences 的發現能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference-local

[English](README.md) | 中文

## 概述

agent（智慧代理）及主機 UI 可以用各 agent 本地工作區中經過排序的路徑補全 `@file` mention；有界發現讓大型儲存庫也能保持回應迅速。結果會在工具活動後重新整理且不會阻塞補全，並且始終不會跟隨目錄符號連結。當 `read` 可用時，模型還會收到關於如何理解引用路徑的穩定指引。當 `read` 使用 Harness 主機檔案系統時選擇本包；遠端或虛擬名稱空間需要與之匹配的發現能力。

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

當 `@file` 補全應發現 Harness 主機自身的檔案系統——即隨附 `read` 工具所操作的名稱空間——時，掛載此提供者。每個 agent 的工作區從該工作階段的工作目錄開始建立索引；工作階段沒有工作目錄時退回到主機程序目錄。

### 啟用提供者

預設設定適合典型工作區，因此最小掛載無需任何設定：

```yaml
- name: '@deepseek-ai/dsh-file-reference-local'
  config:
    maxResults: 20
```

### 你能得到什麼

在主機 UI 中輸入 `@` 會為指定 agent 返回至多 `maxResults` 個排序路徑候選。包含 `/` 的查詢直接列出匹配目錄的條目；裸查詢對有界遞迴索引做模糊排序。目錄候選以尾斜槓保持 mention 開放。任何工具結果之後，該 agent 的索引會被標記為陳舊：下一次查詢仍由它作答，其替代品在後臺建置，因此重建不會擋在游標前面。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxResults` | `20` | 單次查詢返回的排序候選最大數量 |
| `maxEntries` | `50000` | 每個 agent 工作區建立索引的檔案與目錄最大數量 |
| `excludedDirectories` | `['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target', '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle']` | 遍歷與候選中排除的目錄基名 |

所有數值都必須是正的安全整數，所有排除名都必須是不含 `/` 或 `\` 的非空基名。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

提供者為每個 agent 維護一個可複用的 `WorkspaceFileSearch`，以該工作階段的 `cwd` 為根。目錄範圍查詢（`a/b/...`）列出即時目錄狀態，裸模糊查詢共享一次有界遞迴遍歷。每個工作區僅首次裸查詢會等待該遍歷；`tool/result` 事件把已完成的條目標記為陳舊，下一次裸查詢在替代品建置期間繼續由它作答。模型指引是按 agent 的提示詞段，僅在指定 agent 擁有 `read` 工具時貢獻；建立會等待提示詞安裝，安裝失敗會復原 agent；agent dispose（資源釋放）時會同時釋放索引與提示詞 fiber。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `LocalFileReferenceService`：設定驗證、按 agent 搜尋、提示詞安裝 |
| [`src/search.ts`](src/search.ts) | `WorkspaceFileSearch`：遍歷、排序、排除、陳舊標記與後臺重建 |
| — | 不釋出執行時不變式伴生入口；按 agent 的 index 是私有 advisory cache，其失效與 dispose 行為透過服務測試直接觀察。 |

### 主要流程

`list(agent, query, signal)` 要麼列出某個目錄的條目，要麼讀取共享的有界索引，對候選排序（精確、字首、子串，再到子序列得分，目錄有加成），並按確定性順序返回至多 `maxResults` 個。`tool/result` 事件把指定 agent 的索引標記為陳舊；下一次裸查詢仍從舊索引返回結果，同時在後臺建置替代索引。不可讀或已排除的子目錄不貢獻候選，而不可讀的根目錄則讓該次遍歷失敗：一次瞬時故障不得用空索引覆蓋仍然有效的條目。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從本提供者所實作的 seam 進入其候選所指向的工具。

- [檔案引用 seam](../file-reference/README.zh.md)——本提供者所實作的服務約定與 `@file` 語法。
- [工作階段引用子系統](../../../docs/subsystems/session-reference.zh.md)——主機 UI 背後的共享檔案引用約定。
- [檔案系統工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)——發現能力必須匹配其名稱空間的 `read` 工具。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。

-----

<a id="model-experience"></a>
## 模型體驗

### `read` 可用時的檔案引用指引

#### 模型看到的內容

當指定 agent 有實際生效的 `read` 工具時，提供者會貢獻以下穩定的系統提示詞段：

##### 檔案引用指令

```markdown
Tokens prefixed with @ are paths the user explicitly referenced. Relative paths resolve from the workspace root; absolute paths identify files or directories on the host. A trailing slash marks a directory: list it when its contents matter. Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading. @"..." quotes a path containing spaces.
```

#### Token 影響

該影響有條件且固定：只要 `read` 對指定 agent 可見，這一句就會存在；候選查詢本身不增加 token，所選路徑只會貢獻普通使用者訊息中的對應字元。

#### KV Cache 影響

該穩定句子會加入系統提示詞字首。掛載或移除此提供者，或者改變 `read` 是否可見，都會改變該字首；查詢、候選項和索引陳舊標記不會改變字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該提供者何時不合適。它們是目前包約束。

- **主機本地名稱空間**：提供者掃描 Harness 主機的檔案系統，因此遠端或虛擬 `read` 實作需要使用名稱空間與該工具一致的提供者。
- **有界的提示性索引**：超大型工作區可能省略 `maxEntries` 之後的路徑；被排除或無法讀取的目錄不會出現。預設排除項只列沒有任何生態用作原始碼目錄的建置產物；`lib` 被刻意排除在外，因此建置進 `lib` 的工作區需透過 `excludedDirectories` 自行加上。
- **一次失效的陳舊視窗**：緊接工具結果之後的裸查詢反映的是上一次遍歷時的目錄樹；下一次查詢才看到重建結果。
- **沒有忽略檔案語義**：`.gitignore` 和其他專案忽略檔案不會影響發現；系統只排除已設定的目錄基名。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
