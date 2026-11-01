# Agent Note: 側欄佈局持久化與 provider 恢復

Status: implemented

[English](2026-09-14-sidebar-layout-provider-recovery.md) | 中文

## Problem

重新整理瀏覽器會丟失已開啟檔案、分欄位置和選中項。把保留的終端重新開啟為新標籤無法還原佈局，還可能展開原本摺疊的側欄。

## Decision

側欄按 Session 持久化經過驗證的目前佈局快照和身份計數，Client store 將撤銷歷史保留在記憶體中。儲存的型別或佈局引用無效時，只清理對應 Session 的快照。重新整理後撤銷歷史清空，因此持久化資料不會隨過去的操作持續增長。它在渲染正文前恢復佈局和標籤身份，並建立資源 pin。provider 恢復自身內容；側欄不儲存終端專屬狀態，也不負責重連。臨時導航參數和資源內容不進入佈局快照。

terminal provider 讀取已採用的 Session 標籤記錄，先恢復終端模型，再查詢尚無檢視的 Host 終端。其 Client controller 在分配前將全域唯一內容與終端身份的關聯儲存為獨立記錄，重新整理後複用，並在記錄顯式關閉意圖後刪除。佈局內的 tab id 標識獨立活動檢視，不能跨視窗標識持久化程序；逐條記錄的寫入和刪除避免覆蓋無關關聯。恢復身份不允許建立替代程序。Host 負責程序存活狀態、標題和螢幕內容；儲存的關聯只是恢復目標。沒有對應恢復標籤的關聯不會阻止 Host 探測。

OpenCode 的 `packages/app/src/context/layout.tsx` 儲存 Session 標籤，`context/terminal.tsx` 獨立儲存終端身份。DSH 使用現有 Session 作用域 store 和 provider 服務實作相同的職責劃分，終端仍歸 Session 所有。

本決策部分替代 [Web 終端決策](../feature/2026-09-09-web-sidebar-terminal.zh.md)中不持久化的限定。原記錄繼續保留，因為程序歸屬、清理、流傳輸和輸入控制決策仍適用。

## Alternatives considered

**把每個保留終端恢復為新標籤。** Host 探測無法還原標籤位置、選中項或摺疊佈局，還會重複建立已恢復的標籤。

**讓側欄負責終端恢復。** 佈局所有者會因此依賴特定內容 provider。提供通用的已提交標籤查詢即可讓各 provider 恢復自身狀態。

**持久化程序中繼資料和終端輸出。** 這些值會獨立於瀏覽器佈局失效。重新連線 Host 能取得目前中繼資料和一致的螢幕。

## Consequences

同一瀏覽器站點內重新整理會保留佈局，各 Session 使用獨立儲存鍵。視窗共享每個 Session 最後儲存的佈局；活動視窗在重新整理前保留各自佈局。儲存失敗時記憶體狀態仍可用。重新整理不會重新啟動缺失或已退出的程序；Host 重新啟動仍無法恢復 shell。provider 狀態需要自身支援恢復，臨時檔案導航參數不恢復。

store 測試覆蓋佈局讀寫、有界持久化狀態、無效記錄、Session 隔離和資源採用。終端測試覆蓋身份複用、目標缺失、未啟用標籤關閉，以及沒有恢復標籤時的探測。完整瀏覽器測試使用真實終端程序身份，驗證檔案預覽、分欄、選中項、全螢幕和摺疊狀態下的重新整理。

[無人連線終端的兩小時回收](../feature/2026-09-14-unattended-browser-terminal-reclamation.zh.md)為 provider 恢復增加視窗持有的終端生命週期，保留此處的佈局/內容職責劃分。
