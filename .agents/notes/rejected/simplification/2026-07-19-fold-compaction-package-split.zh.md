# Agent Note: 將唯一的壓縮後端併入服務包

Status: rejected — 計劃增加更多壓縮後端，因此 Service Definition 包與 basic 提供者包繼續分離。

[English](2026-07-19-fold-compaction-package-split.md) | 中文

## 問題

壓縮（compaction）目前拆分在兩個包中：`@deepseek-ai/dsh-compaction` 擁有一個含兩個方法的抽象服務和共享型別，`@deepseek-ai/dsh-compaction-basic` 擁有唯一的完整提供者。交付設定只載入 basic 包，除了該提供者外，沒有生產包獨立消費 Service Definition 包。

該拆分增加了一份包 manifest（中繼資料清單）、README、專案邊界、依賴邊、抽象轉發類、生成目錄項和組合接線，卻沒有實際的後端替換案例。[能力 seam 決策](../../implemented/architecture/2026-06-13-capability-seams.zh.md)要求介面、實作和消費方都必須真實存在，而不能預先拆分；[壓縮決策](../../implemented/feature/2026-06-18-compaction-capability-seam.zh.md)也記錄了獨立消費方的實作仍被推遲。

## 提案

把 basic 實作移入 `@deepseek-ai/dsh-compaction`，並刪除 `@deepseek-ai/dsh-compaction-basic`。`ctx.compaction`、`CompactionResult`、共享 transcript（文字記錄）和工具配對輔助方法、現有設定以及具體壓縮演算法都由一個包負責。

保留 `summarize()` 作為受保護的自定義掛鉤。部署專用的摘要器可以透過繼承或攔截現有 LLM（大語言模型）呼叫完成定製，無需第二個能力包。只有在第二個完整後端與獨立消費方確實需要替換實作時，才重新引入獨立的 Service Definition 包。

如果本提案獲准，應同步修訂已實作的壓縮決策與[可回憶壓縮提案](../../proposed/feature/2026-07-06-recallable-compaction.zh.md)，使包所有權只有一處持久說明。

## 備選方案

**為可能出現的遠端或回憶後端保留拆分。** 一種可能的未來實作不足以支撐目前包邊界。回憶功能會增加壓縮結果的消費方，但不一定增加另一種實作；遠端摘要器也可以使用受保護掛鉤。

**將提供者包名用於 Service Definition 包。** 如果保留 `compaction-basic` 作為最終名稱，產品服務會看起來像一個可選後端。`compact` 已經是 `ctx.compaction` 使用的穩定服務標識，更適合作為單包所有者。

## 驗收標準

- 刪除 `@deepseek-ai/dsh-compaction-basic` 及其工作區和包中繼資料。
- `@deepseek-ai/dsh-compaction` 擁有目前設定、外掛類、演算法、型別、事件和共享輔助方法。
- 現有部署可以使用等效設定載入保留的包，模型可見行為等效。
- 自動壓縮和手動壓縮保留取消、鎖、token 用量、工具配對、持久事件、引用的來源事件 seq、重試收斂和 transcript 渲染行為。
- loader 組合、單元、失控輪次、取消、快照和真實模型壓縮測試全部透過；生成目錄與模組圖保持最新。

## 風險

這是一項有意實施的預釋出包名收縮。載入 `@deepseek-ai/dsh-compaction-basic` 的嵌入方必須切換包，未來的後端替換也需要重新提取邊界。只有在仍然只有一個完整實作時，這項代價才可接受；如果第二個後端先行落實，應重新評估是否接納本提案。
