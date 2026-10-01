// Failed syncs: the list from failed-syncs, plus select + delete (delete-syncs), like fish refit-sync_delete.
// Delete is occasional, so it hides behind a Select mode: cards get a check, a sticky bulk bar holds the count and
// Delete, and that bar expands in place into the confirm (preview, environment, typed count on prod).
import { useEffect, useState } from 'react'
import { ago, runStatus } from '../term'
import { dateRange, type FailedSyncs } from '../failed-syncs'
import { ENV } from '../table'
import { isRunning } from '../shared/store'
import { Icon } from '../shared/icons'
import { SyncList } from '../shared/SyncList'
import { Empty, ErrorBanner, Skeleton, runMatches } from './browse'
import type { Common } from './views'

const MAX_DELETE = 100 // the delete-syncs ids param takes at most 100
const ENV_NAME = ENV === 'stag' ? 'staging' : 'prod'
type Row = FailedSyncs['rows'][number]

export function FailedView({ fs, run, now, exec, cancel }: { fs?: FailedSyncs } & Common) {
  const rows = fs?.rows ?? []
  const n = rows.length
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const selected = rows.filter(r => picked.has(r.id)) // only rows still listed
  const mine = isRunning(run) && runMatches(run, 'failed-syncs')
  const deleting = isRunning(run) && runMatches(run, 'delete-syncs')
  const last = run && !isRunning(run) && (runMatches(run, 'failed-syncs') || runMatches(run, 'delete-syncs')) ? run : undefined
  const st = last ? runStatus(last, now) : undefined
  const exit = () => { setSelecting(false); setPicked(new Set()); setConfirming(false) }
  // A finished delete: its rows are gone, so leave select mode.
  useEffect(() => { if (last?.command === 'delete-syncs' && last.exit === 0 && !last.error) exit() }, [last?.id])
  const toggle = (id: string) => setPicked(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const allOn = !!n && selected.length === Math.min(n, MAX_DELETE)

  return (
    <div className="pane">
      <div className="runbar">
        <span className="muted">
          {deleting ? `Deleting on ${ENV_NAME}… approve it in Tabularis` : mine ? 'Running failed-syncs…'
            : selecting ? 'Pick the failures to delete' : fs?.at ? `${n} failed · updated ${ago(fs.at, now)}` : 'Not fetched yet'}
        </span>
        <span className="spacer" />
        {st && !selecting && <span className="pill" data-tone={st.tone} title={last?.summary ?? st.label}>{last?.summary ?? st.label}</span>}
        {mine || deleting ? <button className="btn ghost sm" onClick={cancel}><Icon d="stop" size={13} />Cancel</button>
          : selecting ? <button className="btn ghost sm" onClick={exit}>Done</button>
          : <>
              {!!n && <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>}
              <button className="btn primary sm" onClick={() => exec('failed-syncs', { env: ENV })}><Icon d="play" size={13} />Fetch FAIL syncs</button>
            </>}
      </div>
      <ErrorBanner error={fs?.error} hasRows={!!n} />
      {!fs ? (mine ? <Skeleton rows={3} /> : <Empty icon="terminal" title="No results yet" text={<><b>Fetch FAIL syncs</b> runs <code>failed-syncs</code> in your <code>pnpm server</code> terminal and lists every {ENV_NAME} sync_request with status FAIL.</>} />)
        : !n && !fs.error ? <Empty icon="check" title="No failed syncs" text={`No sync_request on ${ENV_NAME} has status FAIL.`} />
        : <>
            <SyncList rows={rows} now={now} selecting={selecting} selected={picked} onToggle={toggle} />
            {fs.truncated && <p className="hint muted center">Showing the newest {n}. Older failures were cut by the query limit.</p>}
          </>}
      {selecting && (
        <div className="bulk" data-open={confirming} data-env={ENV} role={confirming ? 'alertdialog' : 'toolbar'} aria-label={confirming ? 'Confirm delete' : 'Selection'}
          onKeyDown={e => { if (e.key === 'Escape' && confirming) { e.stopPropagation(); setConfirming(false) } }}>
          {confirming && !!selected.length
            ? <Confirm rows={selected} busy={isRunning(run) && !deleting ? run!.command : undefined} deleting={deleting}
                onCancel={() => setConfirming(false)} onDelete={() => exec('delete-syncs', { env: ENV, ids: selected.map(r => r.id).join(',') })} />
            : <div className="bulk-row">
                <span className="bulk-count"><b>{selected.length}</b> selected</span>
                <button className="link-btn" onClick={() => setPicked(allOn ? new Set() : new Set(rows.slice(0, MAX_DELETE).map(r => r.id)))}>
                  {allOn ? 'Clear' : n > MAX_DELETE ? `Select first ${MAX_DELETE}` : `Select all ${n}`}
                </button>
                <span className="spacer" />
                <button className="btn danger sm" disabled={!selected.length} onClick={() => setConfirming(true)}>
                  <Icon d="trash" size={13} />Delete{selected.length ? ` ${selected.length}` : ''}
                </button>
              </div>}
        </div>
      )}
    </div>
  )
}

// The bulk bar, expanded: what will go, where, and (on prod) the count typed back before Delete is enabled.
function Confirm({ rows, busy, deleting, onCancel, onDelete }: {
  rows: Row[]; busy?: string; deleting: boolean; onCancel: () => void; onDelete: () => void
}) {
  const [typed, setTyped] = useState('')
  const prod = ENV === 'prod'
  const tooMany = rows.length > MAX_DELETE
  const ready = !tooMany && !busy && !deleting && (!prod || typed.trim() === String(rows.length))
  const plural = rows.length === 1 ? '' : 's'
  return <>
    <div className="bulk-title">
      <span className="bulk-env">{prod ? 'PROD' : 'STAG'}</span>
      <strong>Delete {rows.length} failed sync{plural}?</strong>
    </div>
    <ul className="bulk-rows">
      {rows.slice(0, 5).map(r => (
        <li key={r.id}><span className="mono muted">{r.id.slice(0, 8)}</span><span className="bulk-name">{r.name}</span><span className="mono muted">{dateRange(r)}</span></li>
      ))}
      {rows.length > 5 && <li className="muted">and {rows.length - 5} more</li>}
    </ul>
    <p className="bulk-note muted">
      {deleting ? <>Waiting for approval in the <b>Tabularis</b> app…</> : <>Approve it in Tabularis when asked. Rows no longer FAIL are kept. This can't be undone.</>}
    </p>
    {tooMany && <p className="fail-text">At most {MAX_DELETE} per delete.</p>}
    {busy && <p className="muted">Wait for {busy} to finish.</p>}
    <div className="bulk-row">
      {prod && !deleting && (
        <label className="bulk-type">
          <span>Type <b className="mono">{rows.length}</b></span>
          <input value={typed} onChange={e => setTyped(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus aria-label={`Type ${rows.length} to confirm`}
            onKeyDown={e => { if (e.key === 'Enter' && ready) onDelete() }} />
        </label>
      )}
      <span className="spacer" />
      <button className="btn ghost sm" onClick={onCancel} disabled={deleting}>Back</button>
      <button className="btn danger sm" disabled={!ready} onClick={onDelete} autoFocus={!prod} aria-busy={deleting}>
        {deleting ? 'Waiting…' : `Delete ${rows.length}`}
      </button>
    </div>
  </>
}
