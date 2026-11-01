# Agent Note: 環境事實位於可複用提示詞指令之後

Status: implemented

[English](2026-09-06-environment-prompt-suffix.md) | 中文

## 問題

本地 Web URL、Harness checkout 路徑和工作階段 cwd 因使用者與機器而異。將這些事實放在可複用工具指令之前，會使其餘內容相同的提示詞在開頭附近就出現差異，限制可供同模型快取複用的字首。模型名稱介紹標識 agent（智慧代理），可以保留在靠前的位置。

## 決策

[系統提示詞註冊表](../../../../packages/core/system-prompt/README.zh.md)將固定 Harness 身份保留在最前，並將 `DEPLOYMENT_PERSONA_PREFIX` 保留在 `0`。截至 `STRUCTURED_OUTPUT` 的第一方可複用指令位於環境字尾之前：`HARNESS_SOURCE` 位於 `10000`，`WEB_SURFACE` 位於 `10100`，`DEPLOYMENT_PERSONA_SUFFIX` 位於 `10200`。

全域 system-prompt 設定接受 `personaPrefix` 與 `personaSuffix`，兩者均預設為空。[帶作用域的 persona 行](../../../../packages/preset/persona/README.zh.md)要求提供 `prefix`，並接受預設為空的 `suffix`。它們透過匯出的 `PERSONA_PREFIX_SECTION` 與 `PERSONA_SUFFIX_SECTION` 名稱註冊 `deployment:persona-prefix` 與 `deployment:persona-suffix`。省略或為空的作用域 `suffix` 會遮蔽掉全域字尾。交付的 Web、headless、SDK、ACP bundle 以及 standard、PTC、Cordis preset 將模型介紹保留在字首中，僅將 `Your working directory is {{cwd}}.` 放入字尾。這些名稱指定位置，而不對文字分類；不新增 persona 解析或 OS 欄位。

[提示詞變數與工具指導歸屬記錄](../architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.zh.md)仍保留 identity-first 的 persona 位置、單一歸屬規則、嚴格插值和工具指導職責。

## 曾考慮的替代方案

**將整個 persona 後移。** 這會將模型名稱介紹移離開頭，卻無助於同模型複用。分離 cwd 可以將介紹與可複用指令一起保留。

**僅移動原始碼路徑與 Web URL。** 若 cwd 仍位於靠前的 persona 內，不同工作區之間的可複用字首仍會被打斷。

**從 persona 文字推斷環境片段。** 解析部署方撰寫的行文會使位置依賴措辭。顯式範本讓交付組合與自定義部署直接控制位置。

**將這些事實移到 runtime-context 訊息。** 這會改變其訊息角色和持久化位置，而不只是分離系統段落。

## 後果

位元組相同的字首要求模型介紹、persona 字首、工具、設定和前置段落文字一致。任意擴充功能順序與組裝監聽器仍決定最終結果；這是一項第一方位置策略，而非通用穩定字首保證。不測量或承諾提供者共享快取及命中率提升。

環境與 Web／原始碼指導位於結構化輸出指令之後。`complete: true` persona 僅使用渲染後的字首並忽略字尾，抑制其他所有系統段落，但不停用工具 schema 或 runtime context。原始碼與 Web 事實保留 Harness checkout、工作階段工作區和目前工作目錄之間的區分。

## 測試

[註冊表測試](../../../../packages/core/system-prompt/tests/system-prompt.spec.ts)在模型相同、checkout 路徑、URL 和 cwd 值變化時比較可複用字首；同時覆蓋嚴格插值與完整覆蓋。[迴圈測試](../../../../packages/core/agent-loop/tests/loop.spec.ts)固定靠前的模型身份和工作階段 cwd 插值。[Persona 測試](../../../../packages/preset/persona/tests/persona.spec.ts)覆蓋作用域字尾替換、空值遮蔽與完整 persona。[錄製的提示詞快照](../../../../docs/testing.zh.md)覆蓋原生工具與生成 SDK 組合發出的提示詞；它們不測量提供者快取命中。
