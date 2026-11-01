# Agent Note: 生成的第三方宣告

Status: implemented

[English](2026-07-30-generated-third-party-notices.md) | 中文

## 問題

本儲存庫開源需要披露所依賴的第三方軟體及各自的許可證。這份披露必須完整，必須隨依賴變化保持為真，還必須給出讀者用得上的資訊：哪些包最終會進到使用者機器上，哪些只用於建置和測試。

手寫清單無法長期滿足其中任何一條。約一百行從各 manifest（中繼資料清單）推匯出來的包名與許可證標識，只要有依賴新增、移除或換用許可證就會悄悄失真，而沒有任何檢查會察覺。

## 決策

[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 由 [`scripts/gen-third-party-notices.ts`](../../../../scripts/gen-third-party-notices.ts) 依據各工作區 manifest、`vendor/README.md`、`pyproject.toml`、`pnpm-workspace.yaml` 與 [共享執行時鎖檔案](../../../../scripts/primary-runtime/lock.json)生成。根 README 雙語兩側都從「許可證」一節鏈到該檔案。

**新鮮度會得到維護，而非僅靠驗證。** 只要暫存了生成器的任一輸入——任何 manifest、工作區宣告、根鎖檔案或共享執行時鎖檔案、`vendor/README.md`、某個 `pyproject.toml`、生成器自身，或持有建置期 pin 的腳本——pre-commit 任務就會重新生成該檔案並將其暫存，改依賴的人不必事後再折返跑一次生成器。已提交的位元組隨後由 [`scripts/gen-third-party-notices.spec.ts`](../../../../scripts/gen-third-party-notices.spec.ts) 斷言，而測試 lane 本就會跑這個檔案——這項驗證不增加門禁程序、不佔排程位、也不新增 CI 步驟。需要單獨驗證時，`pnpm run verify-third-party-notices` 仍然可用。

有一處觸發缺口是接受而非繞過的：lefthook 只檢視磁碟上存在的檔案，因此**刪除** manifest 不會觸發任何任務，移除一個包會落到測試 lane 的斷言上。重構暫存檔案列表以納入刪除的做法不成立——無論怎麼給列表，lefthook 都會拿工作樹過濾一遍。這個情境正由斷言後備。

檔案預設只披露**直接**依賴；完整的 npm 與 Python SDK 閉包保留在各自鎖檔案中。兩組獨立分發的載荷會明確列出：`@anthropic-ai/claude-agent-sdk` 宣告的官方 Claude 可執行包，以及共享執行時鎖檔案 `pythonPackages` 中的每個分發包。內建條目包含歸一化名稱、精確版本和已記錄的許可證中繼資料；中繼資料缺失、歸一化後名稱重複或版本衝突都會使生成失敗。共享 wheel 集合獨立於 `python/` 下的 manifest，僅掃描後者會遺漏已打包的 Office 庫。內建分發包同樣透過執行時許可證檢查，其中包括 Pillow 與 typing-extensions 宣告的寬鬆許可證標識 `MIT-CMU` 和 `PSF-2.0`。

**分層依據是分發內容，而非 manifest 欄位名。** 安裝的執行時庫由 `DEV_ONLY_AREAS` 之外的 `dependencies` 或 `optionalDependencies` 識別；排除區域為根 manifest、`packages/test-support/`、`packages/test-support/client-runtime/`、`website/`、`native/`。釋出所用的 tsdown 與 Vite 設定解析到的瀏覽器輸入也屬於執行時，即使它們位於 `devDependencies`；[瀏覽器第三方建置輸入](2026-09-08-browser-third-party-build-inputs.zh.md)擁有這項分類。測試支撐依賴不會僅因欄位寫成 `dependencies` 就被交付，而生成器顯式披露 `tsx`，因為原始碼啟動透過其 ESM 掛鉤執行。

執行時層刻意覆蓋**所有可掛載的外掛**，而不止 CLI、Web UI 與 Python 執行時預設載入的那些。從原始碼執行時，使用者可以透過 `cordis.yml` 掛載任何外掛包；因此，`@modelcontextprotocol/sdk` 與 OpenTelemetry 系列即使沒有任何預設裝配引入，也會觸達真實使用者。對法務披露而言，披露不足才是代價更高的那個方向。

manifest 集合由根 `pnpm-workspace.yaml` 宣告的 `packages:` 成員派生，其中包括 Landlock 工作區及其公開包，因此新增成員區域在宣告當天就會被讀取，而不必等誰想起來去補一份列表。許可證與儲存庫地址取自根工作區已安裝的 pnpm store 和包本地連結場；某個包兩處都解析不到時直接失敗，而不是留下空單元格。`OVERRIDES` 收錄已釋出 manifest 答不上來的包：用 Rust 建置、釋出時省略 `license` 欄位的 npm 可執行包，以及 `modelcontextprotocol/servers` 系列——該儲存庫正處在 MIT 向 Apache-2.0 的重新許可過程中，實際條款按貢獻逐條而定。執行時依賴的許可證若不在寬鬆清單內即為硬失敗：交付 copyleft 是一項分發決策，不該被一次重新生成悄悄吸收。被原始碼收編的包會與 `vendor/README.md` 交叉核對，出現非 MIT 即報錯；`pnpm-workspace.yaml` 的 `patchedDependencies` 列入執行時表格，因為 pnpm 在安裝期就會打上這些補丁——交付產物攜帶的是改動過的 `@earendil-works/pi-tui` 與 `node-pty`，補丁檔案本身就是改動的完整記錄。

專案所有者另行授權分發每個官方 `@anthropic-ai/claude-agent-sdk` 版本，以及該版本透過 `optionalDependencies` 宣告的官方 Claude Code CLI 與平臺載荷。生成器將其表示為一項精確匹配直接包身份的例外，而非寬鬆許可證覆蓋項：`SEE LICENSE IN README.md` 與 `SEE LICENSE IN LICENSE.md` 仍歸類為非寬鬆，所有無關的非寬鬆執行時依賴仍以預設拒絕方式失敗。存在該 SDK 時，生成器會讀取其已安裝 manifest，拒絕不符合官方 SDK 載荷字首的可選包身份，推導目前 SDK、CLI 與載荷版本，核驗已安裝主機載荷的身份、版本和宣告許可證欄位，並在單獨的宣告章節中渲染 SDK 宣告的完整載荷集合。版本、宣告許可證和載荷集合發生變化時無需新的身份授權，但仍須經過常規的依賴、鎖檔案、相容性、條款和宣告評審。

## 測試

斷言新鮮度的同一個 spec 也用 fixture（測試前置資料）manifest 釘住分層規則，覆蓋促成該規則的兩個情境：測試支撐包的 `dependencies` 條目，以及沒有任何應用掛載的外掛包。它還把各解析器釘在那些原本會讓某個包無聲消失的形態上：不再覆蓋全部收編目錄的 `vendor/README.md` 表、含 extras 的依賴陣列（`"httpx[http2]"`）、完全不帶版本的依賴、作者自取名字的 `[dependency-groups]` 表，以及任何硬編碼列表都不含的工作區成員區域。這些都是靜默漏報路徑——正是披露檔案最擔不起的失敗方式。

Claude 分發測試證明：只有精確匹配的直接 SDK 身份會繞過通常的非寬鬆執行時拒絕；該繞過不會改變許可證分類；載荷集合來自 SDK manifest，而非版本或平臺允許列表。SDK 身份錯誤、載荷缺失或存在無關的可選包身份時，測試都會失敗。

## 考慮過的替代方案

**保留手寫檔案，發版時人工過一遍。** 用肉眼審閱上百行推導資料，恰恰是生成器能做對的活；而且在兩次發版之間，檔案自稱「列出全部直接依賴」這句話無人驗證。

**用專門的 `doc-sync`（文件同步門禁）驗證。** 儲存庫裡其他生成產物都是這麼把關的，本次改動最初也是這個形態。但它要在本已冗長的矩陣裡再佔一個門禁程序和一個排程位；更糟的是，它唯一的失敗方式，就是在別人推完一個無關的依賴升級幾分鐘後，通知對方回去重跑一次生成器。改為提交時重新生成消除了這次打斷，而把斷言放進測試 lane 本就會跑的 spec 裡，則以零額外 CI 成本保住了這項保證。

**列出完整傳遞閉包。** 閉包有數千個包，鎖檔案裡已帶精確版本，鋪開只會淹沒讀者真正要評估的直接依賴。檔案轉而指向鎖檔案與 `pnpm licenses list`。

**按 manifest 欄位分層（`dependencies` 與 `devDependencies`）。** 機械上最省事，但在真實資料上兩個方向都會出錯，理由見上文分層段落。

**只按已交付裝配的可達性分層**（`apps/*` 加 `python/sdk-runtime`）。這樣得到的執行時層更緊湊，但會把 MCP 用戶端與 OpenTelemetry 匯出器判為僅開發用途——而執行已安裝儲存庫的使用者完全可以掛載它們。這會低估披露，對法務通告來說錯在了更危險的一側。

**將 Claude SDK 條款視為寬鬆條款，或新增可複用的非寬鬆允許列表。** 兩種方案都會誤述上游宣告，並讓無關執行時依賴繼承從未授予它的授權。這項窄例外只匹配官方直接 SDK 身份；其可選載荷身份僅作為該 SDK 宣告的資料被接受，並繼續明確歸類為非寬鬆。

**把披露檔案做成雙語對。** 其他根文件都是成對的，但這份檔案是上游包名、SPDX 標識與網址構成的表格，可翻譯的只有寥寥幾段章節導語。`scripts/translation-pairing.ts` 的發現範圍限定在 `README*`、`.agents/notes/**`、`docs/**` 與 `python/**`，根目錄下的非 README 檔案在建構上就不屬於雙語語料；雙語入口由 README 對承擔。

## 後果

此後改動依賴時，重新生成的披露檔案會隨同一個提交入庫。觸及 manifest 的提交多付一次生成器執行——約一秒；其餘提交不受影響。若停用掛鉤提交，代價推遲為一次測試 lane 失敗，其報錯會指明補救命令。

生成器需要已安裝的依賴樹，因此比純原始碼生成器更重；釋出中繼資料不可用的新包需要補一條 `OVERRIDES`，而不是默默渲染出空白許可證。這兩類失敗都會明確報錯並指出補救方式。

分層規則是編碼在一個常數裡的策略。若新增了不參與交付的工作區區域——第二層測試基礎設施、另一個站點——就要同步擴充功能 `DEV_ONLY_AREAS`，否則其依賴會被當作執行時依賴披露出去。

Claude 身份例外刻意比其啟用的載荷披露範圍更窄。升級 SDK 無需新的所有者授權，但如果已安裝的 SDK 未公開自身版本、CLI 版本和至少一個官方平臺載荷，或目前主機載荷與 SDK 宣告不符，重新生成就會失敗。維護者仍須評審發生變化的條款與相容性；生成器會阻止授權悄然擴大到其他包。
