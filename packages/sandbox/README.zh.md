---
description: "程序沙箱包組：隔離 seam、各平臺後端、共享策略解析器與 Windows 寫入限制檔。"
kind: "package-group"
---

# packages/sandbox

[English](README.md) | 中文

## 概述

`sandbox/` 組將子程序執行限制在檔案效果策略之下：命令以 `read-only` 執行、只能寫入工作階段工作區（`workspace-write`）或不受限制地執行（`danger-full-access`）。四個包交付該能力：隔離服務（`sandbox/`）、面向 Linux、macOS 與 Windows 的各平臺後端（`sandbox-local/`）、共享策略解析器（`sandbox-policy/`）與 Windows 寫入限制後端（`sandbox-windows-acl/`）。被策略拒絕的受限呼叫可以透過使用者批准的一次性升權重試。隔離僅適用於與主機共享檔案系統和核心的子程序；容器、microVM 與遠端執行器會替換整個能力，而不是在此註冊。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

四個包承擔隔離角色；完整約定和逐呼叫策略語義以子系統參考文件為準。

| 包 | 職責 | ctx key |
|---|---|---|
| [`sandbox/`](sandbox/README.zh.md) | 隔離服務約定：模式、強制執行、逐呼叫策略與升權詞彙 | `ctx.sandbox` |
| [`sandbox-local/`](sandbox-local/README.zh.md) | 各平臺隔離後端：Linux 先使用 bwrap，再使用 Landlock；macOS 使用 Seatbelt；Windows 使用受限權杖 | 註冊到 `ctx.sandbox` |
| [`sandbox-policy/`](sandbox-policy/README.zh.md) | 共享策略歸屬：供所有實施隔離的家族使用的部署預設值與逐工作階段模式覆蓋 | `ctx.sandboxPolicy` |
| [`sandbox-windows-acl/`](sandbox-windows-acl/README.zh.md) | Windows 寫入限制：受限子程序只能寫入工作區與私有臨時目錄 | —（由 `sandbox-local` 掛載為 win32 後端） |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考文件瞭解共享詞彙，再看隔離決策及其跨家族擴充功能。

- [程序沙箱子系統](../../docs/subsystems/sandbox.zh.md)——模式、逐呼叫策略、包裝 argv 方言與故障關閉錯誤。
- [子程序沙箱決策](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——能力邊界、升權編排與延期階段。
- [跨家族檔案沙箱決策](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——統一的共享策略歸屬與沙箱化檔案系統提供者。
- [Windows ACL 受限權杖沙箱決策](../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——為何選擇原始 ACL 受限權杖而非 mxc 與 AppContainer。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
