---
description: "面向 web GUI 主機的工作區目錄選擇 seam：原生與瀏覽後端所實作的服務約定、能力詞彙與錯誤碼。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker

[English](README.md) | 中文

## 概述

web GUI 讓操作者透過 OS 選擇器或應用內瀏覽器選擇工作區目錄。操作者能接觸主機螢幕時使用原生選項；遠端用戶端或需要在應用內列舉和建立目錄時使用瀏覽選項。消費方會獲得互動型別，並能呈現匹配的工作流。目錄選擇僅限 GUI 主機，不會影響 agent loop（智慧代理迴圈）。瀏覽工作流一次只公開一棵目錄樹；不支援多根目錄。

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

掛載且只掛載一個目錄選擇後端，然後讓工作區流程驅動它：seam 本身只是服務約定，因此沒有後端的組合就無從選擇目錄。

### 選擇後端

當操作者坐在主機螢幕前時，[原生後端](../directory-picker-native/README.zh.md)是正確選擇：`directoryPicker/pick` 開啟一個 OS 選擇器，返回所選絕對路徑，取消時返回 `null`。[瀏覽後端](../directory-picker-browse/README.zh.md)處處可用——它在瀏覽器中列舉一個目錄層級並建立子目錄，因此無法觸達 OS 對話方塊的遠端用戶端依然能選擇工作區。當主機處境在兩次啟動之間變化時，組合[自適應選擇器](../directory-picker-auto/README.zh.md)，它在啟動時判定一次處境並掛載匹配的後端。

### 能力約定

`capability()` 返回一個可辨識聯合型別，說明操作者如何選擇目錄：OS 選擇器為 `{ kind: 'native', pick(signal) }`，應用內瀏覽器為 `{ kind: 'browse', list(path?), createDirectory(path, name) }`。消費方按 `kind` 分支；遇到未知能力型別時，介面會隱藏選擇入口，而不是失敗。瀏覽失敗丟擲帶型別的 `DirectoryPickerError`，其錯誤碼集合是封閉的——`directory-unreadable`、`directory-exists` 或 `directory-create-failed`——每個都攜帶出錯物件的路徑，目錄選擇 Remote 控制器將其 1:1 對映為協定錯誤碼。

### 行攜帶什麼

`DirectoryEntry` 行暴露絕對 `path` 與主機判定的 `hidden` 標誌（POSIX 上為點字首約定），展示策略留在用戶端；用戶端絕不自行拼接路徑段。`DirectoryListing.crumbs` 是從檔案系統根到被列舉目錄的祖先鏈——每個 crumb 都是跳轉目標，根 crumb 以完整路徑標註。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

該 seam 建立在一個分離之上：後端提供的互動形態是約定，而不是實作細節。`DirectoryPicker` 是隻有一個 `capability()` 方法的抽象 Cordis 服務；後端子類以 `ctx.directoryPicker` 註冊，載入第二個實作會丟擲標準的重複服務錯誤。能力物件在服務生命週期內必須保持穩定，因為消費方可能跨呼叫持有它。

### 可合併擴充功能的詞彙

`DirectoryPickerCapabilities` 是以能力型別為鍵的可合併擴充功能對映，`DirectoryPickerCapability` 從它派生聯合型別。新後端透過宣告合併將其形態加入此對映（條目的 `kind` 字面量必須等於其鍵），而無需改動本包。每個後端包還隨附一個 browser 入口，在 ui-workspace 的 directory-flow slot 中註冊匹配的互動，因此一行組合設定同時選擇主機能力與用戶端流程。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：抽象 `DirectoryPicker`、能力詞彙、型別化錯誤、Context 合併 |

### 失敗詞彙

`DirectoryPickerError` 攜帶封閉的 `DirectoryPickerErrorCode` 加出錯物件的絕對路徑，消費方無需字串匹配即可對映業務錯誤碼。設計依據、與 `ctx.fs` 的切分與策略裁決見 seam Agent Note。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下內容：先看決策記錄，再看組合它的兩個後端與自適應選擇器。

- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——設計依據、`ctx.fs` 切分與策略裁決。
- [原生後端](../directory-picker-native/README.zh.md)——OS 選擇器互動及其平臺工具。
- [瀏覽後端](../directory-picker-browse/README.zh.md)——面向遠端用戶端的應用內列舉與建立互動。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——兩個後端之間的啟動時判定。
- [工作區子系統](../../../docs/subsystems/workspace.zh.md)——接收所選目錄的工作區記錄。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 主機的目錄選擇 seam 不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 seam 約定何時把決定留給未來的消費方。它們是目前包約束，不是任務積壓。

- **不支援多根目錄**——瀏覽約定每次列舉只公開一條祖先鏈；按部署限定瀏覽根（以及在磁碟機代號根的上一級列舉 Windows 各磁碟機代號根目錄）等到出現需要它的消費方再做，見 DirectoryPicker Agent Note。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這個無狀態 Service Definition 只定義 capability vocabulary，觀察由 backend 與 Remote controller 負責。
