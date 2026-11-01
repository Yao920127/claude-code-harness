---
description: "為 Web profile 新增實驗性逐呼叫 Auto review，在工具以 Full access 執行前使用目前 agent 的模型審查。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-auto-review

[English](README.md) | 中文

## 概述

為 Web profile 目前工作階段權限選擇器新增 Auto review。每次原生或 PTC inner 工具呼叫前，目前 agent 的 provider 與模型會評估待執行動作；獲准呼叫以 Full access 執行，被拒絕呼叫會請求使用者審批。dsh 安裝隨附此層但預設關閉；在 Web 側欄外掛頁開啟或顯式安裝之前，預設 Web 保持三種權限模式。Auto review 是實驗功能：它可能誤放行不安全動作、誤拒絕有用操作，並消耗額外 token。

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

### 安裝到 profile

從原始碼 checkout 透過既有 CLI 將包安裝到 Web profile：

```sh
pnpm dsh plugin --profile web add ./packages/experimental/auto-review
```

CLI 會在需要時初始化 profile，並將本包宣告的 patch 追加到 base 與 Web 層之後。Reconciliation 將 patch 啟用為 profile 層；沒有 `dsh.bundle.patch` 的包只是已安裝依賴。在 composer 或 `/permission` 選擇器中選擇帶右上標 `EXP` 的 `Auto review`，並確認目前工作階段風險對話方塊。顯式 `/permission auto` 命令直接切換。通用設定與未來工作階段預設值不提供 Auto。

透過同一 CLI 移除此層：

```sh
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-experimental-auto-review
```

### 獲得的能力

Auto 在每個受支援呼叫的 body 執行前審查一次，包括每個已開始的 PTC `tools.*` inner call。它按實際效果分類：普通專案內操作和精確清理本 Session 建立的物件屬於 low，直接允許；不可逆刪除既有物件、生產操作、外部寫入和安全控制變更屬於 medium，需要目前 human 或直接父級明確授權動作、目標與範圍。跨信任邊界洩露敏感資訊屬於 high，始終拒絕。效果不明確和授權衝突未解決時拒絕。選擇 Auto 會設定 `ask` 審批策略，因此被拒絕呼叫會請求使用者審批，獲批後才執行；審批被拒絕或取消時 body 不執行。程序內委派 child 固定 `never` 策略，其拒絕是最終結果。Reviewer 回應不合法和技術失敗會以具體錯誤使呼叫失敗，且從不執行。

最終拒絕使用普通工具卡片。摺疊行標識 Auto review；展開輸出說明 body 未執行，並顯示可選理由。[Web 權限包](../../client/ui-permission-presets/README.zh.md)擁有選擇器互動，[工具 UI](../../client/ui-tool/README.zh.md)擁有理由展示。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部機制——點選展開</summary>

[`cordis.patch.yml`](cordis.patch.yml)把本包自身插入為 `auto-review` 行。[`src/index.ts`](src/index.ts)要求 approval、LLM、permission、Session 與 tools 服務，然後在同一個 effect 中安裝 preset contribution 和置前的 pre-execute listener。Review 結束後，拒絕會讀取 Session 的審批策略：`never` 下為最終拒絕；`ask` 下 listener 先交給後續 pre-execute listener，只有它們放行呼叫時才返回 tools 流水線的 `ask` 決定，因此後續的拒絕、取消或 `ask`（帶自己的理由）優先。`ask` 決定攜帶英文審計理由，以及保留原始 reviewer 理由的在地化提示文字。[權限 owner](../../interaction/permission-presets/README.zh.md)提供目前身份和程序目錄；Auto 使用 Full access 的沙箱值與 `ask` 審批策略，不改變工具定義。

Reviewer 從目前 Session surface 與待執行呼叫重建五個分割槽：固定策略、僅 cwd 的環境、帶來源的專案約束、過濾後帶來源的歷史，以及完整待審動作。原生 schema 來自最新 request header。PTC binding 凍結其 schema，經由排程器傳入臨時執行中繼資料；開始與結算事件都不序列化描述或參數 schema。主 agent 的 `system/message` 節點、assistant 正文與 reasoning、tool results 全部排除。外層評審輸入是凍結的 `RequestUserInput`，不含持久身份或來源；保留歷史在評審文字中仍攜帶原始來源。[決策記錄](../../../.agents/notes/implemented/feature/2026-08-28-auto-review.zh.md)擁有權威、生命週期與 child 繼承的理由。

解除安裝時先關閉選擇與 review admission，經由既有 preset writer 將存活 Auto Session 遷移到 Full access，再中止並等待在途 review 結清，最後撤回 listener 與 contribution。遷移透過 Session writer 寫入 `never` 審批策略，不排入策略變更通知；模型在下一次 runtime-context 快照中看到新策略。沙箱值與持久終端在遷移中保持不變。持久 Auto Session 缺少完整 integration 時不能釋出；安裝後重新開啟需要使用者顯式操作。重灌只恢復選項，不把存活 Session 切回 Auto。

本包不釋出 runtime invariant companion：同一個 effect 擁有選擇准入、review 登記、取消與清理，不存在能與這些自有操作相互偏離的獨立觀察。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [實驗包](../README.zh.md)——釋出策略與依賴隔離。
- [Web bundle](../../bundle/web-app/README.zh.md)——此 patch 擴充功能的穩定 profile。
- [Auto review 決策](../../../.agents/notes/implemented/feature/2026-08-28-auto-review.zh.md)——固定風險策略、權威與生命週期。
- [Tools](../../core/tools/README.zh.md)——執行、取消與 PTC 結果傳播。

-----

<a id="model-experience"></a>
## 模型體驗

### 逐呼叫 reviewer

#### 模型看到什麼

Reviewer 使用最新 `request/header.config` 的 provider 與模型，並沿用 shipped adapter 預設 reasoning。固定 `REVIEW_POLICY` 替代恰好一個動作的人工審批：allow 後立即以 Full access 執行。其餘四個分割槽只包含上文列出的保留事實。回應為一個嚴格 JSON text 物件，包含 `risk` 與 `decision`；deny 可附字串 `reason`。Reasoning blocks 可以位於這唯一 text block 之前。只有 `low + allow`、`medium + allow/deny` 和 `high + deny` 合法。

#### Token 影響

每個受支援呼叫額外產生一次模型請求，不快取、重試、截斷、壓縮，也不設單獨的小型輸出預算。超窗請求以 provider 錯誤使呼叫失敗。

#### KV Cache 影響

固定 reviewer policy 可以共享字首；保留歷史與待審動作隨呼叫變化。Auto 不向主 agent 增加專門 runtime context 或模式切換提示詞。

### 工具拒絕

#### 模型看到什麼

在 `ask` 審批策略下，模型只看到審批結果，例如 `the user rejected tool "<name>"`，或獲批呼叫的普通結果。最終拒絕訊息為 `Auto review rejected tool "<name>"; its body was not executed`。Reviewer 失敗訊息為 `Auto review of tool "<name>" failed; its body was not executed: <error>`。普通原生錯誤渲染在每條訊息前加 `Error: `。PTC 使用既有 inner-call 異常與 catch 行為；被捕捉的拒絕不強制外層 `run_code` 失敗。可選原始理由是面向使用者的持久結構化錯誤詳情，絕不進入主模型內容。風險、reviewer prompt、reasoning 與原始回應都不持久化。

#### Token 影響

被拒絕或失敗的呼叫只向主對話貢獻其普通錯誤結果。

#### KV Cache 影響

拒絕追加普通工具結果，不改寫更早的上下文，也不隱藏既有模型可見資訊。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- Auto 需要開啟此 Web 層；預設 Web、Headless、通用設定與新工作階段預設值都不包含它。
- Auto 不提供檔案沙箱。外層 `run_code` transport 及PTC 程式內直接 Node 效果不經過 inner-tool review。
- 模型分類可能出錯。不提供確定性工具豁免、持久 grant、可設定策略或重試層。
- 程序內 Auto child 獨立審查自身呼叫。程序外 child 在父委派呼叫獲准後保留原生權限系統。
- reviewer 在帶行級豁免的情況下，透過已廢棄的同步 `snapshotEvents()` 讀取 Session 動作歷史。此前的呼叫、PTC start 與直接父級的初始 prompt 目前都沒有投影或分頁讀取方，因此遷移按[同步讀取決策](../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.zh.md)繼續延期。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
