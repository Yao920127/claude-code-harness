# Claude Code Harness

English | [中文](README.zh.md)

Claude Code Harness (CCH) is a fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the open-source agent harness developed by [DeepSeek AI](https://deepseek.com). It keeps the upstream plugin architecture and adds a model route that runs [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) with the Claude Code login already on your machine, so you can talk to Claude Code from the harness Web UI or the desktop app without entering an API key.

> This project is not affiliated with, endorsed by, or sponsored by Anthropic or DeepSeek. Report problems with this fork in [this repository's issues](https://github.com/Yao920127/claude-harness/issues), not upstream.

## What this fork adds

- **Claude Code model route** — [`dsh-llm-claude-code`](packages/llm/llm-claude-code/README.md) runs each model call as one Claude Code turn through the official Claude Agent SDK. The model selector lists the models your Claude account can use, such as Claude Sonnet 5 and Claude Fable 5.1. Claude Code runs its own tools and asks for permission through the harness approval card.
- **Claude Code as the default** — the [`dsh-cch`](packages/bundle/cch/README.md) bundle makes Claude Code the default model and removes the DeepSeek model routes and DeepSeek account sign-in.
- **Traditional Chinese interface** — [`dsh-client-locale-zh-hant`](packages/client/locale-zh-hant/README.md) adds a 繁體中文 language that converts the Simplified Chinese dictionaries with OpenCC, and the app starts in it by default; the desktop menus, dialogs, and sign-in screen use Traditional Chinese too.
- **Claude look** — [`dsh-client-ui-brand-claude`](packages/client/ui-brand-claude/README.md) shows the Claude mark and applies a cream-and-coral palette with Inter and EB Garamond, following [DESIGN.md](DESIGN.md). Light, dark, and system appearance all work.
- **Desktop app** — the Electron app is named Claude Code Harness. It checks your Claude Code sign-in at startup and offers the official browser sign-in when you are signed out. It keeps its data in `~/.cch`, separate from a DeepSeek Harness installation, and builds as an unsigned macOS disk image.

## Before you start

- Node.js `^22.19` or `>=24` and pnpm, to build from source.
- A Claude account that can use Claude Code. The harness uses the Claude Code CLI that ships with the Agent SDK, so you do not need to install Claude Code separately; the desktop app signs you in, and from source you can sign in once with `claude` and `/login` if you have the CLI.
- Read the [safety notice](SAFETY.md). Claude Code can run commands and edit files in the workspace you choose.

## Run

### Desktop app (macOS, Apple silicon)

Build the unsigned disk image from a checkout:

```sh
git clone https://github.com/Yao920127/claude-harness.git
cd claude-harness
pnpm install
pnpm run package:desktop:mac:arm64:unsigned
```

The disk image is written to `apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/`. Drag Claude Code Harness to Applications. Because the app has no Apple Developer signature, macOS blocks its first launch: right-click the app in Finder and choose **Open**, or allow it in **System Settings → Privacy & Security**. If you are not signed in to Claude Code, the app shows a sign-in screen before the workspace. See the [desktop README](apps/desktop/README.md) for packaging details.

### Run from source

Run the Web UI from a checkout:

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

`pnpm run build` prepares the repository artifacts, and `pnpm dsh web` uses them without rebuilding. The `plugin add` step adds the Claude Code packages to the `web` profile once; without it, `pnpm dsh web` runs the upstream DeepSeek Harness setup, which needs a DeepSeek API key. The Web UI starts at `http://127.0.0.1:3080` and opens in your browser; pass `--no-open` to only start the server. See the [Web UI guide](docs/user/guide/index.md).

## Developer preview

The upstream project is in _developer preview_ and changes quickly, and this fork follows it. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Development

Start with the [development guide](docs/development.md) and the [architecture documentation](docs/architecture.md). `pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits, and `make help` lists the Make targets for Web and Desktop. Agents follow [AGENTS.md](AGENTS.md), and contributors follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Claude Code Harness is built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) by DeepSeek-AI. Its **everything-is-a-plugin** architecture is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512). Upstream documentation is at [deepseek-harness.github.io/deepseek-harness](https://deepseek-harness.github.io/deepseek-harness/), and upstream feedback belongs in [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).

If you cite the harness, cite the upstream project:

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## Trademarks and distribution

Claude, Claude Code, and the Claude mark are trademarks of Anthropic. DeepSeek is a trademark of DeepSeek. Each user signs in with their own Claude account, and use of Claude Code follows Anthropic's terms. Distributing a build that displays the Claude name and mark, or that offers Claude Code sign-in to other people, requires Anthropic's permission. Inter and EB Garamond are used under the SIL Open Font License 1.1.

## License

[MIT](LICENSE), retaining the upstream copyright of DeepSeek. Third-party dependencies and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
