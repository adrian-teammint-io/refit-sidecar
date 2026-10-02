// Every drawer view in one table. Adding a view: add its kind to `View`, then an entry to VIEWS (title, render, and
// optionally a header button). App does the rest: the stack, Back / Esc, breadcrumbs, header, error boundary.
import type { ReactNode } from 'react'
import type { Project, ProjectRef, ProjectsQuery } from '../projects'
import type { useStore } from '../shared/store'
import type { IconName } from '../shared/icons'
import type { Settings } from '../themes'
import { SettingsView } from './Settings'
import { FailedView } from './failed'
import { NewProjectView } from './new-project'
import type { Common } from './browse'
import { Home } from './home'
import { ProjectsView, ProjectView } from './projects'
import { ConnectionsView } from './connections'
import { FittingRoomsView } from './fitting'

export type View =
  | { kind: 'home' }
  | { kind: 'failed'; conn?: { id: string; name: string } } // conn: only that connection's failures
  | { kind: 'projects' }
  | { kind: 'connections' }
  | { kind: 'fitting' }
  | { kind: 'new-project'; from?: ProjectRef } // from: Duplicate pre-fills the form from this project and its members
  | { kind: 'project'; project: ProjectRef }
  | { kind: 'settings' }

type State<T> = [T, (v: T) => void]
// What a view can use: stored data, the run slot (`common`), navigation, and the search state App keeps for Back.
export type Ctx = {
  store: ReturnType<typeof useStore>; common: Common; dark: boolean; saveSettings: (s: Partial<Settings>) => void
  push: (v: View) => void; replace: (v: View) => void
  openProject: (p: ProjectRef) => void; openFailed: (c: { connectionId: string; name: string }) => void; pin: (p: Project) => void
  queries: { projects: State<ProjectsQuery>; connections: State<{ q: string }>; fitting: State<{ q: string }> }
}

type Of<K extends View['kind']> = Extract<View, { kind: K }>
type Def<K extends View['kind']> = {
  title: string | ((v: Of<K>) => string)
  render: (v: Of<K>, x: Ctx) => ReactNode
  header?: { icon: IconName; label: string; open: View } // an extra header button, e.g. Projects' New project
  noHost?: true // renders while the native host is missing (the rest show the host setup instead)
}

export const VIEWS: { [K in View['kind']]: Def<K> } = {
  home: {
    title: 'Refit Sidecar',
    render: (_, x) => <Home pins={x.store.pins} failedSyncs={x.store.failedSyncs} now={x.common.now} open={kind => x.push({ kind })} openProject={x.openProject} />,
  },
  projects: {
    title: 'Projects',
    header: { icon: 'plus', label: 'New project', open: { kind: 'new-project' } },
    render: (_, x) => <ProjectsView projects={x.store.projects} pins={x.store.pins} query={x.queries.projects[0]} setQuery={x.queries.projects[1]}
      openProject={x.openProject} pin={x.pin} duplicate={from => x.push({ kind: 'new-project', from })} {...x.common} />,
  },
  project: {
    title: v => v.project.name,
    render: (v, x) => <ProjectView key={v.project.id} project={x.store.pins?.[v.project.id] ?? v.project} cache={x.store.projectConnections}
      members={x.store.projectMembers} userSearch={x.store.userSearch} pinned={!!x.store.pins?.[v.project.id]} pin={x.pin}
      openProject={x.openProject} openFailed={x.openFailed} fs={x.store.failedSyncs} {...x.common} />,
  },
  'new-project': {
    title: v => (v.from ? 'Duplicate project' : 'New project'), // the source's name is already in the form
    render: (v, x) => <NewProjectView key={v.from?.id} from={v.from} fromMembers={v.from && x.store.projectMembers?.[v.from.id]} search={x.store.userSearch}
      onCreated={project => x.replace({ kind: 'project', project })} {...x.common} />,
  },
  connections: {
    title: 'Connections',
    render: (_, x) => <ConnectionsView page={x.store.connections} query={x.queries.connections[0]} setQuery={x.queries.connections[1]}
      openProject={x.openProject} openFailed={x.openFailed} fs={x.store.failedSyncs} {...x.common} />,
  },
  fitting: {
    title: 'Fitting rooms',
    render: (_, x) => <FittingRoomsView page={x.store.fittingRooms} query={x.queries.fitting[0]} setQuery={x.queries.fitting[1]} openProject={x.openProject} {...x.common} />,
  },
  failed: {
    title: 'Sync requests',
    render: (v, x) => <FailedView key={v.conn?.id} fs={x.store.failedSyncs} other={x.store.syncRequests} conn={v.conn} {...x.common} />,
  },
  settings: {
    title: 'Settings', noHost: true,
    render: (_, x) => <SettingsView settings={x.store.settings} dark={x.dark} host={x.store.host} onChange={x.saveSettings} />,
  },
}

// The per-kind entry for any view (TypeScript can't correlate VIEWS[v.kind] with v by itself).
export const defOf = (v: View) => VIEWS[v.kind] as unknown as Omit<Def<View['kind']>, 'title' | 'render'> & {
  title: string | ((v: View) => string); render: (v: View, x: Ctx) => ReactNode
}
export const titleOf = (v: View) => { const t = defOf(v).title; return typeof t === 'string' ? t : t(v) }
