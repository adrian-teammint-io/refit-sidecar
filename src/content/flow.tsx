// A fitting room's Flow tab: its nodes (transactions) step by step, as a list (default) or a left-to-right graph,
// with one search for both. Data: fitting-room-flow, one fetch per room (no batches). Layering and layout: src/flow.ts.
import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { ago, plural, runStatus } from '../term'
import { ENV } from '../table'
import { fittingNodeUrl } from '../links'
import { BOX, layers, layout, matchesNode, type Flow, type FlowNode } from '../flow'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { stagger } from '../shared/card'
import { Empty, ErrorBanner, RunBar, SearchBox, commandState, type Common } from './browse'

const MODES = [['list', 'Steps'], ['graph', 'Graph']] as const
const TONE: Record<string, string> = { SUCCESS: 'ok', FAIL: 'fail' }
type Room = { id: string; projectId: string }
type Pick = { focus?: string; setFocus: (id: string) => void }

export function FlowPanel({ room, flow, ...c }: { room: Room; flow?: Flow } & Common) {
  const [mode, setMode] = useState<'list' | 'graph'>('list')
  const [focus, setFocus] = useState<string>() // node picked in the graph, or jumped to from an input chip
  const [q, setQ] = useState('')
  const extra = { room: room.id, env: ENV }
  const load = () => c.exec('fitting-room-flow', extra)
  const asked = useRef(false)
  useEffect(() => { if (c.ready && !flow && !asked.current) { asked.current = true; load() } }, [c.ready])
  const { mine, busy, last, ok } = commandState(c.run, 'fitting-room-flow', extra)
  const n = flow?.rows.length ?? 0
  const hits = q.trim() ? new Set(flow?.rows.filter(r => matchesNode(r, q)).map(r => r.id)) : undefined
  const meta = !flow?.at ? '' : `${hits ? `${hits.size} of ` : ''}${plural(n, 'node')}${flow.truncated ? ' (cut off)' : ''} · updated ${ago(flow.at, c.now)}`
  return (
    <div className="flow">
      <RunBar text={mine ? (flow ? 'Refreshing flow…' : 'Loading flow…') : busy ? `Queued after ${busy}` : meta}
        pill={last && !ok ? runStatus(last, c.now) : undefined} running={mine} onCancel={c.cancel}
        refresh={<button className="icon-btn sm" onClick={load} aria-label="Refresh" title="Refresh" data-refetch><Icon d="refresh" size={14} /></button>} />
      <ErrorBanner error={flow?.error} hasRows={!!n} />
      {!flow ? <FlowSkeleton />
        : !n ? <Empty icon="flow" title="No nodes" text="This fitting room is empty." />
        : <>
            <SearchBox value={q} onChange={setQ} placeholder="Find a node by name, type or input" />
            <Segmented label="Flow layout" value={mode} options={MODES} onChange={setMode} />
            <div className="flow-body" data-stale={mine}>
              {mode === 'list'
                ? <Steps nodes={flow.rows} hits={hits} room={room} now={c.now} focus={focus} setFocus={setFocus} />
                : <Graph nodes={flow.rows} hits={hits} room={room} now={c.now} focus={focus} setFocus={setFocus} />}
            </div>
          </>}
    </div>
  )
}

// Shaped like the Steps list (step label, then node cards) so the wait reads as the flow arriving.
function FlowSkeleton() {
  let i = 0
  return (
    <div className="skeleton-list flow-skeleton" aria-busy="true" aria-label="Loading flow">
      {[3, 2, 1].map((cards, s) => (
        <Fragment key={s}>
          <span className="skel skel-label" style={{ '--i': i++ } as CSSProperties} />
          {Array.from({ length: cards }, (_, k) => (
            <div key={k} className="skel skel-node" style={{ '--i': i++ } as CSSProperties}>
              <span className="skel-bar" style={{ width: 64 }} /><span className="skel-bar" style={{ width: `${45 + ((s + k) % 3) * 12}%` }} />
              <span className="skel-bar skel-chip" />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  )
}

function OutputPill({ n, now }: { n: FlowNode; now: number }) {
  if (!n.outputs) return null
  const when = n.outputAt ? ` · ${ago(Date.parse(n.outputAt), now)}` : ''
  return <span className="pill" data-tone={n.outputStatus ? TONE[n.outputStatus] ?? 'none' : 'none'} title={`${plural(n.outputs, 'output')}, newest fitdata sync`}>
    {n.outputStatus ?? 'not synced'}{when}
  </span>
}

function OpenNode({ room, n }: { room: Room; n: FlowNode }) {
  const url = fittingNodeUrl(room, n.id)
  return url ? <a className="icon-btn sync-link" href={url} target="_top" aria-label={`Open ${n.name} in Refit`} title="Open node in Refit"><Icon d="external" size={14} /></a> : null
}

// Step 1 = nodes reading only connections; each later step reads the ones before. Steps come from the whole room, so
// a search hides cards but keeps their step numbers. An upstream chip jumps to its card (shown even if the search hides it).
function Steps({ nodes, hits, room, now, focus, setFocus }: { nodes: FlowNode[]; hits?: Set<string>; room: Room; now: number } & Pick) {
  const box = useRef<HTMLDivElement>(null)
  const ids = new Set(nodes.map(n => n.id))
  useEffect(() => { if (focus) box.current?.querySelector(`[data-node="${focus}"]`)?.scrollIntoView({ block: 'center' }) }, [focus])
  const shown = layers(nodes).map((layer, s) => ({ s, layer: layer.filter(n => !hits || hits.has(n.id) || n.id === focus) })).filter(l => l.layer.length)
  if (!shown.length) return <Empty icon="search" title="No matching nodes" text="Search matches node name, type and the names of what it reads." />
  let i = 0
  return (
    <div ref={box} className="flow-steps">
      {shown.map(({ s, layer }) => (
        <section key={s}>
          <p className="eyebrow group-head">Step {s + 1}</p>
          <ul className="syncs">
            {layer.map(n => (
              <li key={n.id} className="sync flow-node" data-node={n.id} data-focus={focus === n.id} style={stagger(i++)}>
                <div className="sync-head">
                  <span className="badge">{n.type.toUpperCase()}</span>
                  <strong title={n.name}>{n.name}</strong>
                  <OutputPill n={n} now={now} />
                  <OpenNode room={room} n={n} />
                </div>
                {!!n.inputs.length && (
                  <p className="flow-inputs">
                    {n.inputs.map((inp, k) => inp.type === 'transaction' && ids.has(inp.id)
                      ? <button key={k} className="chip" onClick={() => setFocus(inp.id)} title="Show this node"><Icon d="back" size={11} />{inp.name}</button>
                      : <span key={k} className="chip" data-kind={inp.type} title={inp.name ? inp.type : `${inp.type} ${inp.id} (not found)`}>
                          <Icon d={inp.type === 'connection' ? 'plug' : 'alert'} size={11} />{inp.name ?? 'missing'}
                        </span>)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Drag to pan (mouse only; touch and trackpads already scroll natively). A press that moves under 4px stays a click;
// after a real drag the click that follows is swallowed so it doesn't pick a node.
function usePan() {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number; id: number; moved: boolean } | undefined>(undefined)
  const swallow = useRef(false)
  const end = () => {
    if (drag.current?.moved) { swallow.current = true; setTimeout(() => { swallow.current = false }) }
    drag.current = undefined
    if (ref.current) ref.current.dataset.panning = 'false'
  }
  return {
    ref,
    onPointerDown: (e: PointerEvent) => {
      const el = ref.current
      if (!el || e.pointerType !== 'mouse' || e.button !== 0 || (e.target as Element).closest('a')) return
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId, moved: false }
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current, el = ref.current
      if (!d || !el) return
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 4) return
        d.moved = true
        el.setPointerCapture(d.id)
        el.dataset.panning = 'true'
      }
      el.scrollLeft = d.left - dx
      el.scrollTop = d.top - dy
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClickCapture: (e: MouseEvent) => { if (swallow.current) { e.stopPropagation(); e.preventDefault() } },
  }
}

// Boxes are HTML (so names get an ellipsis) over one SVG of curved edges. Clicking a box picks it: its edges light up
// and the bar above shows it with Open in Refit. A search dims what doesn't match and scrolls to the first hit.
function Graph({ nodes, hits, room, now, focus, setFocus }: { nodes: FlowNode[]; hits?: Set<string>; room: Room; now: number } & Pick) {
  const g = layout(nodes)
  const pan = usePan()
  const mid = BOX.h / 2
  const picked = focus ? g.placed.get(focus)?.node : undefined
  const first = hits && [...g.placed.values()].find(p => hits.has(p.node.id))
  useEffect(() => {
    const el = pan.ref.current
    if (el && first) el.scrollTo({ left: first.x - 24, top: first.y - 24, behavior: 'smooth' })
  }, [first?.node.id])
  const dim = (id: string) => !!hits && !hits.has(id)
  return <>
    <div className="graph-bar">
      {picked ? <>
        <span className="badge">{picked.type.toUpperCase()}</span>
        <strong title={picked.name}>{picked.name}</strong>
        <OutputPill n={picked} now={now} />
        <OpenNode room={room} n={picked} />
      </> : <span className="muted">{hits && !hits.size ? 'No matching nodes' : 'Drag to move around · click a node to pick it'}</span>}
    </div>
    <div className="graph-scroll" tabIndex={0} aria-label="Fitting room graph" {...pan}>
      <div className="graph" style={{ width: g.width, height: g.height }}>
        <svg width={g.width} height={g.height} aria-hidden>
          {g.edges.map(({ from, to }) => {
            const x1 = from.x + BOX.w, y1 = from.y + mid, x2 = to.x, y2 = to.y + mid, dx = (x2 - x1) / 2
            const on = !!focus && (focus === from.node.id || focus === to.node.id)
            const off = focus ? !on : dim(from.node.id) && dim(to.node.id)
            return <path key={`${from.node.id}-${to.node.id}`} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} data-on={on} data-dim={off} />
          })}
        </svg>
        {[...g.placed.values()].map(({ node: n, x, y }) => (
          <button key={n.id} className="graph-node" aria-label={n.name} style={{ left: x, top: y, width: BOX.w, height: BOX.h }}
            data-focus={focus === n.id} data-dim={dim(n.id)} data-tone={n.outputs && n.outputStatus ? TONE[n.outputStatus] ?? 'none' : undefined}
            title={`${n.name} (${n.type})${n.outputs ? `, output ${n.outputStatus ?? 'not synced'}` : ''}`} onClick={() => setFocus(n.id)}>
            <span className="graph-type">{n.type}</span>
            <span className="graph-name">{n.name}</span>
          </button>
        ))}
      </div>
    </div>
  </>
}
