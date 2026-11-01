---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-01-coding-cli-tool-event

English | [中文](2026-11-01-coding-cli-tool-event.zh.md)

## Summary

Adds the log-only coding-cli/tool event that records each tool call a coding CLI ran inside its own model turn.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-01-coding-cli-tool-event
baseline: false
changes:
  - root: "event:coding-cli/tool"
    previous: null
    after: "563565881151791031b8f990719507bd5e4ae5f2a9d823c9a353585c1cb5c5e1"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

New event type only; existing records are unchanged. The event never enters derived history or a model request, so a build without the coding-CLI routes reconstructs every Session the same way.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/llm/llm-coding-cli packages/client/ui-coding-cli-tools: 72 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
