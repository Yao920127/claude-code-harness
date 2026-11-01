# DeepSeek Harness 桌面端

[English](README.md) | 中文

桌面應用是完整 dsh Web 應用外的一層 Electron 殼。Electron RunAsNode 子程序啟動共享 profile runner，Electron 立即從 `dsh-app://app/` 載入打包內的 Web 入口。共享載入頁等待 Host 啟動注入，然後在同一文件中啟動用戶端。Electron 將應用 HTTP 請求轉發給已認證的 Web Host，轉發時丟棄描述 Node fetch 連線而非資源本身的回應頭（`transfer-encoding`、`connection`、`keep-alive`），並把外掛 bundle 回應標記為 `no-store`，因為其每次啟動都變化的 revision 只會在 Chromium 磁碟快取中累積；WebSocket 流連線到該 Host，僅為歸屬的應用視窗附加憑證。Node IPC 承載啟動注入、就緒與關閉。Desktop 預設使用埠 `19388`，與 Web 的 `3080` 分開；可透過 `webserver.config.port` patch 覆蓋。

應用選單第一項“**關於 DeepSeek Harness**”開啟 Electron 原生關於面板，展示應用圖示、產品名稱和目前安裝的釋出版本。選單文案跟隨桌面殼的語言。macOS 的隱藏、隱藏其他、顯示全部和退出條目使用在地化文案，隱藏和退出條目包含 DeepSeek Harness 產品名稱。這些條目保留原生動作和快捷鍵。macOS 從應用包讀取圖示，因此未打包的開發啟動會顯示 Electron 圖示；Windows 使用隨包分發的 PNG。

Desktop 的本地原生目錄流程開啟繫結應用視窗的 Electron 資料夾對話方塊，並先恢復、顯示和聚焦該視窗。並行請求共用一個對話方塊；取消不返回路徑，失敗後可以重試。普通 Web 使用 Host 選擇器。瀏覽模式列出 Host 目錄。Linux 缺少 zenity 或 kdialog 時，自動選擇使用瀏覽模式，不使用 Electron 對話方塊。

Creator 和 Web Plugin Manager 在 Electron Node 模式下使用 Desktop 內建 pnpm，無需 PATH 中存在 pnpm。私有 Node 啟動器環境僅應用於包操作。

Platform 內嵌文件使用持久化 WebContentsView 分割槽，分割槽名由 Platform 來源和穩定帳號 ID 的雜湊決定。localStorage 中的頁面偏好（包括已關閉的通知）在關閉檢視和重新啟動應用後保留；不同帳號和來源使用獨立儲存。帳號 ID 來自 Host 最近一次成功的資料讀取；尚無該 ID 時，文件在一次性分割槽中開啟，該分割槽不跨次保留偏好。開啟持久分割槽會先清理 Cookie、檔案系統、IndexedDB、Cache Storage、HTTP 與著色器快取、Service Worker 及 HTTP 認證狀態；一次性分割槽則清理其全部儲存。關閉檢視會銷燬文件、移除請求攔截器並安排相同的清理，因此異常退出遺留的認證會在下一個文件載入前被清除。下次開啟和應用退出都會等待該清理完成，更新安裝也會在安裝器接管退出前等待。清理失敗會使該次開啟失敗，並在後續清理成功前阻止同一帳號開啟；其他帳號不受影響。退出登入會銷燬文件，但保留帳號偏好供下次登入使用。同一憑證下帳號 ID 遲到時，已以一次性分割槽開啟的文件保持掛載；下次開啟使用帳號分割槽。[儲存決策](../../.agents/notes/implemented/architecture/2026-09-22-platform-browser-storage.zh.md)說明保留策略。Host 透過私有 Node IPC 傳送帳號憑證；帳號 RPC 和 Harness 渲染程序不接收 token。Platform preload 在頁面腳本執行前透過一次同步 IPC 讀取主程序中已準備的憑證。它暴露 displayMode、同步的 getAuthToken() 和 getLocale() getter，以及返回取消訂閱函式的 onLocaleChange(listener)。兩個 getter 都只讀取 preload 記憶體，不再呼叫 IPC。bootstrap 包含 Desktop 已解析的語言（`zh_CN` 或 `en_US`）；Settings 語言變更會更新 preload 快取並通知已開啟的 Platform 文件，無需過載。Platform 在首屏渲染前應用該語言，且不將其持久化為瀏覽器偏好。主程序處理器僅驗證呼叫來源並讀取記憶體，不等待 Host、磁碟或網路。可信頁面初始化失敗時保留內嵌模式，由 getter 拋錯，避免退回到瀏覽器憑證。只有受控 Platform 頁面中、位於所設定簽發來源的主 frame 能完成初始化。退登、憑證替換、Host 關閉及檢視關閉都會銷燬文件。跨來源文件導航被阻止。請求新視窗的 HTTPS 連結在系統瀏覽器中開啟，不攜帶內嵌工作階段或 token；其他協定及帶 URL 憑證的連結被拒絕。原生檢視佔據 Account 功能返回欄下方的視口。

Desktop Host 的 Platform API 請求與更新策略請求用相同的 Platform 用戶端請求頭標識已安裝用戶端：平臺、用戶端版本、語言、以秒為單位的時區偏移，以及有意保持為空的 bundle id。帳號操作按呼叫逐次傳入呼叫介面的身份；帳號 provider 管理[僅 API 使用的請求頭設定](../../packages/credentials/deepseek-account-platform/README.zh.md#use-this-package)。更新策略額外上報架構、更新通道和內建執行時版本。

帳號憑證被伺服器端判定失效後，未設定官方 API key 時返回 Welcome；有可用 API key 時保持工作區開啟。主動退出登入遵循相同規則。Welcome 和工作區均顯示在地化的登入失效提示。

桌面麥克風存取僅允許主 `dsh-app://app` 頁面發起的音訊請求。macOS 使用系統麥克風授權與隨包用途說明。

按 F12（多媒體功能鍵鍵盤上為 Fn+F12）、macOS 的 Command+Option+I 或 Windows 的 Ctrl+Shift+I，可切換目前獲得焦點的應用頁面的 DevTools，打包版本同樣支援。這些原生快捷鍵透過隱藏的應用選單項註冊。更新遮罩和打包版本的內嵌瀏覽器停用 DevTools。

## 關閉視窗與退出

關閉主視窗（macOS 的關閉按鈕和 ⌘W；Windows 的 ×、Alt+F4 和工作列"關閉視窗"）會隱藏視窗；Windows 首次隱藏前需要確認。頁面和 Host 繼續執行，任務不受影響，下次顯示時仍是原來的文件，工作階段、草稿和滾動位置都保留；macOS 全螢幕視窗先退出全螢幕再隱藏。macOS 透過 Dock 圖示、再次啟動或 `dsh://open` 找回視窗，Windows 透過托盤找回。最小化行為不變。進入工作區前關閉歡迎視窗，Windows 上走退出流程，macOS 上應用留在 Dock 中且沒有視窗。

Windows 在整個執行期間常駐托盤圖示。懸停提示為產品名，單擊顯示並聚焦視窗，右鍵選單提供殼語言下的"開啟 DeepSeek Harness"和"退出 DeepSeek Harness"。首次隱藏前複用更新彈出視窗，顯示“正在執行的任務不會中斷，可在系統匣中重新開啟視窗”和“確認”按鈕。確認後隱藏視窗，並在 Electron userData 下寫入 `background-close-confirmed`；Esc、關閉彈出視窗或載入失敗均保持主視窗可見，不記錄確認。重複關閉請求會聚焦已有殼彈出視窗。覆蓋更新保留標記，解除安裝刪除標記。舊的 `background-notice-shown` 標記不會跳過此確認。關閉視窗不傳送系統通知。托盤點陣圖是 `resources/tray-windows.ico`，由 `pnpm run render:tray-icon` 從 `resources/icon-windows.svg` 按 16、20、24、32、40、48、64 畫素分別渲染，打包為 `resources/tray.ico`。macOS 不提供選單欄圖示。

所有普通退出入口——⌘Q、應用選單、Dock 選單、Windows 托盤和標題欄"應用程式"選單，以及關閉強制更新視窗或歡迎視窗引起的退出——都先向 Host 查詢退出會中斷什麼。Host 透過私有 IPC 通道回答兩項事實：與更新重新啟動檢查同一口徑的執行中任務（執行中的 agent，包括子代理和等待審批的回合、排隊訊息、執行中或停止中的後臺任務），以及本次執行中已載入工作階段裡由 `workspace/session-activity` 的 `schedule` family 報告的已掛定時器的提醒。兩項都沒有時直接退出，不彈框。否則彈出一個沒有父視窗的原生訊息框——隱藏的視窗保持隱藏——標題為**退出 DeepSeek Harness？**，正文為三種在地化說明之一：正在執行的任務將會中斷、應用關閉期間排程任務不會執行，或兩者兼有。"退出"是預設按鈕，Esc 等同"取消"；macOS 上"取消"在"退出"左側，Windows 上"退出"在"取消"左側，Windows 任務對話方塊顯示應用圖示且不跟隨應用主題、始終為淺色。Host 尚未就緒或已失敗時不可能有任務在跑，直接退出。查詢失敗或 Host 超過兩秒截止時間未答覆，按執行中任務處理。彈框開啟期間，再次請求退出只會併入同一彈框而不疊加新彈框（macOS 上還會把它提到前面；Electron 不暴露 Windows 任務對話方塊的控制代碼）；任務開始或結束不會改變文案；點"退出"不再重新查詢即停止應用；點"取消"不發生任何變化。取消由關閉歡迎視窗引起的退出時，歡迎視窗會重新顯示。

以下情況跳過確認：安裝更新的重新啟動已確認過任務中斷、致命錯誤恢復對話方塊中的退出或重新啟動、開發版"重新啟動應用與 Host"命令，以及作業系統關機、重新啟動或登出：Windows 在確定性的工作階段結束訊息上設定該狀態；macOS 在關機通知上設定，而其他應用仍可能取消這次關機，因此主視窗下一次獲得焦點或顯示時會清除它。安裝器接管退出時會取消尚未結束的普通退出決策；晚到的查詢結果和彈框答覆不會再次開啟確認框或重複清理。視窗隱藏期間完成的使用者主動發起的更新下載，把"安裝並重新啟動"確認推遲到視窗再次顯示時；強制更新流程沿用其工作列和 Dock 提醒。Windows 安裝程式和解除安裝程式在應用仍在執行時提示使用者先在系統匣中退出。Desktop 預設未開啟排程任務，排程任務的說明只在該功能開啟後出現；提醒只在已載入的工作階段中觸發，未載入的工作階段既不計入，也要等到開啟後才會繼續。

托盤渲染器以底板中心為基準將鯨魚放大 20%，保留背景和寬高比；應用和安裝器圖示保持原有比例。

## 關鍵技術決策

設計師原稿位於 `resources/icon.png` 和 `resources/icon.svg`；平臺適應保留鯨魚與漸變，分別位於 `resources/icon-windows.*` 和 `resources/icon-macos.*`。將各平臺 SVG 匯出為透明的 1024×1024 PNG。electron-builder 為 Windows 應用、安裝程式和解除安裝程式生成多尺寸 ICO（[Windows 圖示要求](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction)）。安裝頁面在兩種主題下使用匹配的圖案；解除安裝程式的歡迎和完成頁共用 `installer/assets/uninstaller-sidebar.png`，準備階段將其轉換為 164×314 BMP。

快捷鍵覆蓋儲存在 `app.getPath('userData')/keybindings.json`，與 `DSH_HOME` 分離。主程序驗證並序列儲存修改後才釋出已接受鍵位。讀取失敗保留上次接受的鍵位並阻止編輯，包括全部恢復；不可讀和未來版本的檔案保持不變。開發時可透過 `DSH_DESKTOP_USER_DATA_DIR` 隔離這些偏好，啟動器會輸出解析後的路徑。格式和衝突語義見[快捷鍵服務](../../packages/client/shortcuts/README.zh.md)。

macOS“檔案”選單顯示已接受的單鍵繫結（包括方向鍵），並透過 Client 頁面 owner 路由“關閉頁面或視窗”。Windows 和 macOS 在主文件、內嵌 frame 和瀏覽器 guest 輸入之前攔截所有已接受的完整繫結，包括編輯和終端輸入。錄製和輸入法組合狀態仍受保護。更新蒙層從建立到最後一個蒙層關閉期間阻擋父視窗及其瀏覽器 guest 的產品快捷鍵和編輯按鍵遞送。每次開啟或關閉蒙層都會作廢待完成的組合鍵狀態。主程序透過顯式的建立能力和輸入狀態讀取能力，讓更新對話方塊與快捷鍵輸入共享同一個蒙層管理實例。雙鍵組合會將首鍵的初次按下事件交給頁面，且不攔截其鬆開事件；完整組合及其重複事件會被消費。渲染程序將可設定繫結的分發交給原生介面卡。雙鍵組合不註冊原生選單快捷鍵。已接受的命令透過可信 preload 轉發一次。Linux 透過 DOM 分發主文件快捷鍵，並將已接受的內嵌 frame 繫結轉發給 Client 解析器。關閉最後一個視窗後 macOS 保留應用生命週期；Windows 退出桌面實例並停止其任務。[關窗決策](../../.agents/notes/implemented/architecture/2026-09-21-desktop-page-close-shortcuts.zh.md)記錄了這一生命週期選擇。

macOS PNG 使用帶留白的圓角底板，供傳統 ICNS 打包使用，包含最高 1024 畫素的表示。它是扁平圖示，並非 Icon Composer 文件。Apple 的[應用圖示指南](https://developer.apple.com/design/human-interface-guidelines/app-icons)要求向 Icon Composer 提供未遮罩的圖層；這些輸入需要在 macOS 上單獨匯出，不能複用已做圓角的 ICNS 圖案。釋出前須在支援的 macOS 版本中驗收 Finder 和 Dock 的顯示效果。

<a id="bundled-workspace-dependencies"></a>

### 內建工作區依賴

electron-builder 只把清單中的 `dependencies` 複製進 `app.asar/node_modules`，因此 Electron 主程序 bundle `lib/main.js` 內聯其工作區 devDependencies，裸匯入只剩 `electron`、Node 內建模組與這些 `dependencies`；沙箱 preload 只能留下 `electron`、`events`、`timers` 與 `url`，即其 `require` polyfill 能解析的模組。主程序 bundle 從被內聯包的 `lib/` 產物解析它們，所以根 `build:lib:host` 在並行的工作區 tsdown 階段之後才為 `apps/desktop` 打 bundle，並由 [`desktop-bundle-imports`](scripts/desktop-bundle-imports.mjs) 讓任何靜態、動態或 `require()` 匯入無法在打包應用內解析的 Desktop bundle 直接失敗。沒有這項檢查時，rolldown 無法解析的匯入會作為外部說明符進入產物，並在啟動時以 `ERR_MODULE_NOT_FOUND` 失敗。[bundle 順序決策](../../.agents/notes/implemented/process/2026-09-22-desktop-main-bundle-after-workspace-tsdown.zh.md)記錄了備選方案。

Windows 簽名打包按 PE 檔案內容掃描第一方執行時和應用生產依賴，包括沒有常規副檔名的檔案。最終掃描覆蓋整個解包應用。目錄連結、格式錯誤的 `MZ` 檔案以及非 PE 的 `.exe`、`.dll` 或 `.pyd` 檔案會使打包停止；以 `MZ` 開頭的資料檔案也會被拒絕，除非包含有效 PE 頭。它保留有效的上游簽名，並在記錄執行時雜湊或執行冒煙檢查前為未簽名程式碼補籤。公鑰驗籤每個程序處理最多 32 個檔案，同時最多執行四個程序；硬體權杖簽名仍序列執行，每個新簽名必須匹配設定的憑證且帶時間戳。硬體簽名或驗籤失敗會停止本輪執行；獨立的時間戳請求遵循下文的有界重試規則。electron-builder 只有在驗籤和逐位元組比對透過後，才保留複製後執行時可執行檔案的簽名。寫入釋出完成記錄前，必須透過最終 PE 簽名檢查，以及使用全新快取的 ASAR 載荷和 Host 冒煙檢查。開發、僅準備和未簽名建置不使用硬體權杖，可能被 Windows 程式碼完整性策略阻止；任何建置模式都不會關閉該策略。冒煙檢查透過不代表相容所有企業策略。

Desktop 攜帶獨立的 Python、Node.js 和 pnpm 分發包。Python 包含 numpy、pandas、python-docx、python-pptx、openpyxl、Pillow、lxml、XlsxWriter 及其完整依賴。`load_workspace_dependencies` 工具首次使用時，將該產物離線安裝到 `$DSH_HOME/dsh-runtimes/dsh-primary-runtime`（通常為 `~/.dsh/dsh-runtimes/dsh-primary-runtime`），並返回直譯器、pnpm 腳本和庫目錄的絕對路徑，以及記錄內建分發包名稱與版本的 `pythonDistributions`。版本報告不包含使用者自行安裝的包。Office 任務預設使用這些庫，使用者或工作區指令指定其他環境時遵循其要求。pnpm 腳本透過返回的 Node 可執行檔案執行。返回的 Node 庫目錄為隨包交付的庫預留，不是 pnpm 的全域安裝目錄。

Desktop 預設註冊 `office-docx`、`office-pptx` 和 `office-xlsx`。這些技能使用內建 Python 庫建立檔案和進行定點編輯，隨後重新開啟檔案，並在交付前執行共享結構檢查器。PowerPoint 的建立和編輯使用 python-pptx。技能資源複製到 ASAR 外的 `runtime/office-skills`，讓 Python 可以讀取檢查器。可用的 `render_document` 工具可以補充視覺檢查；缺少該工具不妨礙創作或交付。檢查範圍與限制見 [Office 技能包](../../packages/skill/skill-office/README.zh.md)。

該產物隨 Desktop 版本釋出。`runtime.json` 記錄 Desktop 版本、目標平臺、頂層直譯器和包管理器版本及 Python 分發包版本表，以及所選目標的鎖定產物輸入與組裝格式的摘要。分發包名稱按 PEP 503 歸一化；名稱歸一化後重復時，清單會被拒絕。舊 `components` 清單透過歸一化繼續可讀，並保留其原有庫版本一致性驗證。匹配的安裝會被複用；依賴或壓縮包變化後，即使 Desktop 版本不變，也會在完整暫存副本完成後替換目錄。不含摘要的舊清單會在下次安裝時被替換。使用者自行新增的 Python 包僅在產物身份一致時保留。目錄替換失敗時保留之前的安裝；直譯器仍在執行時，Windows 可能拒絕替換。

Desktop 私有的 `runtime/bin` 目錄僅新增到包安裝程序，不進入 PTC 和 agent shell 從 Host 繼承的 PATH。該工具不修改 PATH、環境變數或使用者包管理器設定。pnpm 的全域包、命令入口和 store 保留自身預設值及使用者設定，包括環境不支援全域安裝時的原生錯誤。不提供獨立依賴更新器。[第一方 Runtime 決策](../../.agents/notes/implemented/feature/2026-09-14-desktop-primary-runtime.zh.md)記錄這些選擇。

Node 準備內建直譯器和 Python 庫，無需系統 Python 或 pip。[下載鎖](../../scripts/primary-runtime/lock.json)固定直譯器壓縮包、Python 分發包版本及目標平臺 wheel 的 URL 和雜湊；共享建置器從根開發依賴中解析 pnpm 固定版本。測試檢查根 package-manager 版本和 Desktop 固定版本保持一致。每個目標的 wheel 檔名必須與分發包版本一致。所選目標、wheel 記錄及分發包對映內部的鍵順序，以及 wheel 條目順序都會影響產物身份，編輯時須保留；鎖檔案頂層鍵的順序不影響該身份。庫 wheel 解壓到 site-packages，各 wheel 的 `.data/scripts` 目錄保留輔助檔案，不生成命令列包裝器。其他安裝方案會被拒絕。本機目標檢查在清理暫存目錄後以及 macOS 簽名後驗證鎖定 wheel 的集合與版本，允許直譯器自帶的 pip，並檢查 Python 版本、Office 文件讀寫和依賴完整性，不寫入位元組碼。獨立 Node 可執行檔案獲得 V8 所需的 JIT 權限。跨目標執行和簽名安裝需要對應的釋出主機。`dev:desktop` 和 `start:desktop` 都會在啟動 Electron 前準備 `.desktop-build/targets/<target>/runtime/primary-runtime`；首次準備可能需要下載鎖定的依賴。準備未完成時，啟動命令不能報告成功退出。

| 決策 | 原因 | 直接結果 |
|---|---|---|
| 釋出身份 | 桌面殼 API、Web 用戶端、後端與外掛依賴圖作為一個組合完成驗證；獨立版本會產生未經驗證的組合，並讓更新可用性含糊不清。 | Electron 與 `@deepseek-ai/dsh` 始終使用同一精確版本。即使桌面殼程式碼不變，升級 dsh 也必須釋出新 Desktop 版本。 |
| 執行時 | 應用必須能夠在沒有系統 Node.js 或 pnpm 的機器上執行。 | dsh 透過設定 `ELECTRON_RUN_AS_NODE=1` 和 `--expose-internals` 的 Electron 執行，所有包操作都使用內建 pnpm。包管理器設定和 Host 環境遵循使用者設定。包腳本透過 `node` shell 啟動器轉發給 Electron。 |
| 包來源 | 即使離線，啟動時安裝核心依賴也會增加開銷。 | `app.asar/dsh` 攜帶完整生產依賴樹；profile 只安裝外部外掛。 |
| 狀態歸屬 | 共享可執行依賴圖會讓 CLI（命令列介面）與 Desktop 相互改變 dsh、Cordis、外掛或原生模組版本，而兩個桌面程序還可能爭用同一個 profile。 | Electron 在存取任何 profile 前取得程序生命週期單實例鎖，並獨佔 `$DSH_HOME/profiles/desktop` 及其包管理器狀態。CLI 與 Desktop 共享 `$DSH_HOME` 下受支援的產品資料，但絕不共享可執行包、外掛啟用、鎖檔案或 `node_modules`。 |
| 傳輸 | Web 服務與認證共享一套實作。 | Electron 載入打包的 Web 資源；Host 提供啟動注入和經過認證的 API。 |
| 外掛變更 | Desktop 與 Web 需要一致的安裝和啟用行為。 | 主應用使用共享 Web 外掛管理器和內建 pnpm。 |
| 更新 | 桌面殼與 dsh 獨立更新會重新產生版本分裂，而桌面殼未變化的資料塊不應強制完整傳輸。 | Electron 殼、匹配的 dsh 執行時與 pnpm 組成一個已簽名更新單元。平臺更新產物可以複用未變化的資料塊，但執行時版本選擇絕不脫離 Desktop 釋出。 |

[薄殼決策](../../.agents/notes/implemented/architecture/2026-09-10-desktop-web-wrapper.zh.md)負責共享 Web 行為與 Desktop 適應。[Electron 打包與更新決策](../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md)負責釋出身份、簽名及更新驗收。

Welcome 載入共享 Toast 的配色和陰影變數，掛載在 body 下的通知使用系統字型。

## 安裝歸屬

Electron 擁有 `$DSH_HOME/profiles/desktop`。其 `dependencies` 包含 pnpm 安裝的包；`dsh.profile.bundles` 包含內建 bundle，後接已啟用外掛。簽名應用從 `resources/app.asar/dsh` 提供 dsh、私有 Desktop Host 及其生產依賴。打包應用選擇 runtime profile 解析，不建立包連結；開發 profile 使用檔案系統連結。主機與外掛在同一個 Electron Node 模式程序中執行；Desktop 不啟用 `--preserve-symlinks`。CLI 不能啟動或修改此 profile。

未顯式設定 `DSH_HOME` 時，Claude Code Harness 在存取任何 profile 前選擇 `~/.cch` 作為 Harness 主目錄，並傳給 Desktop Host。DeepSeek Harness 安裝保留 `~/.dsh`，因此兩個應用絕不會啟動同一個桌面 profile。

應用 preload 只向 `dsh-app://app` 文件暴露啟動就緒、致命啟動失敗上報、原生目錄選擇、用於 composer 路徑引用的 `__DSH_HOST_PATHS__` 橋接和租約範圍內的 Browser 橋接。產品頁面還獲得 Desktop 標記、更新展示資料和開啟原生確認的操作，不能選擇安裝產物或授權安裝。外掛管理使用 Web 應用經過認證的 HTTP API；Electron 在 `dsh-app://shell/` 本地提供更新彈出視窗文件和資源，不依賴 Host 就緒。Electron 不提供外掛管理 IPC 或獨立管理頁面。任何渲染程序都不會獲得檔案系統存取、原始 Electron IPC、shell 或任意 pnpm 參數。

只有主應用視窗啟用 `<webview>`。guest 掛載必須匹配主程序簽發的租約和分割槽；guest 保持 sandbox、context isolation 和 Web security，不啟用 Node integration 或 guest preload。Browser IPC 監聽只為應用文件建立。[Sidebar Browser](../../packages/client/ui-sidebar-browser/README.zh.md) 說明儲存分組和 guest 限制；Host 授權驗證仍獨立於 URL 過濾而必需。

`dsh-app://shell/` 無需聯絡 Host 即可提供打包的更新文件、腳本和樣式。靜態請求保留 GET/HEAD、路徑範圍和 MIME 處理；每個更新文件繼續使用隔離 preload 和所屬視窗的 IPC 驗證。

產品 UI 保留 Web 操作，包括透過共享認證 HTTP 路由執行的“開啟方式…”。Desktop 使用 Web 的自動目錄選擇機制，並以共享 Web 範本的 bundle 列表初始化新 profile。

Electron 根據應用語言選擇型別化的英文或中文 shell 文案，並退回到英文。macOS 應用包透過 `CFBundleLocalizations` 宣告支援英語和繁體中文，讓 macOS 根據使用者的首選語言匹配初始應用語言。主介面仍優先使用已儲存的 Client UI 語言偏好。在 Windows 上，主文件的語言會更新桌面選單、恢復與更新提示。儲存庫 Client UI i18n 檢查覆蓋桌面端原始碼。

Windows 使用 40 DIP 頂欄，保留原生視窗按鈕，顏色隨應用調色盤同步。側欄開關旁的在地化“應用”和“編輯”入口開啟原生彈出選單。僅當應用框架釋出 shell overlay 席位後才掛載選單，啟動載入期間不顯示。“應用”提供檢查更新和退出；“編輯”向目前編輯器傳送對應按鍵，提供撤銷、重做、剪下、複製、貼上、刪除和全選，不受自定義快捷鍵繫結影響。外掛管理使用主應用的“外掛”頁面。按 Alt 不會出現額外的原生選單行。其他平臺保留原生選單。可編輯區域保留快捷鍵和不帶快捷鍵標註的右鍵選單；命令可用狀態由 Chromium 提供，選中的只讀文字提供“複製”命令。

macOS 上自定義選單保留 Electron 的標準 Window 選單及應用隱藏命令，包括 Minimize（⌘M）和 Hide（⌘H）。Linux 保留應用選單和 Edit 選單。

### 執行時與外掛啟用

簽名資源中的 `resources/app.asar/dsh/desktop-runtime.json` 繫結 shell 版本、Electron 的 Node 版本、平臺、架構、共享包版本和最終檔案清單。啟動讀取中繼資料，並檢查共享包記錄。釋出 schema、shell 版本、目標相容性和檔案完整性在打包時驗證。首次啟動不會把核心包複製到 profile 儲存或透過 pnpm 安裝核心包。

1. 主視窗在 profile 準備或後端啟動前，從打包靜態資源於螢幕外載入共享 Web 載入頁。共享 profile 初始化建立缺失的 manifest、空使用者 patch 與 pnpm workspace 檔案，不覆蓋現有檔案。
2. 啟動 Host 前，Desktop 驗證執行時描述符並準備 profile，不改動已安裝的包、依賴宣告與鎖檔案；只刪除早期 Link 後端啟動寫下的 `.dsh-module-fallback` 投影，啟動從不執行 pnpm。profile 內的包保持原生優先順序，本體包名透過 runtime resolution 解析（[查詢順序](../../.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.zh.md)；[清理移除](../../.agents/notes/implemented/simplification/2026-09-19-remove-desktop-profile-core-cleanup.zh.md)）。
3. Electron 的 Node 版本、平臺或架構變化時保留已安裝外掛。原生相容性問題在載入時報錯，可透過 pnpm 修復。
4. 主應用的“外掛”頁面透過共享[外掛管理器](../../packages/boot/plugin-manager/README.zh.md)操作 Desktop profile。包操作使用內建 pnpm 及正常的使用者和 profile 設定。
5. 共享管理器負責安裝錯誤、啟用和重新啟動要求。即使 Host 無法啟動，原生恢復仍可停用第三方 bundle。

[Web 外掛 UI](../../packages/client/ui-plugin-manager/README.zh.md)負責管理介面。Desktop profile 初始化和恢復保留已安裝外掛檔案。

主視窗建立、主文件載入、preload、渲染器、Web 初始化或後端的致命失敗，會在每個應用程序中開啟一次原生恢復對話方塊。對話方塊顯示首次錯誤末尾的限長摘要，標明截斷情況，並提供退出、重新啟動、停用第三方外掛、備份 profile patch 並重新啟動。啟動失敗保留 Web 載入頁和動畫；執行中失敗保留目前頁面。預期關閉、取消導航和普通請求錯誤不會觸發恢復。共享 Web 外掛管理器報告包操作錯誤；外掛變更後的 Host 啟動失敗會進入原生恢復。不透過啟動超時推斷故障。 包含 `listen EADDRINUSE` 的監聽失敗以退出其他正在執行的 DSH 實例的提示替代診斷和重灌建議，僅提供退出和重新啟動。

原生彈出視窗詳情最多包含 1,200 個 UTF-16 程式碼單元和八行診斷，若已寫入下述崩潰報告則附上其路徑。Host 錯誤診斷僅保留 stderr 輸出的最後 64 Ki 個字元。更早的輸出會被丟棄，避免長期執行的 Host 使殼的診斷緩衝區無限增長。

首個致命彈出視窗開啟前，Electron 會向平臺日誌目錄（`app.getPath('logs')`：macOS 為 `~/Library/Logs/DeepSeek Harness`，Windows 與 Linux 為應用 `userData` 目錄下的 `logs`）寫入一份崩潰報告，最多等待寫入一秒；寫入緩慢或失敗時彈出視窗不帶路徑。檔案 `crash-<UTC 時間>-<source>.log` 記錄來源（`host` 為 Host 退出、`web-boot` 為渲染程序啟動失敗、`renderer` 為渲染程序或文件失敗、`main` 為殼自身錯誤）、後端是否已就緒、應用與執行時版本、包含可列舉屬性與 cause 鏈的錯誤（截至 256 KiB）、Host 在退出前透過 IPC 報告啟動失敗時自己的 inspect 錯誤（最多 64 KiB），以及主視窗最近的 error 級 console 輸出（最多 64 KiB）。因此 Host 退出報告包含保留的 stderr 尾部，其中可能含有外掛輸出。關閉過程中的致命失敗只寫報告、不彈出視窗。平臺支援時檔案僅所有者可讀；啟動時保留最新十份報告並刪除更早的，不觸碰目錄中的其他檔案。

恢復操作等待 Host 關閉後才修改外掛啟用狀態。原生恢復操作在 profile 事務鎖內呼叫共享 app-boot 恢複函式。它停用第三方 bundle，並將 profile 的 `cordis.patch.yml` 重新命名為 `cordis.patch.yml.bak-<timestamp>`（重名時追加序號），無需解析；下次啟動建立空 patch。已安裝檔和已有備份保留。home 級 patch 不變。Electron 控制檯記錄備份路徑（或原檔案不存在）以及 home 級 patch 未修改。profile 資料無效、重新命名失敗或寫入失敗會作為恢復操作錯誤報告；已完成的修改保留，Desktop 不會假裝恢復成功後重新啟動。Desktop 不提供 profile 重置操作或應急 HTML 文件。

## 開發

開發環境應用選單提供“重新整理頁面”（macOS 為 Cmd+R，其他平臺為 Ctrl+R）和“重新啟動應用與 Host”。重新啟動會等待 Host 關閉，再重新啟動 Electron 和新的 Host；這兩項操作都不會重新建置原始碼。

`dev:desktop` 會建置目前 Host、用戶端 bundle、Web 前端和 Electron 殼，把已建置的 CLI 包、私有 Desktop Host 包及其 workspace 依賴投影為一次性桌面 npm 專案，然後直接啟動 Electron；這條路徑不從 npm 解析 dsh：

```sh
pnpm run dev:desktop
```

開發 Harness 狀態預設寫入 `apps/desktop/.desktop-build/development/home`，一次性 npm 專案位於 `apps/desktop/.desktop-build/development/project`，Electron 瀏覽器資料則位於 `apps/desktop/.desktop-build/development/electron-user-data`。因此，工作階段、設定、憑證、包連結和瀏覽器資料都不會進入使用者正常使用的 Harness home；顯式 `DSH_HOME` 只會替換開發 Harness home。Renderer DevTools 預設自動開啟，Main、Renderer 和 dsh Host 除錯埠依次為 9229、9222 和 9230。`DSH_DESKTOP_MAIN_INSPECT_PORT`、`DSH_DESKTOP_RENDERER_DEBUG_PORT` 與 `DSH_DESKTOP_HOST_INSPECT_PORT` 可以替換這些埠，`DSH_DESKTOP_OPEN_DEVTOOLS=0` 則保持 Renderer 除錯視窗關閉。

顯式建置完成後，`start:desktop` 會重新生成一次性專案，並跳過建置直接啟動已有產物：

```sh
pnpm run start:desktop
```

Web 側的對應命令是 `pnpm run dev:web` 與 `pnpm run start:web`，見[開發指南](../../docs/development.zh.md)。Workspace 開發使用 Electron RunAsNode 執行目前 CLI 與私有 Desktop Host 包，外掛管理和恢復使用 `$DSH_HOME/profiles/desktop`，與一次性工作區執行時分離。Host 在開發與打包建置中都使用 runtime 模組解析，不建立官方包的 fallback 連結；開發者安裝的包（包括連結）保留原生優先順序。需要驗證 Electron RunAsNode、內建 pnpm、內建 dsh 資源、外掛安裝和修復時，應執行未封裝安裝器的應用目錄。

[原生輸入與渲染程序鍵盤測試](tests/keyboard.spec.ts)在[獨立的 Client 測試專案](../../tsconfig.desktop-keyboard-tests.json)中編譯，由儲存庫 Client 型別檢查納入。它只匯入不依賴 Cordis 的 Desktop 輸入、持久化、IPC、瀏覽器 guest 和蒙層模組。

### 啟動引導

API Key 輸入框初始為空，並透過 `autocomplete="new-password"` 請求 Chromium 不要自動填入已儲存的登入密碼。

重複啟動和 `dsh://open` 會保持工作區隱藏，直到啟動憑證檢查或歡迎頁操作允許進入。從 Welcome 進入時，鍵盤焦點落在文件上，不選中側邊欄控制元件；Tab 導航仍可使用。

Desktop 在 Host 啟動後、開啟工作區前檢查模型 API Key 引用是否已設定。沒有已設定的金鑰時，歡迎視窗提供 [API Key 頁面](https://www.figma.com/design/jRBBK7zBgcszdVWQ0Fh5J8/Harness?node-id=2138-44626)。“儲存並繼續”透過現有憑證服務寫入 DeepSeek 官方提供者設定的引用，然後開啟工作區。“稍後設定”開啟工作區，但不儲存草稿或完成標記；下次程序啟動時會重新檢查憑證。“返回登入”回到入口並清空未儲存的金鑰和驗證提示。儲存或開啟工作區期間，按鈕保持原文案並停用競爭操作。Desktop preload 標記使 Web 憑證彈出視窗不再顯示，同時保留模型設定頁和歡迎須知。

當 profile 註冊了 Claude Code 模型路由時，Desktop 改為檢查五個程式設計 CLI 的登入狀態：Claude Code、Codex、Antigravity、Grok 與 OpenCode。登入任何 CLI 都不是必需的。任一 CLI 已登入時開啟工作區；否則歡迎視窗顯示 CLI 檢視，其中沒有帳號頁和 API Key 頁，並把每個 CLI 標為已登入、未登入或未安裝。Claude Code 使用執行時 Agent SDK 附帶的 CLI 執行 `claude auth status --json` 與 `claude auth login --claudeai`，並像該路由一樣移除憑證類名稱與 `DSH_` 變數；其登入可接收貼上的授權碼。其他 CLI 從 PATH 與常見安裝目錄（`/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin`，以及 `~/.grok/bin` 等各 CLI 目錄）查詢，並移除 `DSH_` 變數。Codex 讀取 `codex login status`，用 `codex login` 登入；Grok 讀取 `~/.grok/auth.json`，用 `grok login --oauth` 登入；兩者在瀏覽器中完成。Antigravity（`agy`）讀取 `~/.gemini/jetski-standalone-oauth-token`，OpenCode 讀取 `opencode auth list --format json`；它們的登入是互動式的，因此 Desktop 在新終端視窗中開啟（macOS 為 Terminal，Windows 為 `cmd.exe`，Linux 為 `x-terminal-emulator`），檢視提示使用者完成後重新檢查。“取消”停止瀏覽器登入，“重新檢查”再次檢查狀態，“繼續”或“稍後設定”開啟工作區。關閉視窗會停止正在進行的瀏覽器登入。登入 Claude Code 以外的 CLI 不會改變新 Session 使用的模型路由。

歡迎視窗在顯示前讀取共享的 `locale.preference`。使用者明確選擇的英文或中文優先；否則 Desktop 按系統語言順序匹配支援的語言，並以英文後備。主介面在掛載前透過隔離 preload 讀取同一偏好和系統語言順序。在設定中切換語言會更新桌面殼的目前詞典和選單；自動選擇不會寫入偏好。歡迎視窗不提供語言切換入口。

等待瀏覽器登入時，歡迎頁提供目前待授權請求的連結複製入口、載入指示和取消操作；剪貼簿寫入失敗後可以重試複製，複製結果提示在兩秒後恢復；已複製狀態下連結停用，恢復後可再次點選。Welcome 文字使用 Montserrat Light 並退回到系統字型，底部大按鈕保留系統字型，文字按鈕使用 Montserrat Light。英文歡迎正文及產品名均為 24px，中文歡迎正文為 24px、產品名為 26px。登入操作按鈕寬 240px，文字為 14px。授權狀態標題使用 20px Montserrat Regular 字重。API Key 頁的標題為 20px，返回操作為 14px，次級按鈕底邊距視窗底部 84px。

### 歡迎視窗外觀

歡迎視窗使用設計稿的 Platform light/dark 顏色跟隨系統外觀，展示 600 × 700 的[入口布局](https://www.figma.com/design/jRBBK7zBgcszdVWQ0Fh5J8/Harness?node-id=2121-39334)和 API Key 表單，包含原生視窗控制元件、可拖曳標題區域、本地品牌 SVG、系統無襯線字型退回，以及非按鈕文字使用的本地 Montserrat Light 字型。視窗使用 macOS menu vibrancy 或 Windows acrylic，疊加 onboarding 的視窗背景色：淺色模式為 40% 白色，深色模式為 50% rgb(24 25 28)。本地 React 歡迎入口將 React、公共 `StateDot` 載入指示器及其 CSS 一起打包；它透過隔離 preload 工作，不載入主 Web 應用。入口、登入狀態和 API Key 頁面共用固定的底部操作行；“返回登入”連結位於操作行下方。按鈕共用平臺的過渡時序，開啟“減少動態效果”會停用過渡。作業系統控制模糊強度和外部圓角。macOS 的“降低透明度”會抑制半透明效果，“增強對比度”會強制開啟該設定。“儲存並繼續”寫入開發環境的憑證儲存；“稍後設定”開啟真實工作區，不儲存金鑰或完成標記。生成的開發專案同時連結已宣告的 workspace 依賴閉包和 pnpm 提升的包，因此未提升的設定外掛仍能解析。[視窗記錄](../../.agents/notes/implemented/architecture/2026-09-08-desktop-welcome-window-material.zh.md)負責材質與引導決策。

## 打包

<a id="release-versions"></a>

### 釋出版本

每次 Desktop 打包前，第一步都要與目前使用者確認完整版本號。檢查所選部署環境、dsh 基礎版本、保留的釋出記錄和已釋出物件，再提出準確版本供使用者確認。使用者確認前不得啟動打包；僅選擇部署環境不代表使用者已認可版本號。

記錄目前 dsh 版本作為基礎版本。production Desktop 使用完全相同的版本，包括其中的 `alpha`、`beta` 或 `rc` 標識。test 釋出保留完整的預釋出基礎版本並追加 `.YYYYMMDD.index`；穩定基礎版本則追加 `-test.YYYYMMDD.index`。

| dsh 基礎版本 | production Desktop | test Desktop 範例 |
|---|---|---|
| `0.1.6-alpha.1` | `0.1.6-alpha.1` | `0.1.6-alpha.1.20260916.1` |
| `0.1.6-beta.2` | `0.1.6-beta.2` | `0.1.6-beta.2.20260916.1` |
| `0.1.6-rc.3` | `0.1.6-rc.3` | `0.1.6-rc.3.20260916.1` |
| `0.1.6` | `0.1.6` | `0.1.6-test.20260916.1` |

日期使用實際建立時的 Asia/Shanghai 日期。每個基礎版本、每天的序號從 1 開始，檢查保留的釋出記錄與已釋出物件後遞增；絕不復用已釋出版本。test 分發不釋出對應的無字尾基礎版本。

把確認後的版本透過 `--build-version` 傳給打包命令，該值同時決定產物檔名、更新 feed 與上傳驗證。清單保留產品版本，因此 test 打包不再改寫釋出家族，也不留下需要還原的改動：

```sh
pnpm --dir apps/desktop run package:win:x64 --build-version 0.1.6-alpha.1.20260916.1
```

`--build-version auto` 會給出當天的下一個序號：讀取目標 bucket 中已釋出的物件，未設定 bucket 或列舉未能在期限內完成時退回到本目標的本地輸出目錄。上傳前請確認它列印的版本號；run script 會自行直接傳遞 `--`，打包入口兩種寫法都接受。

production 釋出使用產品版本本身，不傳 `--build-version`。其上傳成功後會把打包所用 commit 打成 `desktop-v<版本>` 標籤；來自有改動工作區的建置不打標籤，打標籤失敗也只列印手工命令，不會讓已完成的上傳變成失敗。test 與本地建置有意不留標籤，而所有產物的清單都記錄 `dshBuildCommit` 與 `dshBuildDirty`，直接分發的建置同樣可溯源。

版本派生不改變固定更新通道，也不改變 `nightly.yml` / `nightly-mac.yml` 檔名。SemVer 排序為 `0.1.6-alpha.1 < 0.1.6-alpha.1.20260916.1 < 0.1.6-alpha.2`，穩定基礎版本的測試版低於該穩定版。用戶端只接受更高版本：替換 feed 無法讓已安裝的較高版本更新到較低的糾正版。這類用戶端需要手動安裝；保持自動降級關閉。[版本決策](../../.agents/notes/implemented/process/2026-09-16-desktop-release-version-derivation.zh.md)解釋為什麼不能用通道名替換預釋出標識。

打包、上傳以及手動 macOS 簽名檢查使用 `apps/desktop/.env.windows` 或 `.env.macos`，由目標平臺選擇。複製對應的 [Windows 範本](.env.windows.example) 或 [macOS 範本](.env.macos.example)，填寫本機設定；Git 忽略這兩個本地檔案，安裝產物也不包含它們。釋出欄位只從目標檔案讀取，不退回到系統或 shell 中的同名變數；`PATH`、代理和建置工具環境仍保留。釋出版本是命令參數而非釋出欄位，上傳從打包寫下的完成記錄中讀取它。檔案使用 UTF-8，支援 BOM；相對憑證、SignTool、Apple API Key 和鑰匙串路徑以 `apps/desktop` 為基準，變數值不做 shell 展開，包含 `#` 或空格的密碼需要引號。CI 同樣在執行前生成目標檔案。

每條打包命令在建置與下載前檢查應用 ID、更新地址和該模式需要的簽名設定，隨後探測本次執行要用的外部工具：歸檔讀取工具，以及 Windows 目標的安裝器編譯器。macOS 檢查身份、Team ID、一套完整公證憑證、`CSC_LINK` 指定的可讀本地 p12 檔案、顯式設定的 `CSC_KEY_PASSWORD`，以及引用的 API Key 和鑰匙串檔案；Windows 檢查公開程式碼簽名憑證、SignTool 檔案、容器名稱和 PIN 格式。僅準備 Windows 資源或顯式未簽名打包不要求籤名憑證。設定檢查不驗證 PIN 是否正確、Token 是否登入、鑰匙串是否解鎖或 Apple 是否接受憑證；實際簽名與公證負責這些檢查。`--build-version auto` 會存取目標 bucket，`--check` 下同樣如此。單獨執行相同檢查：

```sh
pnpm --dir apps/desktop run check:package
```

無需提前執行 `prepare:desktop`：

```sh
pnpm run package:desktop
```

釋出自動化使用固定目標命令，確保執行時準備、dsh 準備與 electron-builder 接收相同的平臺和架構：

```sh
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:mac:x64
pnpm run package:desktop:win:x64
```

macOS arm64 命令要求 Apple Silicon。macOS x64 命令可以在 Intel macOS 或帶 Rosetta 的 Apple Silicon 上執行。Windows x64 命令要求 Windows x64。Linux 不是受支援的 Desktop 釋出目標。

每個目標都在 `apps/desktop/.desktop-build/targets/<target>/` 下持有自己的打包輸入、已準備執行時、包集合、dsh 依賴樹、pnpm 準備狀態、未打包應用、更新中繼資料和最終產物。Electron 歸檔快取繼續由 `.desktop-build/downloads` 共享，因為每個歸檔檔名都包含版本、平臺和架構，並且在解包前經過驗證。目標建置絕不讀取其他目標的可變準備狀態。

### 執行時檔案篩選

Desktop 在本地打包工作區包，並透過目標捆綁的 Node 和 pnpm 安裝外部依賴。[Desktop 檔案策略](scripts/runtime-file-policy.ts)隨後在簽名和完整性封裝前過濾不可變的 `resources/app.asar/dsh/node_modules` 副本。它排除 TypeScript 宣告、已識別的 JavaScript/CSS/TypeScript source map、TypeScript 建置快取、Domino 測試目錄、選定的原生編譯器輸出和其他平臺的 node-pty 預建置檔案。它保留執行時 JavaScript、原生模組及其 DLL/EXE 輔助檔案、WASM、未知資源、許可證和 notices。依賴清單在完整性封裝前經過 electron-builder 的中繼資料清理，確保歸檔保持已記錄的位元組。該策略不修改 npm tarball、捆綁的包管理器或使用者安裝的外掛檔案。

[Office 轉換提供者](../../packages/document/office-to-pdf/README.zh.md)攜帶目標已宣告的原生引擎；kit 未宣告匹配原生目標時攜帶 WASM 引擎。準備階段在打包前拒絕缺少目標引擎的情況。完整 Office 依賴（CLI、JavaScript 庫和選定引擎的可執行檔案、資料、許可證及 notices）解包到 `resources/app.asar.unpacked/dsh/node_modules/` 下。Desktop Host 將引擎清單解析到這些物理目錄，並向載入的技能提供獨立 Node 和解包後 CLI 的絕對路徑。Node 位於 `resources/runtime/primary-runtime/dependencies/node/bin/`；CLI 位於解包後的 `@deepseek-ai/libreoffice-kit/lib/cli.js`。macOS 上的原生輔助程式獲得 [LibreOffice UNO 橋](https://github.com/LibreOffice/core/blob/master/sysui/desktop/macosx/hardened_runtime.xcent.in)所需的 JIT entitlement。

打包應用執行編譯後的 JavaScript 和預生成的 Typert 中繼資料，不編譯 TypeScript 外掛。原始碼級除錯導航和編輯器宣告仍可從開發包中取得。[複製規則測試](tests/runtime-file-policy.spec.ts)覆蓋排除項和保留資源；[產物 smoke](tests/fixtures/runtime-payload-smoke.mjs) 在 Host smoke 和最終清單驗證之前，使用 Electron RunAsNode 執行。產物 smoke 解析搜尋工具使用的 ripgrep 可執行檔案，並驗證文字搜尋和檔案列舉。Windows 簽名建置在依賴簽名後執行這些檢查；其他建置在 `prepare:dsh` 中執行。[Host smoke](scripts/smoke-runtime.ts) 使用捆綁的 Python 建立 DOCX、XLSX 和 PPTX 輸入，透過真實 Office 提供者逐一轉換並檢查 PDF 輸出。每個組裝後的應用（包括目錄包和 Windows 未簽名建置）都會針對 ASAR 重複產物和 Host 檢查。歸檔完整性檢查將歸檔內完整描述符與準備結果比對，並核對歸檔和解包目錄中的檔案內容與清單、歸檔內檔案記錄的執行標誌，以及解包檔案的物理權限。轉換失敗會在寫入釋出記錄前終止打包；macOS DMG/ZIP 建置在公證前執行這些檢查。

Windows 釋出驗收還需在 Desktop 建置後手動執行[目錄和替換檢查](scripts/smoke-windows.ps1)。將 `$Makensis`、`$SevenZip` 和 `$PluginDir` 分別設為鎖定版本建置器的 NSIS 編譯器、7-Zip 可執行檔案和 x86-unicode NSIS 外掛目錄；透過 `-FrameLibrary` 傳入已準備好的 `window-frame.dll`，即可同時覆蓋原生解壓路徑及其失敗報告。從儲存庫根目錄執行以下命令。它驗證 目錄替換與復原和兩種檔案佔用替換方式；不屬於單元測試通道。

```powershell
pwsh -NoProfile -File apps/desktop/scripts/smoke-windows.ps1 -Makensis $Makensis -SevenZip $SevenZip -PluginDir $PluginDir -FrameLibrary apps/desktop/.desktop-build/targets/win-x64/installer-ui/window-frame.dll
```

Windows 安裝器在啟動時和選定目標目錄後檢查應用是否正在執行，透過檢查後才將新版本解壓到安裝目錄旁邊。透過同卷目錄改名替換前，安裝器會再次檢查。執行中的應用會阻止安裝；更新啟動允許等待應用退出，最長十秒。同路徑升級在替換成功前保留舊目錄；解壓失敗時舊版不變，替換失敗時嘗試恢復舊目錄。安裝器在啟動前清理舊版備份。強制結束安裝器或斷電可能留下 `.new-*` 或 `.old-*` 目錄；不同安裝位置或安裝範圍遷移仍使用 electron-builder 的舊解除安裝器流程。

解壓失敗時，安裝器會把 7-Zip 的結果和完整錯誤輸出寫入更新快取目錄 `%LOCALAPPDATA%\<按包名派生>-updater\installer-logs\extract-failure-<時間戳>.log`（目前為 `@deepseek-aidsh-desktop-updater`），並在彈出視窗中顯示首條錯誤行和 **複製錯誤資訊** 按鈕；靜默安裝只寫入報告。未簽名的 Windows 建置（`DSH_DESKTOP_UNSIGNED=1`）會將安裝檔命名為 `deepseek-harness-<版本>-win-x64-unsigned.exe`，以免被誤當作釋出產物。

<a id="upload-updates"></a>

### 上傳更新

test 與 production 的 `upload:*` 上傳在釋出前置檢查透過後，分別保留新的 `.desktop-build/upload-records/<environment>-<target>-*` 目錄。`plan.json` 記錄目標、版本、每個檔案的大小/SHA-512 和釋出的 YAML 位元組；刷盤的 `events.jsonl` 記錄 PUT 意圖及可用的回應狀態/請求 ID；`result.json` 記錄完成結果或最後失敗階段。缺少最終結果表示中斷或儲存不可用，不表示成功。不記錄憑證值、認證頭或原始 SDK 錯誤。審計寫入失敗即停止後續 PUT。每個物件都以一次流式騰訊 COS PUT 上傳，並攜帶顯式長度與 Content-MD5；COS SDK 僅在請求體不是流時才會重發請求，上傳器自身也不重試。保留部分記錄，檢查遠端狀態後再執行下一次操作：超時或回執寫入失敗不能證明物件未儲存。這些記錄僅在本地，不防篡改，也不會自動備份；每次釋出應將它們與建置證據一同歸檔到受控儲存。公網 CDN 回讀仍是單獨的釋出驗收，上傳結果明確標記為 `not-performed`。

Windows 操作人員可以在儲存庫外儲存 CLIXML 物件，其中 `SecretId` 和 `SecretKey` 是經 DPAPI 加密的 SecureString 欄位。[憑證啟動器](scripts/upload-with-credentials.ps1)要求顯式提供 `-CredentialFile` 和 `-Environment production` 或 `test`；不指定 `-Upload` 時，只驗證解密以及向本地 Node 子程序注入憑證，不發起網路請求。它要求 `PATH` 中有 Node，並使用加密該檔案時的 Windows 使用者和機器。明文、空欄位及純空白欄位都會失敗。父程序環境保持不變；子程序先清除無關金鑰與 Node 預載入選項，再僅接收所選 COS 憑證對。原始子程序 stderr 不會顯示，stdout 中的憑證值會被遮蓋。此檢查不能證明 COS 授權有效。顯式上傳還要求 `-Upload -Target <target> -Bucket <bucket>` 及下述常規釋出完成前提；真實雲端上傳仍需釋出操作人員驗收。此啟動器支援長期金鑰，不支援 STS 憑證。顯式上傳要求所選部署環境和 bucket 與目標 dotenv 檔案及已完成的打包記錄一致，才會發起網路寫入；即使 dotenv 檔案含有其他 COS 金鑰，也使用 DPAPI 憑證對。

`DSH_DESKTOP_AUTO_UPDATE_ENV` 同時選擇打包寫入的 URL 與後續 COS 上傳環境，可取 `test` 或 `production`；預設為 `test`。測試打包透過 `DOWNLOAD_TEST_ORIGIN` 提供 HTTPS origin；生產使用 `https://download.deepseek.com`。上傳透過 `DOWNLOAD_TEST_COS_BUCKET` 或 `DOWNLOAD_PROD_COS_BUCKET` 提供所選 bucket。生產清單位於 `dsh-desk/feeds/<target>/`，安裝檔位於 `dsh-desk/bin/<target>/`。測試釋出必須設定 `DOWNLOAD_TEST_RELEASE_ID`：32 位小寫十六進位制字元，分別插入路徑 `dsh-desk/<release-id>/feeds/<target>/` 和 `dsh-desk/<release-id>/bin/<target>/`。YAML 引用、穩定通道別名和 blockmap 都位於該釋出目錄內。目標為 `mac-arm64`、`mac-x64` 和 `win-x64`。

更新目標與上傳憑證都與所選環境對應：

| 環境 | 公開 origin | COS bucket | COS 憑證 |
|---|---|---|---|
| `test` 或未設定 | `DOWNLOAD_TEST_ORIGIN` | `DOWNLOAD_TEST_COS_BUCKET` | `DOWNLOAD_TEST_COS_SECRET_ID`、`DOWNLOAD_TEST_COS_SECRET_KEY` |
| `production` | `https://download.deepseek.com` | `DOWNLOAD_PROD_COS_BUCKET` | `DOWNLOAD_PROD_COS_SECRET_ID`、`DOWNLOAD_PROD_COS_SECRET_KEY` |

每個測試釋出批次用下方命令生成新 ID，將輸出填入 `.env.macos` 或 `.env.windows` 的 `DOWNLOAD_TEST_RELEASE_ID`。這兩個被 Git 忽略的平臺檔案管理該值，shell 變數不能覆蓋它，dotenv 值也不會進行 shell 展開。打包、上傳和重試必須沿用同一個 ID；上傳會拒絕更新 URL 不一致的完成記錄。需要驗證跨版本升級時，後續版本沿用已安裝用戶端的 ID。生產環境不使用該欄位。

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(16).toString('hex'))"
```

透過完整下載連結分發每個測試批次。已安裝的測試用戶端保留目前批次的清單地址，不會自動發現新 ID。格式驗證無法判斷隨機性，請使用生成器的輸出。隨機路徑降低被猜中的機率，不限制持有連結者存取；撤下批次需要刪除其 COS 物件並清除對應 CDN 目錄快取。

在目標 `.env` 中設定更新地址與所選 COS bucket、SecretId、SecretKey，再打包並上傳同一個目標：

```sh
pnpm run package:desktop:mac:arm64
pnpm run upload:mac:arm64
```

內測打包在目標 `.env` 中顯式設定 `DSH_DESKTOP_AUTO_UPDATE_ENV=test` 和 `DOWNLOAD_TEST_ORIGIN=https://download-test.deepseek.com`；上傳使用 `DOWNLOAD_TEST_COS_BUCKET=bj-toc-download-test-1320056602` 及獨立測試憑證。test 和 production 都使用固定 Nightly 通道，部署選擇不提供通道切換。

前期內測包使用 `test` 部署。只有正式釋出才顯式選擇 `production`；更換上傳憑證不會改變已有安裝檔的更新目標。打包不需要 COS 憑證，會停用 electron-builder 釋出、移除子程序的 COS 憑證，並且僅在簽名與公證成功後記錄完成狀態。上傳在讀取憑證前驗證該記錄、部署、目標、共同版本號、檔名、大小與 SHA-512。安裝檔和 blockmap 先於 YAML 上傳；歷史物件繼續保留。每個版本釋出 `nightly.yml` 或 `nightly-mac.yml`；穩定版本還發布指向相同產物的 `latest.yml` 或 `latest-mac.yml`。釋出的 YAML 使用安裝檔絕對 URL。上傳器不設定 Cache-Control，包括 COS SDK 否則會新增的空頭部：快取策略由部署基礎設施負責，清單不快取，安裝檔快取單獨設定。同一目標應序列釋出，並在釋出驗收前驗證公網產物與清單內容。

macOS 設定使用必填發布環境，不會接受鑰匙串中最先發現的憑證。空值、格式錯誤的 Team ID、包含 electron-builder 不支援的 `Developer ID Application:` 字首的簽名身份，以及不完整的公證憑證都會被拒絕。macOS 打包要求已設定的身份及其私鑰可用。執行時準備會把該身份、安全時間戳與 hardened runtime 應用到每個內嵌 Mach-O 檔案；應用簽名完成後，深度嚴格檢查會拒絕其他葉憑證 Authority 或 Team ID，驗證透過才生成釋出產物。macOS 固定目標安裝檔命令為已簽名應用建立獨立副本，並行執行兩條產物流。一路先公證 App 並釘票，再生成 ZIP 及其更新中繼資料。另一路把已簽名 App 副本封裝進簽名 DMG，再公證 DMG、釘票並驗證；其中的 App 不單獨附加票據。只有兩路均成功結束，產物才會移入最終目錄並寫入釋出完成記錄。僅生成目錄的命令同樣需要公證憑證，並等待 Apple 公證和 App 釘票完成。[並行公證決策](../../.agents/notes/implemented/process/2026-09-09-parallel-macos-notarization.zh.md)負責副本隔離與容器票據語義。`CSC_LINK` 必須指向包含 Developer ID Application 憑證及私鑰的本地 p12，不支援 URL 或 Base64 輸入。`CSC_KEY_PASSWORD` 是其匯出密碼，不是 Apple 帳號或登入密碼；未加密的 p12 可顯式填寫空值。建置前，打包流程自動建立並解鎖私有臨時鑰匙串、匯入 p12、授權簽名並簽署小型探針。執行時與 App 簽名顯式使用該鑰匙串，無需預先設定或手動解鎖登入鑰匙串。子程序只接收鑰匙串路徑，不接收 p12 密碼。成功或普通失敗後刪除臨時鑰匙串；強制終止後由 CI 清理臨時憑證。CI 從金鑰儲存生成憑證檔案和 `.env.macos`，限制檔案存取權限，並在作業結束後刪除二者。環境中的 `CSC_NAME` 與憑證發現順序都不能選擇釋出所有者。公證憑證也可以使用 electron-builder 支援的完整 Apple ID 或鑰匙串 profile 方式。手動執行 `pnpm --dir apps/desktop run verify:mac-signature -- <path-to-app>` 重複應用檢查時，也必須提供兩個 macOS 身份變數。

macOS 簽名遍歷真實檔案，不跟隨 Framework 的軟連結別名。PAK 資源保留全部隨附語言，由外層 Framework 或應用簽名記錄完整性，不逐個簽名。[釋出策略](../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md)負責依賴補丁和驗證要求。

macOS 執行時準備將已驗證的單架構 Mach-O 簽名快取在 `.desktop-build/targets/<target>/signature-cache`。快取鍵包含輸入位元組與權限、簽名探針實際使用的葉憑證、簽名標識、entitlement 位元組、macOS 版本，以及簽名工具與策略。複用不取決於 Git 提交：未提交的位元組變更會使對應檔案失效。每次命中都驗證快取位元組、嚴格簽名、憑證、標識、entitlements、安全時間戳和 hardened runtime，再替換未被並行修改的輸入。通用二進位制每次重新簽名。執行時完整性與 smoke 檢查、App 簽名和 Apple 公證仍會執行。快取要求受信任的本地建置儲存。快取損壞或不安全連結會令建置失敗；停止打包後刪除對應快取目錄再重試。成功的簽名階段會將完整快取條目的內容總量裁剪至一 GiB；中斷留下的臨時條目需手動清理。並行淘汰可能使讀取方安全失敗。日誌記錄命中、未命中及未快取數量。

Mac 打包命令透過 `DESKTOP_PACKAGING_RECORD` 輸出 `apps/desktop/.desktop-build/packaging-runs/` 下的唯一目錄。讀取本地設定後，每次執行保留 `run.json`（釋出版本、產品版本、Git 提交、工作區是否有改動、目標及 Node 版本）、`events.jsonl`（帶時間戳的階段、耗時、並行輸出歸屬及代理恢復狀態）、脫敏後的子程序 `stdout.log` / `stderr.log`，以及 `result.json`（整體結果、階段結果和產物目錄）。事件還記錄打包並行數及各代理是否設定。失敗和後續打包不會清除日誌；沒有自動刪除流程。缺少 `result.json` 表示完成狀態未經確認。已知憑證值會被遮蓋；不記錄環境變數全集或 notarytool 認證參數。執行時準備分別記錄包暫存、安裝、依賴樹複製、簽名、清單生成、smoke 檢查、描述檔案總和檢查碼清理。巢狀階段的耗時存在重疊，不能直接相加。

App 和 DMG 公證分別記錄 submission ID，以及獨立的 `notarytool:upload:*` 和 `notarytool:wait:*` 耗時。上傳使用 `submit --no-wait`，包含認證、本地驗證、傳輸和伺服器端受理，並非純傳輸時間。等待從該命令返回後開始，包含輪詢及剩餘的 Apple 處理時間；Apple 可能在上傳提交命令返回前已開始處理。日誌保留 Apple 狀態與診斷資訊，包括拒絕結果；簽名檢查、接受狀態總和檢查碼 stapling 仍由 `@electron/notarize` 負責。僅生成目錄的打包命令也使用同一條可計時的 App 公證路徑。各子程序輸出仍即時顯示在終端，階段失敗及巢狀錯誤保留在事件日誌中。兩個平臺均記錄父程序打包失敗，並在終端顯示脫敏診斷，包括代理恢復操作指引。僅檢查設定的 `check:package` 命令不建立執行日誌。

Mac 打包從 `.env.macos` 讀取三個調優欄位：

| 設定 | 預設值 | 作用範圍 |
|---|---|---|
| `DSH_DESKTOP_MACOS_PACK_CONCURRENCY` | `4` | 第一方與 vendor workspace tarball 的打包 worker 數；必須是正整數。 |
| `DSH_DESKTOP_MACOS_DOWNLOAD_PROXY` | 空 | Electron、執行時資源、pnpm 安裝及 builder 下載使用的 HTTP/HTTPS 代理 origin。 |
| `DSH_DESKTOP_MACOS_NOTARIZATION_PROXY` | 空 | 透過臨時系統代理設定供 Apple 工具使用的 HTTP 代理 origin。 |

兩個代理欄位互相獨立，拒絕 URL 中的憑證、路徑、查詢參數和片段。空值沿用繼承的網路設定。顯式下載代理會替換子程序的代理變數，僅繞過本地主機；它不修改系統設定。Windows 與獨立 `release:pack` 保持現有並行預設值。公司代理地址僅寫入 Git 忽略的本地檔案；具體地址參見內部文件。

Apple 工具使用 macOS 目前活動網路服務的 HTTP/HTTPS 代理。設定公證代理後，打包會檢查代理可達性、儲存該服務的設定，在兩條產物任務期間啟用代理，並在兩條任務均結束後恢復原設定。對於原本關閉、伺服器為空且埠為零的代理，恢復時僅關閉代理；臨時伺服器和埠可能保留，但不生效。僅生成目錄的打包會在簽名目錄建置完成後的 App 公證期間啟用代理。這會臨時影響其他應用，並要求修改系統代理的權限；必須先停用 PAC、自動發現、SOCKS 及需要認證的代理設定。打包和恢復在讀取恢復記錄或修改代理前取得同一個使用者級 POSIX 檔案鎖；程序退出會釋放鎖的持有權，鎖檔案保留。該鎖在首次使用時才載入 `@deepseek-ai/node-addon-system/flock`，而不是在腳本啟動時載入，因此 `check:package` 和打包入口在未建置 `native/system` 的 checkout 上也能載入；加鎖時若主機 addon 二進位制或入口的 JavaScript 缺失，載入器會先執行 `pnpm run build:native-system` 和 `pnpm --dir native/system run build:ts` 再加鎖，因此恢復命令在這樣的 checkout 上同樣可用。這會阻止不同 checkout 的代理事務重疊；其他使用者及網路設定工具不得同時修改這些設定。SIGINT/SIGTERM 會等待活動任務結束後恢復。強制終止或恢復失敗後，先停止殘留公證程序，再執行 `pnpm --dir apps/desktop run restore:mac-proxy`；儲存的記錄會保留到恢復成功。設定檢查僅驗證 URL 語法，不修改系統設定或連線代理。

### 未簽名 Windows 測試安裝檔

在 Windows x64 上，使用完整的未簽名打包命令進行本地安裝測試：

```sh
pnpm run package:desktop:win:x64:unsigned
```

該命令要求設定 `DSH_DESKTOP_APP_ID` 並具備常規建置依賴，包括編譯原生模組所需的 Python 和 Visual C++ 建置工具。Python 不在 `PATH` 中時，將 `PYTHON` 設定為其可執行檔案路徑。命令將安裝檔寫入 `.desktop-build/targets/win-x64/unsigned-artifacts/`，省略自動更新設定，清除簽名憑證，且不生成釋出完成記錄。它不需要 EV 憑證或更新源地址。簽名打包和上傳命令仍遵循正式釋出要求。

### 未簽名 macOS 測試磁碟映像

在 Apple 晶片上，`pnpm run package:desktop:mac:arm64:unsigned` 無需 Apple Developer 憑證或公證即可建置臨時簽名（ad hoc）的 DMG 和 ZIP。由於 iCloud 桌面等同步資料夾會新增 `codesign` 拒絕的 Finder 中繼資料，命令在系統臨時目錄下的私有目錄中組裝、簽名並冒煙測試應用，然後將 DMG、ZIP 和 blockmap 複製到 `.desktop-build/targets/mac-arm64/unsigned-artifacts/`。Gatekeeper 會阻止下載副本的首次啟動；接收者需從 Finder 右鍵選單開啟，或在系統設定中允許。

### Windows 安裝介面

Windows 安裝程式使用原生 NSIS 頁面，提供亮暗配色、系統陰影、可編輯的安裝目錄，以及預設勾選立即啟動的完成頁。安裝僅面向目前使用者。點選安裝或按 Enter 均驗證目前路徑；新安裝位置必須為空，非空位置必須是已登記的安裝目錄。受影響安裝路徑中的程式執行時顯示系統提示，並保持應用執行；其他目錄中的同名應用不阻止安裝。靜默更新最多等待受影回應用退出十秒，若仍在執行則以結束代碼 2 結束。

主題在啟動時跟隨 Windows；可用 `/THEME=light`、`/THEME=dark` 和 `/THEME=auto` 顯式選擇配色。視窗在品牌控制元件準備完成後顯示。歡迎頁首次出現時，安裝視窗會一次性移到普通視窗前方；若焦點在其他視窗，工作列按鈕會閃爍提示，但安裝視窗不會始終置頂。進度讀取鎖定版本的 7-Zip 解壓器百分比；目錄替換、註冊和清理仍使用有界估算。加權百分比不代表剩餘時間。NSIS 報告成功後，進度條用 600 毫秒補滿並短暫顯示 100%，再顯示完成頁；切換目標時長為 750 毫秒。完成頁保留視窗位置。點選完成後，安裝程式先隱藏視窗，再啟動已安裝的可執行檔案；啟動失敗會恢復頁面以供重試。目錄替換和失敗恢復遵循上文描述的安裝流程。首次啟動的設定檔準備仍屬於獨立的 Desktop 操作。

Windows 打包使用 Visual C++ Build Tools 和 Windows SDK 編譯 x86 Win32/GDI+ 輔助庫；簽名建置透過已設定的 Windows 簽名器對該庫簽名。準備掛鉤在所有平臺上均由 electron-builder 繼續負責收集生產依賴。[安裝介面決策](../../.agents/notes/implemented/architecture/2026-09-10-windows-native-installer-pages.zh.md)記錄 NSIS 接入方式和釋出驗證要求。

在有互動式桌面的 Windows x64 上，從儲存庫根目錄執行 `pnpm --dir apps/desktop run test:installer`，可將小型原生測試載荷接入正式安裝設定並執行驗證。每次執行使用獨立產品身份，依次驗證僅英文和僅中文的安裝器變體，並根據實際顯示的歡迎頁按鈕選擇測試文案。兩個變體均安裝到私有目錄並在測試後解除安裝；截圖和結果保留在 `.desktop-build/installer-tests/` 下。檢查包含末尾帶分隔符的已登記路徑升級，以及磁碟根目錄拒絕。可選的 `--signed` 標誌使用下文的 Windows EV 設定，在嵌入前對測試程式和輔助庫簽名；它不會啟用更新源。

Windows 解除安裝程式會隨應用一起刪除 Electron 使用者資料目錄（`%APPDATA%` 下按包作用域巢狀的瀏覽器儲存與快取）、`%APPDATA%` 下的產品目錄，以及 `%LOCALAPPDATA%` 下的更新下載快取，隨後移除 `%APPDATA%` 之下普通且已空的作用域目錄。Harness 主目錄（`~/.dsh` 或 `DSH_HOME`：工作階段、設定、憑證、外掛）不會被觸碰；以 Windows 環境變數釋出的 `DSH_HOME` 還會保護所有與其重疊的目標。靜默解除安裝刪除相同的資料；以 `--updated` 或 `/KEEP_APP_DATA` 啟動的解除安裝程式保留資料，electron-builder 在原地更新和從其他目錄替換舊安裝時正是這樣啟動它。刪除透過原生輔助程式執行：它拒絕受保護的 Windows 目錄以及與安裝目錄或主目錄重疊的路徑，要求固定的本地驅動器，連結的根目錄或祖先目錄原樣保留，遇到重解析點只解除連結而不進入目標，清除只讀屬性，並在遇到被佔用檔案後繼續刪除其餘兄弟項；殘餘不會中止解除安裝，也不會提示。安裝時在 Windows 解除安裝註冊項上記錄 `InstallLocation` 作為標準的清單中繼資料；在 Windows 11 上，開始選單右鍵選單中的“解除安裝”對所有 Win32 應用都會開啟已安裝應用列表，只有 MSIX 包能從那裡直接解除安裝。解除安裝程式宣告 DPI 感知，中文使用微軟雅黑 UI。此行為僅適用於 Windows。

使用 `node apps/desktop/scripts/test-windows-installer.mjs --uninstall-only --compile-only` 以每次執行唯一的帶作用域包名編譯獨立的中英文夾具。省略 `--compile-only` 可對預置資料執行原生刪除器迴歸，以及互動、靜默、`--updated`、`/KEEP_APP_DATA` 和 `DSH_HOME` 位於 Electron 資料內的檢查。編譯本身不能證明已安裝解除安裝行為。

### Windows EV 簽名

執行時簽名在目前 Windows 帳戶的各 worktree 間共享完整的已簽名檔案。`.env.windows` 中的 `DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_DIR` 指定固定本地磁碟上的絕對目錄；預設值為 `%USERPROFILE%\.dsh-desktop-signing\signature-cache\v1`。快取目錄必須屬於目前帳戶，存取權限不得向其他普通帳戶開放；帶連結的路徑會被拒絕。快取項標識原始位元組、公鑰憑證和簽名工具鏈。每次恢復都檢查摘要、Windows 信任狀態、時間戳和憑證，再替換未簽名檔案；快取項無效會停止打包，不退回到硬體簽名。不會僅因快取較舊而重新簽名。快取信任同帳戶執行的程式，不防禦管理員。[執行時簽名快取決策](../../.agents/notes/implemented/process/2026-09-17-windows-runtime-signature-cache.zh.md)定義驗收要求和設計限制。

預檢、主要執行時簽名、應用執行時簽名和產物生成分別持有帳戶級簽名階段鎖，直到受監督的子程序結束。其他建置進入這些階段前等待；編譯和準備步驟不持鎖。執行時簽名程序自行持鎖，因此僅終止外層打包程序不會釋放仍在存取快取的階段鎖。遷移及維護取得同一把鎖；舊版或外部簽名命令不參與排隊，應另行避免並行。階段等待不計入預檢期限。關閉階段控制代碼會釋放普通競爭鎖，不刪除獨立的硬體嘗試互鎖；遺留硬體失敗仍需操作人員恢復。

快取命中的複製、摘要和逐檔案信任檢查使用 `.env.windows` 中的 `DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_CONCURRENCY` 個工作任務（預設 `4`，整數 `1`–`8`）。所有恢復及後置驗籤完成後，未命中項才進入序列硬體簽名。恢復或驗籤失敗會停止派發新任務，並在釋放階段鎖前等待在途工作結束；硬體簽名、執行時 smoke 檢查和最終完整性驗證仍須執行。

每個執行時階段向標準輸出及打包日誌寫入 `SIGNATURE_CACHE_SUMMARY`，包含實際目錄、策略標識、命中及未命中數、新發布及保留項數、簽名請求數、省去的簽名請求數和驗證失敗數。計時區分簽名、恢復檔案和新簽名檔案的信任驗證及恢復；恢復耗時包含其信任檢查和暫存清理。這些統計不包含預檢、最終產物簽名及外層執行時驗籤。階段鎖事件單獨記錄等待時間。 並行計時累加逐檔案工作耗時，不代表階段牆鍾時間。

使用 `pnpm --dir apps/desktop run cache:windows-signatures --usage` 檢視結構完整的快取項位元組數和數量，或用 `--from <absolute-old-cache>` 匯入顯式指定、屬於同帳戶的舊快取。遷移不修改源目錄，跳過暫存名稱，拒絕損壞項，並保留已有有效項，即使它們的時間戳位元組不同。`--clear` 在階段鎖保護下顯式刪除完整快取項；不執行自動容量淘汰。`--directory <absolute-cache>` 指定維護目標目錄，無需載入釋出憑證。不完整暫存項保持原狀並單獨計數；僅在所有建置停止後檢查它們。這些命令絕不清除硬體失敗證據。預設儲存位於 AppData 之外，避免 MSIX 啟動器虛擬化將帳戶快取拆開；被重定向的覆蓋目錄會明確失敗。

Windows 簽名建置在編譯或準備依賴前執行受監督的簽名預檢。靜態設定、憑證有效期、審計儲存、編譯器可用性及遺留簽名鎖的檢查不存取 Token。本地 .NET Framework C# 編譯器生成一個專用小探針，由正式簽名器僅簽名一次，隨後必須驗出設定的憑證和時間戳才能繼續建置。探針絕不執行。預檢的整體 60 秒期限包含時間戳嘗試；超時、硬體簽名報錯或驗籤失敗都會停止本輪流程，不再次呼叫硬體。成功只證明目前簽名路徑可用，不證明 PIN 已獨立認證：SafeNet 可能複用登入狀態。不要為了驗證 PIN 而登出或重複認證。`--check`、僅準備和 `--unsigned` 模式不執行此硬體預檢；未簽名產物仍不能釋出上傳。自動迴歸測試使用假簽名器，真實硬體由釋出操作人員單獨驗收。

Windows NSIS 上傳要求安裝檔旁存在生成的非空 `.exe.blockmap`。blockmap 先於通道 YAML 上傳；NSIS 安裝檔中繼資料不要求另一種 web-installer 格式使用的內嵌 `blockMapSize`。檔案清單測試使用固定版本建置器的 blockmap 生成器，而不是手工編造內嵌對映欄位。

簽名 Windows 設定從同一份公開憑證的 `CN`、`O` 和 `C` 屬性生成 updater 的 `publisherName`。每個屬性都必須存在、非空且只有一個值。這些身份屬性允許憑證續期，無需固定葉憑證指紋。已安裝應用的 `app-update.yml` 儲存預期釋出者，下載的清單不能選擇該身份。未簽名測試建置省略 updater 設定。真實檔案驗證及其限制見[簽名驗收記錄](tests/README.zh.md)。

本專案使用的 SafeNet Token 出現 `SignTool Error: No private key is available.` 時，說明 PIN（密碼）錯誤。立即停止所有簽名嘗試，等待使用者處理 PIN 後再繼續。PIN 輸錯達到五次會鎖定 Token。遇到該錯誤後，不得重試打包或簽名探針。簽名器序列執行 Token 操作，首次失敗後拒絕所有排隊任務。

Windows 打包命令透過 `DESKTOP_PACKAGING_RECORD` 輸出 `.desktop-build/packaging-runs/` 下的唯一目錄。每次執行保留 `run.json`、帶時間戳的 `events.jsonl`、脫敏後的 `stdout.log` 和 `stderr.log`，以及 `result.json`。簽名失敗還會寫入 `fatal.json` 並透過 stderr 通知父程序；監督程式立即請求終止目前階段的程序樹並等待退出。失敗階段不能啟動後續階段或生成釋出完成記錄。日誌寫入失敗也會停止執行。終止錯誤仍按失敗處理，需要操作者檢查；缺少最終記錄表示尚未確認完成。

硬體簽名必須屬於受監督的打包執行。呼叫命令直譯器前，簽名器原子取得 `%USERPROFILE%/.dsh-desktop-signing/attempt.json` 並記錄本次嘗試。只有簽名成功且設定憑證的主簽名透過驗證後才釋放該檔案；隨後完成時間戳，不再存取硬體。失敗、中斷、已有鎖定檔案或審計儲存不可用都會阻止再次存取硬體，包括同一 Windows 帳戶下的另一個簽名器實例、程序或程式碼檢出目錄。沒有定時恢復或自動重試。管理員必須檢查保留的證據及權杖狀態，再明確授權恢復鎖定狀態；登入權杖或替換 PIN 檔案不會清除它。記錄區分簽名意圖、命令直譯器 PID 和完成結果，不計量 CSP／權杖內部的認證次數。不記錄命令參數、PIN 或憑證環境。其他 Windows 帳戶及無關簽名程式不在此鎖定機制的保護範圍內。

Windows 打包將 7-Zip 過濾器固定為 `BCJ`，以相容內建的 NSIS 解碼器。這樣可以保留 x64 安裝檔中由依賴攜帶的 ARM64 二進位制檔案；自動 ARM64 過濾會生成該解碼器無法解壓的條目。

NSIS 在安裝階段清理臨時解壓目錄，完成後才顯示完成頁或自動啟動應用。已安裝的生產依賴保持為普通檔案；啟動時不會再次解壓。安裝仍會寫入完整的應用目錄樹。

在 `.env.windows` 中填寫 `DSH_DESKTOP_WINDOWS_CER_FILE`（公開 EV 葉憑證）、`DSH_DESKTOP_WINDOWS_SIGNTOOL`（SafeNet 相容的 SignTool）、`DSH_DESKTOP_WINDOWS_KEY_CONTAINER`（匹配的私鑰容器）和 `DSH_DESKTOP_WINDOWS_TOKEN_PIN`（Token Password）。私鑰仍保留在 USB Token；不要把憑證或本地憑證檔案提交到 Git。

```sh
pnpm run package:desktop:win:x64
```

打包前插入並解鎖 Token。electron-builder 掛鉤把每個產物交給採用 CRLF 的 `scripts/windows-sign.cmd`；該 CMD 只呼叫一次已設定的 SignTool，並指定 `/f`、SafeNet `/kc "[{{PIN}}]=容器"`、`/csp "eToken Base Cryptographic Provider"`和 SHA-256 檔案摘要，不請求時間戳。隨後掛鉤在隔離副本上完成 DigiCert SHA-256 RFC 3161 時間戳，不傳遞簽名憑證。掛鉤不會改用 electron-builder 內建的 SignTool，也不會重試失敗的簽名請求。SignTool、憑證、容器、PIN、Token 或簽名不可用時，Windows 釋出打包會失敗，不會生成未簽名產物。

時間戳處理僅對正常退出但返回失敗或警告的時間戳命令重試，最多嘗試三次，間隔為一秒和兩秒。每次均從同一份已驗證的主簽名開始。啟動錯誤、終止狀態不確定或驗籤失敗會立即停止。SignTool 使用短的私有路徑；釋出時先把已驗證位元組複製到目標卷，再原子替換。最終必須透過 Windows 信任、憑證、時間戳和規範化全檔案相等檢查。嘗試耗盡後停止打包並保留證據，不再次呼叫硬體。參見[簽名完成決策](../../.agents/notes/implemented/process/2026-09-17-windows-signature-completion.zh.md)。

PIN 不能包含 `]`、引號或換行，因為這些字元用於分隔 SafeNet `/kc` 值或對應的 CMD 參數。CMD 會停用延遲展開，因此包含 `!` 的 PIN 可以原樣到達 SafeNet。打包流程不會把任何 `DSH_DESKTOP_WINDOWS_*` 欄位傳給建置與 執行時準備子程序；它只向簽名預檢、獨立的第一方執行時簽名階段與 electron-builder 提供四個設定輸入，在其他欄位已經清理的環境中只向簽名 CMD 提供經過驗證的簽名欄位，在 SignTool 啟動前清除這些欄位，並遮蓋 SignTool 診斷。SafeNet 仍要求 PIN 出現在 SignTool 程序命令列中。本地 `.env.windows` 明文儲存 PIN，應限制檔案存取權限；CI 使用臨時檔案並在任務結束後刪除。不要提交或分享檔案內容，也不要把憑證寫入日誌。設定檢查不會消耗 Token 的 PIN 嘗試次數；簽名仍在首次失敗後停止整批任務。

使用對應的 `:dir` 命令可以生成可直接執行的應用目錄，而不是安裝檔，例如：

```sh
pnpm run package:desktop:dir
pnpm run package:desktop:mac:arm64:dir
```

需要檢查或診斷為主機目標準備的資源而不呼叫 electron-builder 時，可以讓同一流水線在準備完成後停止：

```sh
pnpm run prepare:desktop
```

這條診斷命令是另一種停止位置，並非兩條命令建置流程的前半段。之後執行 `package:desktop*` 時仍會重新完成正式建置與準備，避免使用陳舊的 dsh 包、執行時檔案或 dsh 內容。

每條打包命令都會建置儲存庫，打包以 dsh 和私有 Desktop Host 為根的第一方生產依賴閉包，並準備目標專用的 Electron 分發包與 pnpm CLI。`prepare:dsh` 在建置時安裝一次生產依賴圖，準備物化包供 electron-builder 歸檔到 `app.asar/dsh`，移除包管理器中繼資料，並生成包含共享包版本和最終檔案雜湊的 `desktop-runtime.json`。在 macOS 上，它先簽名並驗證原生檔案，再生成清單；electron-builder 不對已簽名的此目錄重複進行巢狀簽名。資源對映明確包含預設根目錄過濾器會忽略的 `dsh/node_modules`；準備完成的執行時清單在原生簽名後檢查。原生可執行檔案及庫解包到 ASAR 旁；Python、獨立 Node 和 pnpm 保留在外部 runtime 資源中。Windows 打包逐項檢查準備好的 PE，確認其 ASAR 條目已標記為解包，且磁碟副本位元組一致；未簽名建置也執行此檢查。Builder glob 規則用單字元萬用字元匹配 PE 檔名中的花括號，因此同目錄中名稱匹配的檔案也可能被解包。準備好的執行時 smoke 沿用已驗證的目標描述符，不使用建置主機的架構。簽名安裝檔、公證、已安裝應用升級和各目標原生模組的驗收需要釋出環境。

macOS 打包在組裝 App 時、程式碼簽名前寫入 `Contents/Resources/app-update.yml`，供並行 ZIP 與 DMG 路線使用的目錄建置也執行此操作。簽名掛鉤驗證準確的更新源和 updater 快取目錄。寫入釋出完成記錄前，流程會再次檢查兩條路線的副本和最終移入的 App；設定缺失或不匹配會阻止移入產物，因而也會阻止上傳。

未壓縮產物包含 Electron、物化後的 dsh 生產依賴樹、pnpm，以及殼應用。安裝檔大小與檔案系統佔用不同；釋出驗收需要測量兩者，以及 profile 外掛儲存和首次啟動耗時。此佈局用更多應用內檔案換取消除使用者機器上的核心包安裝過程。

## 更新

Windows 下載完成後的更新確認說明應用會在安裝期間關閉、完成後自動開啟，並提示期間不要重複啟動。安裝器攜帶 `--updated` 重新啟動應用並直接開啟工作區時，殼會將主視窗前置並聚焦一次，不啟用永久置頂。啟動進入歡迎頁時會清除此請求，使後續登入保留正常的啟用行為。普通啟動和其他平臺不執行此前置步驟。

原生更新浮層在文件就緒且父視窗可見時顯示，並在父視窗再次顯示時恢復。關閉浮層會釋放輸入攔截和父視窗監聽。[本地視窗驗證](tests/README.zh.md#verification-overlay)無需啟動工作區即可檢查這些切換。

打包應用在啟動後非同步檢查固定 Nightly。常規輪詢以十分鐘為基礎間隔，每次獨立取樣 ±20% 的隨機抖動。每次檢查失敗將基礎延遲翻倍，上限為一小時；成功後重置。隨機延遲不超過該上限，並從全部複用呼叫結算後開始計時。在地化的“檢查更新…”選單項（Windows 可從頂欄的“應用”選單進入）立即執行，並複用正在進行的檢查。回到前臺和系統恢復時遵守相同的單調時鐘截止時間。新收到的強更策略也會立即請求檢查更新清單。自動檢查從不彈出視窗或下載安裝檔。手動檢查顯示正在檢查、失敗或包含已安裝版本號的無更新回饋。常規更新彈出視窗原位漸入漸出；連續彈出視窗替換卡片內容並重置其滾動位置，保留黑色半透明蒙層，不模糊父頁面。

`DSH_DESKTOP_UPDATE_CHECK_INTERVAL_MS` 設定常規基礎間隔，`DSH_DESKTOP_UPDATE_CHECK_MAX_BACKOFF_MS` 設定上限；兩者均接受 1000 至 2147483647 的整數毫秒數，且上限不能小於間隔。省略上限時取一小時與間隔中的較大值。`DSH_DESKTOP_UPDATE_CHECK_JITTER` 設定 0 至 1 的抖動比例，預設 `0.2`；最終延遲至少一秒，且不超過上限。這些設定不改變強更策略輪詢，也不授權下載重試。

左下角帳戶行顯示在地化的更新可用狀態、載入圖示與下載百分比、驗證、就緒狀態，或帶可存取提示的持久紅色重試操作。嵌入 Web 介面的文案跟隨應用內目前語言；原生彈出視窗使用 Desktop 殼語言。側欄收起時，頂部展開按鈕顯示圓點。連線狀態優先展示。選擇可用版本即開始下載。準備成功後自動開啟殼擁有的重新啟動確認；關閉後保留就緒狀態，不重複彈出視窗。選擇就緒入口可再次開啟確認。執行中的 agent、排隊輸入，以及執行中或停止中的後臺任務都會在該確認中觸發中斷警告。僅有 API 請求不會觸發警告。使用者批准後，Host 鎖定新請求，等待已接收的請求結束，再檢查任務，包括已接收寫操作建立的工作。等待超過控制請求截止時間時，拒絕安裝並解除准入鎖。任務狀態未知、未獲中斷授權的新任務，或未成功完成正常收尾，都會阻止安裝。常規退出先按"關閉視窗與退出"一節所述詢問可中斷的工作，再在停止 Host 前隱藏產品視窗，在收尾期間忽略新的聚焦請求，且從不安裝更新。下次啟動透過已有的啟動與恢復流程校準版本繫結的執行時。

若任務收尾失敗但已確認 Host 退出，安裝會被拒絕，殼會在允許再次確認重新啟動前恢復目前版本的 Host。Host 正常停止後的安裝器啟動失敗使用同一恢復路徑。替代 Host 啟動並完成認證後，殼重新載入原有應用地址，讓 Web 頁面取得目前埠、Cookie 和啟動注入資料；頁面載入失敗時開啟原生致命故障恢復彈出視窗。未確認程序退出時，絕不允許啟動替代 Host。已下載目標保留以供重試。已知強更策略在恢復過程中繼續阻塞；Host 恢復失敗開啟原生致命故障恢復彈出視窗。

已確認 Host 退出但任務未成功收尾時，常規與強更彈出視窗均展示在地化恢復提示。兩種語言都根據型別化的準備失敗原因選擇提示，翻譯文案變化不會改變失敗分類。“檢視技術詳情”預設摺疊，僅展示退出狀態、訊號、關閉確認和截止時間事實，不展示外掛 stderr。展開詳情既不重試，也不授權安裝。

### 強制更新策略

[強更用戶端決策](../../.agents/notes/implemented/feature/2026-09-11-desktop-mandatory-update-client.zh.md)負責策略查詢和阻塞視窗。打包讀取 `.env.windows` 或 `.env.macos`：`DSH_DESKTOP_AUTO_UPDATE_ENV=test`（預設值）選擇 `DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN`；`production` 選擇 `DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN`。範本將兩個源站留空；在 Git 忽略的目標 dotenv 檔案中填寫所選部署的源站。在準備產物或簽名前，所選源站必須設定，包括未簽名和僅準備建置；未選環境的源站可不填。這些設定不會退回到父程序環境或另一部署環境。打包將選定策略與應用 ID 寫入中繼資料；打包應用忽略執行時覆蓋。

`DSH_DESKTOP_MANDATORY_UPDATE_CONFIG` JSON 提供測試登入源站，以及可選的輪詢和下載頁面選項；打包拒絕其中的 `origin` 和 `authentication`。頁面白名單預設只包含所選服務源站；需要其他已批准下載頁面源站時應顯式設定。測試包選擇 `feishu-test`，且必須在 `DSH_DESKTOP_MANDATORY_UPDATE_CONFIG` 中設定 `allowedAuthOrigins`；正式包選擇 `anonymous`，並拒絕該欄位。每個登入源站必須是沒有憑證、路徑、查詢或片段的 HTTPS origin。登入視窗僅允許文件導航到所選策略源站和這些已設定源站。策略請求拒絕重定向；僅測試授權驗證攜帶閘道 Cookie。未打包開發模式則從此變數讀取完整策略 JSON，並要求 `DSH_DESKTOP_APP_ID`；缺少 JSON 會停用開發模式策略查詢，僅匿名開發允許 HTTP `127.0.0.1`。使用者發起常規檢查時會並行觸發策略檢查，但不會等待或展示策略失敗。只有已確認的強更決定可以關閉常規彈出視窗。測試環境授權驗證會等待目前常規彈出視窗結束，取消或失敗不會丟棄 updater 結果。

| 解析後的策略欄位 | 含義與預設值 |
|---|---|
| `origin` | 必填 HTTPS API 源站，不含憑證、路徑、查詢或片段；請求使用 `/api/v0/check_client_update` |
| `allowedPageOrigins` | 非空的精確 HTTPS 源站陣列；打包時預設只包含所選 API 源站；不隱含子域名或其他埠 |
| `authentication` | 打包時測試環境選擇 `feishu-test`，正式環境選擇 `anonymous`；未打包開發模式預設為 `anonymous` |
| `allowedAuthOrigins` | 測試授權驗證必填的非空 HTTPS 登入文件源站陣列；正式環境禁止設定 |
| `intervalMs` | 輪詢間隔；預設 `600000` |
| `timeoutMs` | 請求截止時間；預設 `15000` |
| `maxBackoffMs` | 含抖動的失敗請求最大間隔；預設 `3600000`，不小於 `intervalMs` |
| `jitter` | 隨機增加的間隔比例；預設 `0.2`，範圍為 `0` 至 `1` |

時長必須是 1000 至 2147483647 毫秒的整數。啟動與定時輪詢獨立於業務請求；前臺／恢復檢查遵守下次到期時間，手動檢查繞過該時間並複用在途請求。用戶端傳送已安裝平臺、架構、DSH_CLIENT_VERSION、內建 dsh 版本、目前語言與 UTC 偏移、空 bundle ID 和固定 Nightly。不使用業務登入憑證或安裝 ID。

啟用 `feishu-test` 時，包含 `error.code: "UNAUTHENTICATED"` 的 HTTP 401 JSON 回應會在使用者主動檢查和打包應用首次啟動檢查時提供登入入口，不等待本地後端就緒。在地化說明指出這是測試版、需要飛書授權驗證，且登入不會下載或安裝更新。確認後先關閉說明，再開啟設定源站根路徑的沙箱視窗，不使用回應中的登入 URL。並行檢查複用整個確認／登入流程，並聚焦已有視窗。在測試環境登入視窗按 F12 可開啟獨立的 DevTools 進行排查。取消後，定時或前臺檢查不會反覆彈出視窗；使用者可手動重試。

登入和策略請求共用記憶體 Session，與產品視窗及 updater 隔離；應用重新啟動後需要重新登入。關閉視窗取消登入，導航失敗提供在地化重試提示。返回服務後重新查詢策略；重定向、Cookie 或 HTTP 422 都不是有效策略決定。取消、登入過期及無效回應均保留已知強更阻塞。固定登入結果寫入程序診斷及可選更新日誌；登入控制器不記錄 Cookie、OAuth 參數或遠端錯誤原文。真實 Harness 閘道/API 聯調及 macOS 登入驗收仍未完成。

扁平化的 `40005` 開啟殼擁有的模態視窗，並拒絕後續外掛修改，不停止現有 Host 任務。伺服器端標題與詳情是可選純文字，缺失時使用用戶端後備文案；缺少下載地址或地址未獲批准時隱藏外部頁面操作，不解除阻塞。macOS 強更蒙層原位漸入漸出，在更新狀態切換時保留蒙層，並將父視窗焦點和鍵盤輸入重定向到蒙層。Windows 由隔離的應用 preload 在主視窗內掛載 shell 來源的 frame，以蒙層和彈出視窗覆蓋 40 DIP 頂欄下方的內容區域。它阻止背景頁面輸入，不建立額外的原生視窗；移動和最大化只作用於主視窗。頂欄選單保留滑鼠和鍵盤操作，頂欄中的 Web 控制元件仍可觸達。共享 DOM 只約束展示，不構成安全邊界：產品腳本可以隱藏蒙層，但不能借此清除主程序策略或授權安裝。更新操作與狀態透過隔離 preload 和殼 frame 之間的私有 MessageChannel 傳遞。父視窗保持啟用，原生移動、縮放、最小化、最大化和關閉控制元件仍可操作。退出應用會完成清理，不會解除更新要求；Esc 不會關閉覆蓋層。批准安裝後，安裝器接管的退出流程會在 Electron 關閉視窗前釋放模態視窗。下載、含準備步驟的檔案驗證、任務檢查和安裝確認共用同一彈出視窗。只有第二次使用者批准才允許任務收尾和安裝；稍後更新保留阻塞與安裝檔。僅存在受影響任務時，重新啟動文案才提示正在停止任務。策略不跨應用重新啟動持久化，策略回應也不作廢或替換 updater 產物。

失敗時在同一彈出視窗內保留阻塞、在地化重試提示和摺疊診斷。白名單下載頁面操作只在恢復狀態出現，不與正常下載或安裝並列。請求開啟瀏覽器後立即提供複製替代入口，即使系統請求尚未返回；請求成功不證明網頁已開啟。複製失敗時展示完整、只讀的地址供手動複製。瀏覽器與剪貼簿結果不覆蓋 updater 錯誤。只有新的有效無需強更回應才解除阻塞；阻塞期間仍可使用頂部選單檢查。

後臺強更安裝確認請求 Windows 工作列提醒或 macOS 資訊級 Dock 彈跳，並在每輪就緒時嘗試一次無聲通知，不還原視窗或搶焦點。點選通知只返回目前確認介面。回到前臺、安裝、策略解除和退出時清理提醒。系統權限和專注模式可能抑制通知；仍需完成 Windows 與 macOS 安裝檔通知驗收。

### 本地 updater 驗證

常規更新 HTTP 請求具有逐連線的無活動截止時間：`60000` 毫秒內未收到回應頭或後續回應位元組會使操作失敗。`DSH_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS` 接受 `1000` 至 `2147483647` 的整數進行調整；活躍下載沒有總時長限制。下載失敗保留重試提示，並要求使用者再次操作。

在已安裝工作區依賴的 Windows 上，從儲存庫根目錄執行：

```sh
node apps/desktop/node_modules/pnpm/bin/pnpm.mjs --dir apps/desktop run test:updates:local
```

此命令建置 Desktop 殼，讓其協調器透過真實 Electron HTTP 請求和 `NsisUpdater` 存取私有迴環伺服器。它驗證使用者授權的完整下載、SHA-512 拒絕、顯式重試、並行請求合併、清單替換和安裝交接。它還開啟使用沙箱預載入的真實強更頁面，檢查按鈕操作、關閉／Esc 攔截、純文字內容、策略請求停滯和策略解除。成功時列印 `LOCAL_UPDATER_RESULT` 並以零結束代碼結束；功能失敗時返回非零結束代碼。每次呼叫獨佔隨機埠和臨時使用者資料／快取目錄，關閉監聽器、等待 Electron 退出，並移除臨時檔案。報告和可用截圖儲存在唯一的 `.desktop-build/qualification/local-updater-*` 目錄中。截圖失敗單獨記錄，絕不當作視覺驗收透過。不需要 COS 或簽名憑證。

下載內容是不可執行的測試位元組，安裝呼叫僅記錄而不執行。測試替換瀏覽器開啟與剪貼簿寫入，避免外部導航和剪貼簿修改。它不啟動完整產品工作區，不驗證真實安裝器或重新啟動，不驗證釋出者簽名，也不覆蓋差分更新或 macOS。停滯的策略請求、清單請求和負載傳輸會執行真實截止時間及恢復。真實常規彈出視窗驗證隔離預載入、卡片尺寸、未施加模糊的父頁面、取消、任務警告選項與顯式安裝批准；帳戶行元件測試另行提供證據。[本地驗證決策](../../.agents/notes/implemented/testing/2026-09-10-desktop-local-updater-qualification.zh.md)和[驗證記錄](tests/README.zh.md)保留這些限制；生產釋出要求保持不變。

## 底層開發覆蓋項

未打包的 Electron 程序使用應用目錄下的 `.desktop-build/development/project` 作為開發專案。`DSH_DESKTOP_PNPM_ENTRY` 和 `DSH_DESKTOP_DSH_DIR` 是帶應用路徑預設值的可選覆蓋項。每次未打包啟動都必須設定 `DSH_DESKTOP_PRIMARY_RUNTIME_DIR`：開發啟動器（`dev:desktop`、`start:desktop` 及工作區更新驗證執行器）會把它設定為自己已準備目標的 primary-runtime 目錄；缺少該變數的啟動會以致命啟動對話方塊失敗。啟動器必須設定它，因為殼無法從 `process.arch` 推導該目錄：建置目標將 Windows 固定為 x64，而主機可能是 arm64。打包應用會忽略這些變數，從 `process.resourcesPath` 解析簽名資源，並使用受管 Desktop profile。

## 已知限制

- 帳號登入尚未接入；登入按鈕停用。Windows 材質效果仍需平臺驗證。

- 釋出簽名、公證、更新託管和跨上一版本的已安裝產物驗證需要生產釋出環境。
- 依賴的生命週期腳本遵循 pnpm 的建置權限；Desktop 不提供單獨的審批對話方塊。
- 桌面殼與 CLI dsh 共享 `$DSH_HOME` 下的工作階段、設定、憑證、工作區和儲存，但可執行包、外掛啟用和鎖檔案彼此隔離。
- 在 Electron win32-arm64 主機上，未打包啟動現在可以成功，但載荷仍為 x64：`packages/skill/tool-workspace-dependencies/src/index.ts` 的架構驗證會把載荷記錄的架構與主機 `process.arch` 比較，因此 `load_workspace_dependencies` 工具仍可能拒絕 primary runtime。

僅嚮應用提供的 `dshOnboarding.hasApiKey()` preload 方法返回歡迎後端目前的 API Key 存在狀態布林值；原生登入與引導共用憑證發現邏輯，且只有受管理的應用主 frame 可以呼叫。

登入會在系統瀏覽器中開啟設定的平臺頁面。Host 負責 PKCE 和臨時本機回呼，在進入工作區前儲存憑證，再將瀏覽器跳轉到平臺完成頁。開啟和複製的授權連結透過 `theme=light` 或 `theme=dark` 攜帶目前生效的 Desktop 主題；`system` 在執行操作時解析。即使平臺頁面隨後批准，取消仍會撤銷本地嘗試。設定中的帳號頁面提供退出；沒有獨立 API Key 時，退出後返回歡迎窗。瀏覽器登入成功後，Welcome 切換到工作區但不啟用應用；完成頁的 dsh://open 連結負責將用戶端置前。打包應用註冊 dsh://open，只顯示視窗而不傳遞憑證。macOS 開發啟動器在 `.desktop-build/development` 下準備經臨時簽名的 `Harness Dev.app`，在 Info.plist 中宣告 `dsh` 並註冊到 Launch Services。它載入目前工作區，並記錄選定的開發 home、瀏覽器資料路徑和除錯設定，以供冷啟動使用。啟動此應用會將其設為 `dsh://` 預設處理程式；啟動打包應用會重新註冊打包版處理程式。生成的應用包不包含帳號 token，依賴工作區和已準備的執行環境繼續存在。

帳號失效並返回 Welcome 時，主程序保留一次性通知，直到渲染器透過所屬視窗的 IPC 領取。重新載入 Welcome 不會重複提示；主動退登和冷啟動不會生成該通知。

登入超時後顯示超時標題，並提供重新登入和新增 API Key 按鈕。開啟 API Key 表單會關閉授權檢視；後續帳號狀態通知不會覆蓋正在填寫的金鑰。

內嵌 Platform 檢視在文件載入完成前保持隱藏，讓渲染層載入圖示可見。關閉或替換待載入檢視後，該檢視不會再次出現。 所屬應用文件重新整理或替換、渲染程序終止以及視窗關閉也會銷燬原生檢視，不依賴 React 清理。

私有 Platform 部署請求頭由內嵌瀏覽器工作階段注入，僅用於設定來源的文件和 API 請求。Cookie 覆蓋按名稱合併。跨來源請求移除部署請求頭；bootstrap 僅暴露 origin、token 和已解析的語言。

帳號提供者的 `embeddedPageDist` 設定為內嵌用量和充值頁面 URL 新增 `dist` 查詢參數。預設值為空；私有前端分支選擇值應寫在本地 profile patch 中。此設定不改變 API 地址或憑證傳遞方式。

## 開發備註

上線前 CDN 與容量決策見[桌面更新提案](../../.agents/notes/proposed/feature/2026-09-08-desktop-update-policy-and-installation.zh.md#cdn-and-capacity-qualification)。
