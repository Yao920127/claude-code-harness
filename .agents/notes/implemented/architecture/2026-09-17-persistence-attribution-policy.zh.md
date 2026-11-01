# Agent Note：已記錄的 user-source 歸屬相容性

Status: implemented

[English](2026-09-17-persistence-attribution-policy.md) | 中文

## 問題

生產者擁有的訊息 source 會傳遞性地出現在多個持久化事件型別中。即使已有讀取方無需該生產者也能保留欄位，新增歸屬 kind 仍會改變這些聯合型別的指紋。僅供請求使用的提示不需要持久身份，但將其建構成 Session 訊息會為聯合型別增加不必要的 source 分支。

## 決策

核心擁有的 user-message source 屬性繫結[已記錄的相容性策略](../process/2026-09-17-persistence-schema-review.zh.md)。生產者另行將其 wire 字面量 kind 宣告為僅用於歸屬。雙方儲存的 schema 必須具有相容的策略狀態，符合條件的新增才能獲得同版本分類。已有分支繼續接受結構比較；缺失策略、未標記的新增、刪除以及已有語義分組的變更繼續採用嚴格分類。固定的 system、model 和 tool source 欄位不參與。

tmux-context 生產者將位置歸屬標記為符合條件。其自身投影使用 kind 避免重複注入，而未安裝該生產者的讀取方保留已記錄內容及 source 的每個 JSON 屬性。該標記承諾讀取方不依賴生產者，並不禁止生產者內部的去重。

`RequestMessage` 接受持久化 `Message`，或僅含 content、沒有 `id` 和 `source` 的 user 專用 `RequestUserInput`。LLM 服務和 provider 序列化器接受兩者；Session 寫入、Agent 交付及持久化標題請求輸入要求持久化訊息。Auto Review 的外層提示和壓縮摘要器的最終指令使用僅供請求使用的輸入，並保留內容與凍結行為。呼叫方不會獲得隱式持久化轉換。Assistant 回放中繼資料和工具結果關聯保持原有要求。

已定稿的 V4 確認記錄儲存 user-source 策略，並移除兩個僅供請求使用的 source 註冊。原有前驅和 header 遷移保持不變。這不構成刪除已接受分支的通案例外：[producer-source 遷移](2026-09-09-producer-owned-message-sources.zh.md)獨立於活動 source 宣告保留生產者對映與擴充功能名稱空間，包括歷史的僅供請求使用的 kind。目錄生成和比較仍由[持久化參考](../../../../docs/persistence-changes/README.zh.md#compatibility-rules)負責。

## 考慮過的替代方案

**將所有 source 新增視為破壞性變更。** 這會要求為讀取方已能安全保留的歸屬資訊提升 Session 格式版本，無法區分它與語義變更。

**放寬所有可辨識聯合或從目前名稱推斷相容性。** 通案例外會接納語義分支。目前宣告不能確定舊快照作出的承諾，結構相等也不能確定 source 屬性的歸屬。

**為每個請求使用持久化訊息。** 獨立提示會保留人為製造的身份和不必要的 source 宣告。顯式的 user 專用分支允許移除它們，同時讓帶型別的 Session 介面繼續要求持久身份。

**將歷史 context 形式收窄到目前寫入方範例。** 寫入方範例不能確定已釋出讀取方接納的全部值。這些面向讀取的分支繼續保留。

## 影響

符合條件的新增仍會改變相關事件指紋，並要求確認記錄。Review 者必須驗證生產者的歸屬承諾；型別分析不能確定回放語義，也不能發現不透明值中隱藏的行為。

Codec 到 Session 的測試在未安裝生產者時保留未知 user 歸屬和額外 JSON 欄位。Provider 等價測試比較僅供請求使用的輸入與持久化輸入，型別斷言則拒絕在持久化寫入處使用僅供請求使用的輸入。已記錄的 Session 世代及 V3→V4 轉換不依賴目錄策略和渲染。
