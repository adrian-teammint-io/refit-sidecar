// Every surface renders straight from storage: settings/run/failedSyncs (local) and host/output (session),
// followed live through storage.onChanged. Mounting also nudges the worker to (re)connect the host.
import { useEffect, useState } from 'react'
import { call, type HostState, type Output, type Run } from '../api'
import type { FailedSyncs } from '../failed-syncs'
import { DEFAULTS, type Settings } from '../themes'

export type Store = { settings: Settings; host?: HostState; run?: Run; output?: Output; failedSyncs?: FailedSyncs; loaded: boolean }
const KEYS = { local: ['settings', 'run', 'failedSyncs'], session: ['host', 'output'] } as const

export function useStore(): Store {
  const [s, set] = useState<Store>({ settings: DEFAULTS, loaded: false })
  useEffect(() => {
    Promise.all([chrome.storage.local.get([...KEYS.local]), chrome.storage.session.get([...KEYS.session])]).then(([l, ss]) =>
      set(p => ({ ...p, ...l, ...ss, settings: { ...DEFAULTS, ...(l.settings as Settings) }, loaded: true })))
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' && area !== 'session') return
      const next: Partial<Store> = {}
      for (const k of KEYS[area] as readonly string[]) if (c[k]) (next as Record<string, unknown>)[k] = c[k].newValue
      if (next.settings) next.settings = { ...DEFAULTS, ...next.settings }
      if (Object.keys(next).length) set(p => ({ ...p, ...next }))
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
