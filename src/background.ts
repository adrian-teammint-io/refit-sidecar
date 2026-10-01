import { connect, startRun, cancelRun, closeOrphanRun } from './host'
import type { HostState, Req } from './api'
import type { FailedSyncs } from './failed-syncs'
import { DEFAULTS, type Settings } from './themes'

// The drawer is a content script; it reads host/output from storage.session, which is worker-only by default.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

async function handle(req: Req): Promise<unknown> {
  switch (req.type) {
    case 'run': return startRun(req.command)
    case 'cancel': return cancelRun()
    case 'hostStatus': connect(); return
    case 'openOptions': return chrome.runtime.openOptionsPage()
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
  await chrome.action.setTitle({ title: hostBad ? 'Refit Sidecar: host not installed' : `Refit Sidecar: ${n} failed sync${n === 1 ? '' : 's'}` })
}

chrome.storage.onChanged.addListener(c => { if (c.failedSyncs || c.host || c.settings) paint() })

closeOrphanRun()
connect()
paint()
