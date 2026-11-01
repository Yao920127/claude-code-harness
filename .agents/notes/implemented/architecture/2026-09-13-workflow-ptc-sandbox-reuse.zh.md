# Agent Note: 工作流複用 PTC Node 沙箱

Status: implemented

[English](2026-09-13-workflow-ptc-sandbox-reuse.md) | 中文

## 問題

動態工作流執行模型編寫的 JavaScript 並啟動 subagent。worker 執行緒把腳本執行移出主機事件迴圈，但逃逸 VM 的程式碼可以使用 Node 並擁有主機程序的檔案權限。PTC 已有 Node 程序實作，負責 OS 檔案約束、隔離的程式狀態、有界輸出與控制通訊，以及受管清理。維護第二套啟動器會重複這些職責。

## 決策

`dsh-workflow-ptc` 透過共享的 Node `PtcRuntime` 實作 `WorkflowEngine`。每次執行在一個 PTC 程序中保留既有 VM 與工作流輔助函式。Host 繫結將 guest 連線到設定的 subagent 提供者及工作流觀察器；Host 提供發起呼叫的 Agent，並解析其 Session 的常設檔案策略與 cwd。

VM 定義輔助 API，以及協作式並行、agent 總數和條目上限。它不是安全邊界，這些計數器也不是 Host 強制的安全配額。檔案強制、V8 堆限制、輸出與控制限制、受管程序清理仍由 PTC 及其沙箱／子程序提供者負責。網路存取與提供者特有的約束限制保持與 PTC 相同。

工作流執行傳入 `timeoutMs: null`，顯式停用 Node 執行時的經過時間定時器。省略 timeout 或使用數值的 PTC 請求保留設定的預設值與上限；`run_code` 仍只接受正數覆蓋值。最初的 VM 片段保留獨立的同步超時。呼叫方的中止訊號（包括外層工具截止）仍會取消工作流。

取消立即中止 PTC 程序，以及待啟動和活躍子 agent 共享的訊號。介面卡等待待完成啟動與子 agent 資源釋放，包括取消後才釋出的子 agent。PTC 停止程式；已經進行中的 Host 繫結仍由其呼叫方負責。不增加工作流清理定時器，也不等待 guest 取消確認。

進度同時只使用一個繫結呼叫。首批同步發起，後續事件按序排隊，並在子 agent 資源釋放及最終結果之前完成傳遞。這避免普通日誌突發耗盡 PTC 的待完成呼叫上限。取消會停止對子 agent 結果的等待，但仍等待子 agent 資源釋放。

Node 載入程式傳送終態幀後保持控制管道開啟，直到 Host 將其關閉。未被等待的繫結回覆可能仍在傳輸，因此子程序提前關閉會讓 `EPIPE` 與已經完成的程式結果發生競爭。

[動態工作流決策](../feature/2026-07-05-dynamic-workflows.zh.md)保留腳本、結構化輸出、事件與工具語義；本文只取代其執行基底與信任實作。[沙箱化 Node PTC 決策](2026-09-11-sandboxed-node-ptc-runtime.zh.md)保留執行與控制保證；顯式 null 截止擴充功能其服務選項。[agent 作用域執行時設計](2026-07-12-agent-scope-runtime-design.zh.md#workflow-children-are-pending-starts-or-published-records)保留待啟動與子 agent 清理的歸屬規則。

## 曾考慮的替代方案

**保留 worker-thread 執行。** 終止 worker 無法應用 Session 的 OS 檔案策略，也無法提供直接 Node 程式碼所需的受管程序清理。

**建立獨立的工作流子程序執行時。** 另一套啟動器、控制傳輸與沙箱介面卡會重複維護相同執行職責。PTC 已經接受程式和具名非同步 Host 繫結，無需瞭解工具或 Session。

**用直接 Node 工作流 API 替換 VM。** VM 與輔助函式保留既有腳本語義、同步片段超時與 JSON 物化。實作 OS 約束不需要移除它們。

**對工作流應用 PTC 的數值截止。** 工作流可能等待一長串 subagent。顯式 `null` 保留呼叫方控制的生命週期，不改變普通 PTC 預設值，也不把任意大的數值當作沒有截止。

## 後果

工作流與顯式啟用的 Ralph 執行共享 PTC 的安全與程序生命週期實作。Ralph 在已釋出預設組合中保持停用。腳本仍使用相同掛鉤與結果信封；不增加新的權威進度臺帳或 Host 子 agent 數量配額。

取消不等待腳本協作推進。介面卡等待子 agent 清理，因此不履行生命週期約定的 subagent 提供者可能延遲資源釋放。程序清理保留所選子程序提供者對受管範圍的限制；本變更不宣稱程序樹 CPU/RSS 計量或普遍的後代終止保證。
