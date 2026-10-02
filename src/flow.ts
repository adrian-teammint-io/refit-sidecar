// A fitting room's node graph (host/sql/fitting-room-flow.sql): parser, steps (layers) and the Graph tab's layout.
// Pure, so plain node can test it (flow.test.ts).
import { parseTable } from './table.ts'

export type FlowInput = { type: string; id: string; name: string | null } // type: 'transaction' (upstream node) | 'connection'
export type FlowNode = {
  id: string
  name: string
  type: string // organize | join | union | aggregate | export
  inputs: FlowInput[] // payload.from, in order
  outputs: number // source_table rows (fitdata) this node writes
  outputStatus: string | null // newest sync_request_fitdata status across them
  outputAt: string | null
}
export type Flow = { at: number; runId: string; rows: FlowNode[]; truncated: boolean; error?: string }
export type FittingRoomFlows = Record<string, Flow> // by fitting room id

export function parseFlow(stdout: string): { rows: FlowNode[]; truncated: boolean } {
  const { rows, truncated } = parseTable(stdout, {
    cols: { id: 'id', name: 'name', type: 'type', inputs: 'inputs', outputs: 'outputs', outputStatus: 'output_status', outputAt: 'output_at' },
    nullable: ['outputStatus', 'outputAt'],
    numbers: ['outputs'],
  })
  return {
    truncated,
    rows: rows.map(r => {
      const inputs = JSON.parse(String(r.inputs)) as unknown
      if (!Array.isArray(inputs)) throw new Error(`Node ${r.id}: inputs is not a list`)
      return { ...r, inputs } as FlowNode
    }),
  }
}

// Search for the Flow tab: name, type or any input's name (a connection or an upstream node), case-insensitive.
export function matchesNode(n: FlowNode, q: string): boolean {
  const needle = q.trim().toLowerCase()
  return !needle || [n.name, n.type, ...n.inputs.map(i => i.name ?? '')].some(s => s.toLowerCase().includes(needle))
}

// Upstream nodes of n that exist in this room (a dangling id, e.g. a deleted node, is not an edge).
const ups = (n: FlowNode, byId: Map<string, FlowNode>) => n.inputs.filter(i => i.type === 'transaction' && byId.has(i.id)).map(i => i.id)

// Step of every node: 1 when it reads no other node (load nodes read connections), else 1 + its deepest upstream's.
// Refit refuses cycles in the editor; if one is stored anyway, the edge that closes it is ignored rather than looping.
export function steps(nodes: FlowNode[]): Map<string, number> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const out = new Map<string, number>()
  const visiting = new Set<string>()
  const step = (id: string): number => {
    const known = out.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0 // back edge
    visiting.add(id)
    const s = 1 + Math.max(0, ...ups(byId.get(id)!, byId).map(step))
    visiting.delete(id)
    out.set(id, s)
    return s
  }
  for (const n of nodes) step(n.id)
  return out
}

// Nodes grouped by step, in step order. Inside a step: by the mean position of their upstreams in the step before
// (keeps a node near what it reads, so fewer crossing edges), then by name.
export function layers(nodes: FlowNode[]): FlowNode[][] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const st = steps(nodes)
  const cols: FlowNode[][] = []
  for (const n of nodes) (cols[st.get(n.id)! - 1] ??= []).push(n)
  const row = new Map<string, number>()
  return cols.filter(Boolean).map(col => {
    const key = (n: FlowNode) => { const r = ups(n, byId).map(u => row.get(u)).filter(x => x !== undefined); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : -1 }
    const sorted = [...col].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
    sorted.forEach((n, i) => row.set(n.id, i))
    return sorted
  })
}

// Graph tab geometry: one column per step, left to right. ponytail: one ordering pass, not dagre's crossing
// minimisation; wide rooms can still cross edges. Swap in dagre if that gets hard to read.
export const BOX = { w: 168, h: 46, gapX: 48, gapY: 14 }
export type Placed = { node: FlowNode; x: number; y: number }
export function layout(nodes: FlowNode[]) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const placed = new Map<string, Placed>()
  const cols = layers(nodes)
  cols.forEach((col, c) => col.forEach((node, r) => placed.set(node.id, { node, x: c * (BOX.w + BOX.gapX), y: r * (BOX.h + BOX.gapY) })))
  // left to right only: an edge into the same or an earlier column is the one closing a cycle (see steps)
  const edges = nodes.flatMap(n => ups(n, byId).map(u => ({ from: placed.get(u)!, to: placed.get(n.id)! }))).filter(e => e.from.x < e.to.x)
  const tallest = Math.max(0, ...cols.map(c => c.length))
  return { placed, edges, width: Math.max(0, cols.length * (BOX.w + BOX.gapX) - BOX.gapX), height: Math.max(0, tallest * (BOX.h + BOX.gapY) - BOX.gapY) }
}
