/** Claude palette and typography, applied as a `ctx.theme` override layer over both built-in palettes. */
import type { ThemeTokenModes, ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Serif display face for headlines; CJK text falls through to the body stack. */
const DISPLAY_FONT = "'EB Garamond', 'Iowan Old Style', Georgia, var(--cch-font-body)"
/** Humanist body face; CJK text falls through to the platform families. */
const BODY_FONT = [
  'Inter', '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", "'PingFang TC'", "'PingFang SC'",
  "'Hiragino Sans GB'", "'Microsoft JhengHei'", "'Microsoft YaHei'", "'Helvetica Neue'", 'Arial', 'sans-serif',
].join(', ')

/**
 * Warm neutrals replacing the cool `neutral-bluish` scale. Both built-in palettes read this one
 * scale, light surfaces from the low steps and dark surfaces from the high steps.
 */
const WARM_NEUTRALS: Readonly<Record<string, string>> = {
  '00': '#ffffff',
  '50': '#f5f0e8',
  '60': '#f5f0e8',
  '75': '#efe9de',
  '100': '#ebe4d8',
  '150': '#e8e0d2',
  '200': '#ded5c7',
  '300': '#cfc7ba',
  '400': '#b0aba2',
  '500': '#9a968d',
  '600': '#8e8b82',
  '700': '#6c6a64',
  '750': '#4a4843',
  '800': '#3d3d3a',
  '850': '#2d2b27',
  '875': '#252320',
  '900': '#1f1e1b',
  '950': '#181715',
  '1000': '#141413',
}

/** Coral replacing the blue accent scale that links, focus rings, and selections read. */
const CORAL: Readonly<Record<string, string>> = {
  '50': '#fbf1ec',
  '100': '#f6e2d9',
  '200': '#efcdbf',
  '300': '#e3ad97',
  '400': '#d88a6e',
  '450': '#d27f63',
  '500': '#cc785c',
  '600': '#a9583e',
  '700-delete': '#8a4630',
  '800': '#5c3325',
  '900': '#3d241b',
}

function both(value: string): ThemeTokenModes {
  return { light: value, dark: value }
}

function scale(prefix: string, steps: Readonly<Record<string, string>>): ThemeTokenOverrides {
  return Object.fromEntries(Object.entries(steps).map(([step, value]) => [`${prefix}${step}`, both(value)]))
}

function heading(level: 1 | 2 | 3, size: number, lineHeight: number): ThemeTokenOverrides {
  const fontSize = `calc(${String(size)}px + var(--dsh-content-font-delta))`
  const height = `calc(${String(lineHeight)}px + var(--dsh-content-font-delta))`
  const name = `--dsw-font-markdown-h${String(level)}`
  return {
    [name]: both(`500 ${fontSize} / ${height} var(--cch-font-display)`),
    [`${name}-font-family`]: both('var(--cch-font-display)'),
    [`${name}-font-weight`]: both('500'),
    [`${name}-font-size`]: both(fontSize),
    [`${name}-line-height`]: both(height),
  }
}

/** Every token the Claude layer sets, keyed by CSS custom property. */
export const CLAUDE_THEME_TOKENS: ThemeTokenOverrides = {
  ...scale('--dsw-static-neutral-bluish-', WARM_NEUTRALS),
  ...scale('--dsw-static-deepseek-', CORAL),
  '--cch-font-body': both(BODY_FONT),
  '--cch-font-display': both(DISPLAY_FONT),
  '--dsw-font-family': both('var(--cch-font-body)'),
  '--dsw-font-family-brand': both('var(--cch-font-display)'),
  ...heading(1, 24, 32),
  ...heading(2, 21, 29),
  ...heading(3, 19, 27),
  '--dsw-alias-bg-base': { light: '#faf9f5', dark: '#181715' },
  '--dsw-alias-bg-layer-1': { light: '#faf9f5', dark: '#252320' },
  '--dsw-alias-bg-layer-2': { light: '#faf9f5', dark: '#2d2b27' },
  '--dsw-alias-bg-layer-3': { light: '#faf9f5', dark: '#3d3d3a' },
  '--dsw-alias-brand-primary': { light: '#cc785c', dark: '#d97757' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#cc785c', dark: '#d97757' },
  '--dsw-alias-button-primary-hover': { light: '#a9583e', dark: '#c96442' },
  '--dsw-alias-button-primary-dimmed': { light: '#e6dfd8', dark: '#3a3733' },
  '--dsw-alias-button-info-fill': { light: '#cc785c', dark: '#d97757' },
  '--dsw-alias-button-info-hover': { light: '#a9583e', dark: '#c96442' },
  '--dsw-alias-label-primary-bluish': { light: '#141413', dark: '#f5f0e8' },
  // Coral fails 4.5:1 as running text on the cream canvas, so links use the pressed coral in light mode.
  '--dsw-alias-link': { light: '#a9583e', dark: '#e0957a' },
  '--dsw-alias-state-error-primary': { light: '#c64545', dark: '#e06c6c' },
  '--dsw-alias-state-success-primary': both('#5db872'),
  '--dsw-alias-state-warn-primary': { light: '#d4a017', dark: '#e8a55a' },
  '--dsw-specific-input-major': { light: '#ffffff', dark: '#252320' },
  '--dsw-specific-bubble': { light: '#efe9de', dark: '#2d2b27' },
  '--dsw-specific-bubble-highlight': { light: '#e8e0d2', dark: '#3a3733' },
  '--dsw-specific-sidebar-fill': { light: '#f5f0e8', dark: '#1f1e1b' },
  '--dsw-specific-menu': { light: 'rgb(250 249 245 / 94%)', dark: 'rgb(37 35 32 / 94%)' },
}
