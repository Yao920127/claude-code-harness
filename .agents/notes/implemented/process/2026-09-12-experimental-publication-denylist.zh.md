# Agent Note: 預設釋出實驗性包並保留顯式私有例外

Status: implemented

[English](2026-09-12-experimental-publication-denylist.md) | 中文

## 問題

公開實驗性包的允許列表要求每個新加入儲存庫的可安裝原型都修改一次策略。實驗性狀態描述相容性與支援預期，但內部專用原型仍需要顯式排除釋出。

## 決策

本地 npm baseline 釋出器與公開 dsh 釋出系列預設發現實驗性包。[`PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES`](../../../../scripts/experimental-package-policy.ts) 負責顯式私有排除項。[完整實驗包釋出決策](2026-09-12-publish-all-experimental-packages.zh.md)使該拒絕列表保持為空；所有目前實驗性包都參與釋出。

拒絕列表以外的每個實驗性目錄預設公開。workspace 約束要求公開包省略 `private` 並設定 `publishConfig.access: public`；所有實驗性包保留 `@deepseek-ai/dsh-experimental-*` npm 字首。新增私有原型需要拒絕列表條目及其私有 manifest（中繼資料清單）。

本決策取代 [Agent Teams 包決策](../architecture/2026-08-18-experimental-agent-teams-packages.zh.md)中的預設私有釋出原則。該決策的依賴隔離、顯式啟用組合、工程要求與 promotion 規則繼續生效。釋出不提供穩定性或支援承諾。

## 曾考慮的替代方案

**保留公開允許列表。** 即使預設釋出路徑能夠發現新公開實驗性包，每個包仍需要額外的策略條目。

**立即釋出所有實驗性包。** 這會暴露現有的內部專用原型。顯式私有拒絕列表改變新包的預設策略，同時保留這些原型的目前釋出狀態。[完整發布決策](2026-09-12-publish-all-experimental-packages.zh.md)記錄了對這些包的單獨釋出決定。

## 後果

新實驗性包無需修改允許列表即可加入兩條 npm 釋出路徑。私有例外有一個共享 owner，workspace 驗證會拒絕與之不符的 manifest。
