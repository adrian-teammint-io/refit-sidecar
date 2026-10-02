// Fake chrome.* for screenshots of the drawer (mock.html) and popup (popup.html), no extension needed.
// State comes from the URL: mock.html#<mode> or popup.html?m=<mode>, plus "light" anywhere in it for Claude Paper light.
// Data modes: results (default), output (a run in progress), never (nothing fetched yet), zero (no failures),
//   error (last run failed), loading (projects list being fetched), offline (pnpm server not running),
//   missing (host not installed), forbidden, settings, many (30 rows everywhere + "load more": overflow/limit checks).
// Drawer navigation (mock.html only): nav=home (default) | failed | projects | project | connections | fitting | output,
//   q=<search text>, sort=service (project view grouped by service).
const Q = location.hash.slice(1) + '&' + location.search.slice(1)
const MODE = (Q.match(/(?:^|[&?])m?=?(output|never|zero|error|loading|offline|missing|forbidden|settings|many|results)/) || [])[1] || 'results'
const LIGHT = /light/.test(Q)
const now = Date.now()
const uuid = n => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`
const base = [
  ['TEST', '팀민트_크레이버', 'SERVICE', 'META', 'FIRST', '2026-08-31', '2026-09-30', "JSONDecodeError('Extra data: line 1 column 68008 (char 68007)')", null, 22],
  ['KR · Meta Ads main', 'Sample Brand KR', 'SERVICE', 'META', 'DAILY', '2026-09-30', '2026-09-30', 'FacebookRequestError: (#17) User request limit reached. Please wait a few minutes before retrying this request, or contact support if the problem continues.', 'Rate limited by Meta. Retry later.', 64],
  ['JP TikTok spark', 'Sample Brand JP', 'SERVICE', 'TIKTOK', 'MANUAL', '2026-07-01', '2026-07-31', 'KeyError: \'advertiser_id\'', null, 180],
  ['Naver SA brand keywords', 'Sample Agency', 'SERVICE', 'NAVER_SA', 'DAILY', '2026-09-29', '2026-09-29', 'HTTPError 401: invalid signature (X-Signature mismatch)', 'Naver credentials expired. Reconnect the account.', 600],
  ['sheet_upload_0929.csv', 'Sample Agency', 'FILE', null, 'FIRST', null, null, 'NotNullViolation: column "광고" of relation "seed_data" violates not-null constraint', null, 1440],
  ['GA4 web property', 'Sample Brand KR', 'SERVICE', 'GOOGLE_ANALYTICS', 'DAILY', '2026-09-28', '2026-09-28', 'google.api_core.exceptions.ResourceExhausted: 429 Exhausted property tokens for a project per hour.', null, 2900],
]
const rows = (MODE === 'many' ? Array.from({ length: 30 }, (_, i) => base[i % base.length]) : base).map((r, i) => ({
  id: uuid(1000 + i).replace(/^0+/, m => 'a'.repeat(m.length)), connectionId: uuid(i + 1), projectId: uuid(900 + (i % 3)), project: r[1], name: r[0], kind: r[2],
  service: r[3], type: r[4], start: r[5], end: r[6], reason: r[7], displayReason: r[8], updatedAt: new Date(now - r[9] * 60000).toISOString().slice(0, 19) + 'Z',
  // rows 2 and 4 have a later SUCCESS covering their end date ("Succeeded after" chip)
  ...(i % base.length === 1 || i % base.length === 3 ? { recoveredStart: r[5], recoveredEnd: r[6], recoveredAt: new Date(now - 20 * 60000).toISOString().slice(0, 19) + 'Z' } : {}),
}))
const lines = [
  { s: 'sys', t: '$ failed-syncs' },
  { s: 'err', t: '$ tabularis --mcp  ·  run_query on ea7632d2-f563-4d45-80ba-22728c416a40  ·  sql/failed-syncs.sql' },
  { s: 'err', t: 'connected to tabularis-mcp 0.1.0' },
  { s: 'err', t: `${rows.length} rows in 979ms` },
  ...JSON.stringify({ columns: ['id', 'connection_id', 'project_id', 'project', 'name', 'kind', 'service'], rows: rows.slice(0, 3).map(r => [r.id, r.connectionId, r.projectId, r.project, r.name, r.kind, r.service]) }, null, 2).split('\n').map(t => ({ s: 'out', t })),
]
const running = MODE === 'output'
const run = MODE === 'never' ? undefined
  : MODE === 'loading' ? { id: 'p2', command: 'projects', args: { q: '', status: 'all', sort: 'active', offset: '0' }, startedAt: now - 1800 }
  // `reloading` flag: the connections search is being fetched again over its cached page (status line shows Cancel)
  : /reloading/.test(Q) ? { id: 'c2', command: 'connections', args: { env: 'prod', q: '', offset: '0' }, startedAt: now - 900 }
  : { id: 'r1', command: 'failed-syncs', startedAt: now - (running ? 3400 : 125000), ...(running ? {} : { endedAt: now - 124000, exit: MODE === 'error' ? 1 : 0 }) }
const failedSyncs = MODE === 'never' ? undefined : { at: now - 124000, runId: 'r1', rows: MODE === 'zero' ? [] : rows, truncated: MODE === 'many', ...(MODE === 'error' ? { error: 'Command failed (exit 1). See Output.' } : {}) }
const P = (i, name, status, plan, connections, failed, mins) => ({ id: uuid(900 + i), name, status, plan, connections, failed, lastSync: mins === null ? null : new Date(now - mins * 60000).toISOString().slice(0, 19) + 'Z' })
const projectRows = [
  P(0, '팀민트_크레이버', 'ACTIVE', 'BASIC', 93, 1, 3), P(1, 'Sample Brand KR', 'ACTIVE', 'BASIC', 27, 3, 12), P(2, 'Sample Brand JP', 'ACTIVE', 'TRIAL', 8, 1, 180),
  P(3, 'Sample Agency', 'ACTIVE', 'BASIC', 41, 0, 25), P(4, 'SKIN1004 USA', 'ACTIVE', 'BASIC', 19, 0, 40), P(5, 'SKIN1004 Indonesia', 'ACTIVE', 'BASIC', 12, 0, 90),
  P(6, '(테스트)E2E 프로젝트', 'ACTIVE', 'DEMO', 3, 0, 700000), P(7, 'Old Client', 'PAUSED', 'BASIC', 5, 0, 200000), P(8, '.', 'PAUSED', 'BASIC', 0, 0, null),
  P(9, 'AILabs Sample', 'ACTIVE', 'BASIC', 6, 0, 400),
]
const C = (i, name, kind, service, status, syncType, mins, start, end, reason, failed) => ({
  connectionId: uuid(i + 1), projectId: uuid(900), name, kind, service, start, end, status, syncType,
  lastSync: new Date(now - mins * 60000).toISOString().slice(0, 19) + 'Z', reason, displayReason: null, failed })
const connRows = [
  C(0, 'TEST', 'SERVICE', 'META', 'FAIL', 'MANUAL', 22, '2026-08-31', '2026-09-30', "JSONDecodeError('Extra data: line 1 column 68008 (char 68007)')", 1),
  C(1, 'GA4_이벤트이름', 'SERVICE', 'GOOGLE_ANALYTICS', 'FRAGMENTED', 'SCHEDULED', 30, '2025-08-22', '2026-09-28', null, 0),
  C(2, 'Google_US', 'SERVICE', 'GOOGLE_ADS', 'SUCCESS', 'SCHEDULED', 760, '2025-03-01', '2026-09-30', null, 0),
  C(3, 'LIVE GMV', 'FILE', null, 'SUCCESS', 'FILE_ADD', 400, '1970-01-01', '2026-09-30', null, 0),
  C(4, '[USA] SKIN1004', 'SERVICE', 'TIKTOK', 'SUCCESS', 'SCHEDULED', 150, '2025-09-22', '2026-09-30', null, 2),
  C(5, 'NEW 캠페인명', 'SERVICE', 'GOOGLE_SHEET', 'SUCCESS', 'MANUAL', 380, null, null, null, 0),
  C(6, 'SKIN1004_Malaysia_Shopee_Local', 'SERVICE', 'META', 'SUCCESS', 'MANUAL', 390, '2025-08-08', '2026-09-30', null, 0),
  C(7, 'Snapchat', 'FILE', null, 'SUCCESS', 'FILE_ADD', 420, null, null, null, 0),
]
// Browse pages: {at, runId, query, rows, hasMore}. The query must equal the view's default or the view re-fetches (and dims).
// many: 30 rows + hasMore (shows "Load 30 more"). sort=service in the hash: the project's connections grouped by service.
const MANY = MODE === 'many'
const BY_SERVICE = /sort=service/.test(Q)
// legacy flag: pages as the previous version stored them (no query / hasMore), to check old storage still renders.
const page = (runId, query, rows) => /legacy/.test(Q) ? { at: now - 300000, runId, rows } : { at: now - 300000, runId, query, rows, hasMore: MANY }
const fill = (rows, make) => MANY ? Array.from({ length: 30 }, (_, i) => make(rows[i % rows.length], i)) : rows
const allProjects = fill(projectRows, (p, i) => ({ ...p, id: uuid(900 + i), name: i < projectRows.length ? p.name : `${p.name} ${i}` }))
const sortedConns = BY_SERVICE ? [...connRows].sort((a, b) => (a.service ?? a.kind).localeCompare(b.service ?? b.kind) || a.name.localeCompare(b.name)) : connRows
const projects = MODE === 'never' || MODE === 'loading' ? undefined : page('p1', { q: '', status: 'all', sort: 'active' }, allProjects)
const projectConnections = MODE === 'never' ? undefined : { [uuid(900)]: page('c1', { q: '', sort: BY_SERVICE ? 'service' : 'status' }, sortedConns) }
const connections = MODE === 'never' ? undefined : page('n1', { q: '' }, fill(connRows, (c, i) => ({ ...c, connectionId: uuid(i + 1) }))
  .map((c, i) => ({ ...c, projectId: projectRows[i % 4].id, project: projectRows[i % 4].name })))
const F = (i, name, p, nodes, outputs, notOk, mins, fitMins) => ({ id: uuid(700 + i), projectId: projectRows[p].id, project: projectRows[p].name, projectStatus: projectRows[p].status,
  name, nodes, outputs, notOk, updatedAt: new Date(now - mins * 60000).toISOString().slice(0, 19) + 'Z', lastFit: fitMins === null ? null : new Date(now - fitMins * 60000).toISOString().slice(0, 19) + 'Z' })
const fitRows = [
  F(0, 'SKIN1004JP_RD_2610 (UPDATE)', 2, 32, 24, 0, 40, 40), F(1, 'SKIN1004JP_RD_2607_NEW', 2, 70, 14, 2, 400, 400),
  F(2, '새 피팅룸', 0, 0, 0, 0, 1500, null), F(3, '[카카오단골가게] Refit RD_260917', 1, 18, 9, 0, 1560, 1560), F(4, 'Legacy weekly report', 7, 1, 1, 1, 90000, 90000),
]
const fittingRooms = MODE === 'never' ? undefined : page('f1', { q: '' }, fill(fitRows, (r, i) => ({ ...r, id: uuid(700 + i) })))
const pins = MODE === 'never' ? undefined : Object.fromEntries([projectRows[1], projectRows[0]].map((p, i) => [p.id, { ...p, pinnedAt: now - i * 1000 }]))
const host = MODE === 'offline' ? { state: 'offline' }
  : MODE === 'missing' ? { state: 'missing', error: 'Specified native messaging host not found.' }
  : MODE === 'forbidden' ? { state: 'forbidden', error: 'Access to the specified native messaging host is forbidden.' }
  : { state: 'ready', commands: ['failed-syncs', 'projects', 'project-connections', 'connections', 'fitting-rooms'] }
// Sync requests tabs: two IN_PROGRESS rows (no reason), FRAGMENTED fetched with nothing in it
const syncRequests = MODE === 'never' ? undefined : {
  IN_PROGRESS: { at: now - 60000, runId: 'r2', truncated: false, rows: rows.slice(0, 2).map(r => ({ ...r, id: r.id.replace('aaaa', 'bbbb'), reason: null, displayReason: null, recoveredAt: null })) },
  FRAGMENTED: { at: now - 60000, runId: 'r3', truncated: false, rows: [] },
}
const local = { settings: { ...(LIGHT ? { theme: 'paper', mode: 'light', badge: true } : { theme: 'graphite', mode: 'dark', badge: true }), ...(/wide/.test(Q) ? { drawerWidth: 720 } : {}) }, run, failedSyncs, syncRequests, projects, projectConnections, connections, fittingRooms, pins }
const session = { host, output: run && { runId: 'r1', lines: running ? lines.slice(0, 7) : lines, dropped: 0 } }
// `answer` in the hash: a project-members run "finishes" 50ms later with STUB_MEMBERS (u1 is the owner), through
// storage.onChanged like the worker's writes. Everything else stays unanswered.
const listeners = []
const STUB_MEMBERS = [
  { id: uuid(801), email: 'owner@brand.kr', name: 'Brand Owner', role: 'admin', addedAt: '2026-01-05T00:00:00Z', owner: true },
  { id: uuid(802), email: 'ops@brand.kr', name: 'Ops', role: 'editor', addedAt: '2026-02-01T00:00:00Z', owner: false },
  { id: uuid(803), email: 'viewer@agency.io', name: null, role: 'viewer', addedAt: '2026-03-01T00:00:00Z', owner: false },
]
const answer = req => {
  if (!/answer/.test(Q) || req.type !== 'run' || req.command !== 'project-members') return
  setTimeout(() => {
    const projectMembers = { ...local.projectMembers, [req.args.project]: { at: Date.now(), runId: `stub-${Date.now()}`, rows: STUB_MEMBERS } }
    local.projectMembers = projectMembers
    listeners.forEach(f => f({ projectMembers: { newValue: projectMembers } }, 'local'))
  }, 50)
}
const area = data => ({ get: async keys => Object.fromEntries([].concat(keys).map(k => [k, data[k]]).filter(([, v]) => v !== undefined)), set: async () => {}, remove: async () => {} })
window.chrome = {
  runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '0.1.0' }), openOptionsPage() {}, onMessage: { addListener() {} },
    // Records each request on <html data-sent> so --dump-dom can check what a view asked for.
    sendMessage: async req => { const h = document.documentElement; h.dataset.sent = (h.dataset.sent ? h.dataset.sent + '|' : '') + (req.type === 'run' ? `run:${req.command}` : req.type); answer(req); return { ok: true, data: undefined } } },
  storage: { local: area(local), session: area(session), onChanged: { addListener: f => listeners.push(f), removeListener() {} } },
  tabs: { create() {} },
}
// The drawer uses a closed shadow root; open it here so the mock can click into it.
const attach = Element.prototype.attachShadow
// Headless virtual time doesn't reliably advance CSS transitions (the drawer froze faded or off-screen), so turn motion off.
Element.prototype.attachShadow = function () {
  const root = attach.call(this, { mode: 'open' })
  setTimeout(() => root.append(Object.assign(document.createElement('style'), { textContent: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important }' })))
  return root
}
window.__MODE = MODE
window.__NAV = (Q.match(/nav=(\w+)/) || [])[1] || 'home'
window.__Q = decodeURIComponent((Q.match(/q=([^&]*)/) || [])[1] || '')
if (location.pathname.endsWith('popup.html')) setTimeout(() => {
  if (MODE === 'output') document.querySelectorAll('.segmented button')[1].click()
  if (MODE === 'settings') document.querySelector('[aria-label="Settings"]').click()
}, 600)
