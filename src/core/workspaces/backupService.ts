import { defaultDb } from '../../lib/supabase'
import type { Workspace } from './types'

const TABLE_BACKUPS = 'workspace_backups'
const TABLE_AUDIT = 'workspace_audit_logs'

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

export const workspaceBackupService = {
  /**
   * Cria um backup do workspace antes da exclusão, retido por
   * BACKUP_TTL_DAYS dias. Lança erro se não for possível gravar,
   * para que a exclusão seja abortada por segurança.
   */
  async backupWorkspace(workspace: Workspace, actor: Actor): Promise<void> {
    if (!defaultDb) return
    const expiresAt = new Date(
      Date.now() + BACKUP_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    const { error } = await defaultDb.from(TABLE_BACKUPS).insert({
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      workspace_data: workspace,
      deleted_by: actor.id,
      deleted_by_name: actor.name,
      expires_at: expiresAt,
    })
    if (error) throw new Error(`Falha ao criar backup do workspace: ${error.message}`)
  },

  /**
   * Registra em workspace_audit_logs quem excluiu o workspace.
   */
  async logDelete(workspace: Workspace, actor: Actor): Promise<void> {
    if (!defaultDb) return
    const { error } = await defaultDb.from(TABLE_AUDIT).insert({
      action: 'delete',
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      actor_id: actor.id,
      actor_name: actor.name,
    })
    if (error) throw new Error(`Falha ao registrar log de exclusão: ${error.message}`)
  },

  /**
   * Remove backups já expirados (auto-limpeza pelo app).
   * Complementa o cron do banco para os casos sem pg_cron.
   */
  async pruneExpired(): Promise<void> {
    if (!defaultDb) return
    await defaultDb
      .from(TABLE_BACKUPS)
      .delete()
      .lt('expires_at', new Date().toISOString())
  },

  /**
   * Lista backups ainda válidos (não expirados), mais recentes primeiro.
   */
  async listBackups(): Promise<WorkspaceBackup[]> {
    if (!defaultDb) return []
    const { data, error } = await defaultDb
      .from(TABLE_BACKUPS)
      .select('*')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[Backup] fetch error:', error.message)
      return []
    }
    return (data || []) as WorkspaceBackup[]
  },

  /**
   * Histórico de auditoria de workspaces (exclusões e restaurações).
   */
  async listAuditLogs(): Promise<WorkspaceAuditLog[]> {
    if (!defaultDb) return []
    const { data, error } = await defaultDb
      .from(TABLE_AUDIT)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      console.warn('[Backup] audit fetch error:', error.message)
      return []
    }
    return (data || []) as WorkspaceAuditLog[]
  },

  /**
   * Restaura um workspace a partir de um backup: recria a linha em
   * workspaces (mesmo id/config), registra na auditoria e remove o
   * backup usado.
   */
  async restoreBackup(backupId: string, actor: Actor): Promise<void> {
    if (!defaultDb) return
    const { data, error } = await defaultDb
      .from(TABLE_BACKUPS)
      .select('*')
      .eq('id', backupId)
      .maybeSingle()
    if (error || !data) {
      throw new Error('Backup não encontrado ou já expirado')
    }

    const backup = data as unknown as WorkspaceBackup
    const ws = backup.workspace_data

    const { error: upsertErr } = await defaultDb
      .from('workspaces')
      .upsert(ws, { onConflict: 'id' })
    if (upsertErr) {
      throw new Error(`Falha ao restaurar workspace: ${upsertErr.message}`)
    }

    const { error: logErr } = await defaultDb.from(TABLE_AUDIT).insert({
      action: 'restore',
      workspace_id: ws.id,
      workspace_name: ws.name,
      actor_id: actor.id,
      actor_name: actor.name,
    })
    if (logErr) {
      throw new Error(`Workspace restaurado, mas o log falhou: ${logErr.message}`)
    }

    await defaultDb.from(TABLE_BACKUPS).delete().eq('id', backupId)
  },
}
