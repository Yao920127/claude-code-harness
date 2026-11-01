---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-16-session-format-v4

[English](2026-09-16-session-format-v4.md) | 中文

## 概述

將 已定稿 V4 寫入方宣告的 SessionHeader.version 從 3 推進到 4，記錄一等 tool 角色結果與生產者擁有的 source，並向 turn/end.reason 新增 forked 變體。 新增 developer 角色的 Session 變更，工具新增僅記錄名稱並繫結歷史請求頭，另含工具移除和延遲載入模式標記。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-16-session-format-v4
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-14-image-offload"
    after: "1506a9b8224986c83015ae99d2cb5ede705538c58c063d6a48ef6d761a31ba6c"
    decision: version-bump
  - root: "event:assistant/attempt"
    previous: "2026-09-14-image-offload"
    after: "15d5dfdd822aa35e115afd74a8982825a493880457774e6850bc1520b50875e4"
    decision: version-bump
  - root: "event:assistant/message"
    previous: "2026-09-14-image-offload"
    after: "1033093edd0db80ff410e00830b523405e00bb0c7684948e531ff65095799625"
    decision: version-bump
  - root: "event:compaction/summary"
    previous: "2026-09-14-image-offload"
    after: "e2f9a41e0989f54ed8cee80f8db2bcf9d60a5c810dc9d45b83fa050b9dce7602"
    decision: version-bump
  - root: "event:developer/message"
    previous: null
    after: "eef4ef54dc7a133d47448a4ee822e45a351314923ef5f66db34c8b24e4b32d80"
    decision: version-bump
  - root: "event:request/header"
    previous: "2026-09-11-initial"
    after: "4208123b50df5006b181481ab45fcf1cde807b88d3fd4d340090bc2e202fac41"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-14-image-offload"
    after: "fa8f7d3ebf08a76c7f7a8b0781873c4d819b964da5dbb52cd3cdfa5da34f452d"
    decision: version-bump
  - root: "event:system/message"
    previous: "2026-09-14-image-offload"
    after: "69081694be231d56fd9580ba14645fd5e35373202605d5c5c841a9435b5fa3b1"
    decision: version-bump
  - root: "event:team/message/queued"
    previous: "2026-09-14-image-offload"
    after: "21fb6a90d5068f6a0003b7ab316ed2f56342477146a65c00db0f13c4d8df667d"
    decision: version-bump
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-14-image-offload"
    after: "100f6dca1468538239522cde3533e5bd721d0f1a7b50bea8b0eb533ea6c96163"
    decision: version-bump
  - root: "event:tool/result"
    previous: "2026-09-14-image-offload"
    after: "7c9f44e90a0058f4cc532ae20dad0c10afa6eba22e70a6c79fc79490bad64397"
    decision: version-bump
  - root: "event:turn/end"
    previous: "2026-09-14-image-offload"
    after: "0f8512903d94f57a4748fa1a2092e64342856796684e6b8343db685b192745ce"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-14-image-offload"
    after: "3f72db3d87a0c5c43e68be467b4cca728eaf5adc1d5d2b6975ff42bfbd961761"
    decision: version-bump
```

<a id="compatibility"></a>
## 相容性

工具角色宣告會改變十個事件根，因為 inbox 條目、訊息事件、compaction 摘要、標題請求、團隊訊息和 PTC dispatch 嵌入了共享的 `Message` 或 `ContentBlock` 宣告。從聯合中移除 `tool-result` 並按角色細化訊息，會改變這些可達 schema，並非新增十套獨立事件協定。`turn/end` 的變更單獨記錄 forked reason；`SessionHeader` 記錄版本遞增。

[原生 V4 驗證決策](../../.agents/notes/implemented/architecture/2026-09-17-native-v4-read-validation.zh.md) 負責說明這些目前欄位所需的讀取接納規則。

V3-to-V4 遷移將已釋出的 user 角色工具結果提升為 tool 角色訊息，包含必需的 toolCallId 和可選的 isError。工具結果包裝不再屬於內容塊聯合。遷移保留每個已接納源事件和繼承切分點，並根據同一持久化根目錄中保留的直屬子 Session 日誌追加缺失的父級 subagent/catalog 記錄。歷史正文恢復要求顯式提供子日誌證據集合；沒有可供補全的子日誌時也須傳入空集合。子日誌的 descriptor 缺失、多條或版本未知時，跳過該子項的補全；身份、時間戳或模式衝突會拒絕遷移且不釋出後繼。已有 catalog 事實保持不變。歷史讀取開啟在記憶體中準備結果。寫入開啟在重新驗證子項成員與修訂後，將目前後繼釋出到未修改的前代檔案旁。Delivery generation 驗證防止歷史確認成為有效的 V4 水位。V3 讀取方拒絕更新的 generation。已定稿遷移向 turn/end.reason 新增 forked。精確切點的 fork 在繼承標記之後追加子工作階段自有的錯誤結果和結束事件。V4 接納經過驗證、使用確定性分支 ID 和文案的未啟動 fork 結果；已釋出的 V0–V3 驗證器和已記錄的前驅代際保持不變。

`request/header` schema 還將退役的 `system` 鍵記錄為禁止欄位。這項宣告記錄已有的原生讀取拒絕規則，不改變儲存資料或提示詞重建；以後允許該欄位攜帶值時，必須提升格式版本，而不能歸類為普通可選欄位新增。

生產者擁有的 source 透過 [V3→V4 遷移](../../packages/session/session-format-v3-to-v4/README.zh.md#v3-to-v4-specification)替代已釋出的 plugin wrapper。凍結的重新命名錶和衝突規則保留 source 欄位與事件座標；未知生產者歸屬保留每個自有 JSON 屬性。原生讀取和寫入開啟在公開 Session 之前驗證 source 欄位。已有 V4 檔案不會重新執行遷入邊。

核心擁有的 user source 屬性記錄歸屬保留策略；tmux-context 將位置歸屬標記為符合條件，同時保留生產者內部的去重。Auto Review 和壓縮摘要器使用僅供請求使用的 user 輸入，移除其活動 source 註冊，同時保留歷史遷移支援。這些輸入不能寫為持久化 Session 訊息。目錄 formatVersion 2 儲存策略中繼資料，不改變 Session 版本，也不重寫凍結的 schema 記錄。System、model 和 tool source 保持嚴格的語義規則。

Developer 事件保留原始角色，並要求處於開啟的 step。每個新增塊儲存 toolName；developer/message.headerSeq 指向更早且已知的 request/header，其中必須恰好包含一個完整同名 ToolSchema。同一事件的所有新增共用該歷史請求頭版本，僅移除或其他 developer 訊息省略 headerSeq。原生與 Session 接納拒絕缺失、前向、非請求頭、未知請求頭、歧義、不完整定義及已退役內嵌定義形式，不解釋未知且可忽略的記錄，也不丟棄無關 JSON 中繼資料。同名替換、重新啟動、fork、surface 替換和壓縮保留歷史模式身份，不查詢最新請求頭或註冊表。通用 sourceEventSeqs 保持獨立。Developer source 使用與 user source 相同的已記錄歸屬保留策略。可選的 deferLoading 標記獨立於新增歷史。已提供的 profile 不發出 developer 記錄；提供者序列化、自動發出及 UI 支援仍未啟用。

PTC 生產者寫入 `source.kind: 'ptc-mode'`。V3→V4 遷入邊保留 `tools-code-mode` 和 `tools-ptc` 作為歷史 plugin 查詢鍵，並將二者對映到該目前 kind。source 策略保留 `ptc-mode`，不允許將其宣告為僅用於歸屬。

<a id="verification"></a>
## 驗證

精確切點 fork 整合後，聚焦的 Session、agent-loop、Session Controller、V4、chat-view 和 compaction 測試共 63 個檔案、1,523 個測試透過。V4 fork 測試確認編碼、解碼和恢復保留原始 ID 與文字，拒絕格式錯誤的結果，並驗證巢狀繼承切點。工具角色遷移測試和 SDK 快照重新整理也在原始變更中透過；建置後的 Python runtime sdk-snapshot 情境透過，定向 pi-ai 與 auto-review 覆蓋率檢查透過 351 個測試，三個受影響模組覆蓋率均為 100%。

生成的請求頭保留欄位迴歸測試以及已有的退役語法和 Session surface 測試共透過三個檔案中的 65 項測試。生成欄位保留可選的 `never`；允許可選字串會產生必須提升版本的診斷，而原生讀取方仍拒絕該退役鍵。

Producer-source 與 request-input 檢查共透過 12 個檔案中的 447 項測試，覆蓋 provider 等價性、僅供請求使用的輸入的型別拒絕、user 歸屬保留、source 遷移及原生 source 准入。與 tool-role 父層的生成目錄相比，有四個 root 發生變化，447 個型別指紋保持不變。

聚焦的 Session、V4 和 request-input 測試共 38 個檔案、884 項透過，完整 V3-to-V4 包與 Session surface 的語句、分支、函式及行覆蓋率均為 100%。覆蓋歷史同名模式繫結、複合新增/移除、畸形引用與定義、未知請求頭拒絕、未知記錄不透明性、中繼資料保留、fork、替換、壓縮引用，以及不重寫 generation 的原生 plain/zstd 讀寫接納。

<a id="dev-note"></a>
## 開發備註

無。
