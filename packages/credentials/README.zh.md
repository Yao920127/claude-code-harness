---
description: "憑證能力族的包對映：憑證引用 seam、環境與檔案提供者、授權 flow 註冊表，以及引用如何讓機密值留在設定之外。"
kind: "package-group"
---

# credentials/：憑證與授權

[English](README.md) | 中文

## 概述

`credentials/` 組讓設定引用機密的名字，而不嵌入機密值。使用 `credentials/` 儲存、查詢和移除憑證；使用 `credentials-local/` 將憑證私密地儲存在本機，並支援按次執行的環境覆蓋；當需要向人詢問以取得憑證時，使用 `authorization/`。輪換後的儲存值會作用於下一次模型請求，而 `DEEPSEEK_API_KEY=… dsh` 在該次執行中優先。設定檔只包含憑證名稱；本地機密值只有同一 OS 使用者可讀。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

三個包共同提供憑證功能：一個在執行時儲存、查詢與移除機密，而設定只寫名字；第二個是預設的本機儲存；第三個讓外掛取得必須向人請求的憑證。它們的 README 覆蓋日常使用；全部約定以子系統參考為準。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`credentials/`](credentials/README.zh.md) | 在執行時儲存、查詢與移除機密，而設定只寫名字 | `ctx.credentials` |
| [`credentials-local/`](credentials-local/README.zh.md) | 預設本機儲存：一個私有 YAML 檔案，環境覆蓋優先 | 註冊 `ctx.credentials` |
| [`authorization/`](authorization/README.zh.md) | 由外掛擁有、透過詢問人來取得憑證的 flow | `ctx.authorization` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享詞彙，再看能力 seam 表與本地儲存的設定面。

- [憑證子系統參考](../../docs/subsystems/credentials.zh.md)——`CredentialRef` 與 `CredentialKey`、按操作解析、可安全用於 UI 的 `CredentialInfo`、授權 flow 與生成的 Cordis 介面面。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。
- [生成設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)——本地儲存的每個受支援欄位。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
