# Agent Note: cch profile

Status: implemented

English | [中文](2026-09-27-cch-profile.zh.md)

## Problem

The CCH Desktop profile composes the Claude Code route, Claude brand, and Traditional Chinese bundles, while `dsh web` boots the plain `web` template. A developer running the Web application from source therefore saw a different product than Desktop. The [application-launch rule](../../../../docs/architecture.md#application-launch) allows only `dsh` profiles to launch supported Node applications.

## Decision

`@deepseek-ai/dsh-app-boot` exports `CCH_PROFILE_BUNDLES` and ships a `cch` profile template with that list; the Desktop project manager composes the same constant, so the two cannot drift. The CLI installation depends on the four CCH bundles so that the profile resolves them without a profile-local install. The repository's `pnpm cch web` script, `scripts/cch.mjs`, runs the source launcher with `--profile cch` and hands later arguments to the Web application; `start:web` and `dev:web` boot the same profile. `verify-application-entrypoints` classifies the `cch` script as a wrapper over the dsh launcher. `verify-default-product-isolation` reads the shared list where the template names it by reference.

## Alternatives considered

**Ship a global `cch` bin that opens Desktop and forwards `web`, `plugin`, and `config`.** It was built and removed: the product does not offer a terminal command, and a second bin duplicated the launcher's grammar for no shipped consumer.

**Change the `web` template to the CCH bundles.** `web` is the upstream DeepSeek composition that tests, the WebWorker preview, and other profiles derive from; a separate template keeps both compositions available.

## Consequences

The `cch` profile is an ordinary CLI profile under `$DSH_HOME/profiles/cch`, separate from Desktop's plugin installations, and it shares sessions and settings with other CLI profiles. `pnpm cch` accepts only `web`.
