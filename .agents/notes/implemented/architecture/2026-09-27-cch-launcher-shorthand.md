# Agent Note: cch launcher shorthand

Status: implemented

English | [中文](2026-09-27-cch-launcher-shorthand.zh.md)

## Problem

The CCH Desktop profile composes the Claude Code route, Claude brand, and Traditional Chinese bundles, while `dsh web` boots the plain `web` template. A developer running the Web application from source therefore saw a different product than Desktop, and had no short terminal command for Claude Code Harness. The [application-launch rule](../../../../docs/architecture.md#application-launch) allows only `dsh` profiles to launch supported Node applications.

## Decision

`@deepseek-ai/dsh-app-boot` exports `CCH_PROFILE_BUNDLES` and ships a `cch` profile template with that list; the Desktop project manager composes the same constant, so the two cannot drift. `@deepseek-ai/dsh` ships a second bin, `cch`, that translates its commands into `dsh` invocations on the `cch` profile: `cch web` into `dsh --profile cch`, `cch plugin` into `dsh plugin --profile cch`, and `cch config` into the config dumps. Both entries share one dispatch module, so `cch` adds no boot behavior. The only native command, `desktop` and the default, opens the installed Desktop application with `open -a`, because the Electron application owns the Desktop profile and the CLI must not boot or manage it. The root `cch`, `start:web`, and `dev:web` scripts launch through `apps/cli/src/cch.ts`, and `verify-application-entrypoints` classifies the bin, its source, and the `cch` script.

## Alternatives considered

**Make `cch` a shell alias or a root script only.** An alias is per-machine, and a root script works only inside the repository; the bin installs with the CLI and keeps one grammar for `pnpm cch` and a globally linked `cch`.

**Boot the Desktop profile from `cch`.** The Desktop profile's packages, lock, and lifecycle belong to Electron; booting it from the CLI would race the application's profile lock and bypass its recovery.

**Change the `web` template to the CCH bundles.** `web` is the upstream DeepSeek composition that tests, the WebWorker preview, and other profiles derive from; a separate template keeps both compositions available.

## Consequences

`cch` opens Desktop only on macOS; other platforms print a message pointing to `cch web`. The `cch` profile is an ordinary CLI profile under `$DSH_HOME/profiles/cch`, separate from Desktop's plugin installations, and it shares sessions and settings with other CLI profiles. The CLI installation now depends on the four CCH bundles so that `cch` resolves them without a profile-local install.
