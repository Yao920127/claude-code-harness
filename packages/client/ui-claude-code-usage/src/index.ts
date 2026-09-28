/**
 * Claude Code usage plugin, node half. The empty apply gives Loader a
 * host-side row while the browser half ships through `exports["./client"]`;
 * the usage Remote itself belongs to `dsh-llm-claude-code`.
 */

/** Host plugin body — this package contributes browser presentation only. */
export function apply(): void {}
