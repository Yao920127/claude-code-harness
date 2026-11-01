# Agent Note：Web 子代理目錄消費共享 projection

Status: implemented

[English](2026-09-08-web-subagent-catalog-projections.md) | 中文

## 問題

父目錄 projection 已透過 Session control stream 釋出完整成員關係。獨立的目錄變化事件、重複 RPC 讀取與第二份成員快取重複傳遞同一資料，並要求協調回應與後續事件。歷史 Session 的 projection 缺席時仍需初始載入，父 Agent 可用性也獨立於持久成員關係。

## 決策

Client 僅在標準逐 Session projection store 中保留目錄成員關係。初始 `session.projections` 讀取透過一次 live-preferred Session observation 返回完整 projection 基線。endpoint 接受任意 Session id，不含目錄專用依賴或驗證。值與序號遊標來自同一次 observation。初始基線與即時 control 幀使用 store 既有的序號排序，因此舊回應不能替換新值。該 endpoint 不啟用 Agent，也不取樣子代理活動狀態。開啟工作階段時使用其 follow baseline，不再額外排程一次投影讀取；未開啟的目錄分支仍使用顯式讀取。

功能消費者從 `projectionsBySession` 中選擇 `subagentCatalog`，並從 Session 列表基線與狀態事件派生行活動狀態。Session 摘要單獨報告 Agent 可用性；Agent 建立與銷燬重新發布已有摘要事件。完成的子代理在移除後保留摘要與展示 projection。通用 projection 讀取擁有載入與錯誤狀態；父 Agent 可用性來自 Session 列表，獨立於成員關係。開啟已載入目錄會複用資料，初始失敗可以重試。重連取消此前的讀取，併為已請求的目錄重新讀取。Session 移除會取消其待完成讀取並將父 Agent 可用性標為 false；projection 回應不能改變 Agent 可用性。

[父目錄決策](../architecture/2026-09-01-parent-owned-subagent-catalog.zh.md) 說明持久建立事實與順序。本決策取代 [Web 子代理工作階段](../feature/2026-07-27-web-subagent-conversations.zh.md) 中的專用成員重新整理機制；該記錄繼續保留導航、控制與展示決策。

Host 摘要替換執行狀態與可用性；本地 create/fork 佔位摘要只補充缺失的中繼資料。若共用覆蓋行為，晚到的本地回應會抹去較新的 Host 狀態，並生成虛假的完成提醒。普通 Session 移除後，僅為非空子目錄保留 store；空目錄沒有需要保留的導航關係。麵包屑 selector 從 Session 列表快照推導地址，使訂閱涵蓋全部依賴。

## 考慮過的替代方案

**保留通知驅動的讀取。** 不採用，因為共享流已經傳遞變化後的值。選單訂閱、請求內活動狀態回放與尾隨成員讀取沒有提供額外的必要傳遞能力。

**刪除初始讀取 endpoint。** 暫緩。Session 列表 projection 是可能缺席的快取提示；跟隨工作階段還會傳輸歷史並保留 observation 狀態。輕量讀取保留歷史目錄存取能力，無需建立工作階段跟隨流。父 Agent 可用性是即時投遞提示，而非持久 projection 事實。

## 影響

成員變化使用既有 control stream，無需額外目錄通知或讀取。對 D 個子級釋出完整 projection 值仍需 O(D)；本變更不引入增量傳輸。初始讀取返回 observation 的完整 projection 基線，其中包括目錄以外的值，以額外初始載荷換取標準基線語義的複用。Session 序號排序不確立複用 Session id 之間的身份關係。

Manager 測試覆蓋成員推送、過時初始回應、按需載入、狀態組合、完成中繼資料保留、重試、空目錄移除、晚到的 create/fork 回應與重連取消。Host 測試覆蓋共享 control stream 與冷 observation。持久化子代理 Web 情境透過釋出應用驗證巢狀歷史導航與續傳。
