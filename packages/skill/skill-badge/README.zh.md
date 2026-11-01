---
description: "隨包附帶的「powered by dsh」徽章 skill（技能），供啟用、使用或排查該可選徽章提供者的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-badge

[English](README.md) | 中文

## 概述

agent（智慧代理）可以透過該內建提供者載入官方「powered by dsh」徽章 skill，並遵循其指令，給文件、PR（Pull Request）以及其他用 DeepSeek Harness 生成的內容新增署名徽章。該提供者沒有設定，隨附 CLI（命令列介面）組合以停用狀態包含該外掛，因此部署方需要顯式啟用。該 skill 同時提供 Markdown 片段和隨包分發的 PNG，供無法可靠匯入遠端圖片的系統使用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟用外掛即可讓 `dsh-badge` skill 出現在工作階段 skill 目錄中；隨後模型可以像載入任何其他 skill 一樣載入它，並遵循其指令新增「powered by dsh」徽章。

### 何時選擇

當用 DeepSeek Harness 生成的內容應攜帶官方署名徽章、且部署方希望該徽章 skill 對 agent 可用而無需存入本地 skill 目錄時，選擇此提供者。當徽章與部署無關時，請跳過——外掛預設停用，啟用前不增加任何東西。

### 啟用外掛

該外掛沒有設定。把它的組合行加入組合即可；隨附 CLI 組合以 `disabled: true` 攜帶該行，因此在那裡需要顯式啟用。

```yaml
- name: '@deepseek-ai/dsh-skill-badge'
```

啟用後，`dsh-badge` 會出現在工作階段目錄的可用 skill 中。該 skill 覆蓋遠端 Markdown 徽章（基於 Shields.io）和隨包分發的 PNG 徽章資源，後者用於無法可靠取得遠端圖片的目標環境。

### 徽章 skill 提供什麼

- **Markdown 片段。** 在文件、PR 與 merge request 中嵌入官方徽章標記的指令。
- **隨包分發的 PNG 資源。** `dsh-badge.png`（726×120 源圖，按 121×20 渲染），在無法匯入遠端圖片的環境中可用。

### 可觀察的成功與失敗

啟用外掛會使 `dsh-badge` 出現在目錄中並可憑名稱載入；停用或省略該行則它不會出現在任何目錄中。由於提供者不可變，發現始終成功且恰好返回一個 skill，絕不會報告部分結果。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋內建提供者如何接線；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供者是一個不可變、同步註冊的 skill 來源：它以 `dsh-badge` 作為提供者名稱、按內建 skill rank（600）註冊一個固定候選項，把隨包分發的 `assets/` 目錄作為該 skill 的目錄資源基底公開，並在每次載入時從隨包分發的 `assets/dsh-badge.md` 檔案讀取 skill 正文。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口與不可變提供者：一個候選項、資源基底、正文載入 |
| — | 不釋出執行時不變式伴生入口；本包只持有一個不可變的提供者註冊，註冊唯一性與生命週期檢查由 skill 註冊表負責。 |
| [`assets/`](assets/) | 隨包分發的 skill 正文（`dsh-badge.md`）與 PNG 資源（`dsh-badge.png`） |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時，請閱讀以下頁面。這些頁面先介紹該提供者註冊到的註冊表，再說明 skill 如何到達模型。

- [skill 子系統參考](../../../docs/subsystems/skills.zh.md)——該提供者實作的註冊表與提供者約定。
- [skill 包](../skill/README.zh.md)——該提供者註冊到的註冊表，以及已載入 skill 的共享渲染。
- [tool-skill 包](../tool-skill/README.zh.md)——徽章 skill 如何到達工作階段目錄與模型。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-skill` 間接影響模型；該包會把該提供者的目錄條目和所選 skill 的正文渲染給模型。

#### KV Cache 影響

該外掛預設停用，不會改變任何請求。啟用後，其目錄條目和任何已載入正文都會在各自插入點改變提供者的 KV 字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明內建提供者不做什麼。它們是目前包約束，不是任務積壓。

- **固定一個 skill，無執行時自定義**——提供者恰好貢獻 `dsh-badge` 這一個 skill；需要其他徽章變體的部署請自行編寫 skill。
- **遠端 Markdown 依賴 Shields.io**——遠端徽章標記內嵌 Shields.io 圖片；目標環境無法可靠取得遠端圖片時，請使用隨包分發的 PNG。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
