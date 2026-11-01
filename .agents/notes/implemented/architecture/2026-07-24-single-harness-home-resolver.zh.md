# Agent Note: 單一 harness home 解析器

Status: implemented

[English](2026-07-24-single-harness-home-resolver.md) | 中文

## 問題

對於"DeepSeek Harness 使用者資料存放在哪裡"，harness 裡存在兩套互不一致的約定：

- `@deepseek-ai/dsh-home` 按 `configured ?? $DSH_HOME ?? ~/.dsh` 解析。
- `@deepseek-ai/dsh-home-paths` 又提供了**第二個** `resolveDshHome`，優先順序相同但額外做了波浪號展開——它幾乎是 `dsh-home` 的重複實作，卻沒有任何門禁發現，因為兩者分屬不同的包，而且早已漂移（只有一個會展開波浪號）。

同一條橫切事實有兩個解析器，意味著不存在單一的 home 策略。

## 決策

由一個解析器統一掌管 harness home，落在 `@deepseek-ai/dsh-home-paths`，採用單一根目錄：

```
explicit configured path  >  $DSH_HOME  >  ~/.dsh
```

空或僅含空白的 `$DSH_HOME` 被當作未設定處理；否則，`resolve('')` 會悄悄把 home 落在目前工作目錄。harness 把所有使用者資料都放在同一個根目錄下；不存在 XDG 的 config/data/cache 拆分。`dshHomePath(...segments)` 將部署負責的子路徑拼接到該根目錄下，`dsh-app-boot` 在掛載條目前向 Loader `!!js` 設定表示式暴露它，因此出廠組合無需複製解析器即可派生 `sessions` 和 `storages`。`dshHomeDisplay()` 為面向使用者的路徑以符號形式命名已解析的根目錄——預設 home 顯示為 `~/.dsh`，任何已設定的 home 顯示為 `$DSH_HOME`——這樣使用者全域的 `AGENTS.md` 標籤就絕不會洩露機器上的絕對路徑。它取代了 agent-instructions 中自定義的「預設值 vs `$DSH_HOME`」判斷。

`dshCachePath(...segments)` 在解析出的主目錄下的 `cache` 目錄中派生路徑。首個 `{ dshHome }` 選項保留提供者顯式設定的主目錄覆蓋值。它只解析路徑，不建立目錄；目錄建立由呼叫方負責。`attachment-local` 將此函式用於可重新生成的請求圖片版本，持久附件物件仍保留在其帶版本的儲存樹中，因此清空快取不會刪除 Session 附件。已有請求圖片快取條目保留在原處，不再讀取或複製；快取未命中時從持久附件重新生成請求版本。

`@deepseek-ai/dsh-home` 被刪除。擁有 home 設定的提供者與 boot 包從 `dsh-home-paths` 匯入 `resolveDshHome`；組合包只包含解析後的設定行。

`dsh-telemetry` 及其獨立 home 策略已隨 [SDK 專案工具鏈移除](../../archived/simplification/2026-08-11-remove-sdk-project-toolchain.md)一併消失，因此該解析器是唯一的 home 策略。

## 備選方案

**保留兩份 `resolveDshHome` 副本。** 它們早已漂移（一個展開波浪號，一個不展開），並把同一條橫切事實編碼了兩遍。`util/` 層的意義正是在於合併，重複的解析器是一個潛在的分歧 bug。

**採用 XDG（遵從 `$XDG_CONFIG_HOME`，或把 config/data/cache 拆分到各自的目錄樹）。** 經過考慮後放棄，轉而採用一個顯而易見的根目錄。單一的 `$DSH_HOME || ~/.dsh` 基準事實與 `~/.claude` / `~/.aws` 一致，無需對每個 `~/.dsh` 消費方按類別重新歸類，也不留下任何需要協調的解析器不對稱。

## 影響

- 單一 home 事實，單一解析器。`dsh-home-paths` 是唯一歸屬方；`util/` 組失去了 `home` 包。
