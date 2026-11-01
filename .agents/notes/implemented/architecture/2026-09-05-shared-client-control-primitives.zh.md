# Agent Note: Shared client control primitives

Status: implemented

[English](2026-09-05-shared-client-control-primitives.md) | 中文

## Problem

用戶端功能外掛透過 slot 組合，彼此從不 import 對方的值，因此 `@deepseek-ai/dsh-client-ui-primitives` 是它們共享 React 元件的唯一通道。在某個功能包內部長出來的控制元件，對下一個需要同樣東西的包不可見，而複製它的標記與 CSS 是當時最省事的做法。三類控制元件已經這樣分叉：36×20 的開關只存在於 `ui-settings-plugins`；只讀膠囊徽章在 `ui-agent-preset`、`ui-settings-plugins`、`ui-settings-plugin-inventory` 裡被分別宣告瞭五次，帶著兩種圓角和各自編寫的配色；外掛相位狀態點在 `ui-settings-plugin-inventory` 裡被重新實作，就在它所複製的共享 `StateDot` 旁邊。

修復所需的兩半，作者當時一半也拿不到。沒有任何清單要求他們在寫控制元件前先看 `ui-primitives`，而這個包也沒給他們可看的東西：README 只列了六個原始檔，包卻匯出了四十多個符號。

## Decision

**第二個用戶端包需要的控制元件，住在 `ui-primitives`。** 這條規則是對作者的引導，不是門禁：功能包在需求確實特殊時仍可以自己寫元件，下面的[保留在原包的控制元件](#what-stays-local)記錄了本次改動中的這些例子。規則禁止的是複製——控制元件已經存在時，作者要麼用它，要麼把那處有意的差異提升成一個 prop。

`Tag` 是隻讀膠囊徽章。幾何鎖定在 `ui-agent-preset` 確立的尺寸：`999px` 圓角、`1px 8px` 內邊距、11px 字號配 17px 行高、500 字重、`inline-flex`、不換行。單個閉合的 `TagTone` 聯合選擇配色，每個成員都因為有已釋出的呼叫點需要它而存在：`outline` 與 `solid` 來自 agent preset 區塊，`neutral` 與 `quiet` 來自外掛設定欄位，`success`、`info`、`warning`、`danger` 來自外掛清單的啟用標籤。與所有 Cordis-free 原語一樣，這個元件不自帶任何文案。

`Switch` 是雙態開關，採用 `ui-settings-plugins` 確立的 36×20 軌道與 16px 滑塊。`label` 必填且沒有預設值，渲染點無法省略無障礙名稱；`title` 在部署停用該控制元件時承載鎖定原因。

`StateDotState` 包含 `idle`，表示一個被跟蹤的物件目前沒有進行中的活動。外掛清單的 `pending` 與 `unloading` 相位需要這個語義成員；沒有 `idle`，這兩個相位會徹底失去標記。五態聯合對消費方保持安全，因為每個包都從自己的閉合狀態聯合**產生** `StateDotState`，沒有任何一個對 `StateDotState` 本身做 switch。目前的純色點配色與旋轉 `ongoing` loading 見 [`ui-primitives` 參考](../../../../packages/client/ui-primitives/README.zh.md)。

**`ui-primitives` README 裡的元件目錄，是這條規則得以可用的前提。** 它列出每個匯出元件的用途，以及它不適用的場合，並點名三組容易混淆的配對：`Tag` 與 `Pill`、`DisclosureRow` 與卡片式摺疊、包內的 `FoldToggle` 與對外匯出面。`Pill` 是可選中的膠囊按鈕——它接受 `active` 與 `onClick`，用於檢視切換與篩選器；`Tag` 是隻讀徽章，兩者都不接受。元件註解使用同一套區分。

規則寫在 [packages/client/AGENTS.md](../../../../packages/client/AGENTS.md) 新元件清單的第一步，[docs/web-styling.md](../../../../docs/web-styling.zh.md) 指向該目錄，讓從樣式一側進來的作者也能到達。

## 如何找出重複

按名字搜會漏。`.badge`、`.tag`、`.chip`、`.configTag` 找不到以角色而非外觀命名的膠囊——`PluginCard` 的未儲存標記叫 `.pending`。幾何特徵才是可靠探針：搜尋同時帶有 `border-radius: 999px` 與 `padding: 1px 8px` 的 CSS Modules 規則。這個特徵屬於 `Tag` 與下面那個有意保留在原包的損壞徽章；未儲存標記只保留自己的 `flex: none` 佈局類。

<a id="what-stays-local"></a>
## 保留在原包的控制元件

機械搜尋會把下面這些控制元件歸到被提升的那三類裡。它們留在各自的包中，因為那種歸併只是表面相似：

- **`ui-trajectory` 的工具欄開關**帶 `role="switch"`，但它是 88px 寬的帶標籤控制元件、軌道內聯，而且目前渲染為 `hidden`。它和 `Switch` 不是同一個部件。
- **`ui-plan` 的模式 chip** 與 **`ui-conversation` 的 `ReferenceChip`** 都是可互動的：前者是警告色調的按鈕，帶 hover、focus、disabled 與關閉操作；後者是帶自有截斷邏輯的 Lexical 原子節點。兩者都不是隻讀徽章。
- **`ui-trajectory` 的單元格 tag** 與 **`ui-user-questions` 的推薦徽章**使用各自的幾何——一個是表格密度下的 6px 圓角，一個是側欄強調色上 600 字重的 6px 圓角。把它們塞進膠囊基準，改掉的是有意的設計，不是意外的分歧。
- **`TerminalBlock` 的退出狀態膠囊**保持為靜態 `Pill`。它落在 24px 的命令列上、用的是 pill 自己的幾何，`Tag` 的 11px 膠囊放不進那一行。只讀與可選中的區分是通常的判據，但這一處由尺寸決定，目錄裡也是這麼寫的。
- **`ui-agent-preset` 的損壞徽章**共用膠囊幾何，但帶著沒有第二處使用的實底錯誤色填充，而且它是自帶提示元素的懸停錨點。改用 `Tag` 就得在功能包樣式表裡保留一份配色覆蓋，並依賴跨檔案 CSS 順序來讓它生效。

## Alternatives considered

**做一個 `SettingsCard` 原語。** 否決。`.card` 出現在十五個包裡，但只有三處帶設定頁語義，而這三處的差異在行為而不在外觀：`ui-settings-plugins` 的 `PluginCard` 暫存編輯，且只在 Host 確認儲存後才摺疊；`ui-agent-preset` 的卡片可選中；外掛清單的卡片是隻讀的。`PluginCard` 自己的頭註解已經記錄了它為何不能使用共享摺疊行。單個元件將不得不透過 props 接納全部三種行為，而沒有任何一個呼叫方會用到其中一種以上。

**加門禁，拒絕 `ui-primitives` 之外的 `role="switch"` 或 `.switch` 規則。** 否決。目標是讓作者複用已有的東西，不是阻止他們建置。門禁會掛掉一個確實有特殊控制元件的包——`ui-trajectory` 的帶標籤工具欄開關正是這種情況——而誤拒的代價落在最沒法跟它講道理的作者身上。目錄加清單條目針對的是真正的失敗原因：作者不知道那個控制元件存在。

**用額外的 `Tag` props 保留現有的每一種外觀。** 否決。外掛清單的 5px 圓角與 agent preset 的膠囊是同一類標籤的兩種形狀，兩處差異都不是決定出來的。兩個都留會把一次意外固化進公開聯合，並且讓下一個作者去猜該挑哪個。

**擴充功能 `Pill` 而不是新增 `Tag`。** 否決。`Pill` 高 24px、圓角 12px、字號 12px；徽章基準更密也更圓。合併會產生一個尺寸取決於是否傳了 `onClick` 的元件，並抹掉只讀與可選中的區分——而目錄正需要這個區分來回答"我該用哪個"。

**給 `Tag` 設計 `variant × tone` 雙軸 API。** 否決。三個 variant 乘六個 tone 描述十八種組合，其中八種會發布，而且它允許呼叫方請求沒有定義外觀的組合。扁平的八成員聯合把每個值對映到恰好一種已釋出外觀。

**讓 `pending` 與 `unloading` 不渲染點，而不是新增 `idle`。** 否決。這些階段需要緊湊的未活動或過渡標記；在一個目的是統一呈現的改動裡把它刪掉，等於從清單中拿走資訊。

**把複用規則寫進根 `AGENTS.md`。** 否決。這條規則只管 `packages/client`，而根檔案正好處在 `scripts/doc-budgets.manifest.json` 給它的 1950 詞上限上，寫在那裡就必須擠掉一條不相干的儲存庫級規則。

## Testing

`Tag`、`Switch` 與擴充功能後的 `StateDot` 在 `packages/client/ui-primitives/tests` 中各有元件測試，處於每檔案 100% 覆蓋率門禁之內。`StateDot` 的配色透過讀取其樣式表來釘住：CSS Modules 在元件測試裡解析為類名對映，因此某個狀態缺了配色規則時會落到繼承色上，而任何渲染斷言都不會察覺。

遷移後的渲染點保留包級測試，覆蓋 role、無障礙名稱、狀態對映與互動。Web ARIA 快照覆蓋裝配後的呈現——`Switch` 保留帶 `aria-checked` 的 `role="switch"`，而由於 `StateDot` 是 `aria-hidden`，外掛清單的相位點把 `role="img"` 名稱保留在外層包裹元素上。

元件與樣式表測試固定膠囊幾何、StateDot 圖稿、動畫、token 與字重；Web 快照固定無障礙結構。明暗主題下的最終渲染仍由人工視覺檢查負責。

## Consequences

- 新的用戶端控制元件現在有一處可查、一處可加，而目錄把這次查詢變成讀一個檔案，而不是在四十多個匯出上 `grep`。
- `TagTone` 有八個成員，因為釋出了八種外觀。加第九個需要一個真的需要它的渲染點，而不是一個對稱性論證。
- 外掛清單使用膠囊標籤；"已停用"標籤使用 `neutral` 色調下可見的 `--dsw-alias-bg-module-platform` 填充。相位標記使用共享 `StateDot`，活動轉換採用旋轉 loading。外掛設定欄位中的"未設定"徽章使用基準 500 字重。
- 外掛清單調色盤不含 `#b45309` 字面量。`conditional` 標籤使用真實的 `--dsw-alias-state-warn-primary` token，而不是不存在的 `--dsw-alias-state-warning-primary` 別名及其硬編碼後備色。
- 這條規則無法被機械檢查。將來的作者仍然可以複製一個控制元件，只有評審能攔住。這是不設門禁所接受的代價：另一條路會拒絕正當的工作，而上面那份保留在原包的清單就是正當工作確實存在的證據。
- `Tag` 與 `Switch` 由多個設定和預設包共享；只有現有 prop 無法表達明確差異時，後續消費方才擴充功能這些原語。
