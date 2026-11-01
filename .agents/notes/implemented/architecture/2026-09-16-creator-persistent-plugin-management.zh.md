# Agent Note: 創造模式安裝持久化外掛組合包

Status: implemented

[English](2026-09-16-creator-persistent-plugin-management.md) | 中文

## Problem

agent 需要安裝能力並在同一段對話中使用。生成程式碼工具在普通已安裝組合包之外引入了第二套外掛生命週期。

## Decision

創造模式啟用現有的 `plugin_manager` 工具。agent 將包和 Loader YAML patch 寫入工作區檔案，再透過 `install_bundle` 安裝。MCP 連線是插入已安裝 `dsh-mcp-client` 的純設定組合包；UI 組合包包含 Host 入口和 Client 產物。profile 鎖、包安裝、啟停和 HMR 繼續由現有管理器負責。 整個管理工具要求 `danger-full-access` 或單次呼叫的批准：profile 變更能以主機權限載入程式碼，並影響其他工作階段。每次執行（包括查詢列表）都會先使用共享沙箱提權函式和審批服務，再存取管理器。在較低沙箱模式下，`ask` 請求審批，`never` 拒絕；完整權限工作階段無需額外審批。批准不改變工作階段權限，但本次操作的 profile 變更會持久化。這讓與 shell 等價的主機存取需要明確授權，同時不必永久提升整個工作階段的權限。由使用者直接操作的 Web 和 CLI 控制元件保持原有行為。

模型可見兩個只讀 Cordis 檢查工具，不再提供生成程式碼的 define/run/stop/undefine 和動態自省工具 API。現有執行時和 Client 消費者保留其服務；歷史工作階段卡片仍然可讀。這僅取代[自引用工具集決策](../feature/2026-07-08-self-referential-cordis-toolset.zh.md)中的模型側變更流程；其執行時所有權和沙箱依據仍有獨立價值。[profile 事務決策](2026-09-14-current-profile-plugin-management.zh.md)繼續規定鎖、包安裝和部分失敗行為。

除非使用者指定其他目標，視覺建立請求預設透過已安裝的 Client 外掛顯示在目前 Web 頁面。開發 skill 提供最小包和由 effect 管理的 Client 註冊範例。已知所需 API 後結束探查，在可選視覺最佳化之前先安裝能工作的初版。有條件時使用已連線頁面驗證。瀏覽器認證或作業系統設定不是安裝外掛的前提，mock 預覽不能證明應用內結果。

Desktop 透過啟動器提供的 profile 資訊傳入內建 pnpm 入口與 Electron Node 呼叫方式。Plugin Manager 使用該呼叫完成安裝、移除和 registry 檢查，保留通常的 profile 事務與啟用行為。其環境僅應用於包管理子程序；普通 Host 子程序不繼承私有 Node 啟動器路徑。CLI profile 保留其設定的 PATH 命令。

歷史 Cordis 工作階段以準確的格式版本宣告 `retired-tools` 覆蓋，即使該版本等於目前 writer 也如此。它們是不可改寫的重放輸入；持久化後的工具呼叫及結果資料會進行比較，卡片渲染不註冊已移除工具。此覆蓋不計入遷移覆蓋。保留的 runner 寫入 API 供程式和瀏覽器消費者使用；移除時必須一起替換這些消費者。

## Alternatives considered

通用條目增刪改查和 MCP 專用管理 API 重複了組合包檔案及現有安裝、啟停操作能夠表達的能力，提示驅動的安裝不需要這些介面。將生成程式碼的版本管理搬入 Plugin Manager 會保留兩套生命週期，且無法提供普通包的持久化方式。

## Consequences

已選擇的組合包影響 profile 中的所有工作階段，並在重新啟動後保留。HMR 在即時 profile 中啟用新組合包；替換已安裝的包需要重新啟動。agent 分別報告儲存狀態和啟用結果，並驗證所需能力。副作用歸屬於外掛生命週期，包括樣式表清理。

建置後的 Web profile 測試安裝 MCP 組合包，檢查現有和新建創造模式工作階段，重新啟動程序，並驗證移除組合包後的工具釋放。錄製工作階段無需模型憑證即可回放管理器啟用已設定 MCP 條目及後續真實本地 MCP 請求。歷史卡片測試保留已移除工具的已儲存展示。
