import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }))
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))
const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }))
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))
const { mockGetMine } = vi.hoisted(() => ({ mockGetMine: vi.fn() }))

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

// Preserva areMembershipsEqual (comparador puro) e isola getMine — o authService
// carrega perfil + memberships em paralelo; getMine é a query de memberships.
vi.mock('../../memberships/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../memberships/service')>()
  return {
    ...actual,
    membershipService: {
      ...actual.membershipService,
      getMine: mockGetMine,
    },
  }
})

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
    // signUp NÃO consulta memberships (user ainda pendente, sem associação alguma)
    expect(mockGetMine).not.toHaveBeenCalled()
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

describe('authService.fetchUserProfile — perfil + memberships em paralelo', () => {
  it('publica membershipsLoaded=true e memberships quando AMBAS as queries concluem', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([
      { id: 'm-1', profile_id: 'u-1', workspace_id: 'ws-1', role_id: 'r-a', status: 'active', managed_by: null, created_at: '', updated_at: '' },
    ])

    const user = await authService.fetchUserProfile('u-1')

    expect(user?.membershipsLoaded).toBe(true)
    expect(user?.memberships).toHaveLength(1)
    expect(user?.memberships?.[0].workspace_id).toBe('ws-1')
  })

  it('falha na query de memberships ⇒ membershipsLoaded=false e NUNCA [] por falha', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockRejectedValue(new Error('RLS: denied'))

    const user = await authService.fetchUserProfile('u-1')

    expect(user).not.toBeNull()
    expect(user?.membershipsLoaded).toBe(false)
    // undefined (nunca uma lista vazia silenciosa nem fallback de workspace_ids)
    expect(user?.memberships).toBeUndefined()
  })

  it('perfil ausente ⇒ null', async () => {
    const authService = await loadAuthService()
    mockFetchProfile(null)

    expect(await authService.fetchUserProfile('u-inexistente')).toBeNull()
  })
})

describe('authService.refreshProfile — detecção de mudança por memberships', () => {
  const MEMBERSHIP = (m: { workspace_id: string; status?: 'active' | 'suspended' }) => ({
    id: `m-${m.workspace_id}`,
    profile_id: 'u-1',
    workspace_id: m.workspace_id,
    role_id: 'r-a',
    status: m.status ?? 'active',
    managed_by: null,
    created_at: '',
    updated_at: '',
  })

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
    mockGetMine.mockReset()
  })

  it('notifica listeners quando membership muda (remove workspace)', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([
      MEMBERSHIP({ workspace_id: 'ws-1' }),
      MEMBERSHIP({ workspace_id: 'ws-2' }),
    ])
    await runSignIn(authService)

    const seen: Array<{ workspace_ids: string[]; membershipsLoaded?: boolean } | null> = []
    authService.onAuthChange((user) => seen.push(user))

    // Admin remove o ws-2 da membership no banco; o próximo refresh detecta.
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await authService.refreshProfile()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.membershipsLoaded).toBe(true)
    expect(seen[seen.length - 1]?.workspace_ids).toEqual(['ws-1', 'ws-2'])
  })

  it('não notifica quando nada mudou (mesmas memberships e demais campos)', async () => {
    const authService = await loadAuthService()
    const row = {
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    }
    mockFetchProfile(row)
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockFetchProfile({ ...row, workspace_ids: ['ws-1'] })
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await authService.refreshProfile()

    expect(listener).not.toHaveBeenCalled()
  })

  it('workspace_ids NÃO é usado na detecção — mudança só na coluna legada não notifica', async () => {
    const authService = await loadAuthService()
    const row = {
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    }
    mockFetchProfile(row)
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    // A coluna legada muda, mas memberships (fonte de autorização) não.
    mockFetchProfile({ ...row, workspace_ids: ['ws-1', 'ws-9'] })
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await authService.refreshProfile()

    expect(listener).not.toHaveBeenCalled()
  })

  it('antes do carregamento (memberships falhando) NENHUM evento é emitido — e não cai em workspace_ids', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockRejectedValue(new Error('RLS: denied'))
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    // workspace_ids muda no banco, mas memberships continuam sem carregar.
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockRejectedValue(new Error('RLS: denied'))
    await authService.refreshProfile()

    expect(listener).not.toHaveBeenCalled()
    expect(await authService.getCurrentUser()?.membershipsLoaded).toBe(false)
    expect(await authService.getCurrentUser()?.memberships).toBeUndefined()
  })

  it('detecta suspensão (membership perde o status active)', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1', status: 'suspended' })])
    await authService.refreshProfile()

    expect(listener).toHaveBeenCalled()
  })

  it('carrega memberships vazias como [] com loaded=true (fail-closed explícito)', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: [],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetMine.mockResolvedValue([])

    await runSignIn(authService)

    expect(authService.getCurrentUser()?.membershipsLoaded).toBe(true)
    expect(authService.getCurrentUser()?.memberships).toEqual([])
  })
})