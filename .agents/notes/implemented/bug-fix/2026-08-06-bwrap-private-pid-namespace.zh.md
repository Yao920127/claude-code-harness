# Agent Note: 將 bwrap 與主機 PID 名稱空間隔離

Status: implemented

[English](2026-08-06-bwrap-private-pid-namespace.md) | 中文

## 問題

bwrap 後端掛載了全新的 `/proc`，但保留主機 PID 名稱空間。因此，受約束命令可以看到主機程序，並沿 `/proc/<pid>/root`、`/proc/<pid>/fd`、`/proc/<pid>/cwd` 等 procfs 魔法連結進入主機程序的掛載檢視。當存取控制允許跟隨其中某條連結時，該路徑便可越過 profile 對主機根目錄的只讀繫結掛載，以及 `workspace-write` 的 allow-list。主機的 ptrace 限制有時會阻斷該路徑，但這類取決於部署環境的權限並不構成約束邊界。

最初的[沙箱決策](../feature/2026-07-06-sandbox.zh.md)有意維持程序可見性不變，因為 `SandboxMode` 承諾的是檔案影響，而不是一般性的程序隔離。對 bwrap 而言，procfs 魔法連結使主機程序可見性成為檔案影響邊界的一部分，因此該選擇無法維持這些模式承諾的邊界。

## 決策

每個 bwrap profile 都使用 `--unshare-pid`，併為該私有名稱空間掛載 `/proc`。受約束命令可以觀察和控制自己的後代程序，但主機程序及其 procfs 魔法連結不會出現。Bubblewrap 提供該名稱空間的 PID 1 程序，用於回收後代程序。

bwrap 功能探測與實際包裝使用同一個 profile builder。因此，無法建立 PID 名稱空間的主機會在選擇階段拒絕 bwrap 並退回到 Landlock，而不是讓較弱的探測透過，隨後才失敗。

這是 bwrap 後端不變式，不是 `SandboxMode` 的新承諾。Landlock 與 Seatbelt 仍保持程序可見性不變，且沒有後端限制網路存取。

## 曾考慮的替代方案

- **在保留主機程序可見性的同時遮蔽部分 procfs 連結。** 每個程序的條目都會動態變化，只覆蓋 `root` 仍會留下可透過 `fd`、`cwd`、`exe` 及未來魔法連結進行的等效越界路徑。阻止列表無法建立該邊界。
- **依賴 ptrace 與 procfs 所有權檢查。** 其行為取決於核心設定、容器設定、程序憑證，以及程序是否可轉儲。同一使用者的程序可能仍可存取，因此這些檢查只屬於縱深防禦，不能取代由 profile 建立的權威邊界。
- **完全移除 `/proc`。** 常規程序工具和後代程序管理依賴 procfs。私有 PID 名稱空間配合對應的 procfs，既能保留這些機制，又不會暴露主機程序。

## 驗證

profile 單元測試固定兩個受約束模式均取消共享 PID 名稱空間。真實 bwrap 測試驗證：兩個模式報告的 PID 名稱空間標識都與 harness 不同，拒絕透過 `/proc/1/root` 寫入，確保主機目標檔案仍不存在，同時仍允許命令觀察、終止並等待自己的後代程序。

## 後果

- 受 bwrap 約束的命令無法再檢查主機程序或向其傳送訊號，包括同一使用者的程序。
- `read-only` 與 `workspace-write` 無需再依賴主機 procfs 存取策略來防止繞過掛載 profile。
- 無法使用 PID 名稱空間的主機會透過現有的失敗關閉階梯，選擇下一個受支援的 Linux 後端。
- 此次改變的是核心約束保證，不是模型可見輸出、協定或 transcript（文字記錄）內容；因此，真實後端 e2e 是組裝應用的驗收路徑，無需修改快照。
