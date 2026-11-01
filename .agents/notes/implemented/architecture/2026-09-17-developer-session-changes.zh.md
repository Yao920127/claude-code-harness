# Agent Note：使用 developer 訊息記錄增量 Session 變更

Status: implemented

[English](2026-09-17-developer-session-changes.md) | 中文

## Problem

動態工具變更需要持久且有序的記錄，提供者才能在改變可用工具時保留對話的快取字首。將這些變更編碼為自由文字提醒會丟失結構化的工具身份，並將 Session 狀態與提示詞措辭耦合。

## Decision

`DeveloperMessage` 按對話順序記錄已接納且模型可見的 Session 變更。新增塊僅儲存 `toolName`；所在事件的 `headerSeq` 選擇更早的完整 `request/header`，其中每個新增名稱必須恰好對應一個模式。同一事件的所有新增繫結到同一個請求頭版本。新增替換目前同名定義；移除僅記錄名稱，不重複模式。沒有新增塊的訊息不攜帶請求頭引用。同名替換、重新啟動、fork 和 surface 替換保留歷史定義身份，不查詢目前註冊表或最新請求頭。沒有被任何已接納請求暴露的中間註冊表變更無需 developer 記錄。

`developer/message` 攜帶訊息及其接納 turn/step 座標。原生讀取方和 Session 接納邏輯拒絕缺失、前向、未知、非請求頭及歧義模式引用、不完整的被引用定義，並拒絕已退役的內嵌定義，同時保留無關 JSON 欄位。`sourceEventSeqs` 保持為獨立的派生中繼資料。替換保留選定的請求頭，並引用被覆蓋的 surface 節點；不同請求頭版本的新增必須分屬不同事件。fork 保留所引用的字首，壓縮不刪除請求頭事件。未來改變事件數量的遷移必須將 `headerSeq` 作為同一檔案內的事件引用重對映。空 developer 內容保留其 surface 位置，不新增模型訊息，也不能覆蓋受保護的 system 頭節點。tools 包按照[生產者自有來源規則](2026-09-09-producer-owned-message-sources.zh.md)擁有 `tool-registry` 來源種類。

`ToolAdditionBlock.tool` 宣告為可選的 `never`，並標註 `@persistenceReserved`。模式歷史因此記錄這個被拒絕的欄位：後續允許任何值都會改變現有值型別並要求格式遞增，無關的可選中繼資料仍屬於可相容新增。

`ToolSchema.deferLoading` 請求延遲載入工具定義，與工具新增歷史相互獨立。工具建構、註冊表投影與提示片語裝保留該標記。動態新增與定義載入是不同事實；預先宣告的延遲載入定義無需虛構新增記錄。

V4 編解碼器將 developer 角色限定在 `developer/message` 欄位內，並拒絕 inbox 與標題請求陣列中的該角色。原生驗證檢查 developer 必需欄位、歷史請求頭繫結及工具變更塊僅限 developer 的約束，同時保留附加 JSON 屬性。因此，可選中繼資料新增符合持久化檢查器的可選屬性規則，仍可讀取；附加欄位不能削弱必需欄位、角色或開啟 step 的檢查。可忽略標記不代表讀取方支援該事件：物理解碼保留 developer 載荷，直到按詞表執行接納；寫入方和原生讀取方仍拒絕格式錯誤的已知資料。developer 接納邏輯將格式錯誤的普通訊息欄位留給解碼器恢復。已安裝的 Session 接納邏輯驗證 surface 關係，不把 developer 記錄轉換為已釋出 V3 的 user 記錄。[已釋出格式遷移規則](2026-08-31-released-session-format-migrations.zh.md)繼續保護已提交的前代檔案。

Session V4 預留 issue #4146 所需的持久表示。生產發出、提供者投影、UI 展示和壓縮整合見[動態工具更新決策](2026-09-20-dynamic-tool-updates.zh.md)。

## Alternatives considered

**將文字提醒作為 developer 內容。** 此格式表示結構化 Session 變更；模型指令屬於 system 訊息。未來的 developer 內容尚未指定，不將其限制為提醒。

**在每次新增中重複定義。** 完整請求頭已經保留精確模式。歷史引用避免第二份持久化副本，同時保留同名替換的身份。若繫結到最新請求頭或註冊表，則會重新解釋較早的新增。

**將延遲載入視為存在工具新增記錄的證據。** 這會阻止預先宣告的延遲工具。模式標記描述載入方式，內容塊記錄動態新增。

## Consequences

Session V4 持久化 issue #4146 的工具變更表示。發出、路由投影、DeepSeek 序列化及 Chat 和 Trajectory 展示由[動態工具更新決策](2026-09-20-dynamic-tool-updates.zh.md)負責。
