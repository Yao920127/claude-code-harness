# Agent Note: 統一 JSON 值 schema DSL

Status: implemented

[English](2026-07-20-unified-json-value-schema-dsl.md) | 中文

## 問題

工具參數使用一套精簡的作者側 schema DSL，subagent／工作流的結構化輸出則使用另一套原始 JSON Schema 子集和驗證器。兩套詞彙在根型別、標量約束和驗證方式上並不一致；如果繼續沿用這種劃分，型別化的規範工具輸出約定要麼還需重複實作兩條路徑，要麼只能接受部分投影無法強制執行的 schema。

## 決策

`dsh-tools` 以兩種表示形式統一管理一套 JSON 值 schema 詞彙。`ValueSchemaSpec` 是可描述任意 JSON 根型別的作者側形式；`ParameterSchemaSpec` 是其隱式物件屬性對映形式，每個屬性可標記 `required: true`。`JsonSchemaNode` 是原始協定形式。兩種形式都支援字串、有限數值、整數、布林值、null、陣列、物件、型別正確的標量 `enum`／`const`，以及要求恰好匹配一個分支的 `oneOf`；`{ type: 'json' }` 僅是作者側語法糖，會編譯為僅含註解、不施加約束的原始節點。

顯式的作者側物件必須宣告 `additionalProperties: true | false`。隱式參數根物件和原始 JSON Schema 保留標準的預設開放語義。schema 記錄只能包含自有且可列舉的字串鍵，schema 陣列必須是稠密的內建陣列，系統只從自有屬性讀取受支援的關鍵字；因此，自定義原型、繼承的約束、symbol 和 JSON 不可見的附加內容都無法讓編譯、投影和驗證觀察到不同的宣告。內建的普通 Object 和 Array 容器跨 JavaScript 執行域後仍視為普通容器，而子類和偽造建構函式的原型仍視為非普通物件。

`InferValue<S>` 和 `InferArgs<P>` 根據同一份宣告推導 TypeScript 值，`valueSchemaSpecToJsonSchema()` 和 `parameterSchemaSpecToJsonSchema()` 也將這些宣告編譯為 JSON Schema。精確型別推導以 16 層容器為界，超過後使用 `JsonValue`，從而避免 TypeScript 的型別實例化棧限製作者能宣告的巢狀深度。`assertSupportedJsonSchema()` 會拒絕不受支援或位置錯誤的關鍵字；`validateJsonSchemaValue()` 則以無損 `JsonValue` 邊界驗證受支援的子集，不允許 `undefined`、負零、非有限數、稀疏陣列、迴圈引用、非普通物件、函式、symbol 及其他需要強制轉換的值。作者側 schema 編譯、原始 schema 斷言、值驗證、schema 到 TypeScript 的渲染、註冊表脫離引用，以及動態 Cordis 的跨執行域規範化與克隆均使用顯式工作棧，因此執行時巢狀只受可用記憶體限制，不受 JavaScript 呼叫堆疊限制。

物件根限制屬於消費方規則，不屬於 schema 詞彙本身。subagent 和工作流中由呼叫方定義的結構化輸出透過 `assertObjectJsonSchema()` 和 `ObjectJsonSchema` 保持物件根限制；工具輸出可以使用任意根型別。動態 Cordis 註冊會把跨 JavaScript 執行域傳入的 schema 重建為主機擁有的 JSON 值，保留原始包裝層的預設開放語義，並要求直接使用 DSL 宣告的物件明確選擇開放方式，然後再呼叫同一編譯器。動態邊界會在規範化之前拒絕 JSON 不可見的記錄鍵和非普通 schema 陣列，因此不會靜默丟棄約束，也不會觸發自定義迭代邏輯。

## 備選方案

- **保留兩套獨立的參數與結構化輸出 schema 系統：**不予採納。每新增一種輸出結構，都必須分別修改型別推導、編譯、總和檢查碼程式碼生成，而這種重複並未形成有意義的職責邊界。
- **使用 Schemastery 處理工具參數：**不予採納。Schemastery 透過 Standard Schema 面向驗證與轉換，而不是生成 JSON Schema。採用它會增加一層介面卡，卻不能產出面向模型的協定 schema 或共享的輸出詞彙。
- **採用完整 JSON Schema 或 Ajv：**不予採納。harness 必須拒絕所有無法投影到生成 SDK 和驗證器中的結構；如果接受更大的語言子集，強制執行能力和模型指引就會與事實不符。
- **讓所有物件預設開放或預設封閉：**不予採納。這兩種選擇都會隱藏一項影響重大的作者決策。只有保持舊有形態的隱式參數根物件和外部原始 schema 才有意保留預設值。
- **把 `oneOf` 定義為首個匹配分支：**不予採納。這樣一來，分支順序會改變驗證語義，重疊分支也會掩蓋值的歧義。

## 影響

- 參數驗證、輸出驗證、schema 到 TypeScript 的程式碼生成、subagent／工作流門禁和動態註冊共用一套強制執行的詞彙。
- 輸出宣告可以推導物件、陣列、標量或 null 根型別；subagent／工作流的結構化輸出仍在其現有服務邊界保持物件根限制。
- 顯式的物件開放方式和型別正確的字面量約束會讓格式錯誤的宣告在編寫或註冊階段快速失敗，而不是拖到後續模型呼叫時才失敗。
- 有界型別推導會為常規宣告保留有用的精確型別，並將異常深的尾部結構退化為 `JsonValue`；執行時 schema 強制執行在任意深度仍保持精確。
- 原始工具仍可直接註冊範圍更廣的 JSON Schema，但統一程式碼生成會把不受支援的 schema 視為未知型別，不會假裝自己能夠強制執行。
- 每個屬性的 `required: true` 仍是工具作者約定；原有推導路徑暴露可選性缺陷後，型別級迴歸覆蓋會鎖定必填鍵不得為可選。
- 執行時測試和編譯期測試覆蓋所有根型別、恰好匹配一個分支時的重疊／無匹配行為、原始 schema 的預設開放語義、顯式開放方式、有損 JSON 值、型別推導、核心投影和動態投影中的深層巢狀、動態註冊中 JSON 不可見的鍵，以及非普通 schema 陣列。
