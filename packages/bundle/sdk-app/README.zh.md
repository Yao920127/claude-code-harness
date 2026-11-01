---
description: "面向啟動 JSON-RPC harness 執行時的使用者與維護者，說明 SDK stdio 應用 profile。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-app`

[English](README.md) | 中文

## 概述

以 [`dsh-base`](../base/README.zh.md) 為基礎的 SDK stdio 應用 `dsh` profile 組合包。它繼承 base 預設停用模組 HMR（熱模組替換）的策略；其 patch 設定 coding agent（程式設計智慧代理）persona、掛載應用自有的零選項命令提供者，並且只在該提供者接受呼叫後啟動 [`dsh-sdk-jsonrpc-server`](../../sdk/server/README.zh.md)。因此，`dsh --profile sdk --help` 會寫出 help 並退出，不會佔用 stdin 或 stdout。獨立的 [`sdk-minimal`](../sdk-minimal/README.zh.md) bundle 複用同一個啟動提供者，並提供自己的 profile 名稱。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動提供者把 stdin EOF 接到啟動器的有界成功關閉流程。SDK 協定 `shutdown`、SIGINT 與 SIGTERM 繼續使用各自所屬的 server 或啟動器路徑；dispose（資源釋放）會排空根 profile 設定樹與持久化。stdout 專用於按換行分隔的 JSON-RPC 幀。SDK 不提供 title 表層，因此本組合包停用模型生成的工作階段標題；確定性的 fallback title 仍會持久化，但不發起輔助模型請求。繼承的投影快取會為 SDK 建立的工作階段寫入檢查點，供後續消費方使用；其永續性屏障會在釋出快取行前 flush 所覆蓋的日誌字首，因此可能拆分原本會合並的 JSONL 行。部署透過 profile 組合包與 patch 檔案選擇另一套完整組合，而不是使用另一個應用 bin。

| 設定 | 預設值 | 行為 |
|---|---|---|
| `profile` | `sdk` | 命令幫助中顯示的 profile 名稱；掛載此提供者的 bundle 會設定自己的隨附 profile 名稱。 |

`DSH_MAX_TOKENS_AS_SUCCESS` 保留 SDK 部署對映：未設定或 JSON `true` 把 token 達限的 subagent 完成報告為已接受，JSON `false` 則報告為錯誤。模型提供者／模型與工作區 cwd 透過 SDK 初始化請求傳入；base profile 擁有介面卡、工具、持久化、策略、settings 與 credentials。

SDK 使用 base 預設提供的 `read`、`write` 和 `edit`。要新增 `str_replace_editor`，請使用 [base 設定指南](../base/README.zh.md#use-this-package)中的顯式插入 patch。獨立的 `sdk-minimal` profile 自行決定其工具選擇。

打包的 Python runtime 預設啟用 [Office 執行時查詢與 skills](../../skill/tool-workspace-dependencies/README.zh.md#use-this-package)。`DSH_PRIMARY_RUNTIME` 覆蓋隨包 payload；空值停用兩行。沒有載體預設路徑的原始碼啟動仍需顯式啟用。工具原位讀取 payload。profile patch 可獨立於 `workspace-dependencies` 停用 `skill-office` 或替換其 `assetRoot`；同名檔案系統 skills 優先於隨包 skills。打包與設定見 [runtime 包](../../../python/sdk-runtime/README.zh.md)。

-----

<a id="model-experience"></a>
## 模型體驗

### SDK coding agent persona

#### 模型看到什麼

profile 在第一方指導之前提供 `You are a coding agent powered by the {{model}} model.`，並在獨立的 persona 字尾中提供 `Your working directory is {{cwd}}.`。確切的 SDK 初始化路由與工作階段 cwd 會解析其中的預留位置。預設檔案工具 schema 包含 `read`、`write` 和 `edit`，不包含 `str_replace_editor`。

#### Token 影響

一段簡短穩定的 persona，加上隨資料變化的 base 提示詞段落與所選工具 schema。

#### KV Cache 影響

對固定 profile、提供者、模型與工具清單保持穩定。由於隨附 SDK profile 使用僅啟動時 patch，profile 變化會在下一個程序生效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **profile 可能省略 SDK server**：TypeScript client 選擇的自定義 profile 必須保留本組合包或另一個 `dsh-sdk-jsonrpc-server` 設定項；沒有 peer 回應時，client 初始化會失敗。
- **使用者外掛可以破壞 stdout 純淨性**：profile 與逐次啟動 patch 屬於受信任應用組合。隨附組合包不會向 stdout 寫入非協定內容，但無法約束任意插入外掛。
- **設定變化需要重新啟動**：`sdk-app` 組合包在 YAML 中停用 HMR，因此一個 stdio 連線不會觀察到 server 或 agent 依賴被替換。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。該 bundle 增加程序傳輸與啟動 latch；幀純度、help 排除和關閉行為由原始碼及建置產物的 stdio 測試負責。
