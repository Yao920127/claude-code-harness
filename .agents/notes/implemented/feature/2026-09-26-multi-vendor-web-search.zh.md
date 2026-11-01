# Agent Note: 多廠商網頁搜尋

Status: implemented

[English](2026-09-26-multi-vendor-web-search.md) | 中文

## Problem

出廠組合只掛載需要 DeepSeek API 金鑰的 DeepSeek 搜尋提供者。透過 Claude Code 登入、沒有 DeepSeek 金鑰的 CCH 安裝因此沒有可用的 `web_search`，持有其他模型廠商金鑰的使用者也無法使用這些廠商的搜尋。web 服務還只在啟動時讀取一次所選提供者，因此沒有任何設定介面能切換提供者。

## Decision

兩個提供者包加入 [web seam](../architecture/2026-06-24-web-capability-seam.zh.md)。[`dsh-web-search-claude-code`](../../../../packages/web/web-search-claude-code/README.zh.md) 每次搜尋用 Host 的登入執行一次 Claude Code 查詢，該查詢唯一的工具是 `WebSearch`，回答是 JSON schema 結構化輸出。[`dsh-web-search-vendors`](../../../../packages/web/web-search-vendors/README.zh.md) 註冊 Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral 與 Z.AI 提供者，每個提供者在每次搜尋時解析自己的憑證引用。Claude API 提供者使用官方 Anthropic SDK 與 `web_search` 伺服器端工具。

base bundle 在 DeepSeek 之外掛載各廠商提供者、Exa 與 Perplexity，並仍選擇 DeepSeek。CCH bundle 掛載並選擇 Claude Code 提供者。`dsh-web` 的 `searchProvider` 為 volatile，並在每次搜尋時讀取，因此外掛頁新增的**搜尋來源**頁面無需重新啟動即可切換提供者，並透過憑證域儲存所選提供者的金鑰。

## Alternatives considered

**每個廠商一個包。** 七個包會重複同樣的憑證、取消與錯誤處理，以及七組 README，而這些提供者的差異只有一個請求和一種對映。

**像 DeepSeek 一樣把每個輔助廠商請求記為 Session 事件。** 每個廠商都會新增一種持久事件型別、持久化型別審查與 SDK 預期輸出。模型可見的輸入已是工具呼叫中的查詢，模型可見的輸出是工具結果；Perplexity 與 Exa 已遵循這一規則。

**納入 Qwen、Groq 與 Kimi。** 它們的搜尋回應沒有文件說明的結構化來源列表，對映只能猜測欄位，或只返回沒有來源的回答文字。

**讀取 Claude Code 儲存的登入並直接呼叫 Messages API。** 這會繞過被借用登入的產品本身；[Claude Code 模型路由](2026-09-25-claude-code-model-route.zh.md)已否決同樣的捷徑。

## Consequences

選擇一個未儲存金鑰的廠商會以寫明引用的 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗。設定頁只知道各提供者出廠的金鑰引用，因此修改某廠商 `apiKeyEnv` 的部署也必須在新引用下儲存金鑰。Claude Code 搜尋每次都啟動一個程序，並計入已登入帳號的用量。各廠商的預設模型與端點屬於組合設定。單元測試覆蓋各廠商的請求與對映、憑證與取消失敗、代理出口、Claude Code 查詢選項與輸出驗證、提供者即時切換以及設定頁；Loader 組合測試透過出廠 headless profile 選中這兩類新提供者。
