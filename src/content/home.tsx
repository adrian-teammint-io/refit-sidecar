// Home: the command list (Search, Checks) and pinned projects.
import { ago } from '../term'
import type { FailedSyncs } from '../failed-syncs'
import { pinnedFor, type Pins, type ProjectRef } from '../projects'
import { Icon, type IconName } from '../shared/icons'

// hue: the icon's colour as an oklch hue angle (styles.css "Home: command list"); a FAIL count turns it red.
function CommandRow({ icon, hue, title, sub, count, onClick }: { icon: IconName; hue: number; title: string; sub: string; count?: number; onClick: () => void }) {
  return (
    <button className="cmd-row" onClick={onClick} data-tone={count ? 'fail' : undefined} data-hue style={{ '--hue': hue } as React.CSSProperties}>
      <span className="cmd-icon"><Icon d={icon} size={18} /></span>
      <span className="cmd-text"><strong>{title}</strong><span className="muted">{sub}</span></span>
      {!!count && <span className="count-chip">{count}</span>}
      <Icon d="chevron" />
    </button>
  )
}

export type HomeTarget = 'projects' | 'connections' | 'fitting' | 'failed'

export function Home({ pins, failedSyncs: fs, now, open, openProject }: {
  pins?: Pins; failedSyncs?: FailedSyncs; now: number; open: (v: HomeTarget) => void; openProject: (p: ProjectRef) => void
}) {
  const n = fs?.rows.length ?? 0
  const pinned = pinnedFor(pins ?? {}, '', 'all')
  return (
    <div className="pane">
      <p className="eyebrow">Search</p>
      <div className="cmd-list">
        <CommandRow icon="folder" hue={255} title="Projects" onClick={() => open('projects')} sub="Search, sort and pin projects; open one for its connections" />
        <CommandRow icon="plug" hue={160} title="Connections" onClick={() => open('connections')} sub="Find a data source in any project by name, platform or id" />
        <CommandRow icon="flow" hue={305} title="Fitting rooms" onClick={() => open('fitting')} sub="Find a pipeline by name or project; newest edits first" />
      </div>
      <p className="eyebrow">Checks</p>
      <div className="cmd-list">
        <CommandRow icon="alert" hue={75} title="Sync requests" count={n} onClick={() => open('failed')}
          sub={fs?.at ? `${n} failed · updated ${ago(fs.at, now)}` : 'FAIL, IN_PROGRESS and FRAGMENTED sync_requests'} />
      </div>
      {!!pinned.length && <>
        <p className="eyebrow">Pinned projects</p>
        <ul className="proj-list">{pinned.map(p => (
          <li key={p.id}><button className="proj" onClick={() => openProject(p)}><Icon d="pin" size={14} /><span className="proj-main"><strong>{p.name}</strong></span>{p.failed > 0 && <span className="count-chip">{p.failed}</span>}<Icon d="chevron" /></button></li>
        ))}</ul>
      </>}
    </div>
  )
}
