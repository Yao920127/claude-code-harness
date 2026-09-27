/** General Settings guidance for installing the `cch` command line from a source checkout. */
import { useState } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CommandLineRow.module.css'

/** Shell command that builds the source checkout and links `dsh` and `cch` onto the user's PATH. */
export const CCH_INSTALL_COMMAND = 'pnpm install && pnpm run build && pnpm --filter @deepseek-ai/dsh link --global'

/** The `cch` commands the row lists, each with its copy key. */
const COMMANDS = [
  ['cch', 'commandLine.cmd.desktop'],
  ['cch web', 'commandLine.cmd.web'],
  ['cch plugin add <package>', 'commandLine.cmd.plugin'],
  ['cch config', 'commandLine.cmd.config'],
] as const

/**
 * Render the install command with a copy action and the commands `cch` offers.
 * @param props - runtime share and localized copy.
 * @returns the General Settings row.
 */
export function CommandLineRow({ t }: PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>) {
  const [copied, setCopied] = useState<boolean | undefined>(undefined)
  return <div className={css.row}>
    <div className={css.title}>{t('commandLine.title')}</div>
    <div className={css.description}>{t('commandLine.description')}</div>
    <div className={css.install}>
      <code className={css.command}>{CCH_INSTALL_COMMAND}</code>
      <Button variant="outline" size="sm" onClick={() => { void writeClipboard(CCH_INSTALL_COMMAND).then(setCopied) }}>
        {t(copied === true ? 'commandLine.copied' : 'commandLine.copy')}
      </Button>
    </div>
    {copied === false && <div role="alert" className={css.description}>{t('commandLine.copyFailed')}</div>}
    <dl className={css.commands}>
      {COMMANDS.map(([command, key]) => <div key={command} className={css.entry}>
        <dt><code>{command}</code></dt>
        <dd>{t(key)}</dd>
      </div>)}
    </dl>
  </div>
}
