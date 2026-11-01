# Agent Note: 僅 master 執行的平臺 CI

Status: implemented

[English](2026-09-06-master-only-platform-ci.md) | 中文

## Problem

macOS Intel、ARM 與 Linux ARM64 上的 Python 執行時建置，以及透過 Wine 執行的 Windows 建置和網站檢查，會在每次拉取請求修訂時消耗付費託管容量。原生 Linux 與 Windows x64 已提供必需的可執行檔案和安裝後 wheel 包證據，原生 Windows 檢查也會在合併前覆蓋建置與程序行為。

## Decision

[CI](../../../../.github/workflows/ci.yml) 要求 Linux x64 與 Windows x64 上的 Python 執行時驗證。[CI master](../../../../.github/workflows/ci-master.yml) 僅在 master 推送時透過同一可複用建置器選擇 Linux ARM64、macOS ARM64 與 macOS x64。兩個呼叫方均傳入 `ci: true` 和顯式外部 API 金鑰，保留完整的無金鑰安裝後 wheel 包情境及可信 live 測試的明確失敗。Fork 與 Dependabot 拉取請求仍不帶金鑰；執行器信任與退回選擇器保持不變。Python 釋出保留全部五個目標。

Wine 作為獨立的託管 Ubuntu master 作業執行一次。其現有的按映像標識的 apt 快取恢復和儲存也負責生成預設分支快取，因此不需要單獨的快取預熱作業。原生 Linux 與 Windows 序列聚合不呼叫 Wine。Wine 保持託管執行，避免在持久 Linux VM 上執行共享主機 apt 事務和共享 Wine prefix 清理。腳本負責臨時快照、checkout 內的 Wine prefix 和經過總和檢查碼驗證的 Windows Node 快取；環境準備、失敗傳播及始終執行的清理保持不變。

[被取代 CI 的取消策略](2026-09-09-cancel-superseded-ci.zh.md) 適用於父工作流與可複用執行時工作流：更新的 master 推送或手動執行會取消同一工作流/引用組內的舊驗證，而釋出所屬的建置仍受保護。master 推送會排程全部三個選定載體，但不保證每個中間提交都得到結果。

本決策部分取代[安裝後 wheel 包驗證](../testing/2026-08-23-installed-python-wheel-black-box-ci.zh.md)、[原生 Windows CI](2026-08-08-native-windows-pull-request-ci.zh.md)、[序列參考](2026-07-21-serial-cross-platform-ci-reference.zh.md)和[故障切換手冊](2026-07-26-ci-failover-runbook.zh.md)中的排程策略。這些記錄仍保留產物來源、平臺保真度、序列完整性與信任規則的決策價值。

## Alternatives considered

**在拉取請求上保留全部目標和 Wine 必需檢查。** 這能在合併前發現平臺特定缺陷，但會在每次修訂時重複付費原生建置。所選策略明確接受這四項檢查在合併後發現問題。

**等到釋出或要求手動派發。** 這會失去自動的預設分支訊號。master 推送保留定期觸發的檢查，不縮減釋出矩陣。

**把 Wine 合入自託管序列聚合。** 聚合並未覆蓋 Wine。加入它會改變持久主機依賴、共享快取歸屬與清理隔離；此次排程最佳化不需要這種遷移。

## Consequences

macOS、Linux ARM64 或 Wine 特定迴歸可能在必需 PR 檢查為綠時合併。master 失敗仍是普通失敗作業，不是 `continue-on-error` 觀測項。Linux/Windows x64 安裝後 wheel 包檢查及原生 Windows 建置和程序檢查繼續阻塞 PR 聚合；其依賴絕不引用已移除的 Wine PR 作業。

[路由迴歸測試](../../../../scripts/tests/ci-master-platforms.spec.ts) 透過現有腳本 spec 覆蓋率清單執行，檢查目標劃分、僅 master 條件、憑證傳遞、取消、Wine 唯一性、聚合依賴有效性及完整發布矩陣。已執行的負對照移除 Intel 目標、錯誤路由 Wine 並恢復失效聚合依賴；每項均產生預期失敗。真實平臺執行仍由 CI 負責；本地排程測試不聲稱執行了原生執行時或 Wine。
