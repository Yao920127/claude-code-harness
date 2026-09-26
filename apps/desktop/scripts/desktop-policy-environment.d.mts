/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * Resolve policy settings before artifact preparation or signing.
 * @param environment File-owned release settings; only the selected origin is required.
 * @returns Policy metadata with deployment-selected origin and authentication.
 */
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv): DesktopPolicyEnvironment
/**
 * Resolve the policy for one build, where an unsigned local build may omit it.
 * @param environment - Packaging environment.
 * @param unsigned - Whether the build is an unsigned local build.
 * @returns The policy, or undefined for an unsigned build that configures no mandatory-update origin.
 */
export declare function resolveBuildPolicyEnvironment(environment: NodeJS.ProcessEnv, unsigned: boolean): ReturnType<typeof resolveDesktopPolicyEnvironment> | undefined
