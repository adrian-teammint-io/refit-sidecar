// The app's keyboard shortcuts: one mapping list every surface reads (drawer, popup, settings). Add an action here
// with its default key; Settings lists it and lets the user rebind it (settings.keys holds only the overrides).
// Pure, so plain node can test it.

export const KEYBINDS = {
  refetch: { label: 'Refetch', hint: 'Fetch the current view again', default: 'r' },
} as const

export type KeyAction = keyof typeof KEYBINDS
export type Keys = Record<KeyAction, string>
export const ACTIONS = Object.keys(KEYBINDS) as KeyAction[]

// Overrides on top of the defaults. An override that's no longer valid (hand-edited storage) falls back.
export const keysOf = (overrides?: Partial<Keys>): Keys =>
  Object.fromEntries(ACTIONS.map(a => [a, validKey(overrides?.[a]) ? overrides![a]!.toLowerCase() : KEYBINDS[a].default])) as Keys

// Single letters and digits only: they never collide with Esc / arrows / Enter, which stay fixed.
export const validKey = (k: unknown): k is string => typeof k === 'string' && /^[a-z0-9]$/i.test(k)

export const keyLabel = (k: string) => k.toUpperCase()

type KeyEventLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: unknown }

// Typing in a field never triggers a shortcut.
export const isTyping = (t: unknown) =>
  !!(t as Element | null)?.closest?.('input, textarea, select, [contenteditable]')

// The action bound to this keypress, if any: no modifier (Shift is fine, so caps lock still works), not typing.
export function actionFor(e: KeyEventLike, keys: Keys): KeyAction | undefined {
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || !validKey(e.key)) return
  return ACTIONS.find(a => keys[a] === e.key.toLowerCase())
}

// Rebinding: a key another action already uses is refused, so one keypress never means two things.
export function rebind(keys: Keys, action: KeyAction, key: string): { keys: Keys } | { error: string } {
  if (!validKey(key)) return { error: 'Use a single letter or digit' }
  const k = key.toLowerCase()
  const taken = (Object.keys(keys) as KeyAction[]).find(a => a !== action && keys[a] === k)
  if (taken) return { error: `${keyLabel(k)} is already ${(KEYBINDS as Record<string, { label: string }>)[taken]?.label ?? taken}` }
  return { keys: { ...keys, [action]: k } }
}
