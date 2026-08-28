import { describe, it, expect, vi, beforeEach } from 'vitest'
import { workspaceBackupService, BACKUP_TTL_DAYS } from '../backupService'
import type { Workspace } from '../types'

const mockFetch = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}))

vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
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

function mockApiOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  })
}

function mockApiError(status: number, error: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  })
}

describe('workspaceBackupService.backupWorkspace', () => {
  it('é noop — backup agora é feito pelo backend', async () => {
    await workspaceBackupService.backupWorkspace(ws, actor)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('workspaceBackupService.logDelete', () => {
  it('é noop — audit log agora é feito pelo backend', async () => {
    await workspaceBackupService.logDelete(ws, actor)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('workspaceBackupService.pruneExpired', () => {
  it('chama POST /api/admin/backups/prune', async () => {
    mockApiOk({ ok: true })
    await workspaceBackupService.pruneExpired()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/backups/prune',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('workspaceBackupService.listBackups', () => {
  it('retorna lista de backups do backend', async () => {
    const backups = [{ id: 'bk-1', workspace_name: 'Escola Teste' }]
    mockApiOk({ backups })
    const result = await workspaceBackupService.listBackups()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/backups',
      expect.anything(),
    )
    expect(result).toEqual(backups)
  })

  it('retorna [] quando o backend retorna erro', async () => {
    mockApiError(500, 'Erro interno')
    const result = await workspaceBackupService.listBackups()
    expect(result).toEqual([])
  })
})

describe('workspaceBackupService.listAuditLogs', () => {
  it('retorna logs de auditoria do backend', async () => {
    const logs = [{ id: 'log-1', action: 'delete', workspace_name: 'Escola Teste' }]
    mockApiOk({ logs })
    const result = await workspaceBackupService.listAuditLogs()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/audit-logs',
      expect.anything(),
    )
    expect(result).toEqual(logs)
  })
})

describe('workspaceBackupService.restoreBackup', () => {
  it('chama POST /api/admin/backups/:id/restore', async () => {
    mockApiOk({ ok: true, workspace_id: 'ws-1' })
    await workspaceBackupService.restoreBackup('bk-1', actor)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/backups/bk-1/restore',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('lança erro quando o backend retorna erro', async () => {
    mockApiError(404, 'Backup não encontrado')
    await expect(
      workspaceBackupService.restoreBackup('inexistente', actor),
    ).rejects.toThrow(/não encontrado/i)
  })

  it('lança erro quando o backup está expirado', async () => {
    mockApiError(410, 'Backup expirado')
    await expect(
      workspaceBackupService.restoreBackup('bk-expired', actor),
    ).rejects.toThrow(/expirado/i)
  })
})

describe('workspaceBackupService — Authorization', () => {
  it('envia Authorization header com token JWT', async () => {
    mockApiOk({ backups: [] })
    await workspaceBackupService.listBackups()
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-token',
      }),
    )
  })

  it('funciona sem token (sessão não autenticada)', async () => {
    const { defaultDb } = await import('../../../lib/supabase')
    vi.mocked(defaultDb!.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as any)
    mockApiOk({ backups: [] })
    await workspaceBackupService.listBackups()
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers).toEqual(
      expect.not.objectContaining({
        Authorization: expect.any(String),
      }),
    )
  })
})

describe('BACKUP_TTL_DAYS', () => {
  it('é 2 dias', () => {
    expect(BACKUP_TTL_DAYS).toBe(2)
  })
})
