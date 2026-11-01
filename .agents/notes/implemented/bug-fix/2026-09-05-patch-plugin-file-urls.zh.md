# Agent Note: 插入補丁外掛的檔案 URL

Status: implemented

[English](2026-09-05-patch-plugin-file-urls.md) | 中文

## Problem

Node ESM 會把 Windows 磁碟機代號字首解釋為 URL scheme，並把檔名中的片段字元視為 URL 語法。因此，直接將檔案系統路徑傳給外掛匯入會使 Windows 絕對路徑以及包含 `#` 或 `%` 的檔名載入失敗。

## Decision

補丁檔案解析將 `insert` 條目及其巢狀分組中的本機絕對路徑、相對於補丁檔案的 `./` 或 `../` 名稱轉換為檔案 URL。包識別符號、已有 URL、已有條目的名稱斷言及替換用的 `config` 值保持原有含義。解析階段負責轉換，因為在合併各層之前它掌握來源補丁的目錄。

可選的 `HostResolvedRootInclude` 匯入覆寫會另外為選擇安裝主機解析基址的呼叫方轉換絕對路徑。普通 CLI profile 不選擇該覆寫，因此它不能代替補丁檔案轉換。

## Alternatives considered

**只在 Python fixture 中使用 `Path.as_uri()`。** 這能避開一次失敗，但使用者編寫的 profile 和 overlay 補丁仍會遇到問題。

**修改共享 Loader 基址。** 這會丟失逐補丁來源資訊並改變裸包解析。檔案 URL 保留選定的本地檔案，無需修改解析基址。

## Consequences

可選與必需補丁讀取器共用該轉換。直接 Loader 匯入及替換分組 config 引入的子條目不在其範圍內；擴充功能這些路徑需要各自的語義與覆蓋。

補丁讀取器測試驗證轉換與真實啟用。建置後 SDK 驗收載入檔名含 URL 敏感字元的絕對路徑 overlay 外掛，並驗證其檔案系統標記、初始化與關閉。
