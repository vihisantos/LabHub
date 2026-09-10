import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { adminService } from '../adminService'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockStockFrom } = vi.hoisted(() => ({ mockStockFrom: vi.fn() }))
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom, auth: { getSession: mockGetSession } },
  stockDb: { from: mockStockFrom },
}))

/**
 * Monta a cadeia .update()/.eq()/.select() usada pelo adminService.
 * O terminal resolve com o resultado informado.
 */
function makeUpdateChain(result: { data?: unknown[] | null; error?: unknown }) {
  const select = vi.fn(async () => result)
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }))
  const deleteFn = vi.fn(() => ({ eq }))
  const chain = { update, eq, select, delete: deleteFn }
  mockFrom.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  // notifyUser insere em stockDb.from('notifications')
  mockStockFrom.mockReturnValue({ insert: vi.fn(async () => ({ error: null })) })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } }, error: null })
  vi.stubGlobal('fetch', mockFetch)
  // Endpoint de memberships: sucesso padrão (linhas ecoadas)
  mockFetch.mockImplementation(async (_url: unknown, opts: any) => {
    const body = JSON.parse(opts?.body ?? '{}')
    const rows = (body.workspace_ids ?? []).map((ws: string) => ({
      id: `m-${ws}`, profile_id: 'u-1', workspace_id: ws,
      role_id: 'r-tec', status: 'active', managed_by: null,
      created_at: '', updated_at: '',
    }))
    return { ok: true, json: async () => ({ ok: true, memberships: rows, workspace_ids: body.workspace_ids ?? [] }) }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('adminService — criação/aprovação de usuários por workspace', () => {
  describe('approveUser', () => {
    it('grava memberships no servidor primeiro e depois status/cargo (sem workspace_ids no PATCH)', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.approveUser('u-1', { roleId: 'role-technician', workspace_ids: ['ws-a'] })

      expect(ok).toBe(true)
      // 1. Endpoint atômico com role + workspaces
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-1/memberships',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        }),
      )
      const [, opts] = mockFetch.mock.calls[0] as any[]
      expect(JSON.parse(opts.body)).toEqual({ workspace_ids: ['ws-a'], role: 'role-technician' })
      // 2. PATCH só com status/cargo (espelho já foi gravado pelo RPC)
      const [payload] = chain.update.mock.calls[0]
      expect(payload).toMatchObject({ status: 'active', role: 'technician' })
      expect(payload).not.toHaveProperty('workspace_ids')
      expect(payload.roleId).toBeUndefined()
      expect(payload.updated_at).toBeTruthy()
      expect(chain.eq).toHaveBeenCalledWith('id', 'u-1')
    })

    it('aborta sem PATCH quando o endpoint falha (nada mudou)', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'x' }) })

      const ok = await adminService.approveUser('u-1', { roleId: 'role-technician', workspace_ids: ['ws-a'] })

      expect(ok).toBe(false)
      expect(chain.update).not.toHaveBeenCalled()
    })

    it('retorna false quando o update retorna 0 linhas (RLS bloqueou)', async () => {
      makeUpdateChain({ data: [], error: null })
      const ok = await adminService.approveUser('u-1', { roleId: 'role-viewer' })
      expect(ok).toBe(false)
    })

    it('retorna false quando o update falha', async () => {
      makeUpdateChain({ data: null, error: { message: 'boom' } })
      const ok = await adminService.approveUser('u-1')
      expect(ok).toBe(false)
    })
  })

  describe('rejectUser', () => {
    it('remove o perfil do usuário (delete) quando o cadastro é recusado', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.rejectUser('u-1')

      expect(ok).toBe(true)
      expect(chain.delete).toHaveBeenCalledOnce()
      expect(chain.eq).toHaveBeenCalledWith('id', 'u-1')
    })

    it('retorna false quando o delete não afeta linhas (usuário já removido/RLS)', async () => {
      makeUpdateChain({ data: [], error: null })
      const ok = await adminService.rejectUser('u-1')
      expect(ok).toBe(false)
    })
  })

  describe('updateUserWorkspaces — adapter deprecated (delega ao endpoint)', () => {
    function mockListProfiles(rows: unknown[]) {
      mockFrom.mockReturnValue({
        select: () => ({ order: async () => ({ data: rows, error: null }) }),
      })
    }

    const dbUser = {
      id: 'u-1', email: 'a@x.com', name: 'A', role: 'technician',
      status: 'active', is_super_admin: false, workspace_ids: [],
      accent: 'blue', theme_variant: 'dark', created_at: '', updated_at: '',
    }

    it('preserva o cargo atual e delega ao endpoint', async () => {
      mockListProfiles([dbUser])

      const ok = await adminService.updateUserWorkspaces('u-1', ['ws-a', 'ws-b'])

      expect(ok).toBe(true)
      const [, opts] = mockFetch.mock.calls[0] as any[]
      expect(JSON.parse(opts.body)).toEqual({ workspace_ids: ['ws-a', 'ws-b'], role: 'role-technician' })
    })

    it('retorna false quando o endpoint falha', async () => {
      mockListProfiles([dbUser])
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'x' }) })

      const ok = await adminService.updateUserWorkspaces('u-1', ['ws-a'])

      expect(ok).toBe(false)
    })
  })

  describe('setUserMemberships — escrita atômica via servidor', () => {
    it('retorna as memberships resultantes em sucesso', async () => {
      const out = await adminService.setUserMemberships('u-1', ['ws-a'], 'role-technician')

      expect(out).toHaveLength(1)
      expect(out?.[0]).toMatchObject({ workspace_id: 'ws-a', status: 'active' })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-1/memberships',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('retorna null quando o endpoint responde erro', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'x' }) })
      expect(await adminService.setUserMemberships('u-1', ['ws-a'], 'role-technician')).toBeNull()
    })

    it('retorna null sem sessão (não chama o endpoint)', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null })
      mockFetch.mockClear()
      expect(await adminService.setUserMemberships('u-1', ['ws-a'], 'role-technician')).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('nunca escreve memberships direto no client (só via RPC transacional)', async () => {
      mockFrom.mockClear()
      await adminService.setUserMemberships('u-1', ['ws-a'], 'role-technician')
      const tables = mockFrom.mock.calls.map(([t]) => t)
      expect(tables).not.toContain('memberships')
    })

    it('approveUser também nunca escreve memberships direto (só endpoint + PATCH status/cargo)', async () => {
      makeUpdateChain({ data: [{ id: 'u-1' }], error: null })
      mockFrom.mockClear()

      await adminService.approveUser('u-1', { roleId: 'role-technician', workspace_ids: ['ws-a'] })

      const tables = mockFrom.mock.calls.map(([t]) => t)
      expect(tables).not.toContain('memberships')
      expect(tables).toContain('profiles')
    })
  })

  describe('updateUserProfile', () => {
    it('converte roleId → role e mantém os demais campos (sem workspace_ids: 9.3-B)', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.updateUserProfile('u-1', {
        roleId: 'role-admin',
        name: 'Novo Nome',
        is_super_admin: true,
      })

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload).toMatchObject({
        role: 'admin',
        name: 'Novo Nome',
        is_super_admin: true,
      })
      expect(payload).not.toHaveProperty('workspace_ids')
      expect(payload.roleId).toBeUndefined()
    })

    it('persiste o coordenador multiunidade como role canonical "coordinator"', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.updateUserProfile('u-1', {
        roleId: 'role-coordinator',
      })

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload.role).toBe('coordinator')
      expect(payload.roleId).toBeUndefined()
      expect(payload).not.toHaveProperty('workspace_ids')
    })
  })
})
