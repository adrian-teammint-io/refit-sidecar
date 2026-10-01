// Fake chrome.* for screenshots of the drawer (mock.html) and popup (popup.html), no extension needed.
// State comes from the URL: mock.html#<mode> or popup.html?m=<mode>, plus "light" anywhere in it for Claude Paper light.
// Modes: results (default), output (a run in progress), never (not run yet), zero (no failures), error (last run failed),
//        missing (host not installed), forbidden, settings, many (30 rows: overflow/limit checks).
const Q = location.hash.slice(1) + '&' + location.search.slice(1)
const MODE = (Q.match(/(?:^|[&?])m?=?(output|never|zero|error|missing|forbidden|settings|many|results)/) || [])[1] || 'results'
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
}))
const lines = [
  { s: 'sys', t: '$ failed-syncs' },
  { s: 'err', t: '$ tabularis --mcp  ·  run_query on ea7632d2-f563-4d45-80ba-22728c416a40  ·  sql/failed-syncs.sql' },
  { s: 'err', t: 'connected to tabularis-mcp 0.1.0' },
  { s: 'err', t: `${rows.length} rows in 979ms` },
  ...JSON.stringify({ columns: ['id', 'connection_id', 'project_id', 'project', 'name', 'kind', 'service'], rows: rows.slice(0, 3).map(r => [r.id, r.connectionId, r.projectId, r.project, r.name, r.kind, r.service]) }, null, 2).split('\n').map(t => ({ s: 'out', t })),
]
const running = MODE === 'output'
const run = MODE === 'never' ? undefined : { id: 'r1', command: 'failed-syncs', startedAt: now - (running ? 3400 : 125000), ...(running ? {} : { endedAt: now - 124000, exit: MODE === 'error' ? 1 : 0 }) }
const failedSyncs = MODE === 'never' ? undefined : { at: now - 124000, runId: 'r1', rows: MODE === 'zero' ? [] : rows, truncated: MODE === 'many', ...(MODE === 'error' ? { error: 'Command failed (exit 1). See Output.' } : {}) }
const host = MODE === 'missing' ? { state: 'missing', error: 'Specified native messaging host not found.' }
  : MODE === 'forbidden' ? { state: 'forbidden', error: 'Access to the specified native messaging host is forbidden.' }
  : { state: 'ready', commands: ['failed-syncs'], log: '/Users/hoan/Library/Logs/refit-sidecar.log' }
const local = { settings: LIGHT ? { theme: 'paper', mode: 'light', badge: true } : { theme: 'graphite', mode: 'dark', badge: true }, run, failedSyncs }
const session = { host, output: run && { runId: 'r1', lines: running ? lines.slice(0, 7) : lines, dropped: 0 } }
const area = data => ({ get: async keys => Object.fromEntries([].concat(keys).map(k => [k, data[k]]).filter(([, v]) => v !== undefined)), set: async () => {}, remove: async () => {} })
window.chrome = {
  runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '0.1.0' }), openOptionsPage() {}, onMessage: { addListener() {} },
    sendMessage: async () => ({ ok: true, data: undefined }) },
  storage: { local: area(local), session: area(session), onChanged: { addListener() {}, removeListener() {} } },
  tabs: { create() {} },
}
// The drawer uses a closed shadow root; open it here so the mock can click into it.
const attach = Element.prototype.attachShadow
Element.prototype.attachShadow = function () { return attach.call(this, { mode: 'open' }) }
window.__MODE = MODE
if (location.pathname.endsWith('popup.html')) setTimeout(() => {
  if (MODE === 'output') document.querySelectorAll('.segmented button')[1].click()
  if (MODE === 'settings') document.querySelector('[aria-label="Settings"]').click()
}, 600)
