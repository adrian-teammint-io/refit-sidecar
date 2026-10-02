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

// The count drawn as the icon itself (a badge's text is unreadably small at 16px): a red tile with the number,
// an amber tile with "!" when the host can't be reached, the normal icon when all is well.
function countIcon(text: string, color: string): Record<string, ImageData> {
  return Object.fromEntries([16, 32].map(s => {
    const ctx = new OffscreenCanvas(s, s).getContext('2d')!
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(0, 0, s, s, s * 0.22); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    // Shrink until it fits: "8" fills the tile, "99+" still reads.
    let size = s * 0.86
    do ctx.font = `700 ${size--}px -apple-system, system-ui, sans-serif`; while (ctx.measureText(text).width > s * 0.9 && size > 6)
    ctx.fillText(text, s / 2, s / 2 + s * 0.05)
    return [s, ctx.getImageData(0, 0, s, s)]
  }))
}

async function paint() {
  const [{ failedSyncs, settings }, { host }] = await Promise.all([
    chrome.storage.local.get(['failedSyncs', 'settings']) as Promise<{ failedSyncs?: FailedSyncs; settings?: Settings }>,
    chrome.storage.session.get('host') as Promise<{ host?: HostState }>,
  ])
  const n = failedSyncs?.rows.length ?? 0
  const hostBad = host && (host.state === 'missing' || host.state === 'forbidden')
  const on = { ...DEFAULTS, ...settings }.badge
  await chrome.action.setBadgeText({ text: '' }) // older versions painted a badge; the icon carries the count now
  await chrome.action.setIcon(!on || (!hostBad && !n) ? { path: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } }
    : { imageData: countIcon(hostBad ? '!' : n > 99 ? '99+' : String(n), hostBad ? '#d97706' : '#dc2626') })
  await chrome.action.setTitle({ title: hostBad ? 'Refit Sidecar: host not installed' : host?.state === 'offline' ? 'Refit Sidecar: run pnpm server in a terminal' : `Refit Sidecar: ${n} failed sync${n === 1 ? '' : 's'}` })
}

chrome.storage.onChanged.addListener(c => { if (c.failedSyncs || c.host || c.settings) paint() })

closeOrphanRun()
connect()
paint()
