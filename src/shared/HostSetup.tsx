// "Host not installed / not running" state with the exact setup command for this extension id.
import { useState } from 'react'
import { call, type HostState } from '../api'
import { Icon } from './icons'

const REPO = '~/personal-projects/refit-sidecar' // ponytail: where this repo lives on Hoàn's machine

export function hostProblem(host?: HostState) {
  return !!host && (host.state === 'missing' || host.state === 'forbidden' || host.state === 'down')
}

export function HostSetup({ host, compact }: { host?: HostState; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const cmd = `cd ${REPO} && pnpm install-host ${chrome.runtime.id}`
  const title = host?.state === 'forbidden' ? 'Host is set up for another extension id'
    : host?.state === 'down' ? 'Host is not running' : 'Terminal host not installed'
  const text = host?.state === 'forbidden' ? 'The installed host only accepts a different extension id (the id changes if the unpacked folder moves). Install it again for this one.'
    : host?.state === 'down' ? `The host stopped: ${host.error}` : 'Commands run on your Mac through a small Node host. Register it once:'

  async function copy() {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  return (
    <div className={`setup ${compact ? 'compact' : ''}`} role="status">
      <div className="empty-icon"><Icon d="plug" size={22} /></div>
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <ol className="steps">
        <li>
          <span>Run this in a terminal</span>
          <div className="cmd"><code>{cmd}</code><button className="icon-btn" aria-label="Copy command" title="Copy" onClick={copy}><Icon d={copied ? 'check' : 'copy'} /></button></div>
        </li>
        <li><span>Keep the <b>Tabularis</b> app installed with the refit-prod connection saved</span></li>
        <li><span>Check again (no browser restart needed)</span></li>
      </ol>
      <button className="btn primary" onClick={() => call({ type: 'hostStatus' })}>Check again</button>
    </div>
  )
}

// Host status + where its log lives. Shared by the drawer and popup settings.
export function HostCard({ host }: { host?: HostState }) {
  const ready = host?.state === 'ready'
  return (
    <div className="host-card">
      <Icon d={ready ? 'terminal' : 'plug'} />
      <div>
        <strong>{!host ? '…' : ready ? `Ready · ${host.commands.join(', ')}` : host.state === 'connecting' ? 'Connecting…' : host.state === 'missing' ? 'Not installed' : host.state === 'forbidden' ? 'Installed for another extension id' : 'Not running'}</strong>
        <span className="muted mono">{ready ? `tail -f ${host.log.replace(/^\/Users\/[^/]+/, '~')}` : host && 'error' in host ? host.error : ''}</span>
      </div>
      {ready ? null : <button className="btn ghost" onClick={() => call({ type: host?.state === 'missing' || host?.state === 'forbidden' ? 'openOptions' : 'hostStatus' })}>{host?.state === 'missing' || host?.state === 'forbidden' ? 'Set up' : 'Retry'}</button>}
    </div>
  )
}
