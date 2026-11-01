# Agent Note: the ptc-runtime-python fd-3 frame protocol

Status: implemented

CPython PTC 執行時位於 `packages/experimental/ptc-runtime-python`，以 `@deepseek-ai/dsh-experimental-ptc-runtime-python` 名稱釋出；[釋出決策](../process/2026-09-12-publish-all-experimental-packages.zh.md)保留其實驗性狀態。

[English](2026-07-31-ptc-runtime-python-fd3-protocol.md) | 中文

## Problem

`@deepseek-ai/dsh-experimental-ptc-runtime-python` 負責供 CPython ptc-runtime 提供者使用的 wire protocol。這樣的提供者會在全新的 `python3 -I` 子程序中執行每個模型程式，並透過子程序 fd 3 橋接 binding 呼叫與完成值。Host 不能信任這條通道：模型程式碼可以完全存取 fd 3 並偽造任意幀，因此 host 必須把每個入站幀視為敵意輸入，先驗證並重建後才能讀取。協定還必須承載無深度限制的 lossless JSON，因為 seam 的 `PtcJsonValue` 深度無界，而 `JSON.stringify` 和 `json.dumps` 都有遞迴深度限制。

這個實驗包同時包含協定與 runtime 實作：`PythonPtcRuntime`（外掛的預設匯出）、`python3 -I` 子程序路徑與 Python 側 JSON codec 都在 `@deepseek-ai/dsh-experimental-ptc-runtime-python` 中。協定建立在[可移植識別符號 seam](../../archived/architecture/2026-07-31-code-runtime-portable-identifier-seam.md)之上。

## Decision

`src/protocol.ts` 是 wire vocabulary 的 host 側及其敵意幀編解碼：

- **`validateChildFrame`** 對每個入站幀做形狀驗證並重建。編譯期 union 在 fd 3 上毫無意義——偽造幀可攜帶 `null`、被汙染的欄位，或省略必需欄位——所以每個被接受的幀都逐欄位重建：偽造的額外欄位絕不隨行，非有限的 call id 絕不會被回顯進 reply，垃圾返回 `undefined` 被丟棄，而不是在 host 的 message handler 裡拋錯。
- **`encodeJsonPlain` / `checkDoneValue` / `hasUnsafeIntegerToken` / `hasNonLosslessNumber`** 是 lossless-JSON 編解碼器與計量器。它們迭代遍歷（顯式棧，非遞迴），使低於位元組預算的深層值能完整穿越；`checkDoneValue` 把位元組計量和數字無損性折進一次遍歷，在新增入棧子節點之前就拒絕超預算 payload；字串與 key 由非分配的轉義尺寸掃描（`jsonStringBytesUpTo`）計量，從不物化轉義副本。它不會重新約束幀自身的寬度：`done.value` 在檢查執行時已經過 `JSON.parse`，因此消費 runtime 必須在解析前限制 fd-3 位元組數。超出安全範圍的整數型 double 透過 `BigInt` 數字序列化，穿越的是精確整數而非 `String()` 的舍入形式。
- **`logTruncationMarker`** 產出日誌 ledger 耗盡位元組預算時發出的帶內標記文字。

`py/protocol.py` 用 `TypedDict` 映像訊息形狀，並重新宣告兩側都會 EXECUTE 的兩個面——`PROTOCOL_FD = 3` 與 `log_truncation_marker`——文字逐位元組一致。

該包隨協定一起交付 runtime，同時保持獨立可建置。`check-workspace-constraints` 會無條件讀取每個 `packages/<group>/<pkg>/package.json`，coverage 與 invariant-topology 檢查則會在包目錄存在時立即覆蓋該包。

## Wire contract

幀是 fd 3 上的 JSON-lines，每行一個物件，讓 stdout/stderr 空出給程式自己的輸出。Child → host：`boot-ack`、`call`、`log`、`done`。Host → child：`boot`（首幀）、`run`（在 `boot-ack` 之後）、以及每個 `call` 對應一個 `reply`。`log` 幀的 `truncated` 標誌標記那個本身就是子程序 ledger 截斷標記的幀，使 host 在與子程序相同的點停止捕捉，而不是從自己的預算去推斷。`log` 幀的 `open` 標誌標記由顯式 flush 提交的未結束行：主機持有它並把下一個幀追加到同一條目，因此顯式 flush 後接更多文字讀回為一行而不是假換行。唯一例外是截斷：當後續超預算幀觸發帳本時，已計費的字首作為獨立條目先提交，截斷 marker 跟在後面（marker 保持末位，無重複計費）。合併條目的線上成本恰好計費一次，在兩側按片段增量分攤（k 個片段 O(k)，絕不對整個持有重走）：首片段付完整 JSON 字串成本加分隔符，每個續接與閉合幀只付內容；主機精確成本 cap 是首片段 `logBudget - 1`（帳本預留位元組，與 `admit` 一致）、續接或閉合幀 `logBudget + 2`（不含兩個引號計費），且 `jsonStringCostUpTo` 在低於 2 位元組 cap 時返回 `undefined`；子程序按 `_open_started` 單獨鍵控拆分計費，因此閉合幀按合併尾部計費。`done.error.kind` 是 `exception`、`invalid-output`、`output-limit` 之一；wall/CPU 預算、abort、substrate 死亡都在 host 側觀測，不作為幀攜帶。

## Mirror alignment

`py/protocol.py` 與 `src/protocol.ts` 一致規定：`LogMessage` 攜帶 `truncated`，`DoneMessage.error` 攜帶 `kind`，`Namespace` 可以攜帶 `errorClass`。`tests/protocol-mirror.e2e.ts` 啟動真實 `python3`，對照 `src/protocol.ts` 斷言 `PROTOCOL_FD`、`log_truncation_marker` 以及每個 `TypedDict` 的必填和可選 wire 欄位集。欄位改名、刪除或必填／可選性不一致都會使測試失敗。欄位*型別*不跨語言邊界比較；這項缺口由評審和 runtime 的真實子程序套件（`runtime.spec.ts`）負責。

## Alternatives considered

**要求未來的 Python JSON codec（`_encode_json_plain` / `_decode_json_plain`）放進 `py/protocol.py`，以便與 `protocol.ts` 跨側對稱。**拒絕。儲存庫的 “prefer symmetry for parallel values” 規則指向真正平行的值；這兩者不是。`protocol.ts` 中的 host 側 codec 驗證敵意輸入且自包含。Child 側 codec 會產出受信任輸出，應與 bootstrap 擁有的發出邏輯和成本核算放在一起；只把入口強塞進 `protocol.py` 會讓 vocabulary 映像耦合 runtime 內部實作，或製造 import 環。`protocol.py` 保持純 wire-vocabulary 映像；codec（`_encode_json_plain`／`_decode_json_plain`）與它所服務的 runtime 一起位於 `bootstrap.py`。

**在 runtime 交付前把協定檔案放在不可建置的包外。**拒絕：workspace-constraint、coverage 與 invariant-topology 檢查要求 `packages/<group>/<pkg>` 下的每個目錄都是可建置包，而協定本身擁有獨立測試與公開 wire vocabulary。

## Consequences

收穫：fd-3 協定及其敵意輸入 codec 構成自包含、unit 全覆蓋的一層，並由執行中的 guard 防止 TypeScript／Python 欄位集漂移。基於它建置的 runtime（`bootstrap.py`）消費經過評審的 wire contract。

代價：包名錶示 Python runtime 家族，而 `src/index.ts` 匯出完整的 `PythonPtcRuntime` 實作，協定 vocabulary 只是包表面的一部分。mirror e2e 會比較兩側欄位名與必填／可選狀態，但不比較欄位型別；跨 TypeScript 與 Python 比較型別宣告沒有機械等價物，因此評審與 runtime 的真實子程序套件繼續負責這項檢查。
