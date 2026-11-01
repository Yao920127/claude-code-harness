# Agent Note: JSONL-only first-party Session persistence

Status: implemented

[English](2026-08-30-jsonl-only-session-persistence.md) | 中文

## Problem

產品交付並實際使用 JSONL 作為權威 Session store，而可選的 SQLite Session persistence provider 用第二種物理格式重複實作同一邏輯服務。因此，每項 Session 約定、event envelope 變更、恢復規則、package graph、平臺測試與格式遷移都要承擔第二套實作和測試矩陣，即使交付 profile 並不選擇它。已釋出 Session 格式遷移還需要保持精確逐 Session 源 generation 不變，同時釋出具名版本後繼；單資料庫 provider 需要另一套不可變 generation transaction 設計，卻沒有服務目前部署。

SQLite 全文 Session-query provider 不是另一種權威 store。它透過 `ctx.sessionPersistence` 觀察持久化，並維護獨立、可丟棄的派生索引。通用 SQLite domain-KV provider 也與 Session 日誌無關。

## Decision

`@deepseek-ai/dsh-session-persistence-jsonl` 是 `ctx.sessionPersistence` 唯一的 first-party 實作。抽象 Service Definition 保持後端無關，使儲存庫外 provider 仍可實作同一服務，但儲存庫只擁有並測試一種權威 Session 物理格式。

儲存庫不再包含 `@deepseek-ai/dsh-session-persistence-sqlite` package、其 schema resource、後端專用測試、設定介面與 Windows differential lane。跨 package 持久化測試使用真實 JSONL provider 或 owner-local fake。`@deepseek-ai/dsh-session-query-sqlite` 繼續作為可選 FTS5 query provider 使用獨立、可重建的資料庫，`@deepseek-ai/dsh-storage-sqlite` 繼續作為通用 domain-KV provider。

目前 build 不開啟或遷移已刪除 provider 寫出的現有資料庫。需要其中內容的 operator 必須先使用仍包含該 provider 的 build 匯出邏輯 Session，再執行升級。

## Alternatives considered

- **保留 SQLite 作為可選 differential backend。** 拒絕，因為未被選擇的生產 provider 仍會成倍增加每項 durable format、lifecycle、平臺與遷移義務；contract fake 與 JSONL provider 已能覆蓋共享服務，無需保留第二種權威格式。
- **保留只讀 SQLite import package。** 拒絕，因為在沒有實際部署需要時，它仍會保留 package graph 與 schema 維護成本。若真實保留資料庫需要恢復，未來可單獨設計 recovery tool。
- **把 Session-query SQLite 資料庫作為 persistence。** 拒絕，因為該資料庫是擁有獨立 ownership、schema 與重建語義的可丟棄 projection；把它當作權威來源會合並兩種無關的儲存職責。

## Consequences

Session persistence 只有一種 first-party 物理格式和一條 first-party durability path。遷移 stack 可以保持逐 Session JSONL generation 的路徑、位元組與 inode 不變，同時排他釋出最終後繼，而無需實作並行的資料庫 transaction protocol。SQLite search 保持可用，其 integration test 證明它觀察 JSONL，而不是共享權威資料庫。

刪除 provider 是針對其可選資料庫檔案的明確 compatibility cut。該變更縮小實作與 CI surface，但也移除更強的 database/WAL 儲存選項；未來 provider 需要目前 owner、部署需求、完整 shared-contract evidence，以及自身的 format-transition policy。
