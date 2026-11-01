# Agent Note: 列舉工作區檔案樹中的目錄連結

Status: implemented

[English](2026-09-18-windows-directory-junction-listing.md) | 中文

## Problem

Windows 的個人目錄如 `Documents\My Music` 是目錄聯接：`lstat` 把這類重解析點報告為符號連結而不是目錄。`list` 端點在解析之前先用 `lstat` 把關，於是把所有末端連結都以 `workspace-file/not-directory` 拒絕；而它自己的列舉又把同樣的子項報告為 `directory`，因為 `listDir` 會解析每個子項。檔案樹因此既列出這些聯接、又拒絕開啟它們，側欄把 `My Music`、`My Pictures`、`My Videos` 報告為非目錄。

## Decision

`list` 跟隨末端連結並判定其解析結果。解析後的目標必須透過工作區包含檢查，且經 stat 必須為目錄，因此工作區內的目錄連結經其目標列舉，返回的工作區路徑也以該目標命名。解析到工作區外的連結為 `workspace-file/outside-workspace`；指向非目錄的連結、或目標已消失的連結，為 kind 為 `symlink` 的 `workspace-file/not-directory`。

`read`、`readBytes`、`readAll`、`readRelated` 與 `stat` 保留拒絕末端符號連結的 `lstat` 把關，因此沒有任何讀取路徑跟隨連結。[工作區檔案服務](../architecture/2026-09-05-workspace-files-service.zh.md)繼續擁有該服務；它此前「`list` 拒絕末端符號連結」的規則由本記錄取代。

## Alternatives considered

**對所有方法去掉 `lstat` 把關。** 被否：經連結讀取是另一項暴露決策，檔案方法的「不跟隨」規則是報告方要求保留的信任規則。

**單獨處理 Windows 目錄聯接。** 被否：`fs-local` 已把目錄聯接報告為 `symlink` 路徑項，且「先解析再判包含」的規則對目錄聯接與 POSIX 目錄符號連結完全相同。

**保留把關，只靠父層列舉報告被連結的目錄。** 被否：列舉本來就報告解析後的型別，端點因此自相矛盾，讀取方無法開啟父層呈現為目錄的條目。

## Consequences

工作區內的目錄連結現在與其目標一樣可列舉，Windows 個人目錄中的聯接可在側欄展開。解析到工作區外的連結報告 `outside-workspace` 而不是 `not-directory`，如實說明原因。讀取權限不變。測試覆蓋工作區內的目錄連結、解析到工作區外的連結，以及目標被刪除的連結；spec 在 Windows 上用 `symlink(target, path, 'junction')` 建立目錄聯接，在其他平臺建立目錄符號連結，因此同一 spec 兩端都跑。
