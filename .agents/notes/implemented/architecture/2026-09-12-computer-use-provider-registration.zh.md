# Agent Note: Computer-use provider registration

Status: implemented

[English](2026-09-12-computer-use-provider-registration.md) | 中文

## Problem

桌面提供者暴露不同的操作、觀測格式和平臺設施。DSH 需要防止在一個組合中意外啟用兩個提供者，同時讓各提供者的整合正常工作，而不承諾通用操作 API。

## Decision

DSH 能力稱為 **computer use（計算機操作）**。[`dsh-computer-use`](../../../../packages/computer-use/computer-use/README.zh.md) 擁有 `ctx.computerUse`，註冊一個提供者自定的名稱並返回其 effect 清理函式。第二次註冊無論名稱為何都會失敗。服務不包含提供者物件、共享操作型別、分派方法、Session 鎖或執行時選擇器。

**Cua Driver** 是上游實作的名稱。[MCP 提供者](../../../../packages/experimental/computer-use-cua-driver-mcp/README.zh.md)連線已安裝的可執行檔案。[原生提供者](../../../../packages/experimental/computer-use-cua-driver-native/README.zh.md)安裝上游原生 npm 依賴。兩者均保持實驗性並加入顯式公開發布允許列表；均不預設啟用。

各整合暴露上游工具目錄。MCP 結果轉換保留在 `dsh-mcp-client` 中，其基於回呼的工具適應函式也轉換原生 Cua Driver 結果。計算機操作服務不依賴該適應函式或任一提供者。

提供者解除安裝時保留註冊，直到停止接收工具呼叫且自有工作和資源關閉。分組 Cordis effect 為此清理排序；獨立 effect 可能並行清理。原生提供者透過 `tools/execute` 在原生呼叫和截圖准入之間共享取消訊號，同時保留執行標識。並行 Session 由呼叫方協調，因為提供者註冊不擁有觀察、操作和驗證流程。

## Alternatives considered

**統一操作 API。** 通用截圖、輸入和視窗術語需要轉換提供者特有的語義，而目前沒有需要可移植性的消費者。由提供者擁有工具可保留這些語義。

**僅外部 MCP。** 此方案複用已安裝的驅動及其程序身份，但保留獨立安裝的前提。原生提供者提供單包執行時安裝。

**僅嵌入原生執行時。** 原生整合讓 DSH 擁有執行時生命週期，並與後端程序共享原生故障。MCP 提供者保留獨立安裝驅動的選項。

**Session 所有權代理。** 在完整流程期間預留桌面需要顯式取得和釋放策略。目前服務僅約束提供者註冊，將流程協調留給呼叫方。

## Consequences

服務保持獨立於實驗性包。公開發布允許列表接納兩個提供者包，但不提升其支援狀態。設定選擇提供者，切換需要先解除安裝目前提供者。

原生平臺支援和主機權限仍由上游和部署負責。macOS 游標疊加層託管和專用 Desktop 權限介面暫緩實作。取消會停止等待並傳播到驅動；不承諾復原已交付的桌面輸入。
