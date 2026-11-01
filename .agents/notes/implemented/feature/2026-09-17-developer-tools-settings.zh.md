# Agent Note: 共享開發者工具設定

Status: implemented

[English](2026-09-17-developer-tools-settings.md) | 中文

## Problem

診斷檢視、預設選擇和改動檔案摘要增加了日常任務的複雜度。支援腳本的 HTML 還授予了基礎文件預覽不需要的能力。桌面端和 Web 共享這些渲染器，分別設定開關會讓同一設定在不同用戶端產生不同結果。

## Decision

設定域內的 `ctx.configForms.developerTools` 偏好物件使用共享條目表單，提供一個已接受的 `ui-settings.enabled` 偏好。最初預設關閉的選擇用於降低日常任務的複雜度；[偏好解析後預設開啟開發者工具](2026-09-20-developer-tools-default-on.zh.md)取代該預設值並負責啟動時的啟用策略。Web 和桌面端的通用設定提供同一個開關。現有設定傳輸負責驗證、有序寫入、持久化和恢復；迴環 Web 和桌面端跟隨 Host 接受的狀態。遠端 Web 持有一個所有消費者共享的瀏覽器本地可觀察值，重新整理後重置，不傳送 Host 寫入。

關閉時隱藏 Trajectory View，在沒有可見 View 宣告工具呼叫檢查能力時隱藏 Inspect 操作，可見 View 少於兩個時隱藏工作階段 View 標籤欄，隱藏新工作階段預設入口並拒絕 Agent 預設卡片的選擇操作，並省略改動檔案卡片及其摘要讀取。其他外掛註冊的 View 保持可用。在 Trajectory 中關閉開關會啟用 Chat。預設組合、儲存的預設值、Session 事件和顯式交付卡片保持不變。此偏好是展示策略，不是 Host 授權。

外掛組裝層將共享偏好轉換為元件自身的能力（`showCodeDiff`、Agent 預設各介面讀取的 `developerTools`，以及 `interactivePreview`）。Conversation 根據可見目標的 `toolCallFocus` 提供檢查回呼；Chat 不再指定目標名稱。內建 HTML 渲染器使用 DOMPurify 清理完整文件並防護解析變異。關閉時保留根節點樣式，移除主動文件、資源提示、SVG 動畫及所有 `href` 屬性，再放入不授予沙箱權限的 iframe，並透過 CSP 禁止腳本和外部資源。不讀取關聯檔案。開啟時保留不透明源的腳本 Blob 渲染器及其有界關聯檔案讀取。切換模式會替換瀏覽上下文並清理待處理讀取。[文件預覽決策](../architecture/2026-09-08-document-preview-operations.zh.md)和[檔案系統讀取權限](../architecture/2026-09-09-workspace-file-read-authority.zh.md)繼續定義高階渲染與 Host 讀取存取。

## Alternatives considered

**僅在桌面端提供開關。** 所選需求沒有僅限桌面的約束，相關 UI 也是共享的。桌面端條件判斷會讓 Web 渲染器的展示和預覽行為不一致。

**隱藏控制元件但不改變啟用的 View 或 iframe。** 之前選擇的診斷內容和已經執行的腳本會在切換後繼續存在。過濾可用 View 並重新掛載 HTML 上下文，可以立即執行所選展示策略。

## Consequences

基礎 HTML 放棄 JavaScript、外部與關聯資源和連結導航；行內樣式與 data 圖片仍可用。高階模式保留正常瀏覽器網路能力，不增加父源、彈出視窗、表單或頂層導航權限。此設定不約束第三方預覽實作，也不撤銷 Host 檔案系統讀取權限。

元件和設定測試覆蓋預設值、schema 拒絕、已接受狀態更新、入口摺疊、改動檔案展示和 iframe 清理。基於已記錄 Session 的[文件預覽](../../../../apps/web/tests/document-preview.e2e.ts)與[改動檔案](../../../../apps/web/tests/changed-files-turn.e2e.ts)情境驗證真實設定控制元件及共用渲染器。瀏覽器腳手架使用產品預設值，除非情境指定偏好。設定外殼、文件預覽和改動檔案情境顯式關閉開發者工具；這些情境共同覆蓋診斷控制元件隱藏、靜態預覽和切回 Chat。Host 拒絕寫入後會恢復已接受狀態，並顯示在地化重試提示。原生 Electron 執行尚未驗證。
