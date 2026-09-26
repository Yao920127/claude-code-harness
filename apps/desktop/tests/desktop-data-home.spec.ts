/** Claude Code Harness data home selection. */

import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopPaths, selectDesktopDataHome } from '../src/paths.ts'

it('uses ~/.cch unless DSH_HOME names a home, so DeepSeek Harness never shares the desktop profile', () => {
  const unset: NodeJS.ProcessEnv = {}
  selectDesktopDataHome(unset, '/Users/person')
  expect(unset.DSH_HOME).toBe(join('/Users/person', '.cch'))
  expect(resolveDesktopPaths(unset.DSH_HOME).profile).toBe(join('/Users/person', '.cch', 'profiles', 'desktop'))
  const blank: NodeJS.ProcessEnv = { DSH_HOME: ' ' }
  selectDesktopDataHome(blank, '/Users/person')
  expect(blank.DSH_HOME).toBe(join('/Users/person', '.cch'))
  const configured: NodeJS.ProcessEnv = { DSH_HOME: '/data/dsh' }
  selectDesktopDataHome(configured, '/Users/person')
  expect(configured.DSH_HOME).toBe('/data/dsh')
})
