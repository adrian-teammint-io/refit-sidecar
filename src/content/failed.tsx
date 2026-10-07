// Sync requests: the failed-syncs list per tab (FAIL default; OTHER, every status but SUCCESS and FAIL, IN_PROGRESS then
// READY first; FRAGMENTED), plus select + delete, like fish refit-sync_delete: on FAIL (delete-syncs) and OTHER
// (delete-other-syncs; the confirm warns that a running sync loses its row and a READY one never runs), each only rows
// still in that state. That tab also filters by status, copies the picked rows as Markdown and marks them FAIL
// (mark-syncs-fail, reason "Manually mark as FAIL").
// Delete is occasional, so it hides behind a Select mode: cards get a check, a sticky bulk bar holds the count and
// Delete, and that bar expands in place into the confirm (preview, environment; Tabularis approval is the last gate).
import { useEffect, useRef, useState } from 'react'
import type { Command } from '../api'
import { ago, plural, runOk, runStatus } from '../term'
import { dateRange, syncMarkdown, SYNC_STATUSES, type FailedSyncs, type SyncRequests, type SyncStatus } from '../failed-syncs'
import { ENV } from '../table'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { SyncList } from '../shared/SyncList'
import { Empty, ErrorBanner, MAX_AGE, RunBar, Skeleton, commandState, type Common, type Find } from './browse'
import { SelectionRow, WriteConfirm, useSelection } from './ui'


const MAX_DELETE = 100 // each delete command's ids param takes at most 100
const ENV_NAME = ENV === 'stag' ? 'staging' : 'prod'
type Row = FailedSyncs['rows'][number]

export const WHAT: Record<SyncStatus, string> = { FAIL: 'failed', OTHER: 'other', FRAGMENTED: 'fragmented' }
const LABEL: Record<SyncStatus, string> = { FAIL: 'FAIL', OTHER: 'Not SUCCESS nor FAIL', FRAGMENTED: 'FRAGMENTED' }
const HAS: Record<SyncStatus, string> = { FAIL: 'has status FAIL', OTHER: 'is neither SUCCESS nor FAIL', FRAGMENTED: 'has status FRAGMENTED' }
// The tabs with Delete: its command, what a row is called in the confirm, and the confirm's warning. Not FRAGMENTED
// (its rows are in OTHER too).
const DELETE: Partial<Record<SyncStatus, { cmd: Command; noun: string; note: string }>> = {
  FAIL: { cmd: 'delete-syncs', noun: 'failed sync', note: "Approve it in Tabularis when asked. Rows no longer FAIL are kept. This can't be undone." },
  OTHER: { cmd: 'delete-other-syncs', noun: 'sync request', note: "Approve it in Tabularis when asked. Rows that became SUCCESS or FAIL meanwhile are kept. An IN_PROGRESS sync still running loses its row, so the crawler can't record how it ended; a READY one never runs. This can't be undone." },
}

export function FailedView({ fs: failed, other, conn: focus, find, run, now, ready, exec, cancel }: {
  fs?: FailedSyncs; other?: SyncRequests; conn?: { id: string; name: string }; find: Find
} & Common) {
  const [status, setStatus] = useState<SyncStatus>('FAIL')
  const fs = status === 'FAIL' ? failed : other?.[status]
  const what = WHAT[status]
  const load = () => exec('failed-syncs', { env: ENV, sync_status: status })
  // A failed-syncs run without sync_status (the popup's) is a FAIL fetch.
  const ofTab = (r?: typeof run) => (r?.args?.sync_status ?? 'FAIL') === status
  const [conn, setConn] = useState(focus) // cleared by "Show all"
  const [only, setOnly] = useState('') // the OTHER tab's status filter ('' = all)
  const rows = (fs?.rows ?? []).filter(r => (!conn || r.connectionId === conn.id) && (!only || r.status === only))
  // The filter's options: statuses in the last fetch, in the list's order (IN_PROGRESS, READY, then by name), with counts.
  const statuses = status !== 'OTHER' ? [] : Object.entries((fs?.rows ?? []).reduce<Record<string, number>>((a, r) => (r.status ? { ...a, [r.status]: (a[r.status] ?? 0) + 1 } : a), {}))
    .sort(([a], [b]) => (a === 'IN_PROGRESS' ? 0 : a === 'READY' ? 1 : 2) - (b === 'IN_PROGRESS' ? 0 : b === 'READY' ? 1 : 2) || a.localeCompare(b))
  const n = rows.length
  const delOf = DELETE[status]
  const canDelete = !!delOf
  const delCmd = delOf?.cmd ?? 'delete-syncs'
  const pickable = canDelete ? rows : []
  const [selecting, setSelecting] = useState(false)
  const sel = useSelection(pickable, r => r.id, MAX_DELETE)
  const { selected } = sel
  const [confirming, setConfirming] = useState<false | 'delete' | 'fail'>(false)
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState('')

  const fetching = commandState(run, 'failed-syncs'), del = commandState(run, delCmd), mark = commandState(run, 'mark-syncs-fail')
  const mine = fetching.mine && ofTab(run)
  const deleting = del.mine, marking = status === 'OTHER' && mark.mine
  const writes = [delCmd, ...(status === 'OTHER' ? ['mark-syncs-fail'] : [])]
  const last = (ofTab(run) ? fetching.last : undefined) ?? (canDelete ? del.last : undefined) ?? (status === 'OTHER' ? mark.last : undefined)
  // A clean fetch is already said by "updated 2m ago"; the pill only shows a failed run or a write's result.
  const st = last && (writes.includes(last.command) || !runOk(last)) ? runStatus(last, now) : undefined
  const exit = () => { setSelecting(false); sel.clear(); setConfirming(false); setCopied(false); setCopyErr('') }
  const copy = () => navigator.clipboard.writeText(syncMarkdown(selected)).then(
    () => { setCopyErr(''); setCopied(true); setTimeout(() => setCopied(false), 1600) }, e => setCopyErr(`Could not copy: ${(e as Error).message}`))
  // Double-click a card: select mode with just it picked. Its x: the same, straight to the delete confirm.
  const pickOne = (r: Row) => { sel.clear(); sel.toggle(r.id); setSelecting(true) }
  const deleteOne = (r: Row) => { pickOne(r); setConfirming('delete') }
  const one = canDelete ? { onPick: pickOne, onDelete: deleteOne } : {}
  // A finished delete or mark: its rows left this tab, so leave select mode.
  useEffect(() => { if ((last?.command === delCmd && del.ok) || (last?.command === 'mark-syncs-fail' && mark.ok)) exit() }, [last?.id])

  // Opening Sync requests, or switching to a tab, fetches that tab again when it was never fetched or is older than
  // MAX_AGE (the browse views' rule); its cached rows stay on screen, dimmed, meanwhile. Once per visit to a tab.
  const asked = useRef<SyncStatus>(undefined)
  useEffect(() => {
    if (!ready || asked.current === status || mine || (fs && Date.now() - fs.at <= MAX_AGE)) return
    asked.current = status
    load()
  }, [status, ready])
  const counts = { FAIL: failed, ...other } as Partial<Record<SyncStatus, FailedSyncs>>

  return (
    <div className="pane">
      <Segmented label="Sync request status" value={status} onChange={v => { exit(); setOnly(''); setStatus(v) }}
        options={SYNC_STATUSES.map(k => [k, counts[k] ? `${LABEL[k]} ${counts[k]!.rows.length}` : LABEL[k]] as const)} />
      <RunBar running={mine || deleting || marking} onCancel={cancel}
        text={deleting ? `Deleting on ${ENV_NAME}… approve it in Tabularis` : marking ? `Marking as FAIL on ${ENV_NAME}… approve it in Tabularis` : mine ? `Fetching ${LABEL[status]}…`
          : selecting ? (status === 'FAIL' ? 'Pick the failures to delete' : 'Pick sync requests') : fs?.at ? `${n} ${what} · updated ${ago(fs.at, now)}` : 'Not fetched yet'}
        pill={st && !selecting ? { label: last?.summary ?? st.label, tone: st.tone } : undefined}
        tools={selecting ? <button className="btn ghost sm" onClick={exit}>Done</button>
          : !!pickable.length && <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>}
        refresh={!selecting && <button className="btn primary sm" onClick={load} data-refetch><Icon d="refresh" size={13} />{fs ? 'Refetch' : 'Fetch'}</button>} />
      <ErrorBanner error={fs?.error} hasRows={!!n} />
      {statuses.length > 1 && (
        <div className="filters">
          <label className="filter-select">
            <select aria-label="Status" value={only} onChange={e => { setOnly(e.target.value); sel.clear() }}>
              <option value="">All statuses · {fs?.rows.length}</option>
              {statuses.map(([k, c]) => <option key={k} value={k}>{k} · {c}</option>)}
            </select>
            <Icon d="chevron" size={13} />
          </label>
        </div>
      )}
      {conn && (
        <div className="list-tools">
          <span className="muted">Only <b>{conn.name}</b></span>
          <span className="spacer" />
          <button className="link-btn" onClick={() => { setConn(undefined); sel.clear() }}>Show all {fs?.rows.length ?? ''}</button>
        </div>
      )}
      {!fs ? (mine ? <Skeleton rows={3} /> : <Empty icon="terminal" title="No results yet" text={<><b>Fetch</b> runs <code>failed-syncs</code> in your <code>pnpm server</code> terminal and lists every {ENV_NAME} sync_request that {HAS[status]}.</>} />)
        : !n && !fs.error ? <Empty icon="check" title={status === 'OTHER' ? 'Nothing but SUCCESS and FAIL' : `No ${what} syncs`} text={conn
            ? `None for this connection${only ? ` with status ${only}` : ''} in the last fetch${fs.truncated ? ' (older ones were cut by the query limit)' : ''}. Fetch again to refresh.`
            : only ? `None with status ${only} in the last fetch.` : `No sync_request on ${ENV_NAME} ${HAS[status]}.`} />
        : <>
            <div className="results" data-stale={mine}>
              <SyncList rows={rows} now={now} status={status} selecting={selecting} selected={sel.picked} onToggle={sel.toggle} {...one}
                findConnection={r => find('connections', r.name.trim())} findProject={r => find('projects', r.project)} />
            </div>
            {fs.truncated && <p className="hint muted center">Showing the newest {n}. Older ones were cut by the query limit.</p>}
          </>}
      {selecting && (
        <div className="bulk" data-open={!!confirming} role={confirming ? 'alertdialog' : 'toolbar'} aria-label={confirming === 'fail' ? 'Confirm mark as FAIL' : confirming ? 'Confirm delete' : 'Selection'}
          onKeyDown={e => { if (e.key === 'Escape' && confirming) { e.stopPropagation(); setConfirming(false) } }}>
          {confirming === 'fail' && !!selected.length
            ? <Confirm rows={selected} title={`Mark ${plural(selected.length, 'sync request')} as FAIL?`} label={`Mark ${selected.length} as FAIL`}
                note={'Sets status FAIL and reason "Manually mark as FAIL". Approve it in Tabularis when asked. Rows that became SUCCESS or FAIL meanwhile are kept. An IN_PROGRESS sync still running may overwrite it when it finishes.'}
                busy={mark.busy} waiting={marking} onCancel={() => setConfirming(false)} onOk={() => exec('mark-syncs-fail', { env: ENV, ids: selected.map(r => r.id).join(',') })} />
            : confirming === 'delete' && !!selected.length && delOf
            ? <Confirm rows={selected} title={`Delete ${plural(selected.length, delOf.noun)}?`} label={`Delete ${selected.length}`} danger note={delOf.note}
                busy={del.busy} waiting={deleting} onCancel={() => setConfirming(false)} onOk={() => exec(delCmd, { env: ENV, ids: selected.map(r => r.id).join(',') })} />
            : <>
                <SelectionRow sel={sel}>
                  <button className="btn danger sm" disabled={!selected.length} onClick={() => setConfirming('delete')}>
                    <Icon d="trash" size={13} />Delete{selected.length ? ` ${selected.length}` : ''}
                  </button>
                </SelectionRow>
                {status === 'OTHER' && (
                  <div className="bulk-actions">
                    <button className="btn ghost sm" disabled={!selected.length} onClick={copy} title="One [name](link): MM-DD ~ MM-DD line per sync request">
                      <Icon d={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copied' : 'Copy Markdown'}
                    </button>
                    <button className="btn ghost sm" disabled={!selected.length} onClick={() => setConfirming('fail')}>
                      <Icon d="alert" size={13} />Mark all as FAIL
                    </button>
                  </div>
                )}
                {copyErr && <p className="bulk-note" data-tone="fail">{copyErr}</p>}
              </>}
        </div>
      )}
    </div>
  )
}

// The bulk bar, expanded: which rows a Delete or Mark as FAIL touches, and where. Tabularis still asks for approval
// before it runs.
function Confirm({ rows, title, label, danger, note, busy, waiting, onCancel, onOk }: {
  rows: Row[]; title: string; label: string; danger?: boolean; note: string; busy?: string; waiting: boolean; onCancel: () => void; onOk: () => void
}) {
  const tooMany = rows.length > MAX_DELETE
  return (
    <WriteConfirm title={<strong>{title}</strong>} waiting={waiting} busy={busy} autoFocus
      preview={
        <ul className="bulk-rows">
          {rows.slice(0, 5).map(r => (
            <li key={r.id}><span className="mono muted">{r.id.slice(0, 8)}</span><span className="bulk-name">{r.name}</span><span className="mono muted">{dateRange(r)}</span></li>
          ))}
          {rows.length > 5 && <li className="muted">and {rows.length - 5} more</li>}
        </ul>
      }
      note={note}
      problem={tooMany ? `At most ${MAX_DELETE} at a time.` : undefined}
      onBack={onCancel} action={{ label, danger, disabled: tooMany, onClick: onOk }} />
  )
}
