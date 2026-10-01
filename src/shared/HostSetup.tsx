// "Server not running / host not installed" states with the exact commands to run, plus the status card.
import { useState } from 'react'
import { call, type HostState } from '../api'
import { Icon } from './icons'

const REPO = '~/personal-projects/refit-sidecar' // ponytail: where this repo lives on Hoàn's machine
const SERVER = `cd ${REPO} && pnpm server`

export function hostProblem(host?: HostState) {
  return !!host && host.state !== 'ready' && host.state !== 'connecting'
}

function Cmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return <div className="cmd"><code>{cmd}</code><button className="icon-btn" aria-label="Copy command" title="Copy" onClick={copy}><Icon d={copied ? 'check' : 'copy'} /></button></div>
}

export function HostSetup({ host, compact }: { host?: HostState; compact?: boolean }) {
  // The relay is installed and only the terminal server is missing: one step, and this view flips by itself once it's up.
  if (host?.state === 'offline') return (
    <div className={`setup ${compact ? 'compact' : ''}`} role="status">
      <div className="empty-icon"><Icon d="terminal" size={22} /></div>
      <h2>Server not running</h2>
      <p className="muted">Commands run in a terminal you keep open. Start it and this panel connects on its own.</p>
      <ol className="steps">
        <li><span>Run this in a terminal and leave it open</span><Cmd cmd={SERVER} /></li>
        <li><span>Keep the <b>Tabularis</b> app installed with the refit-prod connection saved</span></li>
      </ol>
    </div>
  )

  const title = host?.state === 'forbidden' ? 'Host is set up for another extension id'
    : host?.state === 'down' ? 'Native host stopped' : 'Native host not installed'
  const text = host?.state === 'forbidden' ? 'The installed host only accepts a different extension id (the id changes if the unpacked folder moves). Install it again for this one.'
    : host?.state === 'down' ? `Chrome lost the host: ${host.error}` : 'Chrome needs a small relay registered once, so the page can reach your terminal server:'
  return (
    <div className={`setup ${compact ? 'compact' : ''}`} role="status">
      <div className="empty-icon"><Icon d="plug" size={22} /></div>
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <ol className="steps">
        <li><span>Register the host (once)</span><Cmd cmd={`cd ${REPO} && pnpm install-host ${chrome.runtime.id}`} /></li>
        <li><span>Start the server and leave the terminal open</span><Cmd cmd={SERVER} /></li>
        <li><span>Check again (no browser restart needed)</span></li>
      </ol>
      <button className="btn primary" onClick={() => call({ type: 'hostStatus' })}>Check again</button>
    </div>
  )
}

const LABEL: Record<HostState['state'], string> = {
  ready: 'Server ready', offline: 'Server not running', connecting: 'Connecting…',
  missing: 'Host not installed', forbidden: 'Host: wrong extension id', down: 'Host stopped',
}
export const hostLabel = (host?: HostState) => (host ? LABEL[host.state] : '')
export const hostTone = (host?: HostState) => (host?.state === 'ready' ? 'ok' : host?.state === 'connecting' ? 'run' : 'fail')

// Server/host status row. Shared by the drawer settings, popup settings and the options page.
export function HostCard({ host }: { host?: HostState }) {
  const ready = host?.state === 'ready'
  const setup = host?.state === 'missing' || host?.state === 'forbidden'
  return (
    <div className="host-card">
      <Icon d={ready || host?.state === 'offline' ? 'terminal' : 'plug'} />
      <div>
        <strong>{!host ? '…' : ready ? `${LABEL.ready} · ${host.commands.join(', ')}` : LABEL[host.state]}</strong>
        <span className="muted mono">{ready || host?.state === 'offline' ? 'pnpm server, in a terminal' : host && 'error' in host ? host.error : ''}</span>
      </div>
      {!ready && host?.state !== 'offline' && (
        <button className="btn ghost" onClick={() => call({ type: setup ? 'openOptions' : 'hostStatus' })}>{setup ? 'Set up' : 'Retry'}</button>
      )}
    </div>
  )
}
