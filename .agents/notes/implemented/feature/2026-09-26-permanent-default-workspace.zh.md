# Agent Note: 永久預設工作區

Status: implemented

[English](2026-09-26-permanent-default-workspace.md) | 中文

## Problem

[首次使用預設工作區](2026-09-20-default-workspace.zh.md)只在不存在任何 Workspace 和 Session 歷史時建立，刪除其登記會永久停用它。已有 Session（包括沒有工作目錄的未分組 Session）的安裝環境因此永遠得不到預設工作區，輸入框在每次傳送第一條訊息前都要求使用者選擇資料夾。使用者需要一個始終可用、不會被誤刪的工作目錄。

## Decision

[Workspace 註冊表](../../../../packages/workspace/workspace/README.zh.md#first-use-workspace)保留一個永久預設工作區。`initializeDefault` 不再檢查 Session 歷史或其他登記：它返回已登記的預設工作區，並在磁碟上缺少其目錄時重新建立；否則解析目錄、建立目錄並登記。已登記在該目錄的 Workspace 會被採納為預設工作區。舊版本已刪除其登記的標記會被取代。`delete` 以 `WorkspaceDefaultUndeletableError` 拒絕刪除預設工作區，[Host 控制器](../../../../packages/api/workspace-controller/README.zh.md#first-use-workspace)將其對映為 `workspace/default-undeletable`。

Host 控制器在啟動時確保預設工作區存在，每個 `follow` 基線都會等這次嘗試結束，因此瀏覽器的第一個檢視就已列出預設工作區，啟動恢復透過普通的工作區最近使用規則選中它。Remote `initializeDefault` 仍是兩個基線都為空時瀏覽器採用的重試路徑，如今這表示 Host 未能準備預設工作區。`WorkspaceView.isDefault` 標記該行，側邊欄在其選單中省略刪除。

不得在其帳戶下建立目錄的 Host 可以用 `defaultWorkspace: false` 關閉預設工作區；該 Host 不做任何確保，`initializeDefault` 返回 `undefined`。每個帳戶的預設目錄都是 `<home>/default-workspace`：`baseDirectory` 預設為 `home`，`productDirectory` 預設為空，因此不做系統查詢。每次確保都會解析設定的目錄；它與已登記預設工作區的目錄不同時，預設工作區移到該目錄，原預設工作區保留為普通工作區，其 Session 和檔案不變。查詢失敗時保留已登記的預設工作區。目錄內容仍遵循[只刪除中繼資料的刪除策略](2026-07-27-workspace-registration-deletion.zh.md)，語言中立的名稱與標題遵循[預設工作區命名](2026-09-23-language-neutral-default-workspace-naming.zh.md)。

## Alternatives considered

**保留首次使用資格，讓使用者自行新增資料夾。** 已有歷史的安裝環境仍會在沒有工作目錄的狀態下啟動，這正是被報告的問題。

**只在瀏覽器中隱藏刪除。** 其他 Remote 用戶端仍可刪除該登記；由註冊表擁有這一不變數，所有呼叫方都會遵守。

**讓瀏覽器在每次啟動時建立預設工作區。** 每個瀏覽器都會與 Host 競爭並重複查詢 Documents，Host 查詢失敗後每個用戶端還會各自重試。Host 端確保只在每次啟動時執行一次，並讓所有瀏覽器看到相同的基線。

**移除 Remote `initializeDefault`。** Host 無法準備目錄時，瀏覽器將失去引導使用者透過“選擇工作區”選擇資料夾的恢復提示。

## Consequences

每次 Host 啟動都會解析設定的目錄，並最多執行一次 `mkdir`；只有 `documents` 基礎目錄會做系統查詢，查詢緩慢時，第一個工作區基線最多延遲 `documentsLookupTimeoutMs`。預設工作區登記在 Documents 下的安裝環境會在下次啟動時移到 `<home>/default-workspace`。已有安裝環境在下次啟動時獲得預設工作區；之前的 Session 保留其記錄的工作目錄，位置不變。使用者可以重新命名預設工作區，但不能刪除；仍可在產品之外刪除其檔案，下次啟動會重新建立目錄。註冊表測試覆蓋不依賴歷史的建立、採納、拒絕刪除、目錄重建與過期標記；註冊表測試還覆蓋預設工作區的遷移，以及查詢失敗時保留預設工作區；控制器測試覆蓋啟動順序、設定的產品目錄、遷移到新設定的目錄與錯誤對映。
