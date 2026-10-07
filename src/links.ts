// Links into Refit (app.refit.ai or staging-app.refit.ai, per ENV). Pure, so plain node can test them.
import { APP, UUID } from './table.ts'

// refit-app-2 route: /_auth/$projectId/datasources/{service|file}/$datasourceId (datasourceId = connection.id).
// Ids come from the DB, but a URL is still only built from values that look like UUIDs.
export function connectionUrl(r: { projectId: string; connectionId: string; kind: string }, app = APP): string | undefined {
  const kind = r.kind === 'SERVICE' ? 'service' : r.kind === 'FILE' ? 'file' : undefined
  if (!kind || !UUID.test(r.projectId) || !UUID.test(r.connectionId)) return undefined
  return `${app}/${r.projectId}/datasources/${kind}/${r.connectionId}`
}

// The Refit app for an environment, for pages that pick it themselves (the popup, from its tab).
export const appOf = (env: 'prod' | 'stag') => (env === 'stag' ? 'https://staging-app.refit.ai' : 'https://app.refit.ai')

export const projectUrl = (projectId: string) => (UUID.test(projectId) ? `${APP}/${projectId}` : undefined)

// refit-app-2 route: /_auth/$projectId/fitting/$fittingRoomId
export const fittingRoomUrl = (r: { projectId: string; id: string }) =>
  UUID.test(r.projectId) && UUID.test(r.id) ? `${APP}/${r.projectId}/fitting/${r.id}` : undefined
// One node of it (refit-app-2 route /_auth/$projectId/fitting/$fittingRoomId/$transactionId).
export const fittingNodeUrl = (r: { projectId: string; id: string }, nodeId: string) => {
  const room = fittingRoomUrl(r)
  return room && UUID.test(nodeId) ? `${room}/${nodeId}` : undefined
}

// The toolbar popup's current tab: a Refit connection page (the URL connectionUrl builds, on either environment).
export function parseConnectionPage(url: string | undefined): { env: 'prod' | 'stag'; projectId: string; connectionId: string; kind: 'SERVICE' | 'FILE' } | undefined {
  const m = /^https:\/\/(staging-)?app\.refit\.ai\/([0-9a-f-]{36})\/datasources\/(service|file)\/([0-9a-f-]{36})\/?(?:[?#].*)?$/i.exec(url ?? '')
  if (!m || !UUID.test(m[2]) || !UUID.test(m[4])) return undefined
  return { env: m[1] ? 'stag' : 'prod', projectId: m[2].toLowerCase(), connectionId: m[4].toLowerCase(), kind: m[3].toLowerCase() === 'file' ? 'FILE' : 'SERVICE' }
}
