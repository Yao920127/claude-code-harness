# Agent Note: 統一未讀取檔案系統工具診斷

Status: implemented

[English](2026-09-03-normalized-unread-fs-tool-diagnostic.md) | 中文

## 問題

`dsh-tool-fs` 的 write 和 edit 操作可能從觀測策略或檔案系統提供者收到 `FS_NOT_OBSERVED`。這些來源用操作特定訊息描述相同要求，因此相同恢復條件會以不同措辭到達模型。提供者文字還可能暴露被拒絕的操作是否會覆蓋既有目標，但模型只需讀取目標後重試。

## 決策

`remediateFsError(error, displayPath)` 在 `dsh-tool-fs` 模型邊界把每條 `FS_NOT_OBSERVED` 訊息替換為 `cannot modify "<path>": file has not been read — read the file, then retry`。包裝層保留結構化錯誤碼，並把來源錯誤鏈為 `cause`，因此機器路由與診斷仍能檢查原始故障。

`FS_STALE_VERSION` 繼續使用[受防護變更恢復指令記錄](../../archived/feature/2026-08-03-fs-tool-error-remedy.md)擁有的追加式重新讀取指令。檔案系統提供者與策略保留其操作特定訊息，因為其他消費方並不共享該工具面向模型的呈現。

## 考慮過的替代方案

**為每條來源訊息追加相同恢復字尾。** 不予採納，因為模型仍會為同一項必要操作收到不同原因，其中包含不會改變恢復方式的提供者目標存在性細節。

**在提供者與策略源頭統一訊息。** 不予採納，因為這些元件擁有供 `dsh-tool-fs` 之外消費方使用的面向機器錯誤；只有該工具擁有這段模型可見措辭。

**為統一後的結果引入另一個錯誤碼。** 不予採納，因為底層條件與恢復路由仍是 `FS_NOT_OBSERVED`；改變錯誤碼會丟失機器消費方需要的相容性。

## 後果

無論變更由策略還是提供者拒絕，write 和 edit 都會給出同一條穩定的未讀取目標診斷。模型放棄來源特定措辭和提供者的目標存在性提示，以換取一條統一且可執行的恢復指令。原始訊息仍可透過 `cause` 取得。

單元與整合測試固定兩條來源路徑、錯誤碼保留、cause 鏈和模型可見文字全文。`fs-policy-reject` 錄製工作階段攜帶同一條診斷用於重放。
