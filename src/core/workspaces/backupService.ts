import { defaultDb } from '../../lib/supabase'
import type { Workspace } from './types'

export const BACKUP_TTL_DAYS = 2

export interface Actor {
  id: string
  name: string
}

export interface WorkspaceBackup {
  id: string
  workspace_id: string | null
  workspace_name: string
  workspace_data: Workspace
  deleted_by: string | null
  deleted_by_name: string | null
  created_at: string
  expires_at: string
}

export interface WorkspaceAuditLog {
  id: string
  action: 'delete' | 'restore'
  workspace_id: string | null
  workspace_name: string | null
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let token: string | undefined
  if (defaultDb) {
    const { data } = await defaultDb.auth.getSession()
    token = data.session?.access_token
  }
  const resp = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg = (body as Record<string, unknown>).error || `Erro ${resp.status}`
    throw new Error(typeof msg === 'string' ? msg : 'Erro na API')
  }
  return body as T
}

export const workspaceBackupService = {
  /**
   * Backup agora é feito pelo backend (POST /api/admin/workspaces/:id/delete).
   * Mantido como noop para compatibilidade.
   */
  async backupWorkspace(_workspace: Workspace, _actor: Actor): Promise<void> {},

  /**
   * Audit log agora é feito pelo backend.
   */
  async logDelete(_workspace: Workspace, _actor: Actor): Promise<void> {},

  /**
   * Remove backups já expirados via backend.
   */
  async pruneExpired(): Promise<void> {
    await apiFetch('/api/admin/backups/prune', { method: 'POST' })
  },

  /**
   * Lista backups ainda válidos via backend.
   */
  async listBackups(): Promise<WorkspaceBackup[]> {
    try {
      const { backups } = await apiFetch<{ backups: WorkspaceBackup[] }>('/api/admin/backups')
      return backups || []
    } catch {
      return []
    }
  },

  /**
   * Histórico de auditoria via backend.
   */
  async listAuditLogs(): Promise<WorkspaceAuditLog[]> {
    try {
      const { logs } = await apiFetch<{ logs: WorkspaceAuditLog[] }>('/api/admin/audit-logs')
      return logs || []
    } catch {
      return []
    }
  },

  /**
   * Restaura workspace a partir de backup via backend.
   */
  async restoreBackup(backupId: string, _actor: Actor): Promise<void> {
    await apiFetch(`/api/admin/backups/${encodeURIComponent(backupId)}/restore`, { method: 'POST' })
  },
}
