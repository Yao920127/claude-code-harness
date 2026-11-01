---
description: "面向使用者與外掛作者的 web GUI 在地化說明：zh/en 偏好、瀏覽器派生退回、型別化名稱空間字典與框架翻譯席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale

[English](README.md) | 中文

## 概述

使用 `dsh-client-locale` 可在 web GUI 中切換內建的英文和中文 locale，或 client 外掛新增的語言。使用者選擇會立即生效；loopback 頁面把選擇持久化到 `$DSH_HOME/cordis.patch.yml`，非 loopback 頁面則只為目前程序保留選擇。全新瀏覽器會使用瀏覽器請求的第一個受支援語言，直到允許讀取的已儲存偏好到達。外掛作者可新增型別化名稱空間字典，並透過公開 locale API 翻譯；經 slot 渲染的文案無需重新載入即可隨語言切換更新。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

只要 web GUI 需要語言切換或翻譯文案就使用它：已釋出的設定行覆蓋使用者側，外掛作者則註冊自己的字典。掛載無需任何設定——本包隨用戶端樹一起啟用。

### 選擇語言

開啟“設定 → 常規”並選擇一種已註冊語言。生效中的 locale 會立即應用：UI 文案切換、`<html lang>` 指向外部 id 或內建語言的文件標籤，選擇寫入持久設定分割槽。沒有顯式 Host 偏好的瀏覽器會按完整標籤、再按主語言子標籤選擇 `navigator` 請求的第一個已註冊語言，無法匹配時退回到英文。已儲存的外部 locale 會等待其定義註冊，不會在不可用時生效。

原生殼可以提供包含非同步 `read()` 和 `onChange(locale)` 回呼的 `__DSH_LOCALE__`。初始化在 Client 掛載前提供目前 Host 偏好和有序的系統語言列表。自動選擇保持臨時狀態；只有設定中的選擇會寫入 `locale.preference`。每次載入頁面都重新讀取，避免過載後沿用過期的 preload 偏好。普通瀏覽器繼續使用 navigator 檢測和原有的設定作用域策略。

### 註冊字典

用已合併進 `LocaleNamespaceMap` 的名稱空間呼叫 `ctx.locale.register(ns, { zh, en })`；編譯器會對照該名稱空間的型別化鍵並集檢查每個鍵，並要求兩個內建 locale 齊全。消費方透過 `ctx.locale.bind(ns)` 或框架注入的 `t` 席位翻譯。UI 已掛載後再註冊的字典無需重新掛載即可生效。

### 解析包文字

使用 `ctx.locale.resolveText(text)` 解析 [`LocalizedText`](../../util/package-manifest/README.zh.md)，例如已安裝外掛的標題與描述。字面字串原樣返回。翻譯對映使用小寫語言 id，必須提供 `en` 退回值，並沿目前語言宣告的退回鏈查詢。它們不查詢或註冊名稱空間字典。

### 註冊語言包

外部 client 外掛把語言定義和每個已翻譯名稱空間註冊為自身擁有的 effect；定義與字典可以按任意順序註冊：

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language',
  )
  ctx.effect(
    () => ctx.locale.register('common', 'ja', {
      cancel: 'キャンセル',
      close: '閉じる',
    }),
    'my-locale: common dictionary',
  )
}
```

外部 id 必須是非空的 ASCII BCP 47 風格標籤。它的 fallback 必須已經註冊，且整條鏈必須終止於 `en`；未知目標、重複 id 與迴圈會在註冊時失敗。查詢時先在請求名稱空間內遍歷生效語言的 fallback 鏈，再在 `common` 中遍歷該鏈，最後顯示鍵本身。解除安裝語言定義會將其從選擇器移除，並讓生效中的選擇回落到可用的瀏覽器語言或預設語言。

若某語言的文字是對另一語言的改寫，例如文字系統轉換，可傳入可選的 `derive` 函式。該語言從 fallback 鏈取得的文字——包括詞典條目與 `resolveText` 的對映值——會依次經過鏈上每個未命中該文字之語言的 `derive`，從最接近提供文字的語言開始；該語言自己的條目保持原樣。由於每次未命中都會呼叫 `derive`，它必須是純函式且同步執行，並且不會出現在已釋出的 locale 定義中。

### Host 半側做什麼

Host 透過 settings 服務為 loopback 頁面持久化偏好。Client 會刻意拒絕非 loopback 頁面使用該 settings scope，因此即使 Connection 認證所有 API 方法，它們的 locale 選擇仍只存在於程序內。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 locale 服務的建置方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個 `LocaleRuntime` 同時擁有偏好與字典註冊表，並且自身就是 slot 系統的 `LocaleFace`：`getSnapshot`／`subscribe` 透過 `ctx.slots.installLocale` 支撐框架注入的 `t` 席位。不可變快照攜帶生效中的 locale、可選擇的 locale 列表與單調 revision；字典註冊與 locale 切換都會推進 revision，但只有切換會發出 `locale/change` 事件。產品編寫的 Client UI 文字必須來自這些帶型別的字典，或來自已經在地化的 primitive prop；`verify-client-ui-i18n` 強制執行該原始碼歸屬（見[決策](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。

### 偏好解析

臨時 locale 來自瀏覽器（`navigator.languages` 先按完整標籤、再按主語言子標籤匹配，以英文作為退回），在允許使用的 Host-backed settings scope 送達其儲存偏好之前生效。Host 讀取在外掛啟用後執行，因此 settings scope 不可用或被拒絕都不會阻塞頁面，結果會即時替換臨時值。已儲存的外部 locale 會等待其定義註冊。`setLocale` 是唯一寫入入口；即使 id 已與生效中的 locale 匹配也會持久化，因為生效中的值可能是臨時的，必須能供共享同一 home 的其他瀏覽器繼續使用。

### 字典查詢

文件語言同步只在值變化時寫入 `<html lang>`；僅更新字典的 revision 不改動該屬性。

帶型別的物件形式要求兩個內建 locale 都有完整字典；逐 locale 形式允許語言包獨立註冊每個名稱空間。逐鍵查詢會先在請求名稱空間中沿生效語言宣告的 fallback 鏈查詢，再在 `common` 中重複該鏈，最後顯示鍵本身。繫結的翻譯函式按名稱空間保持穩定身份，因此可透過 inject 機制傳遞，且不會破壞 memoization。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | `LocaleRuntime`、字典註冊表、Language 行註冊、`locale/change` 事件 |
| [`src/index.ts`](src/index.ts) | node 半側：註冊 `locale` 設定名稱空間 |
| [`src/locale-settings.ts`](src/locale-settings.ts) | `locale.preference` 的持久 schema |
| [`src/locales/`](src/locales/) | 內建的 `zh`／`en` 字典 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當僅閱讀 locale 約定不足以解答問題時，請繼續閱讀以下頁面，瞭解它實作的 slot 介面、依託的設定機制，以及偏好背後的持久化決策。

- [用戶端 slot 系統](../ui-slots/README.zh.md)——本包實作的 slot 模型與 `LocaleFace` 席位。
- [Host 支撐偏好決策](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md)——偏好為何持久化在 Host 設定中而非瀏覽器裡。
- [設定組地圖](../../settings/README.zh.md)——儲存該偏好的設定服務。
- [用戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。locale 服務屬於瀏覽器側 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>


這些限制說明在地化在哪些地方不完整，或在註冊時被凍結。它們是目前包約束，不是待辦事項清單。

- **註冊表持有的文字只讀取一次翻譯**——在 slot 渲染路徑之外於註冊時捕捉的文案（例如 command 註冊表中的 `/model` 命令描述）在重新註冊前保持註冊時的語言；slot 渲染的文案隨切換即時更新。
- **語言包負責語言特有行為**——註冊表提供選擇、持久化、瀏覽器匹配、逐鍵退回和 `<html lang>`；它不增加複數規則或雙向佈局。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。locale catalog 與字典沒有可供交叉核對的獨立執行時來源；註冊釋放、偏好解析和 fallback 查詢由行為測試覆蓋。
