# Agent Note: 已交付組合中的預設 Web 搜尋

Status: implemented

[English](2026-07-31-web-default-search.md) | 中文

[共享 base 的 Web 抓取預設值](../../archived/feature/2026-09-01-shared-base-web-fetch-default.md)取代本文關於抓取按需啟用的決策。本文繼續負責預設搜尋提供者、憑證解析、端點、超時，以及提供者可用性與模型工具註冊之間的區分。

## 問題

該 harness 已具備完整的 Web 能力體系：提供者註冊表、DeepSeek、Exa 和 Perplexity 搜尋提供者、本地抓取、穩定的面向模型工具，以及結構化結果呈現，但已交付的 `dsh web` 組合沒有掛載其中任何一項。除非部署提供自定義覆蓋層，否則模型無法發現最新資訊。僅掛載現有 DeepSeek 提供者仍無法串接 WebUI 鏈結：Models 頁面透過 `ctx.credentials` 儲存 `DEEPSEEK_API_KEY`，而搜尋提供者只會在外掛載入時固定讀取程序環境，因此在執行中的 UI 輸入或輪換的金鑰無法用於搜尋。

## 決策

`packages/bundle/base/cordis.patch.yml` 明確掛載 `dsh-web`，設定 `searchProvider: deepseek-official` 與 `fetchProvider: http`，同時掛載 `dsh-web-search-deepseek`、`dsh-web-fetch-http`，並以 `searchTimeoutMs: 60000` 掛載 `dsh-tool-web`。[共享 base 的 Web 抓取預設值](../../archived/feature/2026-09-01-shared-base-web-fetch-default.md)負責目前的 `fetch: true`；本文繼續負責提供者選擇、搜尋憑證與超時。顯式提供者 id 使選擇不受註冊順序影響，同時個人覆蓋層或 `--patch` 覆蓋層仍可替換或停用這些設定項。已交付的一分鐘預算用於覆蓋一次輔助 DeepSeek Messages 請求及伺服器端檢索，同時保持 `dsh-tool-web` 提供者無關的 30 秒預設值不變，以供自定義組合使用。[Web 能力 seam 決策](../architecture/2026-06-24-web-capability-seam.zh.md)負責公開抓取安全策略。

DeepSeek 搜尋使用與官方工作階段介面卡相同的 `DEEPSEEK_API_KEY` 憑證引用。提供者在每次搜尋內部透過可選的 `ctx.credentials` 服務解析該引用；只有未掛載該 seam 的組合才會退回到啟動程序的環境變數，非空的 `apiKey` 字面值仍作為程式化設定的最後後備。因此，由 Web 的 Models 頁儲存或輪換的金鑰無需重新啟動即可用於下一次搜尋，提供者也無需保留該值。由於 `WebSearchProvider.available()` 是同步方法，它會將已安裝解析器視為本地可用；若動態憑證缺失，操作會以提供者專屬錯誤碼 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗，而穩定的工具 schema 仍保持註冊。

搜尋端點與 chat completions 保持獨立：`DEEPSEEK_SEARCH_BASE_URL` 覆蓋 Anthropic 相容基址，`DEEPSEEK_BASE_URL` 則繼續設定工作階段請求。每次 `web_search` 都會發起一次輔助 DeepSeek Messages 呼叫，並攜帶原生搜尋伺服器工具。發出請求前一刻，提供者會向發起請求的 agent（智慧代理）工作階段追加僅用於日誌的 LLM（大語言模型）請求事件 `web/deepseek-search-llm-request`，其中包含已解析端點、API 版本，以及不含金鑰的精確 JSON 請求體。請求發出後的失敗會指出該端點；當端點不符合使用者預期時，錯誤訊息會要求工作階段模型指導使用者在 Settings 中修改網頁搜尋的 Endpoint 欄位。該設定頁面不可用時，訊息會說明 `DEEPSEEK_SEARCH_BASE_URL` 和 `web-search-deepseek.baseURL`；模型不得替使用者選擇或修改憑證傳送目的地。憑證預檢仍留在提供者內部，並與呼叫方取消存在競態；這兩項關注點都不會擴充功能通用 Web seam 或憑證 seam。

預設掛載不會建立 Web 專用權限策略。`web_search` 與已啟用的 `web_fetch` 呼叫會在 bash／檔案系統沙箱及審批 preset 之外執行，並遵循 `dsh-tool-web` 的現有約定。HTTP 提供者把抓取限制到已驗證的公開目的地址，但不限制公開資料出站。已交付的 `workspace-write` 預設值只管轄檔案修改；若產品採取受限網路策略，就需要新增 `tools/pre-execute` 策略或按能力限制網路存取，而不能暗示檔案系統存取模式會管轄 Web 呼叫。

## 考慮過的替代方案

**僅掛載 `dsh-tool-web`。** 不予採納：穩定的 schema 如果沒有已註冊提供者，每次預設呼叫都會失敗。啟用狀態與後端可用性刻意分離，但已交付的預設設定必須提供其預期實作。

**從 `cordis.yml` 讀取 `$DSH_HOME/.env`，或將其提升到 `process.env`。** 不予採納：憑證提供者擁有該檔案，環境變數值是隻讀覆蓋；提升後儲存的金鑰將無法輪換，還會繞過經審計的金鑰邊界。

**在提供者載入時固定讀取 `process.env.DEEPSEEK_API_KEY`。** 不予採納：Web Models 頁面透過 `ctx.credentials` 寫入金鑰；產品文件規定的首次執行路徑必須保證下一次操作無需重新啟動即可生效。

**將 Web 工具保留在 `web.cordis.yml` 中。** 不予採納：這會保留 TUI 與 Web／無頭介面之間無法解釋的工具清單差異。這些設定行並非介面特有，因此其唯一歸屬是 `base.cordis.yml`；[工具清單決策](2026-07-31-even-out-shipped-tool-rosters.zh.md)記錄了這一共享組合。

**提高 `dsh-tool-web` 的提供者無關超時。** 不予採納：自定義提供者和部署有各自不同的延遲預期；這一部署預算應歸已交付的 DeepSeek 組合所有。

**在每個共享 base surface 上啟用抓取。** 本文曾因各產品可能需要不同網路策略而否決該方案。已交付產品採用同一個完整工具集合後，[共享 base 的 Web 抓取預設值](../../archived/feature/2026-09-01-shared-base-web-fetch-default.md)取代了該否決；僅限公開目的地址與無需逐次審批的約束仍然有效。

## 後果

headless、完整 SDK、ACP 與僅使用 base 的自定義 profile 的原生模型請求都會攜帶 `web_search` 和 `web_fetch` schema 與指引；Web preset 會暴露同一對工具，PTC mode 還會透過 `run_code` 暴露它們。搜尋會增加一次完整的輔助模型呼叫，並可能多次使用原生伺服器工具；發起工作階段的日誌仍可精確重建其不含金鑰的請求。抓取會強制使用公開地址，並且無需逐次審批。Web 快照通道會啟動已交付設定樹，使用本地 Messages fixture（測試前置資料），經由真實 DeepSeek 提供者驅動一次回放的 `web_search` 呼叫，斷言持久化的輔助請求與結構化結果，並固定最終瀏覽器呈現。共享 snapshot header 會固定通用的抓取 schema 與提示指引。組合冒煙測試會固定工具集合；建置後組合設定的轉儲固定已交付的一分鐘搜尋預算；提供者測試固定缺失、已儲存及已輪換憑證的行為，以及字面值與環境變數的相容性。
