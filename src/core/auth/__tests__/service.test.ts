import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockStockFrom } = vi.hoisted(() => ({ mockStockFrom: vi.fn() }))
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }))
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom, auth: { signUp: mockSignUp, signOut: mockSignOut } },
  stockDb: { from: mockStockFrom },
}))

// O authService é importado pelo setup global (mocks.ts) com o supabase real.
// Para garantir que o mock acima seja aplicado, resetamos os módulos e
// importamos dinamicamente dentro de cada teste.
async function loadAuthService() {
  vi.resetModules()
  const mod = await import('../service')
  return mod.authService
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStockFrom.mockReturnValue({ insert: vi.fn(async () => ({ error: null })) })
})

describe('authService.signUp — criação de usuário', () => {
  it('cria o usuário pendente com role viewer e NENHUM workspace atribuído', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u-novo' } },
      error: null,
    })

    const authService = await loadAuthService()
    const user = await authService.signUp({
      email: 'prof@escola.edu.br',
      password: 'secret',
      name: 'Prof. Ana',
    })

    expect(user).toMatchObject({
      id: 'u-novo',
      email: 'prof@escola.edu.br',
      name: 'Prof. Ana',
      roleId: 'role-viewer',
      status: 'pending',
      is_super_admin: false,
      workspace_ids: [],
    })
    // O usuário novo ainda não tem workspace — o admin atribui depois da aprovação
    expect(user.workspace_ids).toEqual([])
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'prof@escola.edu.br' }),
    )
  })

  it('cria notificação de aprovação para super admins ao cadastrar', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u-novo' } },
      error: null,
    })
    const insert = vi.fn((_payload: Record<string, unknown>) => Promise.resolve({ error: null }))
    mockStockFrom.mockReturnValue({ insert })

    const authService = await loadAuthService()
    await authService.signUp({ email: 'prof@escola.edu.br', password: 'secret', name: 'Prof. Ana' })

    expect(insert).toHaveBeenCalledOnce()
    const [payload] = insert.mock.calls[0]
    expect(payload).toMatchObject({
      title: 'Novo usuário pendente',
      type: 'approval',
      module: 'auth',
      audience: 'role',
      targetSuperAdmin: true,
      actionUrl: '/admin/users?pending=u-novo',
    })
  })

  it('propaga erro do Supabase ao cadastrar', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'email já cadastrado' },
    })

    const authService = await loadAuthService()
    await expect(
      authService.signUp({ email: 'dup@escola.edu.br', password: 'secret123', name: 'Dup' }),
    ).rejects.toMatchObject({ message: 'email já cadastrado' })
  })
})
