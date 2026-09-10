import { defaultDb } from '../../lib/supabase'

export interface ServerAuditLog {
  id: string
  workspace_id: string | null
  actor_id: string | null
  actor_name: string
  action: string
  entity: string
  entity_id: string
  entity_label: string
  meta: Record<string, any>
  timestamp: string
}

function requireDb() {
  if (!defaultDb) throw new Error('Supabase não configurado. Verifique as variáveis de ambiente.')
  return defaultDb
}

function normalize(row: any): ServerAuditLog {
  return {
    id: row.id,
    workspace_id: row.workspace_id ?? null,
    actor_id: row.actor_id ?? null,
    actor_name: row.actor_name ?? '',
    action: row.action ?? '',
    entity: row.entity ?? 'user',
    entity_id: row.entity_id ?? '',
    entity_label: row.entity_label ?? '',
    meta: row.meta ?? {},
    timestamp: row.timestamp ?? new Date().toISOString(),
  }
}

/**
 * Auditoria server-based (`public.app_audit_logs`, migration 054).
 * A segurança vem da RLS `app_audit_logs_select` (super admin OU membro do
 * workspace) — nunca de parâmetros do chamador. Escrita é append-only via
 * service_role/owner; nada aqui insere/altera/remove.
 */
export const serverAuditService = {
  /** Últimos N logs do workspace atual (RLS limita por pertencimento). */
  async getMy(limit = 50): Promise<ServerAuditLog[]> {
    const db = requireDb()
    const { data, error } = await db
      .from('app_audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit)
    if (error) {
      if (error.code === 'PGRST301' || error.code === '42P01') return []
      throw error
    }
    return (data ?? []).map(normalize)
  },

  async getByActor(actorId: string, limit = 50): Promise<ServerAuditLog[]> {
    const db = requireDb()
    const { data, error } = await db
      .from('app_audit_logs')
      .select('*')
      .eq('actor_id', actorId)
      .order('timestamp', { ascending: false })
      .limit(limit)
    if (error) {
      if (error.code === 'PGRST301' || error.code === '42P01') return []
      throw error
    }
    return (data ?? []).map(normalize)
  },

  /** Logs de um workspace específico — super admin (outros recebem [] via RLS). */
  async getByWorkspace(workspaceId: string, limit = 200): Promise<ServerAuditLog[]> {
    const db = requireDb()
    const { data, error } = await db
      .from('app_audit_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('timestamp', { ascending: false })
      .limit(limit)
    if (error) {
      if (error.code === 'PGRST301' || error.code === '42P01') return []
      throw error
    }
    return (data ?? []).map(normalize)
  },
}