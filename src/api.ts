import type { Line, RunInfo } from './term'

// Commands the UI can ask for. The host's commands.json is the real allowlist; this union just types the UI side.
export type Command = 'failed-syncs' | 'projects' | 'project-connections' | 'connections' | 'fitting-rooms' | 'delete-syncs'
  | 'project-members' | 'user-search' | 'add-project-user'
export type Args = Record<string, string> // validated again by the server against commands.json params

export type Req =
  | { type: 'run'; command: Command; args?: Args }
  | { type: 'cancel' }
  | { type: 'hostStatus' } // connect (or reconnect) to the host if not connected; the state lands in storage
  | { type: 'openOptions' }

// chrome.storage.session `host`
export type HostState =
  | { state: 'connecting' }
  | { state: 'ready'; commands: string[] } // relay up and `pnpm server` running
  | { state: 'offline' } // relay up, but no `pnpm server` in a terminal; flips to ready by itself when it starts
  | { state: 'missing'; error: string } // no manifest: install-host hasn't run
  | { state: 'forbidden'; error: string } // manifest is for another extension id
  | { state: 'down'; error: string; retryAt?: number } // host crashed or commands.json is broken

// chrome.storage.local `run`: the latest run's summary
export type Run = RunInfo & { id: string; command: Command; args?: Args; summary?: string } // summary: a one-line result, e.g. "Deleted 3"
// chrome.storage.session `output`: that run's terminal lines
export type Output = { runId: string; lines: Line[]; dropped: number }

type Res<T> = { ok: true; data: T } | { ok: false; error: string }

const RELOADED = 'Extension was reloaded. Refresh this page.'

export async function call<T>(req: Req): Promise<T> {
  // An orphaned content script (extension reloaded/updated under an open tab) loses chrome.runtime entirely.
  if (!chrome.runtime?.id) throw new Error(RELOADED)
  const res: Res<T> | undefined = await chrome.runtime.sendMessage(req)
  if (!res) throw new Error(RELOADED)
  if (!res.ok) throw new Error(res.error)
  return res.data
}
