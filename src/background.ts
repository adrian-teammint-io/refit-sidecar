import { connect, startRun, cancelRun, closeOrphanRun } from './host'
import { MAX_TABS, type HostState, type Req } from './api'
import type { FailedSyncs } from './failed-syncs'
import { DEFAULTS, type Settings } from './themes'

// The drawer is a content script; it reads host/output from storage.session, which is worker-only by default.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

// Opens Refit connection pages in background tabs (the drawer's "Open in Refit" for selected connections; Refit's
// own delete dialog lives there). The page's popup blocker would stop more than one window.open, so the worker
// does it, and only for URLs shaped like connectionUrl() builds them.
const CONNECTION_PAGE = /^https:\/\/(?:staging-)?app\.refit\.ai\/[0-9a-f-]{36}\/datasources\/(?:service|file)\/[0-9a-f-]{36}$/i
async function openTabs(urls: unknown) {
  if (!Array.isArray(urls) || urls.length > MAX_TABS || !urls.every(u => typeof u === 'string' && CONNECTION_PAGE.test(u)))
    throw new Error(`Can only open up to ${MAX_TABS} Refit connection pages`)
  for (const url of urls) await chrome.tabs.create({ url, active: false })
}

async function handle(req: Req): Promise<unknown> {
  switch (req.type) {
    case 'run': return startRun(req.command, req.args)
    case 'cancel': return cancelRun()
    case 'hostStatus': connect(); return
    case 'openOptions': return chrome.runtime.openOptionsPage()
    case 'openTabs': return openTabs(req.urls)
  }
}

chrome.runtime.onMessage.addListener((req: Req, _s, reply) => {
  handle(req).then(data => reply({ ok: true, data }), e => reply({ ok: false, error: String(e?.message ?? e) }))
  return true
})

// Badge: failed count in red, "!" in amber when the host can't be reached, nothing when all is well.
async function paint() {
  const [{ failedSyncs, settings }, { host }] = await Promise.all([
    chrome.storage.local.get(['failedSyncs', 'settings']) as Promise<{ failedSyncs?: FailedSyncs; settings?: Settings }>,
    chrome.storage.session.get('host') as Promise<{ host?: HostState }>,
  ])
  const n = failedSyncs?.rows.length ?? 0
  const hostBad = host && (host.state === 'missing' || host.state === 'forbidden')
  const on = { ...DEFAULTS, ...settings }.badge
  await chrome.action.setBadgeText({ text: !on ? '' : hostBad ? '!' : n ? String(n > 999 ? '999+' : n) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: hostBad ? '#f59e0b' : '#dc2626' })
  await chrome.action.setBadgeTextColor({ color: '#ffffff' })
  await chrome.action.setTitle({ title: hostBad ? 'Refit Sidecar: host not installed' : host?.state === 'offline' ? 'Refit Sidecar: run pnpm server in a terminal' : `Refit Sidecar: ${n} failed sync${n === 1 ? '' : 's'}` })
}

chrome.storage.onChanged.addListener(c => { if (c.failedSyncs || c.host || c.settings) paint() })

closeOrphanRun()
connect()
paint()
