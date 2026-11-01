# Agent Note: 通用檔案上傳

Status: implemented

[English](2026-08-26-generic-file-upload.md) | 中文

## 問題

工作階段可以把貼上或拖入的圖片作為持久附件接收，但其他任何檔案都進不了對話：composer 拒絕非圖片位元組，唯一與檔案相關的入口是 `@` 路徑引用，而它要求檔案本來就能從主機工作區讀到。使用者無法從瀏覽器把 PDF、資料檔案或壓縮包交給智慧代理，而 DeepSeek Chat 使用者期待回形針加檔案卡的上傳互動（#2984）。

命令平面已經為圖片建立了完整提交規則：命令必須同時消費文字與附件，或明確拒絕整次提交。`input.images` 宣告和只支援圖片的 RPC 載荷使通用檔案在普通訊息可用後仍走獨立拒絕路徑。Plan 和 goal 入口需要使用同一附件詞彙，同時保留執行器強制規則，不能靜默清除草稿。

## 決定

檔案與圖片使用不同儲存方案，並進入同一個有序訊息附件列表。圖片的規範化附件流水線保持不變。其他被選中的檔案進入同一個先進先出的後臺上傳佇列，按位元組原樣儲存且不設型別與大小限制，再在本程序內按同一 Session 暫存。相同位元組在 `DSH_HOME/attachments/v1/file-objects/<digest-prefix>/<digest>` 下只有一個規範物件；每條模型可見的只讀路徑 `DSH_HOME/attachments/v1/files/<digest-prefix>/<digest>/<name>` 都是硬連結，因此不同顯示名稱不會複製內容。該佇列可以設定，預設同時執行兩項傳輸。獨立的雙端 `file-upload` Cordis 包擁有傳輸與暫存。其 Client `fileUpload` 服務同時接收所屬 Session 標識與 `Blob`、精確位元組或只能使用一次的 `ReadableStream<Uint8Array>`；它使用該標識組裝原始路由請求，或直接呼叫生成的 Remote。其 Host `fileUploads` 服務擁有流式路由、編碼 Remote 後備、命令憑證解析器，以及以接收方 Agent 的 Session 物件為鍵的憑證表。編碼准入和附件錯誤識別透過 `ctx.attachments` 完成，位元組儲存由附件提供者擁有。Session Controller 註冊用於休眠普通 Agent 的解析器，並在 prompt 准入時消費憑證；Session 物件不公開檔案傳輸。普通 Web 頁面把每個活動請求體交給專用上傳 Worker：Blob 請求體透過 XMLHttpRequest 傳送並報告包含總量的位元組進度，stream 則轉移所有權並增量傳入 Fetch。Worker-hosted 頁面透過頁面自有 Fetch 載體把請求體轉交給 Host Worker，後者讀取有界分片。頁面執行緒不讀取通用檔案位元組，也不做 base64 編碼或 JSON 序列化。經過認證的 Host 路由顯式使用 Connection 的流式請求模式，因此 bridge 會在消費請求體前分發，本地儲存則把有界分片寫入私有暫存物件並同時計算摘要。接收完成後，內容定址物件以原子方式釋出；取消或失敗會移除暫存檔案。上傳任務和草稿狀態屬於常駐的 conversation 根，因此切到另一條 Session 不會停止傳輸，返回原 Session 時仍顯示同一張檔案卡和目前進度。移除檔案卡會跳過排隊中的傳輸或中止正在執行的傳輸。傳送的訊息在 `user/message` 裡攜帶結構化的 `FileBlock`（`{ name, bytes, attachmentId }`），不新增工作階段事件型別。`LlmRuntime` 的請求組裝把每個檔案塊，包括巢狀工具結果中的檔案塊，投影成確定性 handle 文字，指出檔案與其只讀儲存路徑。handle 會要求主 agent 委派檔案任務時附上該路徑，並在子級執行環境看不到路徑時明確報告。提供者不會收到檔案位元組，模型在需要時用現有檔案工具讀取儲存副本。

預設模式、啟用的 Plan Mode 與 active goal 共用普通 queue、follow-up 和 steer 的附件准入。`/goal` create 和 edit 以及 `/plan` 進入接受同一套有序圖片與檔案批次；攜帶附件的控制子命令會在狀態變更前拒絕。命令提交引用已完成暫存的檔案憑證，不會再次讀取或複製通用檔案位元組。Session Controller 先把每個檔案憑證解析為持久引用，再由 `ctx.attachments.admitPromptContent()` 接收完整有序內容列表；附件准入會持久化圖片，並讓檔案引用原樣透過。原 Agent 已銷燬時，Host 會拒絕釋出上傳完成憑證，並按 `rpcId` 去重已經存在的 prompt 重試。prompt 憑證在失敗恢復期間保持可用，已接受的 queue 或歷史 occurrence 被觀察後才退休；只被命令使用的憑證保留到 Session 銷燬。提交回顯在序列化前經 `beginSubmission` 註冊，透過 `pendingSubmissions` 攜帶混合附件，以 `rpcId` 關聯，在 queue 或歷史觀察後只退休一次，並在失敗時保留草稿。傳送前，composer 把有序附件放進同一條不換行的橫向附件欄：圖片使用 64 乘 64 畫素縮圖，通用檔案使用 240 乘 64 畫素卡片，帶 16 畫素圓角、藍色文件圖示、檔名加副檔名與大小，以及懸停或鍵盤操作時可用的移除按鈕。QueueDock 使用相同順序以及緊湊的縮圖和檔案卡。傳送後，Chat 把有序附件放進同一個右對齊、可換行的附件區域。只有一張圖片時保留圖片畫廊的大圖樣式；一條訊息含有多個附件時，圖片使用 64 乘 64 畫素縮圖，檔案使用 240 乘 64 畫素卡片，檔案與圖片在可用寬度內共用一行，空間不足時再換行。Trajectory 保持緊湊的使用者訊息預覽，並增加在地化的通用檔案數量。回形針、拖拽和貼上按 MIME 分類；傳送會等待每個檔案上傳完成。continuable 子代理 composer 停用附件入口，Host 會拒絕收到的任何子工作階段檔案塊。

## 考慮過的替代方案

- **把上傳存進專案根目錄**（OpenHands / ChatGPT `/mnt/data` 的形態）。拒絕：使用者目錄裡的檔案可能被編輯、移動或刪除，會打斷工作階段日誌的穩定引用，汙染 `git status`，還要求工作區必須存在。`DSH_HOME` 用內容定址儲存凍結的只讀位元組；執行世界可見性由投影路徑提供，之後還可以補一步複製進工作區。
- **專用的 `read_file` 工具。** 拒絕：handle 文字指向一條普通路徑，現有 `read` 工具（以及模型的其他檔案工具）已經覆蓋它；再加一個讀工具只會分裂模型行為而不增加能力。
- **把內容急切注入提示詞。** 對檔案的拒絕理由與當年對 `@` 引用完全相同（[web 檔案引用](../../archived/feature/2026-07-27-web-file-and-session-references.md)）：附加時相關性未知，惰性工具讀取讓每次內容存取都留在日誌裡。
- **型別白名單與大小上限。** 現階段拒絕：DeepSeek Chat 的白名單存在是因為其伺服器端要解析上傳，而本 harness 只存位元組、讓模型自己讀。流式載體和儲存讓記憶體佔用與有界分塊大小相關，因此上限屬於磁碟與傳輸策略，不用於保證請求安全。
- **新增 attachment/file 工作階段事件。** 拒絕：圖片已經採用的「塊內聯在 `user/message`」模式即可滿足模型可見 ⟺ 可日誌重建，無需擴大事件詞彙。
- **有附件時阻止所有命令。** 拒絕：`/goal` 目標與 `/plan` 進入需要參考檔案，統一拒絕會使這些檔案沒有進入模型的命令路徑。
- **任何命令成功後自動傳送附件。** 拒絕：`/model` 與 `/compact` 等狀態命令不表示模型可見輸入。附件是否成為使用者訊息由命令生產方負責。
- **把目標附件存進 goal 領域。** 拒絕：一條普通的已記錄使用者訊息就能讓後續 Goal Round 獲得相同歷史，無需擴大 goal schema 或把附件複製進 Round 提示詞。
- **任何命令成功都消費附件。** 拒絕：`/goal pause` 或 `/plan off` 會清除無關卡片。只有生產方明確成功才消費附件；無法使用附件的語法形式返回錯誤。
- **只在用戶端執行宣告。** 拒絕：直接 RPC 呼叫方可以繞過 composer。`CommandRuntime` 在處理器執行前強制檢查宣告、儲存可用性、同一 Session 的檔案憑證解析、圖片 base64 准入與圖片限制。
- **透過 `ctx.connection` 暴露上傳並沿 Session 建構器傳遞該物件。** 拒絕：Connection 不擁有檔案傳輸，中間物件層也不使用這項依賴。獨立上傳服務直接接收 Session 標識，並允許普通瀏覽器與 Worker-hosted 頁面替換載體，無需擴大 Connection 或 Session。

## 後果

- 上傳位元組永不刪除且沒有大小上限，`DSH_HOME` 的增長無界；垃圾回收與圖片保留問題一同繼續掛起。
- 投影路徑只在對應執行環境中有效：無法對映 `DSH_HOME` 的沙箱或遠端檔案系統會得到顯式的無路徑 handle，模型會報告無法讀取該檔案。基於儲存的讀取後備被推遲。
- 暫存上傳按 Session 存在 Host 記憶體裡；上傳與傳送之間 Host 重新啟動會出現 `FILE_NOT_STAGED`，用戶端重新新增檔案即可。
- 瀏覽器到 Host 的傳輸使用一次不帶斷點續傳偏移的流式 HTTP 請求；連線或 Host 失敗後的重試會從第一個位元組重新傳輸整個檔案。
- `ReadableStream` 上傳只消費並轉移一次 stream；重試必須重新建立 stream，而且在未來 API 允許生產方提供長度前，進度不能報告總量。
- 瀏覽器上傳 Worker 由自包含函式的字串形式生成。需要執行時 import 時，必須改用由 tsdown 打包的獨立 Worker 入口。
- 命令必須宣告接受附件。命令拒絕時保留文字草稿與全部附件卡，供使用者重試。
- 子代理不獨立上傳檔案。主 agent 委派時傳遞儲存路徑；只有同機或繼承父級歷史且執行環境能對映該路徑的子級可以讀取。
- 上傳的檔案尚未進入 `@` 補全；該聯動是計劃中的後續階段。
- 命令註冊表准入帶型別標記的 `CommandSubmitAttachment` 聯合型別，其中的檔案成員攜帶暫存憑證，再向處理器提供一個凍結的有序 `ImageBlock | FileBlock` 陣列。註冊表不安排模型輸入；`/goal` 增加一條已記錄 follow-up，`/plan` steer 有序附件塊。
- 從選單選擇彈出視窗命令不會提交 composer 的整套內容。附件保持可見，直到使用者提交命令列或移除附件。
- 宣告、儲存缺失、未知憑證與圖片限制拒絕發生在處理器執行前。生產方語法拒絕和圖片准入後的取消可能留下無引用的內容定址物件，由後續附件垃圾回收處理。

## 測試

單元與整合覆蓋原樣與流式儲存、檔名清洗、宣告為 2.19 GiB 的請求透過流式 bridge 且不發生總量緩衝、原始位元組與 RPC wire 准入、Blob 與可轉移 `ReadableStream` 載體、後臺上傳並行上限、進度與取消、跨 Session 上傳常駐、命令透過檔案憑證提交且不再次讀取位元組、read-only 與 workspace-write 權限下的 native 和 PTC 投影、上傳暫存、有序 queue 與 steer 提交、佇列轉 steer、pending 回顯退休與失敗恢復、active plan 和 goal 的附件入口、`/plan` 與 `/goal` 混合附件、子代理拒絕、composer 與 Chat 附件佈局，以及 Trajectory 檔案摘要。keyless `file-upload-round` 快照記錄瀏覽器上傳、模型讀取檔案與答案呈現。

## 相關記錄

[Trajectory 附件展示決定](../bug-fix/2026-09-15-trajectory-attachment-presentation.zh.md)負責列表計數與詳情面板附件佈局。

[輸入回顯入檔決策](../bug-fix/2026-09-22-input-echo-admission-ownership.zh.md)負責有無附件提交的按展示歸屬回收和遲到 Inbox 排除。
