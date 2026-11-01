# Agent Note: Windows 沙箱刪除約束：強制完整性 + 環境性刪除拒絕

Status: implemented

[English](2026-09-19-windows-acl-mandatory-integrity-confinement.md) | 中文

## 問題

[受限權杖檔](2026-08-08-windows-acl-restricted-token-sandbox.zh.md)透過把請求的存取掩碼與 restricting SIDs 求交集來約束寫入。該交集只覆蓋針對物件**自身**安全描述符的那次存取檢查：Windows 也會依據**父目錄**的 `FILE_DELETE_CHILD` 權限批准寫入或刪除，而這項權限不需要任何 restricting SID 副署。因此 `cmd /c del` 與 `[System.IO.File]::Delete`——凡走 `DeleteFileW` 的路徑——在兩種受限模式下都能刪除工作區之外的檔案（issue #4581），而同一子程序的普通寫入卻被拒絕。

## 決策

每次授權現在都在一次 `SetNamedSecurityInfoW` 呼叫中施加三項編輯，並把受限權杖降到同一級別：

1. 能力 SID 的允許 ACE（`GRANT_MASK`，`OI|CI`）——寫權限本身，未變；
2. 對 world SID 的 `FILE_DELETE_CHILD` 拒絕 ACE，帶 `CONTAINER_INHERIT_ACE`——能力 ACE 的 DELETE 位成為授權根內唯一的刪除授權來源；
3. Low 完整性強制標籤（`S-1-16-4096`、`SYSTEM_MANDATORY_LABEL_NO_WRITE_UP`、`OI|CI`）——並用 `SetTokenInformation(TokenIntegrityLevel)` 把受限權杖降到同一級別。

三者都不可省。標籤是唯一能觸及父目錄 `FILE_DELETE_CHILD` 路徑的手段：無論權限來自哪一項，核心都在存取檢查內部執行強制策略，因此授權根之外的 Medium 物件不僅防寫、也防刪。拒絕項則負責隔開**各個**授權根：所有授權根都帶 Low 標籤，僅靠完整性檢查它們之間仍會放行。而拒絕項只做容器繼承，是為了不破壞環境 ACL 的可用性：`0x40` 是 `FILE_ALL_ACCESS` 的成員，若落到檔案上會讓授權根內每次 `GENERIC_ALL`／`FullControl` 開啟都被拒絕——收窄標誌之前已在真實 runner 上實測確認。

標籤在工作區根上**常駐**，與能力 ACE 同理：按工作階段回收會導致每次供給都重新傳播整棵樹，並與並行工作階段競爭。`revokeWrite` 只在該目錄上不再留有其他能力授權時才清除標籤，因此同一目錄上的兩份授權仍可獨立撤銷。冪等跳過要求精確 ACE、精確拒絕與精確標籤三者齊備，因此早前版本已授權的工作區會在下次供給時補上拒絕項。

## 考慮過的替代方案

### 為什麼不讓標籤按工作階段回收？

那樣可以消除下面的外部性，但每次供給都要付出確定性工作區 SID 本要避免的急切全樹傳播（大型工作區上以數十秒計），而且並行工作階段或崩潰工作階段會讓標籤反覆消失與重建。

### 為什麼 read-only 模式不用 Untrusted 完整性？

本機實測：Untrusted（`S-1-16-0`）權杖根本無法啟動 `pwsh`——DLL 初始化失敗（`0x8007045A`，`BCrypt.dll`）——該模式將沒有可用的 shell。

### 為什麼不用 `OI|CI` 施加 `FILE_DELETE_CHILD` 拒絕？

那樣拒絕項也會落到授權根內的每個**檔案**上（用 `icacls` 觀察到的正是 `Everyone:(I)(DENY)(DC)`），而 `0x40` 屬於 `FILE_ALL_ACCESS`，於是這些檔案上的 `CreateFileW(GENERIC_ALL)` 會對使用者、Administrators、SYSTEM 與 DSH host 一併返回 `ERROR_ACCESS_DENIED`。收窄標誌消除了這一類影響；授權根內**目錄**的 FullControl 開啟仍被拒絕，這是拒絕一項屬於完全存取掩碼的權限所無法避免的代價。

### 為什麼不乾脆去掉這層約束、只把逃逸寫進文件？

逃逸本身就是報告內容：`cmd /c del` 刪除工作區之外的檔案，恰恰是沙箱承諾不允許的事；而僅靠讀側或純 ACL 的改動關不掉它——restricting SID 交集在建構上就觸及不到父目錄路徑。

### 為什麼不讓每個工作區擁有自己的完整性級別？

強制完整性控制只有五個固定級別（Untrusted、Low、Medium、High、System），無法像 `S-1-4-x-y` 能力 SID 那樣按工作區派生。

## 後果

所得：刪除在 Windows 接受的每條授權路徑上都被約束，且被約束在各自的授權根內；此前記錄的 Everyone 寫邊界被關閉；寫入、讀取與程序可見性其餘部分不變；每次 Win32 呼叫失敗都 fail-closed。所失（全部記錄在包 README 中）：常駐 Low 標籤會向**任何**以同一使用者身份執行在 Low 完整性的程序放寬該工作區樹，並比 DSH 生命期更長（這是在該完整性級別上擁有寫邊界本身的代價）；被授權目錄現在還必須授予 `WRITE_OWNER` 才能寫入標籤（完全控制的工作區具備，僅授予 Modify 的會大聲失敗）；授權根內目錄的 FullControl 開啟被拒絕；被其他 AppContainer 工具以包 SID 標記過的目錄樹對 Low 子程序不可讀；FAT 類目標仍未驗證。[受限權杖檔筆記](2026-08-08-windows-acl-restricted-token-sandbox.zh.md)仍是該檔權杖列表、runner 約定與授權生命週期的歸屬者；本筆記只負責刪除路徑與封閉它的完整性層。

## 測試

`runner.spec.ts` 以真實 runner 與真實受限權杖釘住行為：兩種模式下經 `cmd`、.NET、`Remove-Item` 與 libuv 的越界刪除全部被拒且**主機側檔案仍存在**；一個工作階段無法刪除另一個授權根內的檔案；NUL 在兩種模式下仍可寫；授權根內**檔案**的 `GENERIC_ALL` 開啟成功，而**目錄**的同一開啟被拒絕；同一目錄上兩份授權之一被撤銷後，存留的授權仍可用。`acl.spec.ts` 釘住真實 DACL／標籤生命週期、拒絕項只繼承到容器、以及共享標籤的撤銷規則；`token-failure-paths.spec.ts` 釘住 `TokenIntegrityLevel` 的精確載荷；失敗路徑套件覆蓋每處新增分配與提前退出，包括標籤 ACL 與描述符的釋放。

## 相關

- [Windows sandbox 檔：原始 ACL 受限權杖](2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——本次改動所擴充功能的檔（保持 active；本筆記只取代其刪除路徑邊界）。
- [沙箱決策](2026-07-06-sandbox.zh.md)——平臺鏈與 `partial` 強制執行詞彙。
