// The popup's view of the current tab: its Refit environment (staging-app → stag, anything else → prod) and, on a
// connection page, which connection; plus that environment's stored data, followed live. The popup itself runs on
// an extension page, so ENV (src/table.ts) would always say prod.
import { useEffect, useState } from 'react'
import { envKey, type Env } from '../table'
import { parseConnectionPage } from '../links'
import type { Data } from '../shared/store'

export type TabPage = NonNullable<ReturnType<typeof parseConnectionPage>>
export const DATA = ['failedSyncs', 'groups', 'connections', 'projectConnections', 'projects', 'pins'] as const
export type TabData = Pick<Data, typeof DATA[number]>

export function useTab(): { ready: boolean; env: Env; page?: TabPage } {
  const [t, setT] = useState<{ ready: boolean; env: Env; page?: TabPage }>({ ready: false, env: 'prod' })
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = tab?.url ?? ''
      setT({ ready: true, env: /^https:\/\/staging-app\.refit\.ai\//.test(url) ? 'stag' : 'prod', page: parseConnectionPage(url) })
    }, () => setT(s => ({ ...s, ready: true })))
  }, [])
  return t
}

export function useEnvData(env: Env): TabData {
  const [d, setD] = useState<TabData>({})
  useEffect(() => {
    const keys = DATA.map(k => envKey(env, k))
    const read = () => chrome.storage.local.get(keys).then(got => setD(Object.fromEntries(DATA.map((k, i) => [k, got[keys[i]]]))))
    read()
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && keys.some(k => c[k])) read() }
    chrome.storage.onChanged.addListener(on)
    return () => chrome.storage.onChanged.removeListener(on)
  }, [env])
  return d
}
