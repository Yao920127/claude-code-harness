---
description: "在 Web 右側欄提交、拉取與推送，無需 Git 命令；登入 GitHub 後可複製與釋出儲存庫。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git

[English](README.md) | 中文

## 概述

無需記住 Git 命令即可儲存與分享工作。右側欄的**原始碼管理**頁面顯示工作階段資料夾中的已更改檔案，用一條資訊暫存並提交它們，並與 GitHub 拉取、推送或同步。在**設定 → GitHub** 登入 GitHub 後，可以把自己的儲存庫複製為工作區，再從原始碼管理頁面釋出新儲存庫。命令透過 Host 上安裝的 `git` 與 GitHub CLI（`gh`）以你的系統使用者身份執行。

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

從右側欄「開始」頁開啟**原始碼管理**；其標籤頁顯示分支圖示。頁面開啟時、視窗重新獲得焦點時以及按下重新整理時，會讀取包含工作階段資料夾的儲存庫。不在任何儲存庫內的資料夾會提供**初始化儲存庫**。

分支行顯示目前分支（或分離的 HEAD），以及領先與落後上游的提交數。輸入提交資訊後選擇**提交**；命令按鈕平分所在行的寬度。也可以按 Command+Enter（Windows 與 Linux 為 Control+Enter）。沒有暫存任何檔案時，提交會包含全部更改；否則只提交已暫存的檔案。**提交併推送**會在提交後推送。**拉取**快進到上游，**推送**推送分支並在第一次推送時把 `origin` 設為上游，**同步**會先拉取再推送。更改列表區分已暫存與未暫存的檔案；`+` 與 `−` 暫存或取消暫存單個檔案，列表標題可一次暫存或取消暫存全部。每個儲存庫同一時間只執行一個命令；失敗時顯示 Git 自己的資訊，並且頁面會重新讀取儲存庫，因為推送失敗前可能已經提交成功。

GitHub 登入位於設定的 **GitHub** 頁面，使用 Host 的 GitHub CLI。**登入 GitHub** 會啟動 CLI 的裝置登入，開啟 GitHub 的驗證碼頁面並顯示一次性驗證碼（CLI 也會把它複製到剪貼簿）；頁面每隔幾秒檢查一次，直到你完成授權。登入完成後還會讓 Git 用同一憑證推送到 GitHub。在原始碼管理頁面，沒有 `origin` 遠端的儲存庫會在你登入後提供**釋出到 GitHub**，以資料夾名稱建立私有或公開儲存庫；未登入時則提示前往設定。設定頁面在**我的 GitHub 專案**下列出你的儲存庫；**複製到本機**會把儲存庫複製到複製目錄並加入工作區，已經複製到該處的儲存庫顯示為已在本機。未安裝 `gh` 時，設定頁面會說明安裝方法。

| 設定 | 預設值 | 用途 |
| --- | --- | --- |
| `git` | `git` | `git` 可執行檔名稱或絕對路徑 |
| `gh` | `gh` | GitHub CLI 可執行檔名稱或絕對路徑 |
| `searchPath` | `['/opt/homebrew/bin', '/usr/local/bin']` | 在 `PATH` 之後搜尋的目錄；從 Dock 啟動的 Desktop 應用繼承的 `PATH` 較短 |
| `cloneDirectory` | `~/github` | 儲存庫複製到的目錄，每個儲存庫名稱一個子目錄 |
| `repositoryLimit` | `100` | 一次列出返回的最多儲存庫數 |
| `commandTimeoutMs` | `300000` | 單個命令被終止前可執行的毫秒數 |
| `loginTimeoutMs` | `900000` | GitHub 登入等待輸入驗證碼的毫秒數 |
| `graceMs` | `3000` | 停止命令時各終止階段之間的寬限時間 |
| `maxOutputBytes` | `4194304` | 單個命令輸出流保留在記憶體中的最多位元組數 |

<a id="understand-the-implementation"></a>
## 瞭解實作

<details>
<summary>實作細節——點選展開</summary>

Host 部分 `GitController` 提供 `git` Remote 名稱空間。它從工作階段的即時或已儲存標頭解析資料夾，並透過 `ctx.subprocess` 以顯式參數向量執行 `git` 與 `gh`，因此不會有使用者文字被 shell 解釋；憑證提示已關閉，因為沒有人能回答它們。`git status --porcelain=v2 --branch -z` 提供分支與更改列表。複製的儲存庫透過可選的 `ctx.workspaceRegistry` 登記。同一時間只執行一個裝置登入；其提示從 CLI 輸出中解析，並在後臺完成。

瀏覽器部分向 [ui-sidebar-right](../ui-sidebar-right/README.zh.md) 註冊 `source-control` 頁面型別、其標籤頁標題與「開始」頁入口，並在 [ui-settings](../ui-settings/README.zh.md) 的 `settings.section` 座註冊 `github` 頁面。`SourceControl` 擁有每個工作階段的儲存庫狀態與草稿資訊，以及所有工作階段共享的一個 GitHub 狀態。

</details>

<a id="further-exploration"></a>
## 延伸閱讀

- [右側欄](../ui-sidebar-right/README.zh.md)
- [Workspace 註冊表](../../workspace/workspace/README.zh.md)
- [Subprocess](../../subprocess/subprocess/README.zh.md)

<a id="model-experience"></a>
## 模型體驗

無，本包執行由使用者發起的 Git 與 GitHub 命令，不增加模型輸入。

#### KV 快取影響

無；命令輸出只到達瀏覽器。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 頁面沒有差異檢視、分支切換、合併衝突處理或放棄更改操作；這些請使用終端。
- 拉取只支援快進；分叉的分支會顯示 Git 的錯誤。
- GitHub 功能需要 Host 上的 GitHub CLI；透過 SSH 使用 Git 依賴 Host 的 SSH agent。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

不釋出執行時不變數伴生。每個回答都從 Git 或 GitHub CLI 讀取；外掛不保留可供比較的第二個觀測。

</details>
