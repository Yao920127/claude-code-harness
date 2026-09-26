# Claude Code Harness

[English](README.md) | 中文

Claude Code Harness（CCH）是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的分支（fork），原專案是由 [DeepSeek AI](https://deepseek.com) 開發的開源 agent harness（智能體框架）。本專案保留上游的插件架構，並新增一條模型路由：使用你電腦上已有的 Claude Code 登入來執行 [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)，讓你不必輸入 API Key，就能在 harness 的 Web UI 或桌面 App 中與 Claude Code 對話。

> 本專案與 Anthropic 或 DeepSeek 沒有任何隸屬、背書或贊助關係。本分支的問題請回報到[本倉庫的 issues](https://github.com/Yao920127/claude-harness/issues)，不要回報到上游。

## 本分支新增的內容

- **Claude Code 模型路由**——[`dsh-llm-claude-code`](packages/llm/llm-claude-code/README.zh.md) 透過官方 Claude Agent SDK，把每次模型呼叫作為一個 Claude Code 回合執行。模型選擇器會列出你的 Claude 帳號可用的模型，例如 Claude Sonnet 5 與 Claude Fable 5.1。Claude Code 執行自己的工具，並透過 harness 的審批卡片請求權限。
- **預設使用 Claude Code**——[`dsh-cch`](packages/bundle/cch/README.zh.md) bundle 把 Claude Code 設為預設模型，並移除 DeepSeek 模型路由與 DeepSeek 帳號登入。
- **繁體中文介面**——[`dsh-client-locale-zh-hant`](packages/client/locale-zh-hant/README.zh.md) 新增「繁體中文」語言，以 OpenCC 轉換簡體中文詞典，App 預設即使用繁體中文；桌面 App 的選單、對話框與登入畫面也使用繁體中文。
- **Claude 外觀**——[`dsh-client-ui-brand-claude`](packages/client/ui-brand-claude/README.zh.md) 顯示 Claude 標誌，並依照 [DESIGN.md](DESIGN.md) 套用奶油色與珊瑚色配色，以及 Inter 與 EB Garamond 字體。淺色、深色與跟隨系統外觀都可使用。
- **桌面 App**——Electron App 名稱為 Claude Code Harness。啟動時會檢查 Claude Code 登入狀態，未登入時提供官方瀏覽器登入。資料存放在 `~/.cch`，與 DeepSeek Harness 安裝分開，並可打包成未簽名的 macOS 磁碟映像檔。

## 開始之前

- 從原始碼建置需要 Node.js `^22.19` 或 `>=24` 與 pnpm。
- 一個可以使用 Claude Code 的 Claude 帳號。harness 使用 Agent SDK 附帶的 Claude Code CLI，因此不需要另外安裝 Claude Code；桌面 App 會引導你登入，從原始碼執行時，若已安裝 CLI，可先用 `claude` 並輸入 `/login` 登入一次。
- 請先閱讀[安全說明](SAFETY.zh.md)。Claude Code 可以在你選擇的工作區中執行指令與修改檔案。

<a id="run"></a>

## 執行

### 桌面 App（macOS，Apple 晶片）

從原始碼建置未簽名的磁碟映像檔：

```sh
git clone https://github.com/Yao920127/claude-harness.git
cd claude-harness
pnpm install
pnpm run package:desktop:mac:arm64:unsigned
```

磁碟映像檔會輸出到 `apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/`。把 Claude Code Harness 拖到「應用程式」。由於 App 沒有 Apple 開發者簽名，macOS 會阻擋第一次開啟：請在 Finder 中對 App 按右鍵並選擇「打開」，或到「系統設定 → 隱私權與安全性」允許開啟。若尚未登入 Claude Code，App 會在進入工作區前顯示登入畫面。打包細節見[桌面 README](apps/desktop/README.zh.md)。

<a id="run-from-source"></a>

### 從原始碼執行

從倉庫原始碼執行 Web UI：

```sh
git clone https://github.com/Yao920127/claude-harness.git
cd claude-harness
pnpm install
pnpm run build
pnpm dsh plugin --profile web add \
  link:$PWD/packages/llm/llm-claude-code \
  link:$PWD/packages/client/locale-zh-hant \
  link:$PWD/packages/client/ui-brand-claude \
  link:$PWD/packages/bundle/cch
pnpm dsh web
```

`pnpm run build` 會準備倉庫產物，`pnpm dsh web` 直接使用這些產物，不會重新建置。`plugin add` 這一步只需執行一次，會把 Claude Code 相關套件加入 `web` profile；若略過這一步，`pnpm dsh web` 會以上游 DeepSeek Harness 的設定執行，需要 DeepSeek API Key。Web UI 會在 `http://127.0.0.1:3080` 啟動並用瀏覽器開啟；傳入 `--no-open` 則只啟動伺服器。詳見 [Web UI 指南](docs/user/guide/index.zh.md)。

## 開發者預覽

上游專案處於 _開發者預覽_ 階段且快速迭代，本分支跟隨上游。**未來將出現破壞相容性的變更。**

## 開發

請先閱讀[開發指南](docs/development.zh.md)與[架構文件](docs/architecture.zh.md)。`pnpm run dev:web` 會建置、啟動，並在原始碼修改時重建 client bundle；`make help` 列出 Web 與 Desktop 對應的 Make target。Agent 請遵循 [AGENTS.md](AGENTS.md)，貢獻者請遵循 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 致謝

Claude Code Harness 建立在 DeepSeek-AI 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 之上。其**一切皆插件**的架構由 [Cordis](https://github.com/cordiverse/cordis) 驅動，設計參見論文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。上游文件位於 [deepseek-harness.github.io/deepseek-harness](https://deepseek-harness.github.io/deepseek-harness/)，上游相關的回饋請發到 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)。

若要引用本 harness，請引用上游專案：

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 商標與散布

Claude、Claude Code 與 Claude 標誌是 Anthropic 的商標，DeepSeek 是 DeepSeek 的商標。每位使用者以自己的 Claude 帳號登入，Claude Code 的使用須遵守 Anthropic 的條款。散布顯示 Claude 名稱與標誌、或向他人提供 Claude Code 登入的建置版本，需要取得 Anthropic 的許可。Inter 與 EB Garamond 依 SIL Open Font License 1.1 使用。

## 授權

[MIT](LICENSE)，並保留上游 DeepSeek 的版權聲明。第三方依賴及其授權列於 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
