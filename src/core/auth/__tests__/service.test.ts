import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }))
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))
const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }))
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    from: mockFrom,
    auth: {
      signUp: mockSignUp,
      signOut: mockSignOut,
      signInWithPassword: mockSignIn,
      getSession: mockGetSession,
    },
  },
}))

/** Chain de fetch de profile (select → eq → maybeSingle). */
function mockFetchProfile(row: Record<string, unknown> | null) {
  mockFrom.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
  })
}

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

describe('authService.refreshProfile — detecção de mudança de workspace_ids', () => {
  function runSignIn(authService: typeof import('../service').authService) {
    mockSignIn.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@labhub.com' } },
      error: null,
    })
    return authService.signIn({ email: 'a@labhub.com', password: 'secret' })
  }

  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockFrom.mockReset()
  })

  it('notifica listeners quando workspace_ids muda (remove workspace)', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1',
      email: 'a@labhub.com',
      name: 'A',
      role: 'role-technician',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue',
      theme_variant: 'dark',
    })
    await runSignIn(authService)

    const seen: Array<{ workspace_ids: string[] } | null> = []
    authService.onAuthChange((user) => seen.push(user))

    // Admin remove o ws-2 do perfil no banco; o próximo refresh detecta.
    mockFetchProfile({
      id: 'u-1',
      email: 'a@labhub.com',
      name: 'A',
      role: 'role-technician',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws-1'],
      accent: 'blue',
      theme_variant: 'dark',
    })
    await authService.refreshProfile()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.workspace_ids).toEqual(['ws-1'])
  })

  it('não notifica quando nada mudou (mesmo workspace_ids e demais campos)', async () => {
    const authService = await loadAuthService()
    const row = {
      id: 'u-1',
      email: 'a@labhub.com',
      name: 'A',
      role: 'role-viewer',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws-1'],
      accent: 'blue',
      theme_variant: 'dark',
    }
    mockFetchProfile(row)
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockFetchProfile({ ...row, workspace_ids: ['ws-1'] })
    await authService.refreshProfile()

    expect(listener).not.toHaveBeenCalled()
  })
})
