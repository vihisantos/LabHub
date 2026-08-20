import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }))
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom, auth: { signUp: mockSignUp, signOut: mockSignOut } },
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

  it('não cria notificação de aprovação no frontend (agora é feito pelo trigger do banco)', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u-novo' } },
      error: null,
    })

    const authService = await loadAuthService()
    await authService.signUp({ email: 'prof@escola.edu.br', password: 'secret', name: 'Prof. Ana' })

    // A notificação agora é criada pelo trigger handle_new_user() no banco de dados.
    // O frontend NÃO deve mais enviar INSERT para stock.notifications durante o signUp.
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
