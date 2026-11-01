---
description: "按呼叫方解析並惰性載入 CommonJS 相容的 Host 依賴，使應用啟動時不初始化尚未使用的依賴。"
kind: "package-library"
---

# @deepseek-ai/dsh-lazy-require

[English](README.md) | 中文

## 概述

`dsh-lazy-require` 會讓 CommonJS 相容的 Host 依賴保持未載入狀態，直到首次實際操作。解析仍以消費方 package 為基準，同一程序 realm 會複用一次成功載入的模組值。

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

傳入依賴的字面量 specifier 與呼叫方的 `import.meta.url`：

```ts
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require'

interface NativeModule { open(): void }
const requireNative = createLazyRequire<NativeModule>('native-package', import.meta.url)
```

呼叫 `requireNative()` 時才載入依賴，並只載入一次。失敗的載入不會被快取。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本工具使用傳入的呼叫方 URL 建立 Node `require`，並且只快取成功返回的值。顯式呼叫方 URL 會在釋出後保留 package 區域性的依賴解析。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 按呼叫方解析的 loader 與成功結果快取 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包地圖](../README.zh.md)——相鄰的共享原語。
- [NPM 釋出序列](../../../.agents/notes/implemented/process/2026-08-10-npm-release-sequences.zh.md)——釋出依賴分類與首次使用載入策略。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本 Host 工具不註冊任何模型可見行為。

#### KV Cache 影響

無。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅限相容 CommonJS 的依賴**——僅 ESM package 需要由呼叫方擁有非同步 factory。
- **WebWorker 打包需要顯式請求**——靜態 packer 無法發現僅在 `createLazyRequire()` 呼叫中命名的依賴。Preview image 使用的 package 必須透過受支援的字面量請求保持該依賴可達，直到 packer 能夠識別此 helper。

本包不釋出執行時 invariant companion，因為 loader 不持有可獨立觀測的可變關係。

<a id="dev-note"></a>
### 開發備註

無。
