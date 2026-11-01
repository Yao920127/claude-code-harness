---
description: "POSIX SSH 提供者家族：共享連線、遠端檔案系統、託管子程序及檔案效果沙箱。"
kind: "package-group"
---

# ssh/ — POSIX 遠端執行提供者

[English](README.md) | 中文

## 概述

本家族將檔案、普通程序、終端及沙箱執行放在同一臺 POSIX SSH 主機上，Harness 保留在本地。共享 OpenSSH 連線與已安裝輔助程式支援現有檔案系統、子程序及沙箱介面。適用於消費方遵守提供者路徑語義的 headless 或自定義設定組合。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 | 服務 |
|---|---|---|
| [`ssh`](ssh/README.zh.md) | 連線、輔助程式身份及傳輸生命週期 | `ctx.ssh` |
| [`fs-ssh`](fs-ssh/README.zh.md) | 遠端檔案身份、讀取及帶保護的原子修改 | `ctx.fs` |
| [`subprocess-ssh`](subprocess-ssh/README.zh.md) | 可執行檔案查詢、程序、控制流及終端 | `ctx.subprocess` |
| [`sandbox-ssh`](sandbox-ssh/README.zh.md) | 遠端檔案效果限制及執行資訊 | `ctx.sandbox` |

<a id="related-documentation"></a>
## 相關文件

- [SSH 子系統](../../docs/subsystems/ssh.zh.md) — 共享執行座標及傳輸歸屬。
- [POSIX SSH 決策](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md) — 替代方案、影響及驗證要求。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

遠端能力實作保留共享非同步終端及取消介面。絕不能從遠端路徑字串推斷本地路徑存取能力。

</details>
