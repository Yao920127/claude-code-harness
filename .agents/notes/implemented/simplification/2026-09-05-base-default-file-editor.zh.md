# Agent Note: 共享 base 預設檔案編輯器選擇

Status: implemented

[English](2026-09-05-base-default-file-editor.md) | 中文

## Problem

共享 base 同時選擇 `read`/`write`/`edit` 和 `str_replace_editor`，這些工具提供重疊的檔案編輯介面。Issue #3599 要求基於 base 的 profile 預設使用一套介面，同時保留專用的極簡組合。

## Decision

[base patch](../../../../packages/bundle/base/cordis.patch.yml) 選擇 `read`、`write` 和 `edit` 負責檔案編輯。它不插入 `tool-str-replace-editor`；因此 SDK 與 Web 應用 patch 無需停用覆蓋。編輯器包仍可供顯式插入它的組合使用。

Web minimal 與獨立 `sdk-minimal` bundle 各自負責工具選擇，不依賴 base。[僅持久 shell 決策](2026-09-03-minimal-profiles-persistent-shell-only.zh.md)負責它們的單工具預設值。

本決策細化了[統一 dsh 啟動器](../architecture/2026-08-22-single-dsh-application-launcher.zh.md)中的共享工具預設值。該文件對啟動所有權、共享服務和 patch 優先順序仍然有效；沒有被完全取代的活躍 Agent Note。

## Alternatives considered

**在每個應用中分別停用編輯器。** 這會在 base 中保留重疊的預設介面，並要求各消費方主動退出。共享選擇由 base 直接負責。

**刪除工具包。** 顯式自定義組合仍使用此介面。base 的預設選擇不刪除包，也不約束獨立負責的極簡預設值。

## Consequences

基於 base 的 SDK、headless、ACP 與自定義 profile 預設不包含該編輯器 schema。Web standard 同樣不包含它。profile、home 或逐次呼叫 patch 可以透過 `insert` 新增工具；只設定 `disabled: false` 的 patch 需要已有設定項，無法建立設定項。本決策不要求 SDK 與 Web 的全部工具一致。

## Verification

[SDK 程序測試](../../../../apps/cli/tests/profiles/sdk/keyless-smoke.e2e.ts) 捕捉預設檔案工具、顯式插入編輯器與獨立極簡工具清單的實際模型請求。[headless 程序測試](../../../../apps/cli/tests/profiles/headless/tests/keyless-smoke.e2e.ts) 透過所屬應用檢查共享預設值。[headless](../../../../snapshots/session/headless.snapshot.ts)、[SDK](../../../../snapshots/sdk/sdk.snapshot.ts) 與 [ACP](../../../../snapshots/acp/acp.snapshot.ts) 錄製工作階段固定組裝後模型可見的輸出，包括顯式插入編輯器的 SDK fixture。
