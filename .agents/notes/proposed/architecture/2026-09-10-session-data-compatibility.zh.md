# Agent Note: Session 歷史資料相容

Status: proposed

[English](2026-09-10-session-data-compatibility.md) | 中文

## Problem

使用者關心升級後舊對話是否仍能開啟，而不是內部類名。抽象重構不能順帶改變磁碟位元組或要求手工搬移工作階段。目前 `0.1.5-rc.1` checkout 寫入 Session format V3，並已包含貫穿 V3 的 released-format migration chain。

## Proposal

### 從 0.1.5-rc.1 / V3 開始

V3 是目前 durable Session format，不是 projection-cache version。`SESSION_FORMAT_VERSION` 是 writer authority；format catalog 擁有 released v0→v1→v2→v3 路徑，其中包括獨立 V2-to-V3 stage 及其 delivery guards。原生 V3 驗證與歷史格式進入遷移是兩項獨立責任。

不得覆蓋舊 generation 或自動降級。遷移寫入新的 current generation，舊 committed generation 留給檢查與恢復；目前 runtime 可透過 catalog 開啟已釋出舊格式，但不承諾舊 runtime 能讀取 V3。

### 對普通使用者的影響

階段 1–3 只重排程式碼所有權，不改變 V3 Session JSONL bytes、`SESSION_FORMAT_VERSION` 或使用者啟動方式。普通使用者無需因本次 refactor 額外手工遷移或更改設定。首次開啟受支援的舊格式時，現有 migration pipeline 會準備並行布 current V3 generation；大日誌使用流式 stage，避免 whole-artifact 記憶體峰值。

升級前仍應保留 `DSH_HOME` 的常規備份。若開啟失敗，應保留完整 session generation 與錯誤資訊，不要刪除舊檔案；未來 provider 也必須把 unsupported future version、corruption、ownership conflict 和 migration failure 區分報告。查詢索引與其他派生資料由系統重建，使用者不需要手工遷移。

### Provider 替換後的不變數

更換記憶體實作、JSONL provider 或搜尋索引不改變邏輯 SessionId、header、事件順序、fork lineage 和 surface。Storage provider 負責已釋出格式讀取；search/statistics cache 是派生資料，可從規範 Session 內容重建，不能反向成為恢復權威。

## Alternatives considered

**在 refactor 內重新定義 V3。** 拒絕；已釋出資料相容獨立於抽象 stack。本工作必須保留既有 format authority 與 migration evidence，而不是另建平行定義。

**把每個名為 V3 的元件版本都當作 Session V3。** 拒絕；Session log 與 projection-cache 等派生格式有不同 durability 和恢復規則。

## Acceptance criteria

- 既有 V3 catalog、V2-to-V3 stage、native validation 與 released-format fixtures 保持透過。
- 階段 1–5 與 provider 抽取不改變 V3 磁碟格式；未來格式變化另有版本、遷移、重新啟動和復原證據。
- 使用者不需手工編輯日誌；錯誤保留可恢復資料並給出明確類別。

## Risks

主要風險是把新抽象耦合到 V3 目前 JSONL provider，或把可重建 projection cache 當作規範 Session 資料。替換 provider 必須保持 released-format contract，同時讓普通功能程式碼看不到物理佈局。
