/**
 * Coding-CLI tool cards, node half. The empty apply gives Loader a host-side
 * row while the browser half ships through `exports["./client"]`; the
 * `coding-cli/tool` events themselves belong to `dsh-llm-coding-cli`.
 */

/** Host plugin body — this package contributes browser presentation only. */
export function apply(): void {}
