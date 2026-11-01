---
description: "面向組合或除錯 turnOutline 投影單元的用戶端與維護者的全量輪次大綱說明，支撐整工作階段輪次導航。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-turn-outline

[English](README.md) | 中文

## 概述

本包為歷史記錄用戶端提供涵蓋完整工作階段的輪次大綱，其中包含每個已開始輪次的有界提示詞預覽與落定回覆預覽。用戶端可以導航尚未載入的輪次，並從載入所選輪次所需的準確事件序號向後分頁。它適用於提供工作階段投影的裝配；在其他裝配中，用戶端繼續使用僅覆蓋已載入視窗的導航。預覽排除注入的上下文與工具結果，並且回覆僅在所屬輪次落定後出現。

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

當用戶端需要在不持有完整事件日誌的情況下導航工作階段的每一輪時，在工作階段儲存與投影註冊表旁掛載此外掛。只有存在註冊表時單元才會註冊。

### 組合

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-turn-outline'
```

### 各欄位含義

| 欄位 | 含義 |
|---|---|
| `turn` | `turn/start` 載荷裡的主機分配輪次號 |
| `seq` | 該輪 `turn/start` 事件的 seq——視窗向後分頁越過此 seq 即載入整輪 |
| `prompt` | 該輪首條人類提示詞的預覽（文字塊以空格連線、空白摺疊、50 字元封頂且截斷時補省略號——即導航卡片一行）；合格提示詞落日誌前為 `''` |
| `response` | 該輪最後一條帶文字的助手訊息的預覽（同樣的歸一化、120 字元封頂——即卡片至多三行）；輪次帶著助手文字結束前為 `''` |

wire 值是按 `turn` 嚴格遞增的完整條目陣列（整值規則）：消費方整體替換，從不合並。提示詞只從帶人類 `user` 來源的 `user/message` 事件填充，注入的上下文與工具結果絕不進入導航；純圖片提示詞的輪次保持 `''`，消費方按輪次號標註。回覆在輪次流式期間緩衝為草稿、在 `turn/end` 落定；變更流的原始檢視身份門讓純草稿變化保持安靜，因此大綱每輪至多推送三次——開輪、提示詞、落定回覆。預覽預算與聊天導航欄已載入輪次的預覽一致，同一輪在事件載入前後顯示相同的文字。

### 失敗與恢復

沒有投影註冊表時單元是惰性的：`inject` 使 fiber 保持掛起，不註冊任何內容，因此其他裝配缺少 `turnOutline` 鍵。解除安裝外掛會移除該鍵，因為註冊是掛載 fiber 上的 effect。持久快取行在恢復時經受 schema 驗證——包括輪次嚴格遞增的順序——損壞的行被丟棄而不會喂壞摺疊。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋大綱背後的摺疊；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該單元是對已提交工作階段事件的純摺疊。錨定每個條目的是 `turn/start` 而非提示詞 `user/message`，因為它的 seq 就是跳轉的載入目標：agent loop（智慧代理迴圈）先記 `turn/start` 再記該輪的提示詞與步驟，視窗向後分頁越過該 seq 即包含整輪。提示詞由首條人類 `user/message` 填充，且僅當最新條目仍為空時——同一輪內後續的人類訊息（steering（中途引導））保留首個預覽。回覆無法同樣填充（`turn/end` 不帶文字），所以每條帶文字的 `assistant/message` 覆寫狀態裡的草稿，`turn/end` 提交倖存者——最新的文字，與已載入導航欄 `findLast` 的語義一致。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`inject`、在掛載 fiber 上註冊單元 |
| [`src/projection.ts`](src/projection.ts) | 摺疊：條目追加、預覽填充、wire 檢視 |
| [`src/types.ts`](src/types.ts) | `turnOutline` 投影鍵宣告與條目型別的唯一歸屬 |
| — | 不釋出執行時不變式伴生入口：本包僅擁有一個純投影摺疊，`session-projection` 會對其對外值執行 schema 驗證；重新摺疊同一日誌只會複製實作，無法比較獨立維護的觀測，而輪次邊界順序由 session 與 agent-loop 負責。 |

### 摺疊規則

- 不相關事件返回同一狀態引用，純草稿變化保持 `turns` 陣列身份不變；註冊表的兩道 `Object.is` 門由此把變更流壓到每輪至多三次推送。
- 未推進輪次號的 `turn/start` 被跳過，保持大綱有序；重試邊界的預覽隨後落在既有條目上。
- wire 檢視投影 `state.turns`；持久快取的狀態 schema 在 wire schema 外再包一個草稿欄位。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當單元約定不夠用時閱讀以下頁面。它們從驅動單元的註冊表逐步進入相鄰的工作階段包。

- [工作階段投影子系統](../../../docs/subsystems/session-projection.zh.md)——驅動單元並提供快照與變更流值的註冊表。
- [工作階段投影註冊表包](../session-projection/README.zh.md)——單元註冊所依據的註冊表約定。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 turnOutline 單元把已寫入日誌的輪次邊界摺疊成面向用戶端的讀模型，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包從不組裝或傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明大綱描述什麼、單元何時缺失。它們是目前包約束。

- **wire 值隨工作階段增長**——每次推送攜帶完整大綱（整值規則），CJK 字元佔滿預算時每輪上限約 600 位元組、通常遠小於此；把預覽拆成按需讀取推遲到數千輪量級的工作階段真正需要時。
- **回覆只預覽已落定的輪次**——它在 `turn/end` 提交，進行中的輪次（或從未記下結束邊界的輪次）在邊界落實前只有提示詞預覽。
- **沒有合格文字的輪次保持 `''`**——純圖片、純命令的輪次可導航但按輪次號標註，步驟全程不產文字的輪次沒有回覆預覽。
- **僅在組合了投影註冊表時掛載**——其他裝配不提供 `turnOutline` 鍵，其消費方退回到僅按已載入視窗導航。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
