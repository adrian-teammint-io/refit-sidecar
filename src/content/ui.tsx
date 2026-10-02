// Drawer building blocks shared by views (browse-list pieces live in browse.tsx). Styles: content/styles.css.
import { useState, type ReactNode } from 'react'
import { ENV } from '../table'

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
