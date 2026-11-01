---
description: "由操作者控制的 Windows 網路故障與恢復，僅針對已驗證的安裝版更新測試應用。"
---

# 測試應用網路故障

[English](README.md) | 中文

## 摘要

僅中斷已安裝驗收應用的出站流量，再移除該準確規則後重試更新。工具絕不停用網路卡、VPN、代理或防火牆設定檔。真實流量中斷仍須由操作者觀察；測試替換了全部防火牆命令。

## 目錄

- [準備](#prepare)
- [阻斷與恢復](#operate)
- [證據與侷限](#evidence)
- [開發備註](#dev-note)

<a id="prepare"></a>

## 準備

按照[演練指南](../README.zh.md)完成版本 1 安裝檔驗證並安裝該版本。提供已安裝可執行檔案，而非解包產物。在儲存庫根目錄準備計劃：

```powershell
node --import tsx apps/desktop/scripts/prepare-installed-update-network.ts "<run.json>" "<installed-test.exe>" "<verification/result.json>"
```

準備器要求版本 1 身份與簽名證據、準確的測試檔名以及匹配的可執行檔案位元組。它解析 Windows 短路徑，拒絕物料批次目錄內的可執行檔案。它獨佔寫入 `network-fault/plan.json`，不改變網路狀態。保留原始計劃，它標識唯一可移除的規則。安裝註冊仍須操作者獨立驗證。

<a id="operate"></a>

## 阻斷與恢復

以下是待執行的人工步驟，不是真實防火牆驗收透過報告。使用管理員終端，並在阻斷前準備第二個終端及 Restore 命令。每次呼叫寫入新記錄。`Status` 是預設動作，不改變防火牆狀態。執行策略選項隻影響本次 PowerShell 程序，不修改系統策略。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/desktop/scripts/installed-update-network.ps1 -Plan "<plan.json>" -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/desktop/scripts/installed-update-network.ps1 -Plan "<plan.json>" -Action Block
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/desktop/scripts/installed-update-network.ps1 -Plan "<plan.json>" -Action Restore
```

啟動 Block，停留在確認提示，再開始下載。出現正進度後，輸入提示中的 `BLOCK <run-id>` 確認。腳本再次檢查可執行檔案位元組與規則不存在，再建立一條指定程式的出站阻斷規則。觀察並擷取實際下載失敗；僅建立規則不夠。執行 Restore 並輸入 `RESTORE <run-id>`，移除匹配規則，再親手點選重試。Status 必須報告規則不存在。絕不修改無關規則來強行製造失敗。

<a id="evidence"></a>

## 證據與侷限

腳本將帶時間的階段及最終成功/失敗刷入 `network-fault/records/<id>/events.jsonl`。出錯即停，絕不重試，也不在建立失敗後靜默刪除規則。結果不確定時顯式執行 Restore。恢復檢查規則名、歸屬說明、方向、動作和準確程式路徑，不要求可執行檔案仍存在。規則不存在時安全地不操作；不會移除匹配名稱的外來規則。

Windows 支援[指定程式的出站規則](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/configure-with-command-line)。本地策略、已有連線或確認前下載已結束，都可能使預期中斷沒有發生。PersistentStore 中有規則不證明流量確實被阻斷。保持應用開啟，觀察其失敗以及後續成功重試；任一現象缺失都將本次嘗試記錄為未完成。規則會持續存在直至移除，重新啟動也不會自動刪除。保留計劃和恢復終端；測試規則仍存在時絕不安裝更新。

<a id="dev-note"></a>

## 開發備註

本地計劃驗證與實際 PowerShell 控制流程已有無網路改動測試。真實規則建立、有效中斷與恢復須由操作者在獲准的已安裝應用演練中執行。
