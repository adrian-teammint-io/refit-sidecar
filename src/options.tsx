import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import css from './content/styles.css?inline'
import { vars } from './themes'
import { useStore, useDark } from './shared/store'
import { HostCard, HostSetup } from './shared/HostSetup'

// Settings page: native host setup (with this extension's id filled in) and its live status.
function Options() {
  const { settings, host } = useStore()
  const dark = useDark(settings)
  const theme = vars(settings, dark)
  useEffect(() => { document.documentElement.style.background = theme['--bg'] }, [theme['--bg']])

  return (
    <main className={`root ${dark ? 'dark' : 'light'} page`} style={theme as React.CSSProperties}>
      <div className="card">
        <h1>Refit Sidecar</h1>
        <p className="muted">The drawer on app.refit.ai runs allowlisted commands in a terminal you keep open (<code>pnpm server</code>).
          Chrome reaches it through a small native messaging relay over a unix socket. The extension never sees database credentials:
          queries go through the Tabularis app.</p>
        <HostCard host={host} />
        {host?.state !== 'ready' && host?.state !== 'connecting' && <HostSetup host={host} />}
        <p className="hint muted">Extension id <code>{chrome.runtime.id}</code>. It changes if the unpacked folder moves; run install-host again if it does.
          To remove the host: <code>pnpm uninstall-host</code>.</p>
      </div>
    </main>
  )
}

const style = document.createElement('style')
style.textContent = css + `
  body { margin: 0; }
  .page { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
  .page > .card { width: min(600px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 28px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line-strong); }
  .page h1 { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
  .page .host-card, .page .cmd { background: var(--bg); }
  .page .setup { padding: 8px 0 0; }
`
document.head.append(style)
createRoot(document.getElementById('app')!).render(<Options />)
