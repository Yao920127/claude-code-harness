/** Register the Source Control page type in the right Sidebar and the GitHub Settings page over the Host `git` Remote. */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SOURCE_CONTROL_ID, sourceControlDefinition } from './definition.tsx'
import { en, zh } from './locales.ts'
import { SourceControl, type GitCommands } from './source-control.ts'
import { SourceControlBody, type SourceControlInjected } from './SourceControlBody.tsx'
import { SourceControlTitle } from './SourceControlTitle.tsx'
import { GithubSection, type GithubSectionInjected } from './GithubSection.tsx'

export type { GitAction, GitCommands, GitNotice, GithubState, RepositoryState } from './source-control.ts'
export { SourceControl } from './source-control.ts'

/** Milliseconds between sign-in checks while a GitHub sign-in waits for its one-time code. */
const LOGIN_POLL_MS = 3000

/** Required services: slots, copy, the right Sidebar's tab registry, and the mounted `git` Remote. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.git']

/**
 * Resolve a Remote result or reject with its failure.
 * @param call - pending Remote call.
 * @returns the business result.
 */
async function value<T>(call: Promise<RemoteResult<T>>): Promise<T> {
  const result = await call
  if (!result.ok) throw result.error
  return result.value
}

/**
 * Register the Source Control type, its Start-page entry, and its page.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const namespace = 'sourceControl'
  const t = ctx.locale.bind(namespace)
  const git = ctx.remote.git
  const commands: GitCommands = {
    status: sessionId => value(git.status(sessionId)),
    init: sessionId => value(git.init(sessionId)),
    stage: (sessionId, paths) => value(git.stage(sessionId, paths)),
    unstage: (sessionId, paths) => value(git.unstage(sessionId, paths)),
    commit: (sessionId, message) => value(git.commit(sessionId, message)),
    push: sessionId => value(git.push(sessionId)),
    pull: sessionId => value(git.pull(sessionId)),
    githubAccount: () => value(git.githubAccount()),
    githubLogin: () => value(git.githubLogin()),
    githubLogout: () => value(git.githubLogout()),
    githubRepositories: () => value(git.githubRepositories()),
    githubClone: nameWithOwner => value(git.githubClone(nameWithOwner)),
    githubPublish: (sessionId, visibility) => value(git.githubPublish(sessionId, visibility)),
  }
  const control = new SourceControl(commands, LOGIN_POLL_MS, (url) => { window.open(url, '_blank', 'noopener') })
  ctx.effect(() => () => { control.dispose() }, 'ui-git.state')
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-git.copy')
  ctx.effect(() => ctx.sidebarRightTabs.register(sourceControlDefinition(t)), 'ui-git.type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: SOURCE_CONTROL_ID, locale: namespace,
    inject: (sessionId): SourceControlInjected => ({
      hooks: { repository: control.repository(sessionId), github: control.github },
      refresh: () => { control.refresh(sessionId) },
      setMessage: (message) => { control.setMessage(sessionId, message) },
      init: () => { control.init(sessionId) },
      stage: (paths) => { control.stage(sessionId, paths) },
      unstage: (paths) => { control.unstage(sessionId, paths) },
      commit: (push) => { control.commit(sessionId, push) },
      push: () => { control.push(sessionId) },
      pull: () => { control.pull(sessionId) },
      sync: () => { control.sync(sessionId) },
      publish: (visibility) => { control.publish(sessionId, visibility) },
      refreshAccount: () => { control.refreshAccount() },
    }),
  }, SourceControlBody)), 'ui-git.page')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: SOURCE_CONTROL_ID,
  }, SourceControlTitle)), 'ui-git.title')
  // GitHub sign-in and cloning belong to the account, not to one Session, so they live in Settings.
  const github: GithubSectionInjected = {
    hooks: { github: control.github },
    refreshAccount: () => { control.refreshAccount() },
    login: () => { control.login() },
    logout: () => { control.logout() },
    loadRepositories: () => { control.loadRepositories() },
    clone: (nameWithOwner) => { control.clone(nameWithOwner) },
  }
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'github', order: 15, label: () => t('github'), locale: namespace, inject: () => github,
  }, GithubSection)), 'ui-git.settings')
}
