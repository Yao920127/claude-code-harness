---
description: "回溯 dsh-v0.0.1-rc.1 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.0.1-rc.1

[English](dsh-v0.0.1-rc.1.md) | 中文

## 概述

這是現有 DSH alpha/rc 標籤中最早的版本，作為歷史基線：包含 42 個持久化根型別，寫入格式為 0。

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
| 原始碼 tag | `dsh-v0.0.1-rc.1` |
| 原始碼日期 | 2026-08-10T19:25:09.000Z |
| 發行記錄 | 只有 tag，沒有 release 物件。 |
| 前一版本 | 最早可用的預發行 tag；沒有更早的比較輸入。 |
| Session 寫入版本 | 0 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->42 個根型別 / 341 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.0.1-rc.1.schema.json](dsh-v0.0.1-rc.1.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.0.1-rc.1
previous: null
sessionFormatVersion: 0
changes:
  - root: JsonlHeaderLine
    before: null
    after: 63496702a393356d64638beb7939468c1ba039ba3b5492327b2fe074d6cdac93
  - root: SessionEventEnvelope
    before: null
    after: 75af2f6612424c13f0e4e215925c3520923c85f2774c1c505490cff6c4747bc2
  - root: SessionHeader
    before: null
    after: a50373168c4935222b1681223d919a56d095ce37ad45c5ba2c20d75235adf937
  - root: event:agent-preset/selected
    before: null
    after: dcfce00f7b4db0ec0d652c4f4a4cdfe00b728da9ce132efefb1393c3943782f7
  - root: event:agent/inbox/spliced
    before: null
    after: 264e11c61f93de1be14d4c515b517ca4d201eb539d5148c7e2973f26a50c7e23
  - root: event:approval/asked
    before: null
    after: 976f2c5f972f5af8f96c4e8ab19383bd64ef4bb8b14bcf8c8d94f4df1e762e9c
  - root: event:approval/decided
    before: null
    after: 1bf7832b6c2b95f3555dac19d34065fae19999c81d25f7d6cf04fe9c77552b48
  - root: event:approval/policy
    before: null
    after: cce8f654f2885f425de9f235c1a03794b5ff4937d1ad304f7721a97e364cc601
  - root: event:assistant/chunk
    before: null
    after: 6941f6ed08c5a5e296852ce6d3661bf063fb8923ab3b7f1614bcafd7aa11b15d
  - root: event:assistant/message
    before: null
    after: ed8be09ea84f4ae65e1f90b54b16f571f221d8591780ea02c86fb47a326a2ea9
  - root: event:command/done
    before: null
    after: ef2a4328b90be1b415bcce88b7abd27e6d2e18f4a6f2fe0f4e7ee5542a7674be
  - root: event:command/run
    before: null
    after: 83bc42948e1c7da398e1b596a0fab808e2b410457498b90a47466a73ad5299d5
  - root: event:compact/end
    before: null
    after: 2d716a572add9ecf56c7ddcaaf38e919f562ff9dd3f01889c44594635152d84e
  - root: event:compact/prune
    before: null
    after: b489c09d9067a6312a1b61f955f0d86aabbd4a103bf6a10fe145e3c75ad65a9c
  - root: event:compact/start
    before: null
    after: 3bec49e3d40a344b64b6a0d445d2e19f179b7d0ad23b5f00d90612fa260d6b27
  - root: event:compact/summary
    before: null
    after: 0a3551284c84ff0f8b1040698ece64513c136a4c1b504d13192057a083e523b3
  - root: event:feedback/record
    before: null
    after: d342dd39f6eab7565340782afccb4c66dea52744f17e9d3b267f7666319ece63
  - root: event:goal/change
    before: null
    after: 7e0b8a5bf14c5709d8645c9022fb1835fb9de915ff94b3c7276ac86a03912ab0
  - root: event:hook/invoked
    before: null
    after: 47aba122c2eba565fca03e4433586b00b75edc7c9c15cc970419d261b75ec748
  - root: event:hook/result
    before: null
    after: c50ce5176c069912b904fcc832153e3db0c95545d1eb015bd45222eb84f8c664
  - root: event:llm/retry
    before: null
    after: 562f0f8138cfdf4b6f7c7d23c95d4c0b30f1a4ccb4db118c2978d8828fb42eb7
  - root: event:llm/retry-started
    before: null
    after: c2d00a5b35a0a648f97f14d855ca23af9feec1a4d1e5e05548adc0352ba234b5
  - root: event:permission/preset
    before: null
    after: d2a5c0f253863c7fa956d483f71d6c013862f91c1458bbc741417c597230478b
  - root: event:plan/mode
    before: null
    after: 67cc5900f3194024998a4f65f7fb50e6c8b30c3393d52e545dbca89c731dc096
  - root: event:request/context
    before: null
    after: af86fda2262cdb5e047091edb5f402c2e66eb06c8c68783654e6da987feae05c
  - root: event:request/header
    before: null
    after: d075d9d331ec389bd1a2796f87348556f15ee799b60d4307712b06ec0bd50daa
  - root: event:sandbox/mode
    before: null
    after: e0d0bdff25ad9be31aee94770baf1d83c8950110f80d8cb0dfd8a143465fe290
  - root: event:session/end-seed
    before: null
    after: ed81f8c485d16e2717a65c7b6feab7b6552bd79a6634ea9e7deb2bd958940320
  - root: event:session/title
    before: null
    after: a0c63e3dcf542a4a8bef65f90e015178933a13eb63cfb838d59399081f635ce1
  - root: event:session/title-llm-request
    before: null
    after: a968ab9ddc4489b5c84f9302c58b5070b1379dd98b9aff8d22e076d55c707647
  - root: event:step/end
    before: null
    after: 0168132589f5214805264d9d2eb016047562c262925d8f3cec3587e9327c27b8
  - root: event:step/start
    before: null
    after: 5d4bdc47d480625d4b36ce563dcbdf5e1cf69a5f2126cc21104f78e057a954d0
  - root: event:subagent/descriptor
    before: null
    after: 10a830802d3a4128b275c72e4752f371398a8f235b4f6d9695b473895566df06
  - root: event:todo/write
    before: null
    after: bb8e5c7b55601a8ce4b2e83768cb1ea2a6bd406d5a4b803802ff1d99a232d984
  - root: event:tool/call
    before: null
    after: 0442fcc4f0ed6a21c9b68206e7e2728ca8f0ff4da0e5d8cf18a7dd73dca9258e
  - root: event:tool/code-dispatch
    before: null
    after: 3a992ae57f950015c1269216c186c1c57ce0ebecf4d3296a09864ae9395d0cec
  - root: event:tool/code-dispatch-start
    before: null
    after: 151dda92d52dfe13512e9c84717b8f65e031287f0a64893f08bc915cf7ecf101
  - root: event:tool/result
    before: null
    after: 356b0c7f439cdc3d5cba9873c8dbe472bead730b8cde27481be094004a4f1327
  - root: event:turn/end
    before: null
    after: 2a844951f204be73862c15fe3cf82c074ad718f12b9aa8a0e7d3efdd23c20530
  - root: event:turn/start
    before: null
    after: 5aee351286dccded87a8af1af1678ef38f407617cf12d2dc754ed8a61b9a7d09
  - root: event:user/message
    before: null
    after: c4b5e355b7c7ce538ccb1210b5c042d4bbfe33dd57a910ccd34c7afa11cde648
  - root: event:web/deepseek-search-llm-request
    before: null
    after: 0c5c79711e02bd8faed288bb89a39c77af15ad28010a0ee3d5c98adb1e5c3fe5
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

本條記錄建立歷史比較起點。機器宣告列出所有提取的根型別，不對更早版本作相容性判斷。

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
