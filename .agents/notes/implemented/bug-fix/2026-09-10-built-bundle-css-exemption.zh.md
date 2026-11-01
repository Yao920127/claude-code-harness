# Agent Note: 建置產物豁免以失敗的樣式表為準

Status: implemented

[English](2026-09-10-built-bundle-css-exemption.md) | 中文

## 問題

[Node import sweep](../../../../packages/experimental/webworker-runtime/tests/compile/transform-corpus-check.ts)因 Node 無法載入 Dockkit bundle 的樣式表而豁免該 bundle，並曾以一個精確的樣式表路徑作為接受證據：`packages/client/ui-dockkit/lib/components/dockkit.module.css`。該已建置 bundle 在匯入自身樣式表之前先匯入 workspace 包 `@deepseek-ai/dsh-client-ui-primitives`，`tsx` 啟動器又透過 tsconfig `paths` 把這個說明符解析進依賴的 `src` 樹，因此 sweep 報告的是 `packages/client/ui-primitives/src/StateDot.module.css` 的 `ERR_UNKNOWN_FILE_EXTENSION`。固定路徑在帶有 client 建置輸出的樹上無法匹配，Windows 完整門禁的清單于是把這個豁免 bundle 報告為意外的基線失敗。

## 決策

Dockkit 豁免接受 Node 對任意樣式表因未知 `.css` 副檔名而拒絕載入。其他副檔名、其他錯誤碼和無關的錯誤訊息仍計為發現，能順利完成匯入的豁免 bundle 同樣計為發現。

## 考慮過的替代方案

**在固定路徑之外同時接受依賴的源樣式表。** sweep 報告的正是該檔案，但選中它的是 bundle 的匯入順序和啟動器的路徑對映。固定該路徑認定的將是這兩處細節，而非 `.css` 豁免。

**用同一規則分類每個 CSS 豁免。** Dockkit 固定路徑是本次修改所糾正的已記錄證據；另外兩個樣式表豁免從未被分類，收窄它們會在所報告缺陷之外改變其接受的內容。

**放棄分類，接受任何失敗。** 屆時因無關原因停止匯入的 bundle 會隱藏在豁免總數之內。

## 後果

只要 Dockkit bundle 因 Node 未知 `.css` 副檔名拒絕之外的任何原因停止匯入，sweep 就會報告它，該條目也不再斷言失敗的是哪個樣式表。[限定範圍的 resolve/load hook](../../../../packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts)覆蓋被接受的 Dockkit 樣式表、依賴的源樣式表、其他副檔名、任意訊息、其他錯誤碼和陳舊豁免，不修改共享建置產物。

[CI 觀察決策](../testing/2026-09-08-ci-completion-observations.zh.md)保留其擁有的 fixture 完成與隔離決策；其已建置 Client 匯入分類段落保留 sweep 摘要，並就被接受的證據連結到本文。
