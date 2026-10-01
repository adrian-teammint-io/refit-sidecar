// Each theme: [bg, surface, raised, text, muted, accent, onAccent] for dark and light.
type Pal = [string, string, string, string, string, string, string]
export const THEMES: Record<string, { label: string; dark: Pal; light: Pal }> = {
  graphite: { label: 'Graphite', dark: ['#0b0b0d', '#141417', '#1d1d22', '#ededf0', '#8d8d97', '#d4ff3a', '#121400'], light: ['#f7f7f4', '#ffffff', '#efefea', '#141416', '#62626b', '#4d5c00', '#ffffff'] },
  paper: { label: 'Claude Paper', dark: ['#1f1e1c', '#2a2926', '#34322e', '#f2efe8', '#a39e93', '#e08a68', '#1f1e1c'], light: ['#f5f1e8', '#fbf9f4', '#ece6d8', '#2b2a27', '#6e6a61', '#b65332', '#ffffff'] },
  nord: { label: 'Nord', dark: ['#242933', '#2e3440', '#3b4252', '#eceff4', '#9aa3b5', '#88c0d0', '#1c2128'], light: ['#eceff4', '#f8f9fb', '#e1e5ec', '#2e3440', '#5c6577', '#3b6e91', '#ffffff'] },
  tokyo: { label: 'Tokyo Night', dark: ['#16161e', '#1a1b26', '#24283b', '#c0caf5', '#7a83a8', '#7aa2f7', '#10121a'], light: ['#e1e2e7', '#f0f0f4', '#d5d6db', '#343b58', '#5f6378', '#2e5fd3', '#ffffff'] },
  rose: { label: 'Rosé Pine', dark: ['#191724', '#1f1d2e', '#26233a', '#e0def4', '#908caa', '#ebbcba', '#191724'], light: ['#faf4ed', '#fffaf3', '#f2e9e1', '#575279', '#6e6a86', '#b4637a', '#ffffff'] },
  gruvbox: { label: 'Gruvbox', dark: ['#1d2021', '#282828', '#3c3836', '#ebdbb2', '#a89984', '#fe8019', '#1d2021'], light: ['#f9f5d7', '#fbf1c7', '#ebdbb2', '#3c3836', '#665c54', '#af3a03', '#ffffff'] },
  solarized: { label: 'Solarized', dark: ['#00212b', '#002b36', '#073642', '#eee8d5', '#93a1a1', '#b58900', '#002b36'], light: ['#fdf6e3', '#fffbee', '#eee8d5', '#073642', '#586e75', '#8a6900', '#ffffff'] },
  catppuccin: { label: 'Catppuccin', dark: ['#181825', '#1e1e2e', '#313244', '#cdd6f4', '#9399b2', '#f5c2e7', '#1e1e2e'], light: ['#e6e9ef', '#eff1f5', '#dce0e8', '#4c4f69', '#6c6f85', '#8839ef', '#ffffff'] },
  dracula: { label: 'Dracula', dark: ['#21222c', '#282a36', '#343746', '#f8f8f2', '#a0a4c0', '#ff79c6', '#21222c'], light: ['#fffbeb', '#ffffff', '#f2eddc', '#1f1f1f', '#635d73', '#a3144d', '#ffffff'] },
  everforest: { label: 'Everforest', dark: ['#232a2e', '#2d353b', '#3d484d', '#d3c6aa', '#9da9a0', '#a7c080', '#232a2e'], light: ['#f3ead3', '#fdf6e3', '#e9e1c8', '#5c6a72', '#6f7b72', '#5c7a00', '#ffffff'] },
  mono: { label: 'Mono', dark: ['#000000', '#0d0d0d', '#1a1a1a', '#ffffff', '#8a8a8a', '#ffffff', '#000000'], light: ['#ffffff', '#ffffff', '#f2f2f2', '#000000', '#666666', '#000000', '#ffffff'] },
}

export type Mode = 'system' | 'light' | 'dark'
export type Settings = {
  theme: string
  mode: Mode
  badge: boolean // toolbar badge shows the failed-sync count
}
export const DEFAULTS: Settings = { theme: 'graphite', mode: 'system', badge: true }

export function vars(theme: string, dark: boolean): Record<string, string> {
  const [bg, surface, raised, text, muted, accent, onAccent] = (THEMES[theme] ?? THEMES.graphite)[dark ? 'dark' : 'light']
  return { '--bg': bg, '--surface': surface, '--raised': raised, '--text': text, '--muted': muted, '--accent': accent, '--on-accent': onAccent }
}
