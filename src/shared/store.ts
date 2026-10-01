// Every surface renders straight from storage: settings/run/failedSyncs (local) and host/output (session),
// followed live through storage.onChanged. Mounting also nudges the worker to (re)connect the host.
import { useEffect, useState } from 'react'
import { call, type HostState, type Output, type Run } from '../api'
import type { FailedSyncs } from '../failed-syncs'
import { dropStalePages, type Projects, type ProjectConnections, type Connections, type FittingRooms, type Pins } from '../projects'
import { DEFAULTS, type Settings } from '../themes'
import { DATA_KEYS, ENV, envKey } from '../table'

export type Store = {
  settings: Settings; host?: HostState; run?: Run; output?: Output; loaded: boolean
  failedSyncs?: FailedSyncs; projects?: Projects; projectConnections?: ProjectConnections
  connections?: Connections; fittingRooms?: FittingRooms; pins?: Pins
}
// Results are per environment (envKey: staging's are stored as "stag.<key>"); settings, run and host are shared.
const KEYS = {
  local: ['settings', 'run', ...DATA_KEYS],
  session: ['host', 'output'],
} as const
const stored = (area: 'local' | 'session', k: string) => (area === 'local' && (DATA_KEYS as readonly string[]).includes(k) ? envKey(ENV, k) : k)

export function useStore(): Store {
  const [s, set] = useState<Store>({ settings: DEFAULTS, loaded: false })
  useEffect(() => {
    const read = (area: 'local' | 'session', got: Record<string, unknown>) => Object.fromEntries(KEYS[area].map(k => [k, got[stored(area, k)]]))
    Promise.all([chrome.storage.local.get(KEYS.local.map(k => stored('local', k))), chrome.storage.session.get([...KEYS.session])]).then(([l, ss]) => {
      const local = read('local', l)
      set(p => ({ ...p, ...dropStalePages(local), ...ss, settings: { ...DEFAULTS, ...(local.settings as Settings) }, loaded: true }))
    })
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' && area !== 'session') return
      const next: Partial<Store> = {}
      for (const k of KEYS[area] as readonly string[]) { const sk = stored(area, k); if (c[sk]) (next as Record<string, unknown>)[k] = c[sk].newValue }
      if (next.settings) next.settings = { ...DEFAULTS, ...next.settings }
      if (Object.keys(next).length) set(p => ({ ...p, ...dropStalePages(next) }))
    }
    chrome.storage.onChanged.addListener(on)
    call({ type: 'hostStatus' }).catch(() => {})
    return () => chrome.storage.onChanged.removeListener(on)
  }, [])
  return s
}

export const saveSettings = (cur: Settings, patch: Partial<Settings>) => chrome.storage.local.set({ settings: { ...cur, ...patch } })

export function useDark(settings: Settings) {
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSys(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return settings.mode === 'dark' || (settings.mode === 'system' && sys)
}

// Re-renders every `ms` while `active`, for running timers and "updated 2m ago".
export function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [active, ms])
  return now
}

export const isRunning = (run?: Run) => !!run && !run.endedAt
