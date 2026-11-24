import { defaultDb } from '../../../lib/supabase'

/**
 * A null result means unknown/unavailable, never "unchanged".
 * Include every authorized workspace: the full queue API can return more than
 * the currently selected campus. No ticket content or Redis secret is exposed.
 */
export async function readTicketQueueRevision(workspaceId: string | null): Promise<string | null> {
  if (!defaultDb || !workspaceId) return null
  try {
    const { data: before } = await defaultDb.auth.getSession()
    const userId = before.session?.user.id
    if (!userId) return null
    const { data, error } = await defaultDb
      .from('chamados_queue_revisions')
      .select('workspace_id,revision')
      .order('workspace_id')
    const { data: after } = await defaultDb.auth.getSession()
    if (error || after.session?.user.id !== userId || !Array.isArray(data)) return null
    if (!data.some(row => row.workspace_id === workspaceId)) return null
    if (data.some(row => typeof row.workspace_id !== 'string' || typeof row.revision !== 'string')) return null
    return JSON.stringify([userId, workspaceId, data.map(row => [row.workspace_id, row.revision])])
  } catch {
    return null
  }
}
