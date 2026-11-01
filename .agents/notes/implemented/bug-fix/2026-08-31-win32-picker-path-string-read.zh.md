# Agent Note: 不用固定長度的非託管檢視讀取 Win32 選擇器路徑

Status: implemented

[English](2026-08-31-win32-picker-path-string-read.md) | 中文

## Problem

Win32 選擇器需要解碼 `IShellItem::GetDisplayName` 分配的 NUL 結尾 UTF-16 字串，並透過 `CoTaskMemFree` 釋放它。固定長度的外部 ArrayBuffer 增加了執行時要求和手工終止符掃描，卻不能提供實際分配大小。

## Decision

`readUtf16` 將原生地址存入指標寬度的緩衝區，再交給通用 `koffi.decode(buffer, 'str16')`。通用解碼需要指標變數，而非直接傳入字串地址。切片長度取自 `koffi.sizeof('void *')`；Koffi 3 用 BigInt 表示原生地址。解碼期間分配必須保持有效且以 NUL 結尾。轉換成功後，原始地址仍可交給 `CoTaskMemFree`；若解碼拋錯，字串不會被釋放。

## Alternatives considered

**外部檢視加手工掃描。** 這要求執行時支援外部緩衝區，並重復實作 Koffi 的字串轉換。固定檢視和遞增分塊都無法確定原生分配大小。

**字串型別出參。** `_Out_ str16 *` 返回文字，卻丟失顯式 COM 釋放所需的指標。內建 `str16!` 使用 CRT 分配器釋放，而非 COM 分配器。

**自定義可釋放型別。** Koffi 可釋放型別可以呼叫 `CoTaskMemFree`，但顯式轉換無需註冊原生型別，就能將地址和釋放保留在同一呼叫點。

## Consequences

真實 Koffi 測試使用存活的 UTF-16 緩衝區執行生產結果路徑轉換，涵蓋 U+5F00、代理對、NUL 終止和超過 32 KiB 的字串。獨立的四位元組與八位元組 BigInt 案例驗證指標保持完整，並釋放原始地址。測試持有的緩衝區在同步讀取期間保持存活；原生解引用之前會檢查指標位元組。此前的掃描決策保留在[歸檔記錄](../../archived/bug-fix/2026-08-23-win32-utf16-nul-truncation.md)中。
