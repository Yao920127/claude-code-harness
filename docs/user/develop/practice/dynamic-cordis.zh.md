# 透過提示詞設定持久化外掛

[English](dynamic-cordis.md) | 中文

創造模式提供 [Plugin Manager](../../../../packages/boot/plugin-manager/README.zh.md) 和只讀[執行時檢查](../../../../packages/extensions/tool-cordis/README.zh.md)。外掛設定屬於目前 profile，影響其工作階段，並在程序重新啟動後保留。

## 連線 MCP 伺服器

啟動 Web profile 並選擇創造模式。準備一個可存取且提供 `ping` 的 Streamable HTTP MCP 伺服器，將其實際端點填入以下提示詞：

> 將 `<endpoint>` 處的 MCP 伺服器設定到目前 profile，命名為 `demo`。立即啟用它的工具，然後呼叫它的 ping 工具並告訴我結果。

agent 編寫純設定組合包，在 patch 中插入 `@deepseek-ai/dsh-mcp-client`，再透過 `plugin_manager install_bundle` 安裝。啟用 HMR 時，工具會出現在同一個執行中的工作階段裡。同時檢查管理結果（`application: applied`）和成功的 `mcp__demo__ping` 呼叫。返回 `restart-required` 的已儲存條目尚未啟用；失敗條目需要修復設定。

修改設定前先讀取組合包 patch。使用 Plugin Manager 停用條目或移除組合包。可接受的設定及連線失敗行為見 [MCP client 參考](../../../../packages/mcp/mcp-client/README.zh.md)。
