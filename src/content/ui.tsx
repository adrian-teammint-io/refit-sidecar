// Drawer building blocks shared by views (browse-list pieces live in browse.tsx). Styles: content/styles.css.
import { useState, type ReactNode } from 'react'
import { ENV } from '../table'

// Select mode's picked set over `rows` (keyed by `id`). `selected` keeps only rows still listed; Select all takes at
// most the first `max` (what the bulk action accepts at once).
export function useSelection<T>(rows: T[], id: (r: T) => string, max: number) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const selected = rows.filter(r => picked.has(id(r)))
  const allOn = !!rows.length && selected.length === Math.min(rows.length, max)
  return {
    picked, selected,
    toggle: (k: string) => setPicked(p => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s }),
    clear: () => setPicked(new Set()),
    toggleAll: () => setPicked(allOn ? new Set() : new Set(rows.slice(0, max).map(id))),
    allLabel: allOn ? 'Clear' : rows.length > max ? `Select first ${max}` : `Select all ${rows.length}`,
  }
}
export type Selection = ReturnType<typeof useSelection>

// The bulk bar's main row: "N selected", Select all / Clear, then the view's action.
export function SelectionRow({ sel, children }: { sel: Selection; children: ReactNode }) {
  return (
    <div className="bulk-row">
      <span className="bulk-count"><b>{sel.selected.length}</b> selected</span>
      <button className="link-btn" onClick={sel.toggleAll}>{sel.allLabel}</button>
      <span className="spacer" />
      {children}
    </div>
  )
}

export const EnvTag = () => <span className="bulk-env" data-env={ENV}>{ENV === 'prod' ? 'PROD' : 'STAG'}</span>

// The confirm step every write ends with (delete syncs, add user, create project): PROD/STAG tag and title, an
// optional preview, what happens next, then Back and the action. On prod `typeWord` must be typed first (any case).
// Tabularis still asks for approval before the write runs; `waiting` is that wait. `busy`: another command running.
export function WriteConfirm({ title, preview, note, problem, waiting, busy, typeWord, typeLabel, autoFocus, onBack, action }: {
  title: ReactNode; preview?: ReactNode; note: ReactNode; problem?: string; waiting: boolean; busy?: string
  typeWord?: string; typeLabel?: ReactNode; autoFocus?: boolean; onBack?: () => void
  action: { label: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void }
}) {
  const [typed, setTyped] = useState('')
  const mustType = ENV === 'prod' && typeWord !== undefined && !waiting
  const ok = !action.disabled && !busy && !waiting && (!mustType || typed.trim().toLowerCase() === typeWord!.toLowerCase())
  const go = () => { if (ok) action.onClick() }
  return <>
    <div className="bulk-title"><EnvTag />{title}</div>
    {preview}
    <p className="bulk-note muted">{waiting ? <>Waiting for approval in the <b>Tabularis</b> app…</> : note}</p>
    {problem && <p className="fail-text">{problem}</p>}
    {busy && <p className="muted">Wait for {busy} to finish.</p>}
    <div className="bulk-row">
      {mustType && (
        <label className="bulk-type">
          <span>{typeLabel ?? <>Type <b className="mono">{typeWord}</b></>}</span>
          <input value={typed} onChange={e => setTyped(e.target.value)} aria-label={`Type ${typeWord} to confirm`} spellCheck={false} autoFocus={autoFocus}
            style={{ width: `${Math.min(24, Math.max(8, typeWord!.length + 3))}ch` }} onKeyDown={e => { if (e.key === 'Enter') go() }} />
        </label>
      )}
      <span className="spacer" />
      {onBack && <button className="btn ghost sm" onClick={onBack} disabled={waiting}>Back</button>}
      <button className={`btn sm ${action.danger ? 'danger' : 'primary'}`} disabled={!ok} aria-busy={waiting} onClick={go} autoFocus={autoFocus && !mustType}>
        {waiting ? 'Waiting…' : action.label}
      </button>
    </div>
  </>
}
