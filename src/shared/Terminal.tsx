// Raw output view: stderr tinted, ANSI already stripped by the worker, auto-scroll while "follow" is on.
// Scrolling up pauses follow; scrolling back to the bottom resumes it.
import { useLayoutEffect, useRef, useState } from 'react'
import type { Output, Run } from '../api'
import { MAX_LINES, runStatus } from '../term'
import { Switch } from './controls'
import { isRunning } from './store'

export function Terminal({ output, run, now, onCancel }: { output?: Output; run?: Run; now: number; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const lines = output && run && output.runId === run.id ? output.lines : []

  useLayoutEffect(() => {
    const el = ref.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [lines.length, output, follow])

  function onScroll() {
    const el = ref.current!
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12
    if (atBottom !== follow) setFollow(atBottom)
  }

  const st = run && runStatus(run, now)
  return (
    <div className="term-wrap">
      <div ref={ref} className="term" role="log" aria-label="Command output" tabIndex={0} onScroll={onScroll}>
        {!run && <div className="term-line sys">No command has run yet.</div>}
        {!!output?.dropped && <div className="term-line sys">… {output.dropped} earlier lines dropped (keeps the last {MAX_LINES})</div>}
        {lines.map((l, i) => <div key={i} className={`term-line ${l.s}`}>{l.t || ' '}</div>)}
        {isRunning(run) && <div className="term-line sys term-cursor" aria-hidden="true">▍</div>}
      </div>
      <div className="term-bar">
        {st && <span className="pill" data-tone={st.tone} title={st.label}>{st.label}</span>}
        <span className="spacer" />
        <label className="term-follow muted">Follow<Switch label="Follow output" checked={follow} onChange={setFollow} /></label>
        {isRunning(run) && <button className="btn ghost sm" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
