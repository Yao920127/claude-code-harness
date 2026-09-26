/** Brand copy for the Claude occupants: the product name and the hero headline. */

/** Keys of the `brand.claude` namespace. */
export type BrandClaudeKey = 'name' | 'headline'

/** Chinese copy. */
export const zh: Record<BrandClaudeKey, string> = {
  name: 'Claude Code',
  headline: '创造令人振奋的，维护不可或缺的。',
}

/** English copy; the headline is the Claude Code product tagline. */
export const en: Record<BrandClaudeKey, string> = {
  name: 'Claude Code',
  headline: 'Create what’s exciting. Maintain what’s essential.',
}
