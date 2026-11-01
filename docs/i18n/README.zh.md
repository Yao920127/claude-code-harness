# 雙語文件

[English](README.md) | 中文

本儲存庫的文件會被公司內外的人和 agent（智慧代理）閱讀，因此範圍內的每篇文件都以英文和繁體中文（臺灣）維護。本頁定義配對約定、檢查、範圍與排除規則；[translation-rules.md](translation-rules.zh.md) 定義如何翻譯；[terminology.md](terminology.md) 是術語真源。agent 的日常工作遵循 [docs/AGENTS.md](../AGENTS.md) 中的輕量路徑；擴充功能版 [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) 工作流僅在使用者顯式呼叫時可用。

<a id="the-pairing-contract"></a>

## 配對約定

- **兩種語言同權。** 一篇文件可以先用任一語言撰寫和評審（先寫中文的 Agent Note 與先寫英文的一樣正當），另一側由它翻譯而來。兩個檔案誰也不高於誰；約束它們的是二者必須說同樣的話。
- **一對文件是三個同目錄檔案。** 英文 `foo.md`、中文 `foo.zh.md`，加一份一致性記錄 `foo.i18n.yaml`，都在同一目錄。不用語言目錄，不用獨立翻譯儲存庫，不用中英混排的單檔案。配對必須整體合併：PR（Pull Request）永遠不會只帶一種語言而缺其餘兩個檔案。
- **一致性記錄。**`foo.i18n.yaml` 為每個仍含語言特有內容的標題分節儲存一個條目。鍵是該分節英文標題 slug 組成的路徑（第一個標題之前的文字為 `/`；重複路徑依次加 `~2`、`~3`……），條目儲存該分節中兩側不同的英文塊與中文塊各自的 hash：

  ```yaml
  /foo:
    en: 41d772192075e133
    zh: dda91c6c670cfd9d
  /foo/usage:
    en: 86940bea4a3c7ed6
    zh: de78429597783c7f
  ```

  一側的第 `i` 個分節對應另一側的第 `i` 個分節。每側的 hash 覆蓋該分節的全部頂層塊，只排除圍欄程式碼塊和生成區域——門禁已要求這兩類內容在兩側一致；只是碰巧相同的內容仍計入 hash。沒有剩餘塊的分節沒有條目。重新生成區域或在兩側同時修改程式碼塊不會改變記錄；修改不同分節會改動記錄中不同的行，因此 Git 預設文字合併（包括 GitHub 的合併）能組合它們。只有兩個分支都修改了同一分節中計入 hash 的內容時，記錄才會衝突；解決 Markdown 衝突後重新記錄該配對。失去同步的配對是「按被改一側的 diff 最小化地修補另一側」，從不整篇重譯；門禁會指出每個發生變化的分節。日常工作會直接完成這份修補；使用者顯式呼叫擴充功能工作流時，`pnpm run gen-translation-brief <pair>` 會從內容能生成所記錄條目的最新提交中還原上次確認的文字，以能安全對齊的最窄粒度彙集這次更新，並可由 `--apply` 在結構驗證後拼接僅涉及圍欄程式碼塊的改動。兩側對齊後，`pnpm run verify-translation-pairing --write <pair>` 重新記錄這些條目；那份 YAML diff 就是「確認一致」這個動作本身，可以被評審，也正因如此，`--write` 要求點名你確認過的配對（`--write --all` 是顯式的全語料形式）。

  中文件案必須保留指向英文的反向連結；普通撰寫的英文源必須保留指向中文的連結，而清單內的生成英文源不作此要求。[按分節記錄配對 Agent Note](../../.agents/notes/implemented/process/2026-09-23-section-keyed-translation-pairing-records.zh.md) 負責記錄該記錄格式與備選方案。
- **語言切換行。** 中文件案一律在 H1 標題後立即以 `[English](foo.md) | 中文` 鏈回英文。普通撰寫的英文件案在同一位置以 `English | [中文](foo.zh.md)` 互鏈；清單內的生成英文源省略此行，以便與生成器輸出逐位元組一致。釋出到 GitHub 以外位置的 README（例如 PyPI 專案中繼資料）可以改用指向同一對側檔案的規範 `https://github.com/deepseek-ai/deepseek-harness/blob/master/<repository-path>` URL，使切換行在該位置仍可存取。
- **結構與另一側一一對應。** 標題深度與順序、列表型別、有序列表起始編號、列表項數量、表格行列數、保留原樣 query/fragment 字尾的語義連結目標，以及逐位元組一致的程式碼塊在配對兩側一一對應。相對文件連結的目標屬於活躍雙語語料時，英文側使用其 `.md` 路徑，中文側使用其 `.zh.md` 路徑。該範圍內缺少對側屬於配對完整性錯誤，不得退回；範圍外的目標保留原路徑。完整保持規則見 [translation-rules.md](translation-rules.zh.md)。既有 Markdown 門禁對 `.zh.md` 檔案原樣生效（`verify-md-wrap`、`verify-md-links`）。

## 門禁：verify-translation-pairing

`pnpm run verify-translation-pairing`（`doc-sync`（文件同步門禁）的一環，貢獻者會針對文件變更在本地執行，CI 則會完整執行）機械地強制執行這份約定：

1. 範圍內的每篇文件都有完整配對。發現 README 時，basename 不區分大小寫，因此 `missions/readme.md` 與其他文件根一樣屬於範圍。
2. 任何已存在的配對產物都完整且一致：三個檔案齊全、記錄為規範形式，且其條目等於根據目前內容計算出的條目（任一側的語言特有內容改了而沒重新確認配對就變紅）、中文側和所有普通撰寫的英文源都帶語言切換行（清單內的生成英文源除外）、每條普通相對文件連結都使用原始檔一側對應的目標 locale，且結構簽名按序一致：標題深度、逐位元組一致的程式碼塊（資訊字串與內容）、表格行列數、列表型別、有序列表起始編號、列表項數量，以及除切換行之外保留原樣 query/fragment 字尾的語義連結目標。
3. 列為 `excluded` 的檔案完全沒有 `.zh.md`，也沒有 `.i18n.yaml`。`.agents/notes/archived/` 下凍結的 Agent Note 不受這個持續演進的門禁約束；專用驗證器會要求其現有的三個配對檔案完整，並將其封存。

面向原始碼的程式碼門禁會把精確的 `.zh.md` 圍欄序列視為其無字尾兄弟檔案的派生內容，而不會再次編譯相同程式碼或在 manifest（中繼資料清單）中重複登記。該序列必須在長度、順序、圍欄型別和按位元組精確的正文上一致；否則兩份副本仍會獨立受檢，配對門禁也會報告結構不匹配。

`pnpm run verify-translation-pairing --list` 列印範圍內每篇文件的目前配對狀態（missing、out-of-sync 或 ok）。它從不失敗；其中 `missing` 與 `out-of-sync` 行指出普通檢查會拒絕的違規。

`pnpm run verify-translation-pairing <pair...>` 只檢查被點名的配對——配對的三個檔案中的任意一個（或其裸詞幹）都能點名它——因此更新迴圈幾秒內就能驗證自己的配對，而不必重新掃描全語料。`doc-sync` 與 CI 執行的是無參數的全語料形式；限定範圍的綠燈在 PR 層面永遠不能替代它。

這個門禁帶來的實際規則是：**當一個 PR 修改了已配對文件的任一側時，同一個 PR 在術語指導下直接一次完成對側檔案的更新，並用 `--write <pair>` 重新記錄配對**，與本儲存庫既有的程式碼與 README 的 doc-sync 規則完全一致。留下失去同步的配對的 PR 會在 CI 變紅。

門禁的限制很明確：**門禁透過意味著這組文件在目前內容上的一致性得到了確認，不代表確認本身正確可靠。** 它檢查記錄的 hash 與 Markdown 結構；它無法判斷兩側是否在說同樣的話，也無法判斷措辭是否準確、術語是否得當、行文是否自然；這部分約定由評審者把關，見 [translation-rules.md](translation-rules.zh.md)。重新記錄了 hash 但另一側翻得潦草的配對能透過門禁；它不得透過評審。

## 範圍與排除

**範圍**：根目錄 `CONTRIBUTING.md`、`BRAND_GUIDELINES.md` 與 `SAFETY.md` 文件、除 vendor 原始碼外的全部 README，以及 `.agents/notes/**`、`docs/**` 與 `python/**` 下的全部活躍文件。匹配 README 時只看檔名且不區分大小寫，因此今後新增的目錄無需再修改 manifest。依賴目錄、被忽略的建置產物目錄以及凍結的 `.agents/notes/archived/` 目錄樹只在發現階段排除，不屬於持續演進的翻譯源文件。

有經評審的中文對側的生成英文參考文件和圖文件遵循配對規則。生成器把生成資料放在生成區域中，並把每個區域寫入兩種語言的頁面，因此重新生成不需要手工更新中文，也不需要重新記錄；只有區域外的說明文字需要翻譯並計入記錄。新鮮度門禁與配對門禁各自獨立強制其約束。

共享生成區域（例如 Cordis 子系統區域和[設定目錄](../config-catalog.zh.md)中每個包的區域）在兩種語言間保持每個生成位元組相同，僅配對文件路徑按語言在地化；區域內的標籤使用程式碼識別符號而非譯文。整頁生成器也可以從相同的結構資料渲染原始碼維護的雙語說明，例如 [persistence-catalog-text.ts](../../scripts/persistence-catalog-text.ts)，並保持 Markdown 結構對應、程式碼塊完全相同。它同時重新生成兩頁及其一致性記錄；評審仍須驗證雙語說明的含義與術語。

生成的英文原始檔不含普通撰寫文件所帶的語言切換行，因為新增該行會使生成器新鮮度檢查失敗；中文對側仍連結回英文源。人工維護的中文對側只能改寫若直譯便不再符合經評審譯文事實的自指生成與維護說明；所有技術內容仍受普通忠實性規則約束。

**排除**（永不配對，門禁拒絕為它們建 `.zh.md` 或 `.i18n.yaml`）：

- [cordis-api/inherited.md](../cordis-api/inherited.md)：該生成文件沒有經評審的中文對側，因此網站的兩個 locale 都投影英文原始檔。
- `docs/AGENTS.md`、`.agents/notes/**/AGENTS.md` 以及指向它們的 `CLAUDE.md` 指令符號連結：agent 指令，與根 `AGENTS.md` 一樣只以英文維護。
- `docs/i18n/terminology.md` 與 [style-samples.md](style-samples.md)：二者本身即為中英對照文件。
- [translation-prompt.md](translation-prompt.md)：自動翻譯流水線的提示詞範本；正文逐字進入模型請求，配對翻譯會改變流水線行為。
- [review-ownership/README.md](../../.github/review-ownership/README.md)：儲存庫內部審批策略，只以英文維護。
- `.agents/notes/archived/`：凍結的歷史三檔案配對。[`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) 驗證其完整性和內容封存記錄；翻譯維護絕不能重寫這些檔案。

**統一要求**：目前及今後納入範圍的每篇文件，合併時都必須構成完整的雙語配對。[scripts/translation-pairing.manifest.json](../../scripts/translation-pairing.manifest.json) 只包含顯式排除項；不存在逐檔案推進清單、日期分界或 README 專用政策類別。

## 分工

日常更新對側檔案時，負責處理的 agent 會先載入 [terminology.md](terminology.md)，再直接一次性更新；它不會呼叫翻譯 skill（技能）、生成簡報、執行單獨的翻譯評審輪次，也不會委派給 subagent。擴充功能版 [dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) 工作流保留這些較重的機制，僅供使用者顯式呼叫。門禁負責檢查配對是否完整、記錄的 hash、中文反向連結和普通撰寫源的切換行（生成源按本文規則例外），以及本文列出的結構簽名；翻譯品質、術語和簽名未涵蓋的結構要求仍由評審把關。提示詞約定也有可執行實作：[scripts/translation-prompt.ts](../../scripts/translation-prompt.ts) 會把儲存庫內建的範本（注入術語表；範本自帶經人工校準的規則）渲染為英譯中或中譯英兩個方向的提示詞，並解析三段式回應；`doc-sync` 中的 `verify-translation-prompt` 會檢查兩個渲染方向與儲存庫內範例。
