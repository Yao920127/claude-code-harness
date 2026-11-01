---
description: "持久圖片附件能力族的包對映：你可以用圖片附件做什麼，以及你的圖片存放在哪裡。"
kind: "package-group"
---

# attachment/：持久附件能力族

[English](README.md) | 中文

## 概述

`attachment/` 組提供持久圖片附件：把圖片附加到提示詞和命令，harness 會把它儲存到你的機器上，重新顯示在對話歷史中，並在後續輪次傳送給模型。隨附的 `dsh` 組合無需任何設定即可支援這一點。該能力與它的儲存拆分為兩個包，見下文。已儲存的圖片在重新啟動後依然存在且永遠不會被自動刪除，並且只支援光柵圖片格式。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

這兩個包提供持久圖片附件；每個 README 描述其各自部分可以做什麼。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`attachment/`](attachment/README.zh.md) | 可用於提示詞與命令、會持久儲存並回到歷史中的圖片附件 | `ctx.attachments` |
| [`attachment-local/`](attachment-local/README.zh.md) | 把附加圖片儲存在本機 `DSH_HOME` 下 | 註冊到 `ctx.attachments` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解服務約定，再看能力 seam 表與本地後端的設定面。

- [附件子系統參考](../../docs/subsystems/attachment.zh.md)——服務約定、載荷型別與 `ctx.attachments` 的 Cordis 介面面。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。
- [生成設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-attachment-local)——本地後端的每個受支援欄位。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
