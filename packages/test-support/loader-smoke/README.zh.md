---
description: "面向無金鑰範例冒煙測試的共享子程序與直接 agent（智慧代理） harness，供測試作者啟動真實 Loader 組合。"
kind: "package-library"
---

# @deepseek-ai/dsh-loader-smoke

[English](README.md) | 中文

## 概述

使用 `dsh-loader-smoke` 可從應用 fixture（測試前置資料）的真實可執行檔案及其 `cordis.yml` 啟動應用，並在隔離的臨時目錄中捕捉輸出和完成清理。`runFixtureTurn` 透過已設定的根 agent 驅動一項任務，並返回最終 assistant 文字與 token 用量。測試可以選擇零建置的原始碼執行或已建置包執行，使本地和 CI 冒煙測試分別採用對應環境預期的消費路徑。這個支援層庫面向測試作者，不用於產品整合。

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

本包以已安裝消費方的方式啟動應用 fixture，並讓測試觀察結果：選擇源模式或建置模式，從隔離 cwd 用其設定啟動可執行檔案，然後要麼等待乾淨退出，要麼讓一項任務透過根 agent。

### 啟動應用 fixture

`runLoaderSmoke` 接受可執行檔案與設定路徑、可選的完整可執行檔案參數、環境覆蓋、標準輸入、執行前準備與清理前檢查。它負責隔離工作目錄、DSH 主目錄、診斷、截止時間、終止、EOF 與清理（只清理自己建立的 cwd，呼叫方自帶的 cwd 原樣保留）；程序以零狀態退出後返回兩個流，失敗時則拒絕並附帶兩個流：

```text
const result = await runLoaderSmoke({
  label: 'acp-agent',
  tempDirPrefix: 'acp-smoke-',
  binScript: '/abs/path/to/src/bin.ts',
  configPath: '/abs/path/to/cordis.yml',
  tsconfigPath: '/abs/path/to/tsconfig.json',
})
```

原始碼 smoke 測試支援的 `dsh` 啟動器時，設定 `sourceImport: 'tsx/esm'`；built 模式忽略此選項。當情境固定一個設計好的失敗面——即一次性輪次以錯誤結果結束——時設定 `expectedExitCode`；以任何其他方式退出（包括成功退出）都會使冒煙測試失敗。

### 測試交付 profile

Profile 整合 driver 使用僅限儲存庫內部的 `tests/fixtures/production-profile.ts` helper。它透過 `loadProfile` 載入指定的已交付 profile 及其組合包 patch，計算 runtime resolution，並透過 `PluginPackages` 安裝它，然後把組合包 patch 與測試 `*.patch.yml` 檔案依次交給 `boot` 掛載的根 `cordis:include`。這些 patch 應只包含測試提供者或模型、隔離持久化路徑及被測物件專用變更。只需要 agent loop 而不測試 profile 整合的包級單元測試改為在本地掛載 `dsh-agent-loop-testkit`。

### 驅動 fixture 輪次

`runFixtureTurn(ctx, options)` 讓一項任務透過恰好一個已設定的根 agent：它等待任務進入持久收件箱，把規範事件轉發給你的觀察器，刷寫工作階段，並返回最終 assistant 文字與累計用量。範例本地的 driver 繼續負責設定、渲染與斷言。

### 源模式或建置模式

`resolveExampleLaunch` 選擇範例可執行檔案從哪個產物啟動。`src` 模式在 tsx 下執行可執行檔案並設定 `TSX_TSCONFIG_PATH`，使工作區匯入透過 tsconfig `paths` 對映解析——這是零建置開發路徑。`lib` 模式在普通 Node 下執行建置後的 `lib/` 可執行檔案，使裸包外掛透過真實包 `exports` 解析，與已安裝消費方的解析方式完全一致。模式來自顯式值或 `DSH_EXAMPLE_MODE`（CI 設定 `lib`，開發時保持未設定）；其他任何值都會明確報錯。

### 可能出什麼問題

- **程序永不退出**——冒煙測試強制執行截止時間，並在失敗資訊中報告捕捉的流；會 spawn 自身程序樹的故障 fixture 可能比冒煙測試存活更久，需要外部清理。
- **建置模式需要事先建置**——選擇 `DSH_EXAMPLE_MODE=lib` 前先執行 `pnpm run build`；擁有該設定的包 manifest（中繼資料清單）還必須宣告設定中點名的每個包。
- **捕捉輸出受 execa 預設 100 MB `maxBuffer` 約束**——失控子程序在該上限處被終止，而不是在冒煙測試自選的預算處。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 harness 的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

harness 建立在一個分離之上：冒煙測試在隔離世界中的子程序裡執行，測試程序只觀察與斷言。`runLoaderSmoke` 建立臨時 cwd（或複用呼叫方提供的 cwd）、在那裡準備世界狀態、以隔離的 DSH 主目錄（該 cwd 下的 `DSH_HOME`、`DSH_AGENTS_HOME`）spawn 解析出的可執行檔案、立即關閉 stdin，並在截止時間內等待乾淨退出，然後在每種結果下都執行檢查，且只刪除自己建立的 cwd。`runFixtureTurn` 留在程序內執行：它查詢組合中的唯一根 agent，從持久收件箱收到任務起持續跟蹤，直至整個 agent 完全停穩；隨後彙總每步用量，並在返回前刷寫工作階段。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 模式解析器、`runLoaderSmoke` 子程序 harness、選項與結果型別 |
| [`src/agent-turn.ts`](src/agent-turn.ts) | `runFixtureTurn` 直接 agent driver 與結果信封 |
| — | 不釋出執行時不變數伴生入口；該測試支援包不負責維護生產事件流或可變資料；消費它的測試套件會檢驗該 harness。 |
| [`tests/fixtures/production-profile.ts`](tests/fixtures/production-profile.ts) | 僅限儲存庫內部、供整合 fixture 使用的交付 profile 組裝 helper |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 harness 逐步進入它啟動的組合以及它所服務的 fixture。

- [llm-replay](../llm-replay/README.zh.md)——冒煙測試組合為在沒有提供者金鑰的情況下執行而掛載的無金鑰模型 fixture。
- [Agent 包](../../core/agent/README.zh.md)——`runFixtureTurn` 驅動的根 agent。
- [測試策略](../../../docs/testing.zh.md)——無金鑰快照與冒煙層級。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支援包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為測試 harness 僅提交呼叫方測試的普通使用者任務，並將提示詞與工具組裝交由已載入的樹負責。

#### KV Cache 影響

除已載入樹本身的影響外，無其他影響；該 helper 既不更改請求字首，也不跨執行保留狀態。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該 harness 特別小心。它們是目前包約束，不是任務積壓。

- **建置模式需要事先建置**——擁有該設定的包 manifest 還必須宣告設定中點名的每個包。
- **捕捉的 stdout 與 stderr 僅受 execa 預設 100 MB `maxBuffer` 約束**——失控子程序在該上限處被終止，而不是在冒煙測試自選的預算處。
- **超時只終止直接子程序**——有故障的 fixture spawn 的程序樹可能比冒煙測試存活更久，需要外部清理。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
