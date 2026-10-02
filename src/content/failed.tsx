// Sync requests: the failed-syncs list per status tab (FAIL default, IN_PROGRESS, FRAGMENTED), plus select + delete
// (delete-syncs, FAIL tab only: the DELETE only removes FAIL rows), like fish refit-sync_delete. Delete is occasional, so it hides behind a Select mode: cards get a check, a sticky bulk bar holds the count and
// Delete, and that bar expands in place into the confirm (preview, environment; Tabularis approval is the last gate).
import { useEffect, useState } from 'react'
import { ago, plural, runStatus } from '../term'
import { dateRange, SYNC_STATUSES, type FailedSyncs, type SyncRequests, type SyncStatus } from '../failed-syncs'
import { ENV } from '../table'
import { isRunning } from '../shared/store'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { SyncList } from '../shared/SyncList'
import { Empty, ErrorBanner, RunBar, Skeleton, commandState, type Common } from './browse'
import { SelectionRow, WriteConfirm, useSelection } from './ui'


const MAX_DELETE = 100 // the delete-syncs ids param takes at most 100
const ENV_NAME = ENV === 'stag' ? 'staging' : 'prod'
type Row = FailedSyncs['rows'][number]

const WHAT: Record<SyncStatus, string> = { FAIL: 'failed', IN_PROGRESS: 'in progress', FRAGMENTED: 'fragmented' }

export function FailedView({ fs: failed, other, conn: focus, run, now, ready, exec, cancel }: {
  fs?: FailedSyncs; other?: SyncRequests; conn?: { id: string; name: string }
} & Common) {
  const [status, setStatus] = useState<SyncStatus>('FAIL')
  const fs = status === 'FAIL' ? failed : other?.[status]
  const what = WHAT[status]
  const load = () => exec('failed-syncs', { env: ENV, sync_status: status })
  // A failed-syncs run without sync_status (the popup's) is a FAIL fetch.
  const ofTab = (r?: typeof run) => (r?.args?.sync_status ?? 'FAIL') === status
  const [conn, setConn] = useState(focus) // cleared by "Show all"
  const rows = (fs?.rows ?? []).filter(r => !conn || r.connectionId === conn.id)
  const n = rows.length
  const [selecting, setSelecting] = useState(false)
  const sel = useSelection(rows, r => r.id, MAX_DELETE)
  const { selected } = sel
  const [confirming, setConfirming] = useState(false)

  const fetching = commandState(run, 'failed-syncs'), del = commandState(run, 'delete-syncs')
  const mine = fetching.mine && ofTab(run)
  const deleting = del.mine
  const last = (ofTab(run) ? fetching.last : undefined) ?? (status === 'FAIL' ? del.last : undefined)
  // A clean fetch is already said by "updated 2m ago"; the pill only shows a failed run or a delete's result.
  const st = last && (last.command === 'delete-syncs' || last.exit !== 0 || last.error) ? runStatus(last, now) : undefined
  const exit = () => { setSelecting(false); sel.clear(); setConfirming(false) }
  // A finished delete: its rows are gone, so leave select mode.
  useEffect(() => { if (last?.command === 'delete-syncs' && del.ok) exit() }, [last?.id])

  // Opened from a connection's FAIL count with nothing fetched yet: fetch once instead of showing an empty list.
  // Opening a tab that was never fetched fetches it once.
  useEffect(() => { if ((focus || status !== 'FAIL') && !fs && ready && !isRunning(run)) load() }, [status])
  const counts = { FAIL: failed, ...other } as Partial<Record<SyncStatus, FailedSyncs>>

  return (
    <div className="pane">
      <Segmented label="Sync request status" value={status} onChange={v => { exit(); setStatus(v) }}
        options={SYNC_STATUSES.map(k => [k, counts[k] ? `${k} ${counts[k]!.rows.length}` : k] as const)} />
      <RunBar running={mine || deleting} onCancel={cancel}
        text={deleting ? `Deleting on ${ENV_NAME}… approve it in Tabularis` : mine ? `Fetching ${status}…`
          : selecting ? 'Pick the failures to delete' : fs?.at ? `${n} ${what} · updated ${ago(fs.at, now)}` : 'Not fetched yet'}
        pill={st && !selecting ? { label: last?.summary ?? st.label, tone: st.tone } : undefined}
        tools={selecting ? <button className="btn ghost sm" onClick={exit}>Done</button>
          : !!n && status === 'FAIL' && <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>}
        refresh={!selecting && <button className="btn primary sm" onClick={load} data-refetch><Icon d="refresh" size={13} />{fs ? 'Refetch' : 'Fetch'}</button>} />
      <ErrorBanner error={fs?.error} hasRows={!!n} />
      {conn && (
        <div className="list-tools">
          <span className="muted">Only <b>{conn.name}</b></span>
          <span className="spacer" />
          <button className="link-btn" onClick={() => { setConn(undefined); sel.clear() }}>Show all {fs?.rows.length ?? ''}</button>
        </div>
      )}
      {!fs ? (mine ? <Skeleton rows={3} /> : <Empty icon="terminal" title="No results yet" text={<><b>Fetch</b> runs <code>failed-syncs</code> in your <code>pnpm server</code> terminal and lists every {ENV_NAME} sync_request with status {status}.</>} />)
        : !n && !fs.error ? <Empty icon="check" title={`No ${what} syncs`} text={conn
            ? `None for this connection in the last fetch${fs.truncated ? ' (older ones were cut by the query limit)' : ''}. Fetch again to refresh.`
            : `No sync_request on ${ENV_NAME} has status ${status}.`} />
        : <>
            <SyncList rows={rows} now={now} status={status} selecting={selecting} selected={sel.picked} onToggle={sel.toggle} />
            {fs.truncated && <p className="hint muted center">Showing the newest {n}. Older ones were cut by the query limit.</p>}
          </>}
      {selecting && (
        <div className="bulk" data-open={confirming} role={confirming ? 'alertdialog' : 'toolbar'} aria-label={confirming ? 'Confirm delete' : 'Selection'}
          onKeyDown={e => { if (e.key === 'Escape' && confirming) { e.stopPropagation(); setConfirming(false) } }}>
          {confirming && !!selected.length
            ? <Confirm rows={selected} busy={del.busy} deleting={deleting}
                onCancel={() => setConfirming(false)} onDelete={() => exec('delete-syncs', { env: ENV, ids: selected.map(r => r.id).join(',') })} />
            : <SelectionRow sel={sel}>
                <button className="btn danger sm" disabled={!selected.length} onClick={() => setConfirming(true)}>
                  <Icon d="trash" size={13} />Delete{selected.length ? ` ${selected.length}` : ''}
                </button>
              </SelectionRow>}
        </div>
      )}
    </div>
  )
}

// The bulk bar, expanded: what will go and where. Tabularis still asks for approval before the DELETE runs.
function Confirm({ rows, busy, deleting, onCancel, onDelete }: {
  rows: Row[]; busy?: string; deleting: boolean; onCancel: () => void; onDelete: () => void
}) {
  const tooMany = rows.length > MAX_DELETE
  return (
    <WriteConfirm title={<strong>Delete {plural(rows.length, 'failed sync')}?</strong>} waiting={deleting} busy={busy} autoFocus
      preview={
        <ul className="bulk-rows">
          {rows.slice(0, 5).map(r => (
            <li key={r.id}><span className="mono muted">{r.id.slice(0, 8)}</span><span className="bulk-name">{r.name}</span><span className="mono muted">{dateRange(r)}</span></li>
          ))}
          {rows.length > 5 && <li className="muted">and {rows.length - 5} more</li>}
        </ul>
      }
      note="Approve it in Tabularis when asked. Rows no longer FAIL are kept. This can't be undone."
      problem={tooMany ? `At most ${MAX_DELETE} per delete.` : undefined}
      onBack={onCancel} action={{ label: `Delete ${rows.length}`, danger: true, disabled: tooMany, onClick: onDelete }} />
  )
}
