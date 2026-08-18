import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminService } from '../adminService'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockStockFrom } = vi.hoisted(() => ({ mockStockFrom: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
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
})

describe('adminService — criação/aprovação de usuários por workspace', () => {
  describe('approveUser', () => {
    it('aprova com status active e converte roleId para role (coluna do banco)', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.approveUser('u-1', { roleId: 'role-technician' })

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload).toMatchObject({ status: 'active', role: 'technician' })
      expect(payload.roleId).toBeUndefined()
      expect(payload.updated_at).toBeTruthy()
      expect(chain.eq).toHaveBeenCalledWith('id', 'u-1')
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

  describe('updateUserWorkspaces — atribuir usuário a workspaces', () => {
    it('persiste workspace_ids no perfil', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.updateUserWorkspaces('u-1', ['ws-anhembi-sjc', 'ws-anhembi-mooca'])

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload.workspace_ids).toEqual(['ws-anhembi-sjc', 'ws-anhembi-mooca'])
      expect(payload.updated_at).toBeTruthy()
      expect(chain.eq).toHaveBeenCalledWith('id', 'u-1')
    })

    it('permite esvaziar a lista (remover de todos os workspaces)', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.updateUserWorkspaces('u-1', [])

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload.workspace_ids).toEqual([])
    })

    it('retorna false quando o update é bloqueado', async () => {
      makeUpdateChain({ data: [], error: null })
      const ok = await adminService.updateUserWorkspaces('u-1', ['ws-1'])
      expect(ok).toBe(false)
    })
  })

  describe('updateUserProfile', () => {
    it('converte roleId → role e mantém os demais campos', async () => {
      const chain = makeUpdateChain({ data: [{ id: 'u-1' }], error: null })

      const ok = await adminService.updateUserProfile('u-1', {
        roleId: 'role-admin',
        name: 'Novo Nome',
        workspace_ids: ['ws-1'],
        is_super_admin: true,
      })

      expect(ok).toBe(true)
      const [payload] = chain.update.mock.calls[0]
      expect(payload).toMatchObject({
        role: 'admin',
        name: 'Novo Nome',
        workspace_ids: ['ws-1'],
        is_super_admin: true,
      })
      expect(payload.roleId).toBeUndefined()
    })
  })
})
