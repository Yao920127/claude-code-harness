---
description: "面向啟動持久 harness agent（智慧代理）的使用者與維護者，說明純自動化 ACP（Agent Client Protocol）stdio 應用 profile。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-acp-app`

[English](README.md) | 中文

## 概述

以 [`dsh-base`](../base/README.zh.md) 為基礎的純自動化 ACP stdio 應用 `dsh` profile 組合包。它繼承 base 停用模組 HMR（熱模組替換）的策略；其 patch 設定 coding agent（程式設計智慧代理）persona 與預設模型路由、掛載應用自有的零選項命令提供者，並且只在該提供者接受呼叫後啟動 [`dsh-acp`](../../acp/acp/README.zh.md)。因此，`dsh --profile acp --help` 會寫出 help 並退出，不會佔用 stdin 或 stdout。

## 目錄

- [使用本包](#use-this-package)
- [標準自動化工作流](#standard-automation-workflow)
- [模型體驗](#model-experience)
- [已知限制與待辦事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動提供者把 stdin EOF 繫結到啟動器的有界成功關閉。ACP 連線關閉、SIGINT 與 SIGTERM 會在退出前排空 bridge 自有 agent 以及根 profile 樹。Stdout 僅保留給換行分隔的 ACP JSON-RPC 幀。ACP 不提供標題呈現能力，因此本組合包停用模型生成的工作階段 title；確定性的 fallback title 仍會持久化，但不發起輔助模型請求。繼承的投影快取會為 ACP 建立的工作階段寫入檢查點，供後續消費方使用；其永續性屏障會在釋出快取行前 flush 所覆蓋的日誌字首，因此可能拆分原本會合並的 JSONL 連續段。部署方透過 profile 組合包與 patch 檔案選擇另一套完整組合，而不是使用另一個 app bin。

隨附設定項使用 `deepseek-official` 與 `deepseek-v4-flash` 建立工作階段；後續 patch 可以替換該設定項的完整設定。base profile 負責介面卡、工具、持久化、策略、設定、憑證，以及 ACP client 為每個工作階段提供的工作區。

-----

<a id="standard-automation-workflow"></a>
## 標準自動化工作流

ACP v1 SDK 用戶端先初始化 `dsh --profile acp`，再用絕對 `cwd` 與可選的標準 stdio／HTTP MCP 宣告建立工作階段，選擇公開的 `model` 或 `reasoning_effort`，在觀察標準語義更新的同時提交提示詞，最後呼叫 `session/close`。另一個程序可以針對同一個 profile 持久化根目錄使用 `session/list` 與 `session/resume`；恢復會重新連線該請求提供的 MCP 宣告，但不會回放歷史。

完整的受支援方法矩陣、MCP 信任模型、更新對映與停止原因見 [`dsh-acp` 協定約定](../../acp/acp/README.zh.md#standard-acp-v1-surface)。該 profile 不增加私有方法、能力、`_meta`、環境變數或傳輸欄位。免金鑰控制面一致性測試透過公開 ACP SDK 驅動真實 profile。

<a id="model-experience"></a>
## 模型體驗

### ACP coding-agent persona

#### 模型看到什麼

profile 在第一方指導之前提供 `You are a coding agent powered by the {{model}} model.`，並在獨立的 persona 字尾中提供 `Your working directory is {{cwd}}.`。ACP 設定項的路由與每個 `session/new` 的 cwd 會解析其中的預留位置。

#### Token 影響

一段簡短穩定的 persona，加上 base 提示詞中隨資料變化的部分與已選工具 schema。

#### KV Cache 影響

固定 profile、提供者、模型與工具集合下保持穩定。隨附 ACP profile 只在啟動時載入 patch，因此 profile 更改會在下一個程序生效。

## 已知限制與待辦事項

<a id="known-limitations-and-deferred-work"></a>

- **profile 可以省略 ACP bridge**：自定義 ACP 啟動 profile 必須保留本組合包或另一個 `dsh-acp` 設定項；否則沒有 peer 回應 client。
- **使用者外掛可能破壞 stdout 純淨性**：profile 與單次啟動 patch 屬於受信任的應用組合。隨附組合包不會向 stdout 寫入非協定內容，但無法約束任意插入的外掛。
- **設定更改需要重新啟動**：`acp-app` 組合包在 YAML 中停用 HMR，確保一條 stdio 連線不會觀察到 bridge 或 Agent 依賴被替換。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。該 bundle 只增加程序傳輸與啟動 latch；幀純度、help 排除和關閉行為由原始碼及建置產物的 stdio 測試負責。
