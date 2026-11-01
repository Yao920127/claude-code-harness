---
description: "在建立 PR 前，本地生成、確認並驗證工作階段持久化型別變更。"
---

# 實操手冊：審閱持久化型別變更

[English](reviewing-persistence-type-changes.md) | 中文

## 概述

在已安裝依賴的貢獻者檢出目錄中修改工作階段持久化型別宣告後，使用本教學。提供雙語相容性說明，再用一條命令分類變更並生成記錄。[記錄參考](../persistence-changes/README.zh.md)解釋檔案和自動規則。所有比較輸入都在檢出目錄中；不需要基線分支或網路存取。

## 目錄

- [可選：檢查變更](#generate)
- [1. 記錄變更](#acknowledge)
- [2. 檢查、提交併推送](#verify)
- [更新尚未接受的記錄](#competing-records)
- [開發備註](#dev-note)

-----

<a id="generate"></a>
## 可選：檢查變更

若需在記錄前預覽，在儲存庫根目錄執行：

```sh
pnpm --silent run verify-persistence-changes --json
```

消費 JSON 時使用 `--silent`：否則 pnpm 會把生命週期失敗文字追加到標準輸出。失敗命令仍以結束代碼 1 結束。

閱讀報告中的根、路徑、變更種類和版本要求。被引用型別可能影響多個事件摘要；檢查每個受影響的根。在歷史覆蓋新 schema 之前，驗證會失敗。陳舊生成清單也會導致驗證失敗；記錄命令會重新整理它。若重排欄位或聯合型別分支後 `changes` 為空，執行 `pnpm run gen-persistence-catalog` 並重新檢查。即使複製的宣告或原始碼位置產生目錄 diff，未變的摘要也無需新增確認記錄。

要獨立於確認歷史評審 PR，先將 base 和 head 的目錄儲存為本地 JSON 檔案，再執行：

```sh
pnpm --silent run persistence-review --before .artifacts/base.schema.json --after docs/persistence-schema.json
```

在報告旁記錄這些檔案對應的 commit。新增 `--json` 可取得結構化輸出。此只讀比較將共享變更與受影響的根型別歸組，使用實際字面量 `kind`/`form` 值代替聯合型別位置。無法唯一匹配的候選項保留為獨立的新增與刪除。相容性部分複製每個根型別的權威分類結果；結構說明不替代確認檢查。目前目錄標籤和宣告名稱是描述中繼資料；結構錨點和指紋標識型別。

<a id="acknowledge"></a>
## 1. 記錄變更

先檢查[已接受基線](../session-format-status.zh.md#finalization-record)，保留其鎖定記錄。向後相容的演進使用新的同版本確認記錄；記錄破壞性變更之前，先實作更高的寫入器版本。

編寫包含 `en` 和 `zh` 的本地 JSON 檔案，兩者分別包含 `summary`、`compatibility` 和 `verification` 字串。以下輸入描述一個經過驗證的掛鉤審計欄位從必選改為可選的變更。用你所做變更的事實替換說明和測試證據；CLI（命令列介面）不會證明這些宣告。

將輸入儲存為 `.artifacts/persistence-change.prose.json`，必要時建立該被忽略的目錄：

```json
{
  "en": {
    "summary": "Makes the persisted hook audit decision optional.",
    "compatibility": "Existing records remain valid. Hook execution consumes HookOutput instead of replaying this audit field. Producers still write decisions, and absence does not imply pass.",
    "verification": "pnpm exec vitest run packages/hooks/hook-protocol/tests/events.spec.ts: 10 tests passed."
  },
  "zh": {
    "summary": "將持久化的掛鉤審計決策改為可選。",
    "compatibility": "已有記錄仍然有效。掛鉤執行消費 HookOutput，不回放此審計欄位。寫入方仍然記錄決策，缺失不代表 pass。",
    "verification": "pnpm exec vitest run packages/hooks/hook-protocol/tests/events.spec.ts：10 個測試透過。"
  }
}
```

用日期和描述性短名替換範例 id：

```sh
pnpm --silent run persistence-changes --record 2026-09-11-poc-optional --prose .artifacts/persistence-change.prose.json --json
```

命令在寫入前驗證歷史和雙語說明、推斷最低版本決策，並檢查所需的頭部版本遞增。它生成記錄對、完整的變更後 schema、兩份目錄、機器清單和配對記錄。提交前審閱說明及返回的 `changes`、`roots` 和 `files`。省略 `--prose` 會建立未完成草稿，驗證將拒絕它們，直到說明補齊。

推斷遵循[固定相容性規則](../persistence-changes/README.zh.md#compatibility-rules)，不會更改原始碼或放寬規則。需要升版本時，先遵循[新增工作階段格式版本](adding-a-session-format-version.zh.md)。記錄必須包含其自身的 `SessionHeader.version` 遞增轉換；無關的歷史升版本不能授權它。日常變更不建立另一條基線。

<a id="verify"></a>
## 2. 檢查、提交併推送

根據[測試政策](../testing.zh.md)選擇變更所屬模組的行為檢查，再執行文件檢查：

```sh
pnpm run doc-sync
```

`doc-sync` 檢查持久化清單和目錄新鮮度、完整歷史及雙語配對。記錄命令的 `ok: true` 不能替代這些檢查，也不能替代所屬模組的行為與遷移測試。JSON 失敗回應保留 `ok: false`、診斷 `code` 和結束代碼 1。結構化變更包含穩定種類和逐根的變更前後摘要，自動化無需解析描述文字。

記錄生成負責其目錄和記錄的雙語對；包 README 或其他雙語頁面的編輯仍遵循常規配對流程。審閱並暫存預期差異，然後正常提交和推送。暫存 lint、配對、空白 hooks，以及 pre-push Host/Client 型別檢查仍須執行。

<a id="competing-records"></a>
## 更新尚未接受的記錄

記錄後原始碼再次變化時，審閱相容性說明，並重新整理同一條尚未接受的末端記錄：

```sh
pnpm --silent run persistence-changes --update 2026-09-11-poc-optional --prose .artifacts/persistence-change.prose.json --json
```

命令重新整理機器宣告、schema、目錄和配對。沒有 `--prose` 時，它保留已有說明。更新會拒絕初始基線、其他記錄所依賴的記錄，以及已被定稿檢查點鎖定的記錄。定稿檢查點之外，目錄不會推斷審閱接受狀態：保留已接受歷史，並建立後繼。

整合產生競爭末端記錄時，根據剩餘歷史更新尚未接受的記錄，再重新評估最終差異。無關根的確認無需重新整理。[機制決策](../../.agents/notes/implemented/process/2026-09-11-persistence-type-history.zh.md)解釋為何保留完整快照和逐根前驅。

顯式 `--decision` 仍是受檢查的斷言。若已有屬性的值型別發生變化，下面這個故意錯誤的斷言會在寫入前失敗：

```sh
pnpm --silent run persistence-changes --update 2026-09-11-poc-optional --decision same-version --json
```

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
