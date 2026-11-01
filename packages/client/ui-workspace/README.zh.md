---
description: "dsh Web 用戶端的共享 Workspace 瀏覽器與選擇器外掛：分組或扁平的工作階段行、管理操作、由 slot 組合的 Session 行 action 與目錄選擇。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace

[English](README.md) | 中文

## 概述

本包讓使用者瀏覽分組或扁平的 Session 列表、為新 Session 選擇 Workspace，並透過新增、重新命名、重排序、搜尋、fork、歸檔、確認後永久刪除 Session 和刪除 Workspace 來管理 Workspace 與 Session；Session 行選單及其懸停按鈕是可由用戶端外掛擴充功能的 slot 列表。待處理互動顯示為警告點，subagent 來源的 Session 則保持隱藏。處於空閒狀態且未歸檔、其 Session 有活動排程任務的 Session 行會顯示時鐘標記，其懸浮卡片會列出這些任務。規範化後仍有差異的資料夾路徑會保留為獨立 Workspace。新增 Workspace 需要組合目錄選擇器；沒有目錄選擇器時，新增操作不可用。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

用側邊欄瀏覽 Workspace 及其 Session、重排它們並新建工作階段；在 Session Intent 主視覺區用選擇器為新工作階段選擇 Workspace。開啟的 Workspace 預設顯示五條空閒的非空白 Session。正在執行的 Session（包括有子工作階段正在執行的父工作階段）始終按原順序顯示，不佔用這五條配額；目前選中的空白**新工作階段**在首條提示詞落實前也作為額外行。每次點選**展開其餘**最多再顯示五條空閒 Session；全部顯示後，**收起**恢復初始行數，但仍顯示正在執行的 Session。關閉再開啟 Workspace 也會恢復該摺疊投影。

### 重排序與檢視選項

分組和平鋪檢視都先顯示置頂 Session，再顯示普通 Session。**最近更新**在各分割槽內嚴格按最近一次使用者提示詞或 steering（中途引導）時間降序排列，置頂時間不影響它。**手動排序**使用同一條完整 Session 序列中的相對位置，包括隱藏的歸檔項。返回最近更新會丟棄手動佈局，再次進入手動排序時凍結當時的時間順序。瀏覽器預設採用最近更新，並在重新載入後記住所選模式。

置頂把 Session 移到完整儲存序列的首位，但不切換所選模式。它在手動模式下排在置頂區最前，在最近更新模式下則不一定。取消置頂不改變儲存的位置。拖拽置頂行或普通行都修改同一條完整序列並選擇手動模式，隱藏的歸檔成員始終保留。缺失的置頂成員按置頂陣列順序補到頭部。新增的普通 fork 在完整序列中插在來源之前，不繼承置頂成員關係；可見置頂行仍排在普通行之前。其他缺失成員按最近更新時間追加，缺失歸檔項放在最後。補齊僅在記憶體中完成，直到一次 Session 順序寫入儲存完整結果。單純切換歸檔篩選既不改變儲存的位置，也不改變成員關係。

目前選中的空白**新工作階段**保留臨時首位且無法拖拽；首條提示詞落實後，它成為可拖拽的普通行，在手動排序中保留該位置，在最近更新中按目前時間戳排列。摺疊分組的拖拽使用目標 Session 身份，並保持來源行可見。真實 Workspace、Ungrouped 與單列表的 Session 顯示順序都保留在瀏覽器本地；Workspace 分組的拖拽順序仍由 Host 持久化。[工作階段置頂與歸檔決定](../../../.agents/notes/implemented/feature/2026-09-18-session-pin-and-sidebar-archive.zh.md)記錄排序與恢復規則。

### 工作區層級

選擇**新增工作區**並選取目錄，即可註冊工作區並開啟 Session。**檢視選項 → 分組方式**預設為**按工作區**，將工作區作為同級分組顯示。選擇**按工作區樹**後，每個 Workspace 會位於最近的已註冊祖先之下，之後新增的 Workspace 也會自動歸入。每個 Workspace 保留自己的 Session 和行操作，子 Workspace 顯示在父級自己的 Session 之前。祖先預設展開，已有的摺疊偏好除外。儲存的摺疊狀態也會隱藏目前 Session；如果後代 Workspace 包含目前 Session，祖先資料夾圖示仍保持高亮。各層級的高亮和點選區域保持整行同寬，僅內容縮排。拖拽 Workspace 僅重排同級專案；落在後代行上時，由最近的相容祖先接收，因此無需先摺疊父級就能將其他工作區拖到其後。選擇搜尋結果會展開全部祖先。分組方式和展開狀態儲存在目前瀏覽器中；切換模式會保留各 Workspace 的展開偏好，單列表檢視保持平鋪。

層級僅使用已註冊的規範路徑，不掃描專案，也不解析符號連結別名。巢狀不會改變 Session 的工作目錄、日誌或 Workspace 歸屬。刪除父 Workspace 後，子 Workspace 仍保持註冊，並歸入下一個已註冊祖先；沒有祖先時顯示在根層級。

### 搜尋

摺疊搜尋是檢視和新增操作旁的一枚區頭按鈕：啟用後輸入框會擴充功能並佔據區頭。非空白查詢會以單一扁平結果列表替代任一瀏覽模式——不區分大小寫的標題和 Workspace 子串匹配項會立即顯示，經 250 ms 防抖的 Host 請求則會加入經過排序的目前對話內容匹配項及其摘要片段。每次新查詢都會中止前一個請求；內容搜尋失敗時，中繼資料匹配項仍會顯示，不另給警告。列表最多顯示 20 條結果。選擇未歸檔結果會清空並收起搜尋、開啟 Session，並在目前瀏覽模式中將其行滾動到可見區域；分組瀏覽還會按需展開所屬 Workspace 和完整 Session 列表。已歸檔結果提供取消歸檔操作；嘗試開啟時會說明限制，不清空查詢，也不導航。

### 管理工作階段

Session 行內的 Rename 操作開啟一個以該行顯示標題預填的對話方塊；確認未修改的標題是有意允許的——這正是把目前自動標題釘住、不再被重新生成覆蓋的手勢。雙擊標題也會開啟 Rename；對於未歸檔 Session，先發生的點選會開啟其對話。Rename 使用臨時 `workspaceOperation` reference，並等待首次歷史開啟。行內 Fork 在源工作階段最後一個已完成輪次處 fork，透過 Session Controller 遞增繼承的持久化標題，不 retain 子工作階段、不開啟其歷史，也不改變選擇。Workspace 行內的 Delete 操作會開啟確認框，說明保留邊界；成功後該分組被移除，其 Session 則留在 Ungrouped 下。Pin、Rename、Fork、Archive 本身就是 `sidebar.workspaces.session.menu.item` 列表的條目（pin 與 archive 同時也是 `sidebar.workspaces.session.row.action` 的條目），因此用戶端外掛的 action 由其 `order` 決定落在哪個位置。

對靜止的 Session，Archive 不經確認對話方塊直接提交，並保留 Session 的記帳位置。仍有工作在跑的 Session 是唯一會先詢問的情形：Host 拒絕普通歸檔並列出這些工作，側欄隨即開啟"停止並歸檔"對話方塊，按族列出——進行中的回合、執行中的子代理、後臺任務、定時提醒，各帶名稱——並寫明恢復路徑；確認後請 Host 按停止按鈕同樣的方式停止這些工作，歸檔集合持久化後即完成歸檔，停止在後臺收斂；取消則讓 Session 繼續執行並保持可見。檢視選項以一組顯式三選一控制顯隱：隱藏已歸檔（預設項）隱藏已歸檔 Session，全部對話（顯示已歸檔）將其納入列表，僅顯示已歸檔則隱藏普通 Session，並丟棄沒有歸檔 Session 的 Workspace；樹形分組下，被丟棄 Workspace 的子級掛到最近一個仍顯示的祖先下。可見的歸檔行置灰，並提供無障礙說明，告知取消歸檔後才能開啟；Rename、Fork 與取消歸檔仍然可用。歸檔成功後的提示提供"撤銷"動作，並在歸檔行仍被隱藏時附帶"篩選已歸檔工作階段"動作，後者直接把篩選切到全部對話（顯示已歸檔）；停止並歸檔顯示同樣的提示但措辭不同，撤銷只恢復 Session，不會讓被停止的工作繼續。取消歸檔移除歸檔標記，但不恢復置頂，也不改變儲存的位置。列表為空時顯示居中的"圖示在上、文字在下"佔位；僅顯示已歸檔檢視用自己的文案（暫無已歸檔工作階段），並附"檢視其他工作階段"文字按鈕，點選把篩選切回隱藏已歸檔。

工作階段更新時間使用 tertiary 文字色，包括已歸檔行。標題寬於所在行時，靜止狀態以省略號裁切。把指標停在行上，標題會滾動到遠端——例如 fork 遞增後的標題——並在揭示時不顯示省略號；指標離開後標題回到開頭。

快捷鍵速查提供新建工作階段、搜尋工作階段、新增工作區、重新命名工作階段、分叉工作階段和歸檔工作階段。桌面預設使用平臺的主修飾鍵，搜尋為 Mod+K；Windows 和 macOS Web 使用[快捷鍵服務的平臺預設值](../shortcuts/README.zh.md)；Linux Web 在使用者設定前不繫結這些命令。按鈕提示和工作階段行選單顯示目前有效繫結。點選選單項操作該行，按快捷鍵操作主工作階段。Windows 和 macOS Desktop 的繫結也可從終端輸入區域和模態對話方塊中執行；其他環境遵循命令的區域和模態限制。搜尋和重新命名的開啟請求歸本包管理，輸入草稿保留在瀏覽器中。目錄選擇或工作區接納尚未結束時，目錄選擇器拒絕重複開啟。分叉捕捉源工作階段，並使用工作階段行相同的 Host 操作選擇最近已完成輪次，不讀取更早的 Client 歷史。沒有工作階段或工作階段為空時不可用；沒有已完成輪次的源工作階段由 Host 拒絕。快捷鍵分叉被拒絕時保留目前選擇、顯示在地化提示，並允許重試；非預期失敗還會保留診斷日誌。

### 待處理互動

Session 行渲染執行時的即時 `pendingInteraction` 分類：審批顯示**等待審批**，計劃審閱顯示**計劃待審**，普通問題顯示**等待回答**。互動待處理期間，該行使用共享 warning 橙點，並以**待批准**、**計劃待審**或**待回答**替換尾部更新時間；懸停詳情仍保留完整狀態和相對時間。待處理互動的優先順序高於共享 ongoing loading；已完成但未檢視的 Session 使用 done，idle 在行內不顯示點，在懸停詳情中使用共享 idle 灰點。 行首 seat 僅在該行的主狀態為 idle 時渲染——沒有待處理互動、沒有自身或後代活動、也沒有未檢視的完成提醒——因此該處的佔用方不會與行自身的狀態點同時出現。歸檔行該格整體留空：既不顯示狀態點也不掛 seat，其活動狀態只出現在懸浮卡片上。

### 活動 Schedule 標識

當成組的與平鋪的 Session 行所對應的 Session 存在活動排程任務時，該行顯示時鐘標記。它是行首 `sidebar.session.row.leading` seat 的佔用方，因此僅在該行主狀態為 idle 時渲染，絕不與行自身的狀態點同時出現；歸檔行該格同樣留空，搜尋結果沒有該 seat，也不顯示標記。它不是按鈕，沒有 Tab stop，點選其所在區域不會開啟整行。標記自身的讀取及其「活動」條件的確切含義由 [ui-schedule](../ui-schedule/README.zh.md) 負責。

-----

`ctx.uiWorkspace.openSession(target)` 會同步替換其擁有的 `mainView` reference，並讓主區域返回 Conversation，而不等待 `reference.ready`，因此歷史載入會顯示在已經選中的 Session 檢視內。目標可以是已知 Session id，也可以是持久的直接父子 subagent 地址；顯式地址不要求預先載入 parent catalog。`openWorkspace(id, beforeOpen?)` 僅在請求未被後續導航替代時開啟結果；新工作階段使用 `openWorkspace`。`forkSession(id)` 建立子工作階段，不導航，也不替代尚未完成的導航。可選的同步準備回呼在目標被 retain 後執行，並且僅對仍有效的 Workspace 請求執行，因此過期請求不會搬移 composer 草稿。後續導航或 owner 釋放會阻止晚到的 UI 提交，但不取消底層 Session 建立。啟動恢復會 retain 主 reference，不改變已選面板，也不取消後續導航。歸檔主 Session 會釋放其 reference 並清除主選擇。選擇失敗時保留目前全域面板。Session 行讀取 `usePanelInfo`，在全域面板活躍時不顯示 Session 選中樣式；僅把焦點移到搜尋框或目錄選擇器不會離開該面板。

導航和啟動恢復透過所選 Session 的 `follow` 取得投影，不會另行重新整理該 Session 或其父工作階段的投影。

新建工作階段嘗試取得列表中第一個符合條件的空白工作階段；啟動恢復嘗試已儲存的空白工作階段。若該寫鎖被佔用，導航直接新建 Session，不再嘗試其他空白工作階段。其他取得錯誤會中止請求：顯式新建工作階段或在 hero 中選擇工作區時，失敗以短暫提示展示，引用 Host 的錯誤碼和訊息（例如 preset 掛載失敗），非 Host 拒絕的失敗則顯示其自身訊息；已被後續導航或 owner 銷燬取代的請求不彈提示，啟動恢復仍只報告到控制檯。已釋放的空白工作階段被複用時保留 slash 命令狀態。後續導航會取消尚未完成的啟動選擇。

Host 的工作區基線已列出永久預設工作區，因此啟動恢復會選中一個工作區，並建立或複用其空白 Session。預設工作區的行選單隻提供重新命名，不提供刪除。Workspace 和 Session 的啟動基線都為空時（即 Host 未能準備預設工作區），啟動流程會再呼叫一次 `workspaces.initializeDefault`。選中 Session 後輸入框才可編輯，不會自動提交訊息。後續導航或所屬上下文銷燬會阻止啟動流程選中其結果。預設工作區建立失敗時顯示短暫提示，引導使用者透過“選擇工作區”選擇資料夾，直到下次啟動才重試。Session 建立失敗沿用普通的恢復錯誤處理。登記成功的工作區在 Session 建立或後續提交失敗時仍然保留。

首次使用的目錄名與其儲存標題都是固定的，都不跟隨讀者語言：`workspaces.initializeDefault` 不攜帶任何名稱，同一安裝環境在切換語言後仍只有一個磁碟路徑和一個儲存標題。仍保留該自動標題的工作區，在本包展示它的所有位置——側欄行及其懸浮卡片、搜尋結果元資訊、hero 選擇器選單、重新命名與刪除對話方塊——都透過控制器的 `workspaceDisplayTitle` 顯示為在地化的預設名稱。重新命名對話方塊以螢幕上的標籤作為初值，而判斷確認是否需要儲存用的是儲存標題，因此對這類工作區直接確認未改動的初值即可固定該名稱，該行不再跟隨語言；重名檢查按工作區身份而非標題排除目標自身。

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本包是一條組合：兩個目標 slot 都由其他外掛宣告，因此 `apply` 使用 `slots.inject()` 在各自的宣告生命週期內完成註冊，並在目標 slot 的宣告恢復後重新註冊。

瀏覽器入口還為每個 Session 行宣告兩個 root 作用域的 `list` 子 slot：`sidebar.session.row.leading` 僅在該行主狀態為 idle 時渲染、歸檔行留空，`sidebar.session.row.hover` 僅在該行的懸浮卡片開啟時掛載。兩者只接收行的 Session 身份，佔用方據此讀取自己的資料；Session 作用域的 slot 會強制建立 Session 繫結，從而啟用並保留列表中每個 Session。

### 目錄流子 slot

每個註冊各自宣告一個**目錄流子 slot**（`single` kind：`conversation.hero.workspace.directoryFlow`／`sidebar.workspaces.directoryFlow`），由組合的選擇器包 client half 填入其選取互動——`-native` 後端的無渲染 OS 選擇器驅動，`-browse` 組合下則是應用內瀏覽對話方塊。平鋪顯示的**新增工作區…** 操作僅在目前介面的 slot 被佔用時渲染；slot 為空意味著該組合沒有目錄選擇能力。本包持有觸發與接納：佔用方透過 slot 的屬主互動約定（`open`/`busy`/`onPicked`/`onCancel`/`onError`）每次開啟上報一個所選路徑，owner 透過物件層接納它，並等待 Workspace 列表投影重新整理後才選中已提交的 Workspace。

### Session 行 action

Session 行的 "..." 選單和行尾懸停按鈕是 WorkspaceBrowser 註冊項宣告的兩個 `list` slot：`sidebar.workspaces.session.menu.item` 與 `sidebar.workspaces.session.row.action`。每一個選單行、每一個懸停按鈕都是條目，本包自己的 action 也不例外：`apply` 以用戶端外掛註冊自己 action 的同一方式註冊 `pin`（選單 100、按鈕 200）、`rename`（200）、`fork`（300）、`archive`（選單 400、按鈕 100），因此外掛 action 落在其 `order` 所指的位置，以另一個 `priority` 複用內建 id 則遮蔽該 action。

條目只接收行身份（`sessionId`、`displayTitle`），其餘一切自己負責：用自己注入的 hook 讀自己關心的 Host 狀態（置頂與歸檔集合，以每次 Workspace 快照只派生一次的 Set 形式），自己決定是否顯示（Host 規定歸檔與置頂互斥，所以 pin 在歸檔行上不渲染），整套行為放在註冊項自己的 `inject` face 裡（置頂成功後順帶把工作階段推到儲存順序最前，歸檔成功後發提示），浮層也自己帶——重新命名對話方塊、停止並歸檔對話方塊和行 action 的提示是本包註冊在 `shell.overlay` 的條目，由 action 注入的請求驅動。選單條目渲染一個 `role="menuitem"` 的按鈕（本包自己的行用 ui-primitives 的 `MenuItemButton`，它帶主機樣式，開啟新分組的行加 `separatorBefore`，分隔線隨行一起出現和消失），並透過 slot 級 `useMenuOpenState` hook（選單自身的開啟狀態，從該行的渲染出現處繫結）關閉選單；懸停按鈕條目渲染一個圖示按鈕，按鈕條會攔住點選、不讓它開啟該行。browser 不再向行傳任何 action 回呼，它剩下的動作只有搜尋結果裡的恢復按鈕和標題雙擊，後者發出的是同一個重新命名請求。

#### 打包用戶端外掛

按照 Client 依賴規則，將 `ui-workspace`、`ui-slots`、`ui-renderer`、`client-locale` 與 `ui-primitives` 宣告為瀏覽器／型別開發依賴。純型別的 `ui-workspace/client` import 會載入本包的 `SlotMap` 宣告；缺少該 import 時，獨立編譯的外掛不會知道這些 slot key。Component 保持模組級穩定身份；使用者可見文案由貢獻包自己的 locale namespace 持有。

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, LocaleDictOf, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { exportSession } from './export-session.ts'

const NS = 'acme.sessionActions'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acme.sessionActions': 'export'
  }
}

const en: LocaleDictOf<typeof NS> = { export: 'Export {title}' }
const zh: LocaleDictOf<typeof NS> = { export: '匯出 {title}' }

interface ExportRowInjected {
  exportSession: (sessionId: SessionId) => void
}

type ExportRowProps =
  PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<typeof NS>
  & InjectFace<ExportRowInjected>

function ExportRow({ sessionId, displayTitle, useMenuOpenState, exportSession, t }: ExportRowProps) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton separatorBefore onSelect={() => { setMenuOpen(false); exportSession(sessionId) }}>
      {t('export', { title: displayTitle })}
    </MenuItemButton>
  )
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'acme-session-actions: dictionaries')

  // Order 500 places the row after the shipped Archive (400); `separatorBefore` opens the plugin group.
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item',
    id: 'acme.export-session',
    order: 500,
    locale: NS,
    inject: (): ExportRowInjected => ({ exportSession }),
  }, ExportRow))
}
```

即使 owner 通常已經存在，也必須使用 `ctx.slots.inject()`：它等待宣告，在宣告摺疊時移除貢獻項，並在宣告恢復後重新註冊。註冊項的 `inject` factory 可以閉包使用外掛已宣告的 Cordis service；Component 只接收投影后的資料和 callback。懸停按鈕以同樣方式註冊到 `sidebar.workspaces.session.row.action`，渲染一個圖示按鈕。

#### 動態用戶端包

動態載入的 browser half 採用同一套元件協定，能拿到哪些模組取決於它走哪條 lane。Module Loader 包（`factory(require)`，即真實 Loader/Web fixture 那種）把 `@deepseek-ai/dsh-client-ui-primitives` 當作隱式 baseline external：透過 loader 的 `require` 解析 `MenuItemButton`，不要把 primitive 列為執行時依賴或打包另一份副本，僅在原始碼編譯需要其型別時宣告開發依賴。`cordis-client-runner` 閉包（生成的 Client Slot catalog 面向的讀者）無法 import 任何東西：它用 `React.createElement` 渲染自己的 `role="menuitem"` `<button>`，樣式經 `styles.insert` 注入，並透過同一個 `useMenuOpenState` hook 關閉選單，catalog 裡的範例就是這個寫法。

### 檢視狀態

Workspace 基線就緒後，瀏覽器持久化的展開狀態和 Session 順序記錄只保留目前 Workspace id、Ungrouped 和單列表記帳。`WorkspaceView.sessionIds` 提供真實 Workspace 的成員關係，而不提供 Session 顯示順序。檢視操作接收完整記帳順序，而不是篩選後的行。尚無 Session 摘要的新成員會等待摘要，已儲存的位置則在摘要暫時缺失時保留。歸檔顯隱僅在派生行時應用。置頂和拖拽寫入完整順序，普通派生不執行寫入。目前選中的空白 Session 仍是一次顯式位置寫入；Workspace 重連時同樣如此，此時保留其他已儲存成員，直到基線確定成員關係。側邊欄收成窄欄或搜尋替代列表主體時，排序仍保持掛載。最近更新從目前摘要派生，不讀取已儲存位置；時間相同時按 Session id 穩定排序。

側邊欄隱藏持久化摘要中帶有 `origin: 'subagent'` 的行。可見普通行的共享 ongoing loading 來自其已載入 parent 目錄中正在執行的直接 child，絕不來自摘要譜系。Child 活動狀態使用最新 UI status，尚無該狀態時使用 Session 摘要。

行動畫由 [AnimatedRows](src/client/rows/AnimatedRows.tsx) 負責。它僅在 React 提交改變行成員或順序時讀取更新前後的位置，並使用瀏覽器原生位移與透明度動畫。被移除的行以不可互動的副本在滾動列表外淡出，不會延遲 React 解除安裝，也不會擴大列表的滾動範圍。初始載入、拖拽提交、展開其餘工作階段和檢視選項變化直接完成。動畫元件不使用佈局觀察器或輪詢，也不會因僅內容更新或滾動而測量位置。

### 懸浮卡片

Workspace 與 Session 懸浮卡片會複製對應行被截斷的值：啟用 Workspace 卡片會寫入其完整目錄路徑，啟用非空白 Session 卡片則會寫入其完整顯示標題。臨時的空白「新工作階段」卡片保持只讀，因為其在地化標籤是佔位文案，並非工作階段內容。 Session 卡片在卡片開啟期間還會在相對時間與行尾狀態行之間渲染 `sidebar.session.row.hover` seat，與行自身狀態無關。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋側邊欄主機、主視覺區介面與選取後端。

- [ui-sidebar](../ui-sidebar/README.zh.md)——承載 `sidebar.workspaces` 子 slot 的側邊欄外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——承載 Session Intent 主視覺區選擇器子 slot 的聊天介面。
- [directory-picker-native](../../host/directory-picker-native/README.zh.md)——填充目錄流子 slot 的 OS 選擇器後端。
- [Workspace Controller](../../api/workspace-controller/README.zh.md)——負責 Workspace、成員關係與 Workspace 分組順序的 Host 變更和框架無關 Client 投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 外掛層，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義搜尋深度、歸檔介面與選取載體；它們是目前包約束。

- **沒有模糊內容搜尋或事件深連結**：內容後端採用字面 token/短語匹配，選擇結果會開啟 Session，而不是匹配的事件。
- **沒有 Session 刪除**：工作階段可以歸檔但絕不會被刪除；已歸檔的行透過「已歸檔工作階段」檢視篩選與搜尋結果中的取消歸檔操作原位恢復，刪除 Workspace 註冊記錄不會刪除 Session。
- **待處理的使用者互動不會聚合到摺疊的分組上**：摺疊分組內正在等待的行不會點亮分組頭指示，只有展開該分組後才可見。
- **原生資料夾選擇依賴本地 Host 載體**：在 `-native` 組合下，程序內部署或遠端瀏覽器部署無法開啟本地作業系統對話方塊；可遠端的選取是 `-browse` 組合的應用內流程。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。這是一個純消費方外掛，只向兩個由主機宣告的 slot 註冊展示元件，並註冊自身的 locale dictionaries；inject face 由無狀態 RPC 包裝層和一次 create-and-open 呼叫組成；本外掛不發出 Cordis 事件，也不持有跨外掛可變狀態。
