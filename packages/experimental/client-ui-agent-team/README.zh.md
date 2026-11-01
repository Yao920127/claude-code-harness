---
description: "使用並排查實驗性 Web Agent Teams roster、共享任務板與 teammate 導航面板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-team

[English](README.md) | 中文

## 概述

本包向 Web 工作階段頁頭新增 Agent Teams action，讓使用者檢查目前 roster、檢視共享任務板並導航到 teammate 工作階段。它從共享 Session store 讀取 Lead Session 的 `agentTeam` 投影，Host 投影 frame 使其保持最新而無需重新整理控制元件，並讓普通 child history 導航繼續使用穩定的 addressed-subagent 路徑。透過公開發布的實驗性 Agent Teams bundle 選擇本包。這個瀏覽器 projection 不擴充功能穩定 API Proxy、不儲存 Team 狀態，也不註冊面向模型的輸入。

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

透過 [`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.zh.md) 啟用本包。這個組合包同時提供團隊服務、工具與 Web 介面。Web Client loader 掛載 `/client` export；root Host export 不執行行為，本包也沒有使用者設定欄位。

### 檢查並導航 roster

面板從共享 Session store 展示 Lead Session 的 roster 與任務板。面板保持開啟時，任務和成員更新會直接出現。開啟面板不發起投影請求。工作階段或 Session 列表正在載入時，面板顯示載入提示；載入結束後仍無 Team 值時，顯示不可用提示。

Roster 行展示持久名稱與階段。provisioning 和 running 成員使用共享 ongoing loading，inactive 成員使用人物圖示，failed 成員使用 error 紅點。即時 Session 狀態提供執行活動；共享 `modelSelection` 投影在可用時提供模型。目前工作階段帶有“目前工作階段”標籤且不可選擇。在 teammate 工作階段中選擇 Lead 會直接開啟 Lead Session。選擇 active teammate 會開啟其普通 continuable 子工作階段地址。Host 在開啟歷史時驗證 parent、child 與 mode；後續人類提示詞使用同一 addressed-subagent 工作階段。

### 檢視任務板

可開始的 pending 任務使用 idle 灰點，被依賴阻塞的 pending 任務使用 warning 橙點，in-progress 任務使用 ongoing loading，completed 任務使用 done 綠點。

只讀任務板展示任務標識、負責人、依賴、就緒狀態、提示性寫入範圍與重疊警告。超過兩行的描述提供展開按鈕。分割槽標題顯示成員與任務數量；空任務板顯示簡短描述，只有一名成員且無任務時採用單列面板。Team agent 透過工具建立和更新任務；面板不提供任務修改控制元件。當投影報告某條持久 Team 記錄被拒絕時，面板在最後有效的 roster 與任務上方顯示該失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

Client export 透過 Cordis effect 註冊 locale dictionary 與一個 conversation-header slot；它不掛載任何 Remote namespace。Dispose plugin fiber 會移除這兩項 registration。

面板渲染在工作階段容器外，並保持在視口範圍內。成員卡片在靜止、選中和懸停狀態下均使用共享 elevation 描邊繪製輪廓。懸停觸發按鈕 150ms 後開啟面板；指標離開觸發按鈕和麵板後，經過 120ms 寬限關閉。點選觸發按鈕會固定面板並將焦點移入其中。點選外部或按 Escape 可關閉面板；僅當焦點原本位於面板內時，Escape 才將焦點返回觸發按鈕。頁頭較窄時觸發按鈕摺疊為圖示，只回應點選開啟。元件從 `useSessions`、`useSessionStatus` 與 `useSession` 座位派生每一行：Lead 身份來自目前 Session 的 subagent address，Team 檢視來自 `projectionsBySession[lead].values.agentTeam`，成員活動來自 Session 狀態並以列表摘要為後備，model 來自 `projectionsBySession[member].values.modelSelection.next`。每個 roster 行只選擇自己的執行狀態。唯一的注入回呼透過目前與目標 Session 的 id 開啟 roster Session。切換工作階段會關閉面板並清除導航失敗。

| 檔案 | 職責 |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | locale、導航與 slot registration |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | 由投影派生的 roster 與任務板及面板互動狀態 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文 panel 文案 |
| [`src/index.ts`](src/index.ts) | 不執行行為的 Host entry |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Agent Teams bundle](../agent-team-profile/README.zh.md)——掛載本 Client plugin 的公開 opt-in bundle。
- [Agent Teams service](../agent-team/README.zh.md)——權威 roster、task 與投影行為。
- [工作階段 UI](../../client/ui-conversation/README.zh.md)——穩定 header slot 與 addressed-subagent 導航表層。
- [實驗性包](../README.zh.md)——孵化狀態與釋出規則。

-----

<a id="model-experience"></a>
## 模型體驗

無直接影響，因為該瀏覽器 projection 不註冊面向模型的輸入。

#### KV Cache 影響

無直接影響；Team 工具與普通工作階段提交負責後續任何模型可見用途。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **沒有 mailbox timeline**——投影檢視只承載 roster 與任務；不顯示 peer 訊息。
- **晚啟用外掛** — 在已經開啟的工作階段中啟用 Agent Teams 後，需要重新整理頁面才能接收其 Team 投影。
- **模型可用性** — 僅當共享 store 包含該成員的持久選擇或請求時才顯示模型。冷快取中缺少的值會保持缺失，直到正常 Session 載入或即時更新提供它們。
- **普通 child continuation**——導航後傳送的人類訊息使用穩定 addressed-subagent 提示詞路徑，而不是 Team peer mailbox。
- **沒有 lifecycle 或 workspace control**——panel 不能 spawn、rename、delete 或 interrupt teammate，write scope 仍只是提示性 metadata。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。Host 投影是權威來源，本包只持有一個可釋放的 slot 註冊。
