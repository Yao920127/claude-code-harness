# Agent Note: 把 tool-owned render 移植到目前 DSH API

Status: proposed

[English](2026-08-27-port-tool-owned-render.md) | 中文

## 問題

`dsh-tool-owned-render` 原型（`Chinesezjc/dsh-tool-owned-render`）帶有 `read`、`bash`、`write`/`edit`、`grep`/`glob`、`web_search`/`web_fetch` 的 tool-owned render 註冊項，基於舊 API 編寫：`ToolCallBlock` 暴露 `callView` / `resultView`，用戶端能拿到 host `presentResult` 輸出。目前 master 從原始 `block.call` / `block.content` / `block.meta` 推導用戶端卡片，`ctx.slots` 也需要 `@deepseek-ai/dsh-client-ui-renderer/client` 模組增強。直接合並原型不能透過型別檢查，因此這些註冊項不經移植無法釋出。

## 提案

- 新增 `packages/client/tool-owned-render` workspace 包。
- 把 `read`、`bash`、`write`/`edit`、`grep`/`glob`、`web_search`/`web_fetch` 註冊項移植到從目前 `ToolCallBlock` 欄位推導。
- 增加 `read_image` 註冊項，使用同一套 ToolCard/Segment 原語。
- 透過 `dsh-client-ui-renderer` 接通 `ctx.slots` 型別增強。
- 移植單獨推進，保持 PR #2828 可合併。

## 已考慮的替代方案

- **直接合並原型並就地修復型別錯誤** — 否決：每個註冊項反正都要按目前 `ToolCallBlock` 欄位重新推導，移植就是同一份工作，只是舊的 `callView` / `resultView` 契約已不存在。
- **把移植併入 PR #2828** — 否決：image 卡片是一個範圍明確的單一功能，再加一個新包和五個註冊項會擴大本已很大的 PR 的審查面。

## 驗收標準

- `packages/client/tool-owned-render` 作為 workspace 包存在。
- 移植後的註冊項從目前 `ToolCallBlock` 欄位推導卡片狀態，並在 master 上透過型別檢查。
- `read_image` 註冊項與 `read` 使用同一套原語渲染。
- `ctx.slots` 型別增強透過 `dsh-client-ui-renderer` 解析。
- PR #2828 獨立於本移植合併。

## 風險

- 移植可能無法復現原型的精確視覺輸出，因為目前卡片原語與舊的 `callView` / `resultView` 契約不同。
- 移植推進期間 API 繼續漂移會使本提案過時；驗收標準在移植時按當時的 master 重新核對。
