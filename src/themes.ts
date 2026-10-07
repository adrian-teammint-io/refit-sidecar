import type { Keys } from './keybinds'

// Each theme: [bg, surface, raised, text, muted, accent, onAccent] for dark and light.
type Pal = [string, string, string, string, string, string, string]
export const THEMES: Record<string, { label: string; dark: Pal; light: Pal }> = {
  graphite: { label: 'Graphite', dark: ['#0b0b0d', '#141417', '#1d1d22', '#ededf0', '#8d8d97', '#d4ff3a', '#121400'], light: ['#f7f7f4', '#ffffff', '#efefea', '#141416', '#62626b', '#4d5c00', '#ffffff'] },
  paper: { label: 'Claude Paper', dark: ['#1f1e1c', '#2a2926', '#34322e', '#f2efe8', '#a39e93', '#e08a68', '#1f1e1c'], light: ['#f5f1e8', '#fbf9f4', '#ece6d8', '#2b2a27', '#6b675f', '#b65332', '#ffffff'] },
  nord: { label: 'Nord', dark: ['#242933', '#2e3440', '#3b4252', '#eceff4', '#a5aebe', '#88c0d0', '#1c2128'], light: ['#eceff4', '#f8f9fb', '#e1e5ec', '#2e3440', '#5c6577', '#3b6e91', '#ffffff'] },
  tokyo: { label: 'Tokyo Night', dark: ['#16161e', '#1a1b26', '#24283b', '#c0caf5', '#858eb4', '#7aa2f7', '#10121a'], light: ['#e1e2e7', '#f0f0f4', '#d5d6db', '#343b58', '#575c72', '#2e5fd3', '#ffffff'] },
  rose: { label: 'Rosé Pine', dark: ['#191724', '#1f1d2e', '#26233a', '#e0def4', '#908caa', '#ebbcba', '#191724'], light: ['#faf4ed', '#fffaf3', '#f2e9e1', '#575279', '#6a6684', '#a95d73', '#ffffff'] },
  gruvbox: { label: 'Gruvbox', dark: ['#1d2021', '#282828', '#3c3836', '#ebdbb2', '#afa089', '#fe8019', '#1d2021'], light: ['#f9f5d7', '#fbf1c7', '#ebdbb2', '#3c3836', '#665c54', '#af3a03', '#ffffff'] },
  solarized: { label: 'Solarized', dark: ['#00212b', '#002b36', '#073642', '#eee8d5', '#93a1a1', '#b58900', '#002b36'], light: ['#fdf6e3', '#fffbee', '#eee8d5', '#073642', '#556c73', '#8a6900', '#ffffff'] },
  catppuccin: { label: 'Catppuccin', dark: ['#181825', '#1e1e2e', '#313244', '#cdd6f4', '#949ab3', '#f5c2e7', '#1e1e2e'], light: ['#e6e9ef', '#eff1f5', '#dce0e8', '#4c4f69', '#5f627a', '#8839ef', '#ffffff'] },
  dracula: { label: 'Dracula', dark: ['#21222c', '#282a36', '#343746', '#f8f8f2', '#a0a4c0', '#ff79c6', '#21222c'], light: ['#fffbeb', '#ffffff', '#f2eddc', '#1f1f1f', '#635d73', '#a3144d', '#ffffff'] },
  everforest: { label: 'Everforest', dark: ['#232a2e', '#2d353b', '#3d484d', '#d3c6aa', '#b3b5a4', '#a7c080', '#232a2e'], light: ['#f3ead3', '#fdf6e3', '#e9e1c8', '#3f4a50', '#58666d', '#5c7a00', '#ffffff'] },
  mono: { label: 'Mono', dark: ['#000000', '#0d0d0d', '#1a1a1a', '#ffffff', '#8a8a8a', '#ffffff', '#000000'], light: ['#ffffff', '#ffffff', '#f2f2f2', '#000000', '#666666', '#000000', '#ffffff'] },
  kanagawa: { label: 'Kanagawa', dark: ['#16161d', '#1f1f28', '#2a2a37', '#dcd7ba', '#a6a69c', '#7e9cd8', '#16161d'], light: ['#f2ecbc', '#f8f3d6', '#e5ddb0', '#43436c', '#5d5a6e', '#4d699b', '#ffffff'] },
  onedark: { label: 'One Dark', dark: ['#1e2127', '#282c34', '#2f343e', '#dcdfe4', '#9da5b4', '#61afef', '#1e2127'], light: ['#f0f0f1', '#fafafa', '#e5e5e6', '#383a42', '#5f626b', '#2f63d6', '#ffffff'] },
  github: { label: 'GitHub', dark: ['#0d1117', '#161b22', '#21262d', '#e6edf3', '#8d96a0', '#4493f8', '#0d1117'], light: ['#f6f8fa', '#ffffff', '#eaeef2', '#1f2328', '#59636e', '#0969da', '#ffffff'] },
  ayu: { label: 'Ayu', dark: ['#0b0e14', '#11151c', '#1c212b', '#bfbdb6', '#8a8f99', '#e6b450', '#0b0e14'], light: ['#f8f9fa', '#fcfcfc', '#ecedee', '#3d4248', '#61666d', '#b25e00', '#ffffff'] },
  nightowl: { label: 'Night Owl', dark: ['#010e1a', '#011627', '#0b2942', '#d6deeb', '#8a9bb1', '#82aaff', '#011627'], light: ['#f0f0f0', '#fbfbfb', '#e4e4e4', '#403f53', '#5f6070', '#2a6bc4', '#ffffff'] },
  vesper: { label: 'Vesper', dark: ['#101010', '#161616', '#232323', '#ffffff', '#a0a0a0', '#ffc799', '#101010'], light: ['#f7f5f2', '#ffffff', '#ece9e4', '#101010', '#5f5f5f', '#9a4f00', '#ffffff'] },
  flexoki: { label: 'Flexoki', dark: ['#100f0f', '#1c1b1a', '#282726', '#cecdc3', '#9a9891', '#3aa99f', '#100f0f'], light: ['#f2f0e5', '#fffcf0', '#e6e4d9', '#100f0f', '#676662', '#24837b', '#ffffff'] },
  monokai: { label: 'Monokai', dark: ['#1e1f1c', '#272822', '#3e3d32', '#f8f8f2', '#ada890', '#a6e22e', '#1e1f1c'], light: ['#fafaf6', '#ffffff', '#efeee6', '#272822', '#67665c', '#5c7d00', '#ffffff'] },
}

export type Mode = 'system' | 'light' | 'dark'
export type Settings = {
  theme: string
  mode: Mode
  badge: boolean // toolbar icon shows the failed-sync count
  drawerWidth: number // px, dragged from the drawer's left edge
  keys: Partial<Keys> // keyboard shortcut overrides (keybinds.ts); keysOf() fills in the defaults
  font: string // UI font family name ('' = bundled Geist), any font installed on the Mac
  monoFont: string // monospace font family name ('' = bundled JetBrains Mono)
}
export const DEFAULTS: Settings = { theme: 'graphite', mode: 'system', badge: true, drawerWidth: 440, keys: {}, font: '', monoFont: '' }

// A typed font name as a CSS family list: quoted (CSS generics like system-ui stay bare), then the fallbacks. Quotes,
// backslashes and ; { } are dropped so a name can only ever be a family name. '' = keep the bundled font (ui.css).
const GENERIC = /^(system-ui|ui-(sans-serif|serif|monospace|rounded)|sans-serif|serif|monospace|cursive|fantasy)$/i
export function fontFamily(name: string, fallback: string): string | undefined {
  const n = name.replace(/["'\\;{}]/g, '').trim()
  return n ? `${GENERIC.test(n) ? n : `"${n}"`}, ${fallback}` : undefined
}

export function vars(s: Settings, dark: boolean): Record<string, string> {
  const [bg, surface, raised, text, muted, accent, onAccent] = (THEMES[s.theme] ?? THEMES.graphite)[dark ? 'dark' : 'light']
  const sans = fontFamily(s.font ?? '', 'ui-sans-serif, system-ui, sans-serif')
  const mono = fontFamily(s.monoFont ?? '', "ui-monospace, 'SF Mono', monospace")
  return {
    '--bg': bg, '--surface': surface, '--raised': raised, '--text': text, '--muted': muted, '--accent': accent, '--on-accent': onAccent,
    ...(sans && { '--sans': sans }), ...(mono && { '--mono': mono }),
  }
}
