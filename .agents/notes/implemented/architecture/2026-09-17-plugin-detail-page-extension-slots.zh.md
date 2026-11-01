# Agent Note：外掛詳情頁作為擴充功能點

狀態：已實作

[English](2026-09-17-plugin-detail-page-extension-slots.md) | 中文

## 問題

外掛頁的詳情頁——組合包頁、行頁、官方外掛頁——只承載頁面自繪的內容和物件自己的設定（[外掛設定放在外掛頁](2026-09-16-plugin-configuration-on-the-plugins-page.zh.md)）。對不屬於自己的組合包有話要說的外掛——診斷外掛的健康檢查、市場外掛的更新標籤、文件外掛的 README 區塊——在那個組合包的頁面上無處安放，而透過 import 頁面來擴充功能它被用戶端包純淨性規則禁止。

## 決策

**頁面按區域而不是按物件宣告三個 list slot。** `plugins.detail.actions` 渲染在頁頭，位於頁面自己的開關和解除安裝之前；`plugins.detail.badge` 在標題旁，位於版本、Beta 和異常標籤之後；`plugins.detail.section` 在頁面自身內容之下——組合包頁在元件列表之後，行頁與官方外掛頁在設定之後。每個條目都以頁面的 `subject` 渲染：`{ kind: 'bundle', pkg }`、`{ kind: 'row', pkg, row }` 或 `{ kind: 'item', id }`。條目根據 subject 決定是否渲染，否則返回 null；頁面按 `order` 排列條目。

**subject 是投影，不是 store。** `PluginPackageRef` 與 `PluginRowRef` 攜帶包名、版本、是否已安裝、是否啟用以及行列表——貢獻者據以判斷的事實——不帶頁面自己的任何狀態，因此頁面的 store 保持私有，契約保持精簡。

**行頁仍然只為已設定的行存在。** list 條目無法預先說明它對哪些行有話要說，而一個空空如也的行頁沒有值得開啟的內容，所以設定控制元件保留原規則：有 `plugins.row.config` 條目點名這一行時才可開啟，對該行的貢獻渲染在那個頁面上。

## 考慮過的替代方案

**按物件和區域各開一個 slot（`plugins.bundle.section`、`plugins.row.section` 等）。** 否決：三個區域要九個 slot，而跨物件的貢獻要註冊三次。subject 判別式在三個 slot 裡承載同樣的資訊。

**把頁面的 `PackageView` 與 `PackageRow` 直接作為 subject。** 否決：這些型別攜帶 Host 的只讀原因、錯誤、條目 id 與 fiber 階段，這些是頁面自己的事；暴露它們會讓 store 內部成為公共契約。

**每一行都有頁面，讓行級貢獻總有落腳處。** 推遲：沒有設定的行，頁面除了模組名和狀態之外無可展示；等有貢獻需要時再放寬這條規則。

## 後果

- 一個貢獻就是一次 slot 註冊，只需 `import type` `ui-plugin-manager` 的宣告；頁面從不點名任何貢獻外掛。
- e2e 夾具組合包（`@fixture/live-client`）透過三個 slot 向它自己的組合包頁和行頁貢獻內容；它的瀏覽器半側與其餘註冊一起完成，也一起離開。
- slot 目錄與 slots 子系統層級樹在 `main` 下列出這三個 slot。

## 測試

`packages/client/ui-plugin-manager/tests/components.client.spec.tsx` 在組合包頁、行頁和官方外掛頁上渲染貢獻並核對各自的 subject，釘住投影；`browser-plugin.client.spec.tsx` 釘住宣告。`apps/web/tests/plugin-config.e2e.ts` 開啟夾具組合包，斷言組合包頁與行頁上的操作、標籤和區塊、官方外掛頁上沒有它們，並保留組合包頁的 golden。
