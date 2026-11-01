# Agent Note: 尺寸無關的產品圖示線重

Status: implemented

[English](2026-09-16-size-neutral-product-icon-weights.md) | 中文

## 問題

共享產品圖示的匯出名稱包含一個歷史渲染尺寸，但每個元件已經接受 `size` prop。消費方還會透過本地 CSS 或獨立圖稿加粗部分圖示，視覺強調沒有具名的圖示庫選項，因而可能在不同功能間漂移。

## 決策

每個共享產品圖形都匯出尺寸無關的 `Regular` 和 `Medium` 元件。`Regular` 渲染提供的 1px 圖稿，`Medium` 使用相同路徑並繼承 1.3px 描邊；填充區域保持不變。`size` prop 控制渲染尺寸；僅當圖稿沒有 16px 來源時，原數字字尾才作為預設尺寸保留。

`LinkIconRegular` 與 `LinkIconMedium`、`ReferenceIconRegular` 與 `ReferenceIconMedium`，以及三組 `PermissionIcon*Regular`/`PermissionIcon*Medium` 遵循同一規則。儲存庫內消費方使用具名線重，不再使用帶數字的匯出名。

Medium 線重只用於明確強調的情境：新建工作階段控制元件、設定入口與導航圖示、外觀選項、輸入框加號按鈕，以及可點選產物連結的圖示。其他既有消費方使用 Regular。編輯器加號選單中的權限命令使用 `PermissionIconFullAccessRegular`，因為該行表示權限提升，而不是目前權限模式。

## 考慮過的替代方案

**在匯出名中保留畫素尺寸。** 否決，因為字尾重複了執行時 `size` prop，併為相同幾何建立了多個名稱。

**只匯出一個帶 `weight` prop 的元件。** 否決，因為呼叫點會把線重選擇隱藏在 prop 中；顯式元件名便於搜尋和審查視覺強調。

**在消費方 CSS 中覆蓋描邊寬度。** 否決，因為源 SVG 元素可能自帶描邊寬度，本地覆蓋會在圖示庫外重新產生不一致線重。

## 後果

圖示 API 在預穩定階段有意進行破壞性調整：每個消費方明確選擇 `Regular` 或 `Medium`；原 14px 呼叫點與 16px 匯出共享幾何時會顯式傳入尺寸。新增產品圖形從同一份幾何定義同時提供兩種線重。僅填充的圖稿也為 API 一致性匯出兩個名稱，即使線重不會改變其外觀。上述層級選擇繼續由對應渲染點顯式宣告，不會變成全域尺寸或透明度覆蓋。
