---
description: "Web GUI 的權限預設介面：通用設定中的預設行與切換目前工作階段的 /permission 選擇器；供權限策略的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-permission-presets

[English](README.md) | 中文

## 概述

為目前 Web 工作階段或未來工作階段選擇權限預設。通用設定行只更改之後建立工作階段所用的預設值；composer 與 `/permission` 選擇器切換目前工作階段。預設 Web 提供僅可檢視、工作區內修改與完全權限。顯式載入實驗 Auto integration 後，目前工作階段選擇器會增加帶 `EXP` 標記的 Auto review。透過可見選項選擇完全權限或 Auto 時，需要分別確認對應風險；完整的 `/permission <preset>` 命令直接執行。主機透過 Session 投影確認每次變更。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

將本外掛與 settings、commands 和 conversation 包一同掛載。通用設定獲得未來預設值行；composer 獲得 `conversation.input.permission` 控制元件，裸 `/permission` 開啟 slash 選擇器。目前工作階段控制元件同時要求 Session 投影和完整目錄快照。不提供權限功能的裝配既不公開目前工作階段控制元件，也不公開設定行。

### 選擇器

選中即提交 `/permission <preset>` 命令列。帶參形式（直接鍵入 `/permission <preset>`）仍直接切換；裝飾只替換裸呼叫。內建標籤在英文介面中是 `Read Only`、`Workspace Write`、`Full access` 和 `Auto review`，在中文介面中是「僅可檢視」「工作區內修改」「完全權限」和 `Auto review`。顯式 host 標籤保持原樣，未知 kebab-case 名稱渲染為 Title Case；`auto` 帶有 `EXP` badge，並在可見選擇時要求實驗風險確認。`custom` 只是顯示狀態，絕非目標。

即時目錄撤銷某個預設時，composer 關閉對應的待確認對話方塊，並用 Session 的目前值替代已不可用的樂觀選擇。每次目錄失效（無 payload 的通知或連線代際變更）會關閉已開啟的 slash 選擇器或其確認對話方塊，不消費草稿；而釋出某個 picker 正在等待的讀取結果時，該 picker 保持開啟並保留失敗與重試狀態；重新開啟時讀取目前目錄。已經提交的命令在回應結束前繼續保持忙碌狀態。

### 設定行

該行從主機動態的 `defaultPreset` enum 推導選項，使用與目前工作階段選擇器相同的在地化內建標籤，並寫入一條設定變更操作。`auto` 等僅限目前工作階段的 contribution 不會出現。該值只在之後建立工作階段時生效；改變它絕不會切換或改寫目前工作階段。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

General Settings 行經 `ctx.configForms` 讀取顯式暴露的 `permission` Settings 描述符，並攜帶描述符 revision 寫入一條 `settings.mutate` 路徑操作；其 observable 經 slot 系統的 `hooks` compartment 傳遞，因此 React 掛鉤繫結歸渲染器，推送失效通知會重新取得描述符。該值只在之後建立工作階段時讀取。目前工作階段介面是掛在主機 `/permission` 命令上的 popupSelect 裝飾（`ctx.commandUi.decorate`）：主機命令保留斜槓選單行、帶參形式與持久生命週期記帳，裝飾只把裸呼叫替換為選擇器。一個程序級目錄會在首次 Remote 讀取前訂閱無 payload 的目錄通知，並且只發布目前連線代際中最新的完整成功結果。勝出的讀取失敗或連線 reset 會清空舊快照：composer seat 因此隱藏，直到後續既有觸發重試，而 slash 選擇器保持可用並在彈出視窗內顯示失敗與重試；舊連線代際與 dispose 後才返回的結果會被忽略。它的公共 observable 是 `{ value }` 與 `invalidations`（每次目錄通知或連線代際變更打一個點）；失敗僅供命令式載入內部使用。slash popup 與 composer seat 共用這份目錄，而 Session `permissions` 投影只提供 `currentValue`。Full access 與 Auto review 各自攜帶在地化確認文案；Auto 還攜帶由共享 popup 外殼渲染的 badge。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

需要了解權限介面以外的內容時，請閱讀以下頁面。這些頁面從瀏覽器介面進一步介紹主機策略與命令外殼。

- [dsh-permission-presets](../../interaction/permission-presets/README.zh.md)——這些介面寫入的主機側權限預設策略。
- [ui-commands](../ui-commands/README.zh.md)——`/permission` 裝飾註冊進的 popupSelect 外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——把這份共享目錄與 Session 目前值合併的 composer seat。
- [用戶端包對映](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響。它的兩個介面寫入權限事實：設定行使未來工作階段帶著全量值旋鈕事件啟動，而 `/permission` 選擇器追加選中的目前工作階段預設。沙箱與審批消費方各自解析自己的旋鈕事件；選擇 `auto` 還會啟用主機 Auto integration 的獨立逐呼叫 reviewer。

#### KV Cache 影響

無直接失效；請求字首的變化由旋鈕消費方自行承擔。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了目前權限介面。它們是目前包約束，不是通用策略對比或任務積壓。

- **設定行僅限 Web**——非 Web 用戶端仍可經 `/permission` 切換目前工作階段，但不會獲得這項瀏覽器貢獻。
- **Auto review 僅限目前工作階段**——General Settings 行有意省略它，且只有透過可見選擇器選擇時才顯示實驗確認；顯式鍵入 `/permission auto` 已經構成明確同意。
- **預設描述來自主機**——在地化的內建標籤旁邊可能顯示另一種語言編寫的描述。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。命令與 slot 貢獻的生命週期由 HMR（熱模組替換）安全性測試驗證；瀏覽器側設定控制器不持有主機事件或跨外掛可變狀態。
