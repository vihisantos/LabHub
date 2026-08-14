import { describe, it, expect, vi, beforeEach } from 'vitest'
import { workspaceBackupService, BACKUP_TTL_DAYS } from '../backupService'
import type { Workspace } from '../types'

const { db } = vi.hoisted(() => ({ db: { from: vi.fn() } }))

vi.mock('../../../lib/supabase', () => ({ defaultDb: db }))

const insert = vi.fn()
const deleteLt = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  insert.mockReturnValue({ error: null, data: null })
  deleteLt.mockReturnValue({ error: null, data: null })
  db.from.mockImplementation(() => ({
    insert: (row: unknown) => insert(row),
    delete: () => ({ lt: deleteLt }),
  }))
})

const ws: Workspace = {
  id: 'ws-1',
  name: 'Escola Teste',
  slug: 'escola-teste',
  location: 'Piracicaba, SP',
  spreadsheet_url: '',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}

const actor = { id: 'user-1', name: 'Vitor Santos' }

describe('workspaceBackupService.backupWorkspace', () => {
  it('grava backup com TTL de 2 dias e dados do ator', async () => {
    const before = Date.now()
    await workspaceBackupService.backupWorkspace(ws, actor)

    expect(db.from).toHaveBeenCalledWith('workspace_backups')
    const row = insert.mock.calls[0][0] as Record<string, unknown>
    expect(row.workspace_id).toBe(ws.id)
    expect(row.workspace_name).toBe(ws.name)
    expect(row.workspace_data).toEqual(ws)
    expect(row.deleted_by).toBe(actor.id)
    expect(row.deleted_by_name).toBe(actor.name)

    const expires = Date.parse(String(row.expires_at))
    const ttl = BACKUP_TTL_DAYS * 24 * 60 * 60 * 1000
    expect(expires).toBeGreaterThanOrEqual(before + ttl)
    expect(expires).toBeLessThanOrEqual(before + ttl + 1000)
  })

  it('lança erro quando o insert falha', async () => {
    insert.mockReturnValue({ error: { message: 'insert failed' } })
    await expect(workspaceBackupService.backupWorkspace(ws, actor)).rejects.toThrow(/backup/i)
  })
})

describe('workspaceBackupService.logDelete', () => {
  it('registra ação, workspace e quem excluiu', async () => {
    await workspaceBackupService.logDelete(ws, actor)

    expect(db.from).toHaveBeenCalledWith('workspace_audit_logs')
    const row = insert.mock.calls[0][0] as Record<string, unknown>
    expect(row.action).toBe('delete')
    expect(row.workspace_id).toBe(ws.id)
    expect(row.workspace_name).toBe(ws.name)
    expect(row.actor_id).toBe(actor.id)
    expect(row.actor_name).toBe(actor.name)
  })

  it('lança erro quando o insert falha', async () => {
    insert.mockReturnValue({ error: { message: 'insert failed' } })
    await expect(workspaceBackupService.logDelete(ws, actor)).rejects.toThrow(/log/i)
  })
})

describe('workspaceBackupService.pruneExpired', () => {
  it('remove backups com expires_at anterior a agora', async () => {
    await workspaceBackupService.pruneExpired()

    expect(db.from).toHaveBeenCalledWith('workspace_backups')
    expect(deleteLt).toHaveBeenCalledTimes(1)
    const [col, value] = deleteLt.mock.calls[0] as [string, string]
    expect(col).toBe('expires_at')
    expect(Date.parse(value)).toBeLessThanOrEqual(Date.now())
  })
})

const okDb = () => ({
  insert: () => Promise.resolve({ error: null, data: null }),
  delete: () => ({ lt: async () => ({ error: null, data: null }), eq: async () => ({ error: null, data: null }) }),
  select: () => ({
    gte: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
  }),
  upsert: () => Promise.resolve({ error: null, data: null }),
})

describe('workspaceBackupService.listBackups', () => {
  it('lista backups não expirados, mais recentes primeiro', async () => {
    const rows = [{ id: 'bk-1', workspace_name: 'Escola Teste' }]
    vi.mocked(db.from).mockReturnValue({
      ...okDb(),
      select: () => ({
        gte: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    })

    const result = await workspaceBackupService.listBackups()
    expect(db.from).toHaveBeenCalledWith('workspace_backups')
    expect(result).toEqual(rows)
  })

  it('retorna [] quando a consulta falha', async () => {
    vi.mocked(db.from).mockReturnValue({
      ...okDb(),
      select: () => ({ gte: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'x' } }) }) }),
    })
    const result = await workspaceBackupService.listBackups()
    expect(result).toEqual([])
  })
})

describe('workspaceBackupService.listAuditLogs', () => {
  it('lista o histórico de auditoria', async () => {
    const rows = [{ id: 'log-1', action: 'delete', workspace_name: 'Escola Teste' }]
    vi.mocked(db.from).mockReturnValue({
      ...okDb(),
      select: () => ({
        gte: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }),
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    })

    const result = await workspaceBackupService.listAuditLogs()
    expect(db.from).toHaveBeenCalledWith('workspace_audit_logs')
    expect(result).toEqual(rows)
  })
})

describe('workspaceBackupService.restoreBackup', () => {
  const backupRow = {
    id: 'bk-1',
    workspace_id: ws.id,
    workspace_name: ws.name,
    workspace_data: ws,
    deleted_by: 'user-x',
    deleted_by_name: 'Outro',
    created_at: '2026-08-10T00:00:00.000Z',
    expires_at: '2026-08-15T00:00:00.000Z',
  }

  it('restaura o workspace, registra auditoria e remove o backup', async () => {
    const upsert = vi.fn()
    const insertAudit = vi.fn()
    const deleteEq = vi.fn()
    const maybeSingle = vi.fn(async () => ({ data: backupRow, error: null }))

    vi.mocked(db.from).mockReturnValue({
      insert: (row: unknown) => insertAudit(row) || Promise.resolve({ error: null, data: null }),
      delete: () => ({ lt: async () => ({ error: null, data: null }), eq: async () => deleteEq() || Promise.resolve({ error: null, data: null }) }),
      select: () => ({
        gte: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        eq: () => ({ maybeSingle }),
      }),
      upsert: (row: unknown, opts?: unknown) => upsert(row, opts) || Promise.resolve({ error: null, data: null }),
    })

    await workspaceBackupService.restoreBackup('bk-1', actor)

    expect(db.from).toHaveBeenCalledWith('workspace_backups')
    expect(db.from).toHaveBeenCalledWith('workspaces')
    expect(db.from).toHaveBeenCalledWith('workspace_audit_logs')

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toEqual(ws)
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'id' })

    expect(insertAudit).toHaveBeenCalledTimes(1)
    const audit = insertAudit.mock.calls[0][0] as Record<string, unknown>
    expect(audit.action).toBe('restore')
    expect(audit.workspace_id).toBe(ws.id)
    expect(audit.actor_id).toBe(actor.id)

    expect(deleteEq).toHaveBeenCalledTimes(1)
  })

  it('lança erro quando o backup não existe', async () => {
    vi.mocked(db.from).mockReturnValue({
      ...okDb(),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    await expect(workspaceBackupService.restoreBackup('inexistente', actor)).rejects.toThrow(/não encontrado/i)
  })
})
