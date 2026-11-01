---
description: "回溯 dsh-v0.1.3-alpha.1 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.1.3-alpha.1

[English](dsh-v0.1.3-alpha.1.md) | 中文

## 概述

在這些標籤之間，寫入格式從 0 升至 2：JSONL 頭以必需欄位 isSeeded 替代 seedLength，session/end-seed 新增可選欄位 inherited。刪除 assistant/chunk，新增 assistant/attempt，assistant/message 新增必需的 stream 陣列。Team 事件載荷版本從 1 升至 2，共享內容型別及可選的 capturedFormatVersion/sessionFormatVersion 中繼資料也發生變化。

## 目錄

- [發行來源](#evidence)
- [宣告](#declaration)
- [結構變化](#changes)
- [驗證](#verification)
- [開發備註](#dev-note)

-----

<a id="evidence"></a>
## 發行來源

這是供閱讀和格式驗證的近似回填，不是當時的相容性確認。提取方法和覆蓋限制見[歸檔說明](README.zh.md)。

| 專案 | 記錄值 |
|---|---|
| 原始碼 tag | `dsh-v0.1.3-alpha.1` |
| 原始碼日期 | 2026-09-04T09:16:23.000Z |
| 發行記錄 | 有 release 物件。 |
| 前一版本 | [dsh-v0.1.2-rc.1](dsh-v0.1.2-rc.1.zh.md) |
| Session 寫入版本 | 2 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->54 個根型別 / 425 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.1.3-alpha.1.schema.json](dsh-v0.1.3-alpha.1.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.3-alpha.1
previous: dsh-v0.1.2-rc.1
sessionFormatVersion: 2
changes:
  - root: JsonlHeaderLine
    before: 63496702a393356d64638beb7939468c1ba039ba3b5492327b2fe074d6cdac93
    after: 18ee62b8900a4c3d046700f05d7a4d49d6cab2a660a020c87481d1603dd8bd4f
  - root: SessionHeader
    before: 001ed6f66d67fac9cb9594b55f13557db94174fe5d5954789bb5a2d6d5927226
    after: 15918d785bdccedf0dba204622c75591bfb833bbf107ae0894bbc44cfbd73c1d
  - root: event:agent/inbox/spliced
    before: 15cdff6391d58ea00d7e2fe113b663d5479cbb3fd1af26717ad933c770bca081
    after: f757322e25914d63799c6235af4ed4b4f36d7d083fef40d6873a45e94fe6ad65
  - root: event:assistant/attempt
    before: null
    after: 3516f54b427775f483febe8e938e4e10f9afd3583610861547bbe2999ed4d8d9
  - root: event:assistant/chunk
    before: be6b0aa5cd6a279facb1c29589f92e24a0eb30d60a5869ae17acbcf6c3d12821
    after: null
  - root: event:assistant/message
    before: 6ac50e8b7feeb6a718cf502a4d32aa5430d68c01c23e6f4903db07f884b6cfe6
    after: 83f26c7a856f772e6ffd9a5a144e5aaccf771ac54cef41948f99eed99e1a25a7
  - root: event:compaction/summary
    before: 85c28ce3efec5863a9bf4b22ae57a50a03ec5337b965ee95ff77c9b9d137fa22
    after: eb1d32dcd3d76833392f351e039dcbd40686a1ab24b252a7a5003426f9cf4c89
  - root: event:session-log-deepseek/delivery-accepted
    before: 9c413656ca5600ea33812d43c4e7923a541cfb6ab8b5bc98e415f295f44e40da
    after: d63b8b8ffad9c02fd80c43a17df4f240c1fe8118ecca9de34f9d5871838ab5b9
  - root: event:session/end-seed
    before: 669846d6f47138d4b8897717b0f08476805437a4b3195c82551b527035d90bc6
    after: 5e6db6e24948d4a853c71cb9fabd252ad051ce93d4672c1266cf837c1c17b84e
  - root: event:session/title-llm-request
    before: 2cfb71f7819bc88a6bccbffa8b7ae5664233af6f6e1dfb068db25e2e17ddd8c7
    after: 6091f64d426ada2adc646094a6fe662a1b81d9ee5770929fe76800524e2c89a8
  - root: event:team/member
    before: 31d13edbb5fe2f8b7a38056320a8a06275ee4426e0abf12d4741818beda5a9c9
    after: 4fb59762612c3e3ac3a3bd4f84c9c148d3c3893bd422ba2b201cc039fabd49bc
  - root: event:team/message/delivered
    before: c53bff743470c8bf11be698ced047072744ef088cce663a774b456d7a8982516
    after: 48f9c19417a1abbedfa59f4667bba36b93ac2db407adf5e84cb3ba0de30942cb
  - root: event:team/message/queued
    before: a6a26c92459c96e4f342e58d7e41c71956e7e62c9280e30e260df58409a3012c
    after: 2ffcad547cb840f462eb1849fa5f6cb0e17eb93f5d07cc88b61d749b1b78d632
  - root: event:team/task
    before: 1688a2451eef9da19eaf45f12c8a27df07b1a6e56fa57ba603118f5201bb435b
    after: d595ec73b32b016a6055333c67a5d646032b22e672da1d4a09c5b1ae398a093a
  - root: event:tool/code-dispatch
    before: c14c2fdd439461cfc85105c6f620b0f62f799e3a69fb48196e938ec045aa0390
    after: f8dc5624cd0c942a069063ae0d90a61d821b4fddd1d967dcded91cf17933e708
  - root: event:tool/result
    before: a79feb023a08a8b73d254e29e78f13045b6773ce377b0c4156fcdf1368c146ab
    after: eacefd48000720582725ccfc6ff7a0ac02755a1a3c57a8f9754125f99aab6c1b
  - root: event:user/message
    before: e950c87ba49bd8175b8a670b319a599d5ed14cde996540d5ba91a141fad68781
    after: a57a77f18de7b37b724293830a57064696895d69f2afcd2c0264f41cd13ba980
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

檢測到 17 個根型別變化、25 項結構差異。下表的最低要求按目前規則計算，只用於比較；不表示舊版本曾遵守這些規則，也不證明遷移或執行時相容性。

| 路徑 | 變化 | 目前最低要求 |
|---|---|---|
| `JsonlHeaderLine.seedLength` | `property-removed` | `version-bump` |
| `JsonlHeaderLine.isSeeded` | `required-property-added` | `version-bump` |
| `SessionHeader.version` | `type-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].content[]` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:assistant/attempt` | `root-added` | `same-version` |
| `event:assistant/chunk` | `root-removed` | `version-bump` |
| `event:assistant/message.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.stream` | `required-property-added` | `version-bump` |
| `event:compaction/summary.data` | `union-variants-changed` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted.data.sessionFormatVersion` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data.inherited` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data` | `index-signature-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].content[]` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:team/member.data.version` | `type-changed` | `version-bump` |
| `event:team/message/delivered.data.version` | `type-changed` | `version-bump` |
| `event:team/message/queued.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:team/message/queued.data.message.delivery` | `property-removed` | `version-bump` |
| `event:team/message/queued.data.version` | `type-changed` | `version-bump` |
| `event:team/task.data.version` | `type-changed` | `version-bump` |
| `event:tool/code-dispatch.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:tool/result.data.message.content[0].content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## 驗證

提取結果已透過規範圖、根摘要和全部可達型別摘要驗證；僅對歷史 surface 事件允許原始碼原有的可選 `surfaceOp`。儲存庫內檢查從前驅重建每個 tag，核對 before/after、快照覆蓋和雙語機器宣告。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 開發備註

無。
