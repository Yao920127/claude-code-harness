# Agent Note: 保留子目錄證據不完整的 V3 Session

Status: implemented

[English](2026-09-19-v3-incomplete-child-catalog-evidence.md) | 中文

## Problem

有效 V3 子日誌可能沒有自身 descriptor、descriptor 版本不受支援，或存在多個 descriptor。其 header 仍能確定身份及父子關係。要求一個受支援的 descriptor 才遷移父日誌，會讓不可獲得的發現欄位阻止讀取原本可讀的歷史。

## Decision

V3→V4 遷移僅在恰好一個受支援的自身子 descriptor 提供發現欄位時，追加完整的缺失父目錄項。其他 descriptor 數量和不支援的版本透過[逐工作階段目錄準備](2026-09-19-session-local-subagent-migration.zh.md)保留模式未知的成員關係。已有父目錄項和子事件保持不變。這取代[相鄰遷移決策](../architecture/2026-08-31-released-session-format-migrations.zh.md)中對缺失證據的拒絕。

JSONL 錯誤傳播規則由[逐工作階段目錄準備](2026-09-19-session-local-subagent-migration.zh.md)部分取代；轉換器仍驗證已提供事實及衝突。已知子建立時間必須匹配已有父目錄項。只有恰好一個受支援的自身 descriptor 時才檢查 mode／label 和 descriptor 欄位。JSONL 隔離無效 descriptor 欄位和損壞子正文，並保留已知 header 身份；不可讀或不支援的 header 不參與發現。來源修訂變化仍拒絕釋出。

## Alternatives considered

**拒絕整個父 Session。** 發現中繼資料不足以成為禁止讀取有效父歷史的理由。

**選擇首個或末個 descriptor。** [`foldSubagentDescriptor()`](../../../../packages/subagent/subagent/src/descriptor.ts) 依據建立提供者恰好寫入一次的規則取首個；[身份投影](../../../../packages/subagent/subagent/src/projection.ts)取末個以覆蓋繼承身份。多個自身記錄違反該規則。補填要求一個自身記錄，而不在這兩種消費者策略之間做選擇。

**推斷缺失欄位。** 推斷的 mode 或 label 會在沒有證據的情況下成為持久目錄事實。

## Consequences

歷史子工作階段具有可讀 header 但沒有可用 descriptor 時，在父直屬子目錄中保留未知模式成員關係。已有目錄項仍可見。V4 後繼釋出後，開啟它不重新掃描歷史子日誌；自動補齊後續模式不屬於本遷移。準備過程仍在釋出前重新檢查子修訂，因此新出現的證據不能靜默繞過來源一致性檢查。

單元、JSONL 讀寫和 Preview 打包測試覆蓋不可用證據、源位元組不變、條目保留、身份衝突以及釋出前的證據變化。
