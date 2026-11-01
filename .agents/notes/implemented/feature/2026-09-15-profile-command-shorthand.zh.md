# Agent Note: Profile 命令簡寫

Status: implemented

[English](2026-09-15-profile-command-shorthand.md) | 中文

## Problem

Profile 啟動需要一種適用於自定義名稱的簡潔寫法，同時不能讓外掛管理依賴 Harness home 中的內容。

## Decision

CLI 在解析前，將開頭非選項且非 `plugin` 的參數展開為 `--profile <name>`。兩種寫法使用相同的啟動器 flag、應用參數直接傳遞和 profile 驗證。`plugin` 僅在首個參數位置保持命令優先順序；`dsh --profile plugin` 顯式選擇同名 profile。選定 profile 後，`plugin` 作為應用參數直接傳遞。應用參數開始之前，重複選擇 profile 會被拒絕。

本決策取代[統一 dsh 應用啟動器](../architecture/2026-08-22-single-dsh-application-launcher.zh.md)中僅為 Web 提供簡寫的機制；該 Note 繼續負責應用組合與生命週期的所有權。

## Alternatives considered

- 將 profile 註冊為命令需要掃描檔案系統，並使解析依賴已安裝的 profile。
- 讓 profile 優先於內建命令，會使安裝 profile 改變外掛管理呼叫的含義。
- 讓後一次 profile 選擇覆蓋前一次，可能啟動與開頭名稱不同的應用；顯式拒絕可避免這種歧義。

## Consequences

自定義和內建 profile 共用一種簡寫，無需新增公開型別。名稱必須緊跟 `dsh`；未知名稱會觸發現有的 profile 缺失診斷。移除專用的 `web` 命令後，已選定的 profile 也能將 `web` 作為應用參數接收。解析等價性測試、建置產物驗收和無金鑰 headless 工具往返情境覆蓋共用的啟動路徑。
