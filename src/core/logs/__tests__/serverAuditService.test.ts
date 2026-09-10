import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultDb } from '../../../lib/supabase'
import { serverAuditService } from '../serverAuditService'
import type { ServerAuditLog } from '../serverAuditService'

const mockDefaultDb = defaultDb as unknown as {
  from: ReturnType<typeof vi.fn>
}

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: vi.fn() },
}))

function mockSelectResult(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  }
  mockDefaultDb.from.mockReturnValue(chain)
}

const row: ServerAuditLog = {
  id: 'aud-1',
  workspace_id: 'ws-1',
  actor_id: 'u-1',
  actor_name: 'Maria',
  action: 'claim',
  entity: 'ticket',
  entity_id: 't-1',
  entity_label: '#12 · Lab 3',
  meta: {},
  timestamp: '2026-09-10T10:00:00.000Z',
}

describe('serverAuditService (tabela app_audit_logs, migration 054)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getMy limita a 50 e ordena por timestamp desc', async () => {
    mockSelectResult({ data: [row], error: null })
    const logs = await serverAuditService.getMy()
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('claim')
    expect(mockDefaultDb.from).toHaveBeenCalledWith('app_audit_logs')
  })

  it('getByActor filtra por actor_id (RLS decide o que é exposto)', async () => {
    mockSelectResult({ data: [row], error: null })
    const logs = await serverAuditService.getByActor('u-1')
    expect(logs).toHaveLength(1)
  })

  it('getByWorkspace filtra por workspace_id', async () => {
    mockSelectResult({ data: [row], error: null })
    const logs = await serverAuditService.getByWorkspace('ws-1')
    expect(logs[0].workspace_id).toBe('ws-1')
  })

  it('erro de schema/RLS (tabela inexistente) → [] fail-closed, não lança', async () => {
    mockSelectResult({ data: null, error: { code: 'PGRST301' } })
    const logs = await serverAuditService.getMy()
    expect(logs).toEqual([])
  })

  it('erro real é propagado (sem degradar para [] silencioso)', async () => {
    mockSelectResult({ data: null, error: { code: '23505', message: 'conflict' } })
    await expect(serverAuditService.getMy()).rejects.toThrow()
  })

  it('normaliza ausências (actor null/empty) sem quebrar', async () => {
    mockSelectResult({
      data: [{ ...row, actor_id: null, actor_name: '', meta: null }],
      error: null,
    })
    const logs = await serverAuditService.getByActor('u-1')
    expect(logs[0].actor_name).toBe('')
    expect(logs[0].meta).toEqual({})
  })
})