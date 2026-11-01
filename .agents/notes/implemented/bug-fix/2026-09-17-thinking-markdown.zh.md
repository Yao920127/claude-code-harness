# Agent Note: Thinking 的緊湊 Markdown

Status: implemented

[English](2026-09-17-thinking-markdown.md) | 中文

## 問題

Chat Thinking 包含模型編寫的 Markdown，但純文字渲染直接顯示標題、強調標記和程式碼圍欄。共享回答排版會讓標題比次級推理文字更大、更醒目。Trajectory 對同一推理內容使用了回答排版。

## 決策

[MarkdownText](../../../../packages/client/ui-primitives/src/markdown/MarkdownText.tsx) 擁有緊湊展示變體，供 Chat Thinking 和 Trajectory 思考詳情使用。內容沿用次級字號、行高和 tertiary 顏色。各級標題保留語義元素，但統一使用 600 字重和相同字號；段落、列表、引用和程式碼採用緊湊間距。連結保留預設點狀下劃線與 tertiary 顏色，作為[共享連結樣式](../../../../docs/web-styling.zh.md)的次級內容例外；程式碼保留等寬字型和底色。

表格和公式繼續透過既有解析器啟用。其容器限制橫向溢位，公式文字繼承次級字號。行內公式保留 KaTeX 原生基線，由外層文字塊承擔溢位處理，短公式不會產生捲軸。緊湊程式碼欄保持正常文件流，讓 [Thinking 摺疊標題](../../../../packages/client/ui-chat/src/client/chat/ReasoningRow.module.css) 位於滾動內容上方，無需第二條 sticky 欄。

Chat 將執行狀態傳給既有增量 Markdown 渲染器。摺疊摘要仍是獨立的單行文字投影。解析器、凍結塊快取、儲存的推理內容和 Session 格式均保持不變。Trajectory 將 Thinking 固定在檢查器的 13px/20px 層級，與 Chat 的內容字號設定無關。其回答輸出保留既有排版及其 [Thinking 摺疊行為](../feature/2026-09-09-ptc-trajectory-code-inspection.zh.md)。

## 曾考慮的替代方案

**直接使用回答排版。** 大標題和寬鬆塊間距讓推理比回答更醒目。

**由每個使用方單獨設定 Markdown 樣式。** Chat 和 Trajectory 將需要分別跟蹤相同的渲染元素；基元擁有這些元素及其緊湊展示。

**停用表格和公式。** 既有渲染器已支援二者。限制溢位和繼承字號可以保留有用內容，無需增加另一種解析模式。

## 後果

Thinking 支援結構化閱讀，同時保持次級強調。雖然視覺層級被統一，輔助技術仍可使用語義標題。共享變體同時用於兩個檢視；後續 Markdown 元素變更必須同時保留緊湊排版與預設回答排版。

Markdown 軟換行與回答正文一樣摺疊；硬換行和獨立段落需要相應 Markdown 語法。流式凍結以完整塊為單位，因此尚未結束的長段落仍處於可變尾部，並隨增長重新解析。
