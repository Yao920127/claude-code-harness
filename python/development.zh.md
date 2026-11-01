# Python 貢獻者工作流

[English](development.md) | 中文

根據所需的貢獻者成果選擇工作流：建置執行時產物、驗證 SDK、從原始碼執行或建置分發包。包行為分別見 [SDK 參考](sdk/README.zh.md) 和[執行時載體參考](sdk-runtime/README.zh.md)。

## 建置執行時產物

各平臺可執行檔案是建置產物，不檢入 git。請在儲存庫根目錄執行建置：

```sh
pnpm install
pnpm exec tsx scripts/build-exe-for-python-sdk.ts
```

所需 `lib/` 產物已存在時使用 `--skip-build`；如需選擇平臺，請使用 `--targets=node24-linux-x64,node24-linux-arm64,node24-macos-arm64,node24-macos-x64,node24-win-x64`。每個目標都應在其原生架構上建置。產物寫入 `dist-exe/`，腳本會將所選載體同步到 `python/sdk-runtime/`。Windows 會生成 `.exe` 與 `-rg.exe`；macOS 建置還會同步 `node-pty` 所需的配套 spawn 輔助程式。

## 驗證 SDK

請將虛擬環境放在 `python/` 之外，安裝測試組，然後執行 Python 測試套件：

```sh
export UV_PROJECT_ENVIRONMENT="$PWD/tmp/py-sdk-venv"
uv sync --project python/sdk --group test
uv run --project python/sdk pytest
```

`python/sdk/tests/test_bundled_runtime.py` 會執行可用的內建載體；某個載體的產物尚未建置時，會跳過該載體。儲存庫級測試政策見 [測試](../docs/testing.zh.md)。

該套件面向的是偽造的執行時對端。`scripts/smoke-python-runtime.py` 面向打包執行時。`python-runtime` CI 任務在拉取請求上建置 Linux x64 與 Windows x64，在 master 推送上建置 Linux arm64 與兩種 macOS 架構。每個選定目標把匹配的 SDK wheel 包與執行時 wheel 包安裝進新的 Python 3.10 虛擬環境，在 checkout 外清除 `PYTHONPATH` 與 `DSH_RUNTIME_MODE` 後執行，證明兩個模組及可執行檔案都來自這些 distribution，然後執行全部 keyless 情境。聚焦的本地原始碼 SDK 執行可以選擇一個已建置可執行檔案與情境：

```sh
uv run --project python/sdk python scripts/smoke-python-runtime.py \
  --scenario sdk-minimal --exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64
```

SDK 情境會比對 `scripts/snapshots/python-sdk-single-exe/` 下已提交的期望輸出。`minimal/model-visible.json` 固定 Linux／macOS `sdk-minimal` profile 所組裝的系統提示詞、對外公佈的工具 schema 與模型可見訊息；`minimal/win-x64/model-visible.json` 固定對應的 PowerShell 版本。因此，外掛一旦貢獻出計劃外的系統分段或 user 訊息，該任務即失敗，且該 profile 發出的每條訊息都會參與比對。`advanced/` 跨所有目標固定一個複雜程序的 SDK 結果及父／子工作階段日誌。`restart/` 針對同一持久化根目錄啟動兩個完整 SDK 執行時程序，並跨所有目標固定其彼此隔離的模型歷史、高層結果與獨立持久日誌。`sdk-minimal-in-history` 複用持久 shell 與編輯器情境，並在首次 shell 呼叫成功後更改一個分段。`minimal-in-history/prompt-history.json` 固定兩個提示詞版本、後續請求中不變的首條提示詞、追加的 SDK system-message 事件及 `request/context.systemPromptUpdate`；工具 schema 保持不變，並獨立檢查編輯器建立的檔案。`sdk-dynamic-tools` 在 `dynamic-tools/tool-history.json` 中固定原生工具的新增與移除，包括歷史 header 引用，以及 Python SDK 結果、通知與持久事件的一致性。重新執行對應情境時加上 `--update-snapshots`，並在提交前審閱該差異。

`advanced` 與 `restart` 的比較按每份輸入自身的 Session 代際匹配原生 delivery 限定值，包括 SDK 事件與通知。捕捉的代際及其他 delivery 代際保留數值。每一側的 Session 角色必須使用同一個代際，新日誌必須標識目前寫入器。比較絕不重寫已提交的記錄。

可信拉取請求與 master 推送還會在各自選定的原生目標上執行 `--scenario sdk-live --installed-wheel`。該情境面向 `https://api.deepseek.com` 執行兩個使用工具的輪次：立即檢查已建立檔案，將其內容替換為僅主機知道的隨機挑戰值，並要求第二輪將變更後的內容複製到全新的回執檔案，且不修改原始檔。兩個輪次都必須完成、返回精確的哨兵答案並由模型請求呼叫工具；檔案透過外部逐位元組比較驗證。儲存庫金鑰缺失時失敗，而不是自行 skip。Fork 與 Dependabot 拉取請求會執行完整的 keyless 安裝後 wheel 路徑，但不會獲得金鑰。

互動式冒煙測試需要環境變數或儲存庫根目錄 `.env` 中存在 `DEEPSEEK_API_KEY`：

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(dsh_home="/absolute/path/to/test-dsh-home") as harness:
    print(harness.run("say hi").final_response)
```

也可以匯出非空 `DSH_HOME`。SDK 會拒絕可能靜默使用 `~/.dsh` 的啟動。

## 針對 Node 原始碼執行

儲存庫貢獻者可以選擇以下任一開發路徑；兩者都執行普通的 `dsh --profile sdk` 啟動器：

- 設定 `DSH_RUNTIME_MODE=node`，在系統 Node `>=22.19` 上使用已建置的 Node 載體。建置腳本會重新整理該載體，但分發物絕不會包含或自動選擇它。
- 將 `dsh_bin` 設定為已建置 `apps/cli/lib/bin.js` 的絕對路徑，直接驗證目前 checkout 的 CLI。請顯式提供 `dsh_home`，並按需提供 `profile` 與有序 `patches`。

`python/sdk/tests/manual_sdk_agent_smoke.py` 使用內部 `_launch_args` 測試介面卡，透過 tsx 驗證未建置的 TypeScript CLI。公開 SDK 刻意不提供任意 argv 替換。

## 建置分發包

根目錄 `package.json` 的版本是兩個 Python 分發包的權威版本。暫存腳本會將該版本注入兩個 wheel 包，並將 SDK 固定到同版本的 `deepseek-harness-runtime-bin`。

純 SDK wheel 包只需建置一次；每個原生平臺分別建置一個執行時 wheel 包：

```sh
version="$(python - <<'PY'
import runpy

release = runpy.run_path("scripts/build-python-release.py")
print(release["pep440_version"](release["repository_version"]()))
PY
)"
python scripts/build-python-release.py --package sdk --output-dir dist-python
python scripts/build-python-release.py --package runtime --platform macos-arm64 --runtime-exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64 --output-dir dist-python
pip install \
  "dist-python/deepseek_harness_sdk-$version-py3-none-any.whl" \
  "dist-python/deepseek_harness_runtime_bin-$version-py3-none-macosx_14_0_arm64.whl"
```

執行時分發包僅提供 wheel 包。釋出流水線會連同純 SDK wheel 包一起釋出五個平臺 wheel 包：Linux x64、Linux arm64、macOS 14 或更高版本的 arm64 與 x64，以及 Windows x64（`win_amd64`）。只有與儲存庫版本匹配時，才接受 `python-v<repository-version>` 標籤；`0.0.1-rc.1` 之類的儲存庫預釋出版本在 wheel 包檔名和中繼資料中使用規範化的 PEP 440 寫法，例如 `0.0.1rc1`。

## 驗證候選發行版

手動執行 GitHub 的 `Release (Python)` 工作流並設定 `publish=false`，即可建置全部六個 wheel 包，在 Python 3.10 和 3.14 上安裝 Linux 發行集合，檢查精確檔名和中繼資料，執行 PyPI 預設單檔案大小限制，並保留一份帶 SHA-256 雜湊的彙總產物。該執行沒有註冊表憑證，dry-run 執行無法進入任何釋出作業。

公開發布從私有自動化儲存庫執行。包中繼資料指向獨立的只讀公開原始碼映像，該映像不執行釋出 Actions。私有儲存庫把儲存庫變數 `PYPI_PUBLISHER_REPOSITORY` 定義為自身的 `owner/name`，並且只在有意釋出期間把 `PUBLIC_PYPI_RELEASE_ENABLED` 從 `false` 改為 `true`。

獨立的執行時與 SDK 作業使 SDK 上傳失敗後可以繼續執行，而無需重新傳送不可變的執行時檔案。只有工作流從設定的釋出儲存庫、匹配的 `python-v*` 標籤執行，且受保護的 `pypi-runtime` 和 `pypi` 環境分別批准執行時與 SDK 作業時，才接受 `publish=true`。PyPI Trusted Publishing 仍會提供短期 OIDC 憑證，但公開 attestation 會披露私有釋出儲存庫身份，因此將其停用。
