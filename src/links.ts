// Links into Refit (app.refit.ai or staging-app.refit.ai, per ENV). Pure, so plain node can test them.
import { APP, UUID } from './table.ts'

// refit-app-2 route: /_auth/$projectId/datasources/{service|file}/$datasourceId (datasourceId = connection.id).
// Ids come from the DB, but a URL is still only built from values that look like UUIDs.
export function connectionUrl(r: { projectId: string; connectionId: string; kind: string }): string | undefined {
  const kind = r.kind === 'SERVICE' ? 'service' : r.kind === 'FILE' ? 'file' : undefined
  if (!kind || !UUID.test(r.projectId) || !UUID.test(r.connectionId)) return undefined
  return `${APP}/${r.projectId}/datasources/${kind}/${r.connectionId}`
}

export const projectUrl = (projectId: string) => (UUID.test(projectId) ? `${APP}/${projectId}` : undefined)

// refit-app-2 route: /_auth/$projectId/fitting/$fittingRoomId
export const fittingRoomUrl = (r: { projectId: string; id: string }) =>
  UUID.test(r.projectId) && UUID.test(r.id) ? `${APP}/${r.projectId}/fitting/${r.id}` : undefined
// One node of it (refit-app-2 route /_auth/$projectId/fitting/$fittingRoomId/$transactionId).
export const fittingNodeUrl = (r: { projectId: string; id: string }, nodeId: string) => {
  const room = fittingRoomUrl(r)
  return room && UUID.test(nodeId) ? `${room}/${nodeId}` : undefined
}
