import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }))
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))
const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }))
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }))
const { mockOnAuthStateChange } = vi.hoisted(() => ({ mockOnAuthStateChange: vi.fn() }))
const { mockGetMine } = vi.hoisted(() => ({ mockGetMine: vi.fn() }))
const { mockGetByUser } = vi.hoisted(() => ({ mockGetByUser: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    from: mockFrom,
    auth: {
      signUp: mockSignUp,
      signOut: mockSignOut,
      signInWithPassword: mockSignIn,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}))

// Preserva areMembershipsEqual (comparador puro) e isola a query de memberships —
// o authService carrega perfil + memberships em paralelo. `loadUser` deve usar
// getByUser(userId) (filtra profile_id); getMine() fica espiolhado para provar
// que NÃO é mais usado (a RLS é escopada por workspace, não por usuário).
vi.mock('../../memberships/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../memberships/service')>()
  return {
    ...actual,
    membershipService: {
      ...actual.membershipService,
      getMine: mockGetMine,
      getByUser: mockGetByUser,
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
    expect(mockGetByUser).not.toHaveBeenCalled()
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
    mockGetByUser.mockResolvedValue([
      { id: 'm-1', profile_id: 'u-1', workspace_id: 'ws-1', role_id: 'r-a', status: 'active', managed_by: null, created_at: '', updated_at: '' },
    ])

    const user = await authService.fetchUserProfile('u-1')

    expect(user?.membershipsLoaded).toBe(true)
    expect(user?.memberships).toHaveLength(1)
    expect(user?.memberships?.[0].workspace_id).toBe('ws-1')
    // REGRESSÃO: as memberships vêm de getByUser(userId) — filtro profile_id.
    // getMine() devolve também as linhas dos OUTROS membros do workspace e por
    // isso não pode ser a fonte do usuário logado.
    expect(mockGetByUser).toHaveBeenCalledWith('u-1')
    expect(mockGetMine).not.toHaveBeenCalled()
  })

  it('falha na query de memberships ⇒ membershipsLoaded=false e NUNCA [] por falha', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))

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
    mockGetByUser.mockReset()
  })

  it('notifica listeners quando membership muda (remove workspace)', async () => {
    const authService = await loadAuthService()
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetByUser.mockResolvedValue([
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
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
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
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockFetchProfile({ ...row, workspace_ids: ['ws-1'] })
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
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
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    // A coluna legada muda, mas memberships (fonte de autorização) não.
    mockFetchProfile({ ...row, workspace_ids: ['ws-1', 'ws-9'] })
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
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
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    // workspace_ids muda no banco, mas memberships continuam sem carregar.
    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1', 'ws-2'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))
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
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1' })])
    await runSignIn(authService)

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockFetchProfile({
      id: 'u-1', email: 'a@labhub.com', name: 'A', role: 'role-technician',
      status: 'active', is_super_admin: false, workspace_ids: ['ws-1'],
      accent: 'blue', theme_variant: 'dark',
    })
    mockGetByUser.mockResolvedValue([MEMBERSHIP({ workspace_id: 'ws-1', status: 'suspended' })])
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
    mockGetByUser.mockResolvedValue([])

    await runSignIn(authService)

    expect(authService.getCurrentUser()?.membershipsLoaded).toBe(true)
    expect(authService.getCurrentUser()?.memberships).toEqual([])
  })
})

describe('authService.fetchUserProfile — deduplicação de consultas concorrentes', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
  })

  it('reutiliza a mesma Promise para a mesma identidade (sem consulta duplicada)', async () => {
    const authService = await loadAuthService()

    let resolveProfile!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferred = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveProfile = res
    })

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => deferred,
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])

    const p1 = authService.fetchUserProfile('u-dedup')
    const p2 = authService.fetchUserProfile('u-dedup')

    // As duas chamadas compartilham a mesma Promise: mockFrom invocado uma vez.
    expect(mockFrom).toHaveBeenCalledTimes(1)

    resolveProfile({
      data: {
        id: 'u-dedup', email: 'd@labhub.com', name: 'D', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })

    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe(b)
    expect(a?.id).toBe('u-dedup')
  })

  it('identidades distintas não compartilham a Promise', async () => {
    const authService = await loadAuthService()
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])

    await Promise.all([
      authService.fetchUserProfile('u-a'),
      authService.fetchUserProfile('u-b'),
    ])

    // Duas identidades distintas => duas consultas.
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('falha não bloqueia carregamentos futuros (Promise removida do mapa)', async () => {
    const authService = await loadAuthService()

    // Primeira chamada: perfil ausente -> null (loadUser retorna null).
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])
    await authService.fetchUserProfile('u-fail')

    // Segunda chamada deve consultar novamente (não reutilizar Promise antiga).
    mockFrom.mockClear()
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'u-fail', email: 'f@labhub.com', name: 'F', role: 'role-viewer',
              status: 'active', is_super_admin: false, workspace_ids: [],
              accent: 'blue', theme_variant: 'dark',
            },
            error: null,
          }),
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])
    const user = await authService.fetchUserProfile('u-fail')

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(user?.id).toBe('u-fail')
  })
})

describe('authService — invalidação por logout e troca de sessão', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockSignOut.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
  })

  it('um carregamento iniciado antes do signOut não restaura o usuário depois do logout', async () => {
    const authService = await loadAuthService()

    let resolveProfile!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferred = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveProfile = res
    })

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => deferred,
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])
    mockSignOut.mockResolvedValue({ error: null })

    const loadPromise = authService.fetchUserProfile('u-logout')

    // Logout enquanto a carga está em andamento.
    await authService.signOut()

    resolveProfile({
      data: {
        id: 'u-logout', email: 'l@labhub.com', name: 'L', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })
    await loadPromise

    // O logout invalidou a carga: currentUser permanece null.
    expect(authService.getCurrentUser()).toBeNull()
  })

  it('eventos legítimos continuam atualizando o usuário (fetchUserProfile direto)', async () => {
    const authService = await loadAuthService()
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'u-evt', email: 'e@labhub.com', name: 'E', role: 'role-viewer',
              status: 'active', is_super_admin: false, workspace_ids: [],
              accent: 'blue', theme_variant: 'dark',
            },
            error: null,
          }),
        }),
      }),
    })
    mockGetByUser.mockResolvedValue([])

    const user = await authService.fetchUserProfile('u-evt')
    expect(user?.id).toBe('u-evt')
  })
})

describe('authService.init — corrida entre restauração e login', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockSignOut.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
    mockOnAuthStateChange.mockReset()
  })

  it('restauração antiga de A não sobrescreve B após login', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-a', email: 'a@labhub.com' } } },
      error: null,
    })

    let callCount = 0
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            callCount++
            if (callCount === 1) return deferredA
            return Promise.resolve({
              data: {
                id: 'u-b', email: 'b@labhub.com', name: 'B', role: 'role-viewer',
                status: 'active', is_super_admin: false, workspace_ids: [],
                accent: 'blue', theme_variant: 'dark',
              },
              error: null,
            })
          },
        }),
      }),
    }))
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    mockSignIn.mockResolvedValue({
      data: { user: { id: 'u-b', email: 'b@labhub.com' } },
      error: null,
    })
    const userB = await authService.signIn({ email: 'b@labhub.com', password: 'secret' })
    expect(userB.id).toBe('u-b')
    expect(authService.getCurrentUser()?.id).toBe('u-b')

    resolveA({
      data: {
        id: 'u-a', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })

    await initPromise

    expect(authService.getCurrentUser()?.id).toBe('u-b')
  })
})

describe('authService — corrida com listener real (init + signOut/signIn)', () => {
  const ROW_A = {
    id: 'u-a', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
    status: 'active', is_super_admin: false, workspace_ids: [],
    accent: 'blue', theme_variant: 'dark',
  }
  const ROW_B = {
    id: 'u-b', email: 'b@labhub.com', name: 'B', role: 'role-viewer',
    status: 'active', is_super_admin: false, workspace_ids: [],
    accent: 'blue', theme_variant: 'dark',
  }

  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockSignOut.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
    mockOnAuthStateChange.mockReset()
  })

  function setupInitRestore(deferredA: Promise<{ data: Record<string, unknown> | null; error: null }>) {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-a', email: 'a@labhub.com' } } },
      error: null,
    })
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => deferredA,
        }),
      }),
    }))
  }

  function setupResolvedB() {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: ROW_B, error: null }),
        }),
      }),
    }))
  }

  it('Cenário A — logout durante restauração não restaura o usuário', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    const listener = vi.fn()
    authService.onAuthChange(listener)
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    setupInitRestore(deferredA)
    mockSignOut.mockResolvedValue({ error: null })
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    // Logout enquanto a carga de A está pendente.
    await authService.signOut()
    expect(authService.getCurrentUser()).toBeNull()

    resolveA({ data: ROW_A, error: null })
    await initPromise

    // A carga obsoleta não restaura A nem notifica listeners.
    expect(authService.getCurrentUser()).toBeNull()
    const calledWithA = listener.mock.calls.some(([u]) => (u as { id?: string } | null)?.id === 'u-a')
    expect(calledWithA).toBe(false)
  })

  it('Cenário B — login B enquanto restauração de A está pendente', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    const listener = vi.fn()
    authService.onAuthChange(listener)
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    setupInitRestore(deferredA)
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    setupResolvedB()
    mockSignIn.mockResolvedValue({ data: { user: { id: 'u-b', email: 'b@labhub.com' } }, error: null })
    await authService.signIn({ email: 'b@labhub.com', password: 'secret' })
    expect(authService.getCurrentUser()?.id).toBe('u-b')

    resolveA({ data: ROW_A, error: null })
    await initPromise

    // B permanece autenticado; A não é restaurado nem notificado.
    expect(authService.getCurrentUser()?.id).toBe('u-b')
    const calledWithA = listener.mock.calls.some(([u]) => (u as { id?: string } | null)?.id === 'u-a')
    expect(calledWithA).toBe(false)
  })

  it('Cenário C — novo login após logout mantém B autenticado', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    const listener = vi.fn()
    authService.onAuthChange(listener)
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    setupInitRestore(deferredA)
    mockSignOut.mockResolvedValue({ error: null })
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    await authService.signOut()
    setupResolvedB()
    mockSignIn.mockResolvedValue({ data: { user: { id: 'u-b', email: 'b@labhub.com' } }, error: null })
    await authService.signIn({ email: 'b@labhub.com', password: 'secret' })

    resolveA({ data: ROW_A, error: null })
    await initPromise

    // B permanece autenticado após a carga antiga de A terminar.
    expect(authService.getCurrentUser()?.id).toBe('u-b')
    const calledWithA = listener.mock.calls.some(([u]) => (u as { id?: string } | null)?.id === 'u-a')
    expect(calledWithA).toBe(false)
  })
})

describe('authService — callback real de onAuthStateChange (corridas)', () => {
  const ROW_A = {
    id: 'u-a', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
    status: 'active', is_super_admin: false, workspace_ids: [],
    accent: 'blue', theme_variant: 'dark',
  }
  const ROW_B = {
    id: 'u-b', email: 'b@labhub.com', name: 'B', role: 'role-viewer',
    status: 'active', is_super_admin: false, workspace_ids: [],
    accent: 'blue', theme_variant: 'dark',
  }

  beforeEach(() => {
    mockGetSession.mockReset()
    mockSignIn.mockReset()
    mockSignOut.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
    mockOnAuthStateChange.mockReset()
  })

  it('INITIAL_SESSION(A pendente) + SIGNED_OUT não restaura A', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    let callback!: (event: string, session: unknown) => Promise<void> | void
    mockOnAuthStateChange.mockImplementation((cb: typeof callback) => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-a', email: 'a@labhub.com' } } },
      error: null,
    })
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => deferredA }) }),
    }))
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    // Evento real do Supabase: logout (sessão nula) durante a carga pendente.
    await callback('SIGNED_OUT', null)
    expect(authService.getCurrentUser()).toBeNull()

    resolveA({ data: ROW_A, error: null })
    await initPromise

    expect(authService.getCurrentUser()).toBeNull()
    const calledWithA = listener.mock.calls.some(([u]) => (u as { id?: string } | null)?.id === 'u-a')
    expect(calledWithA).toBe(false)
  })

  it('SIGNED_IN(B) durante restauração de A pendente mantém B', async () => {
    const authService = await loadAuthService()

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })

    let callback!: (event: string, session: unknown) => Promise<void> | void
    mockOnAuthStateChange.mockImplementation((cb: typeof callback) => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const listener = vi.fn()
    authService.onAuthChange(listener)

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-a', email: 'a@labhub.com' } } },
      error: null,
    })
    let callCount = 0
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            callCount++
            if (callCount === 1) return deferredA
            return Promise.resolve({ data: ROW_B, error: null })
          },
        }),
      }),
    }))
    mockGetByUser.mockResolvedValue([])

    const initPromise = authService.init()
    await vi.advanceTimersByTimeAsync(0)

    // Evento legítimo do Supabase: login de B enquanto A ainda está pendente.
    await callback('SIGNED_IN', { user: { id: 'u-b', email: 'b@labhub.com' } })
    expect(authService.getCurrentUser()?.id).toBe('u-b')

    resolveA({ data: ROW_A, error: null })
    await initPromise

    expect(authService.getCurrentUser()?.id).toBe('u-b')
    const calledWithA = listener.mock.calls.some(([u]) => (u as { id?: string } | null)?.id === 'u-a')
    expect(calledWithA).toBe(false)
  })

  it('INITIAL_SESSION com sessão nula limpa currentUser', async () => {
    const authService = await loadAuthService()
    let callback!: (event: string, session: unknown) => Promise<void> | void
    mockOnAuthStateChange.mockImplementation((cb: typeof callback) => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    await authService.init()
    await callback('INITIAL_SESSION', null)

    expect(authService.getCurrentUser()).toBeNull()
  })
})

describe('authService.signIn — invalidação por logout/sessão mais recente', () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockGetSession.mockReset()
    mockSignOut.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
    mockOnAuthStateChange.mockReset()
  })

  it('login pendente seguido de logout → lança erro e não sobrescreve sessão', async () => {
    const authService = await loadAuthService()
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    let resolveProfile!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferred = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveProfile = res
    })

    mockSignIn.mockResolvedValue({
      data: { user: { id: 'u-a', email: 'a@labhub.com' } },
      error: null,
    })
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => deferred }) }),
    }))
    mockGetByUser.mockResolvedValue([])
    mockSignOut.mockResolvedValue({ error: null })

    const signInPromise = authService.signIn({ email: 'a@labhub.com', password: 'secret' })
    // Esperar até que signIn chegue em fetchUserProfile
    for (let i = 0; i < 10; i++) await Promise.resolve()
    // Logout durante o fetch do perfil no login.
    await authService.signOut()
    expect(authService.getCurrentUser()).toBeNull()

    resolveProfile({
      data: {
        id: 'u-a', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })

    await expect(signInPromise).rejects.toThrow(/login invalidado/i)
    expect(authService.getCurrentUser()).toBeNull()
  })

  it('login pendente de A seguido de login válido de B', async () => {
    const authService = await loadAuthService()
    mockOnAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

    let resolveA!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredA = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveA = res
    })
    let resolveB!: (v: { data: Record<string, unknown> | null; error: null }) => void
    const deferredB = new Promise<{ data: Record<string, unknown> | null; error: null }>((res) => {
      resolveB = res
    })

    mockSignIn
      .mockResolvedValueOnce({ data: { user: { id: 'u-a', email: 'a@labhub.com' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u-b', email: 'b@labhub.com' } }, error: null })

    let markAQueryStarted!: () => void
    let markBQueryStarted!: () => void
    const aQueryStarted = new Promise<void>((resolve) => { markAQueryStarted = resolve })
    const bQueryStarted = new Promise<void>((resolve) => { markBQueryStarted = resolve })

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }
      }
      return {
        select: () => ({
          eq: (_column: string, userId: string) => ({
            maybeSingle: () => {
              // Associar cada deferred pelo ID, nunca pela ordem de scheduling.
              if (userId === 'u-a') {
                markAQueryStarted()
                return deferredA
              }
              if (userId === 'u-b') {
                markBQueryStarted()
                return deferredB
              }
              throw new Error(`ID de perfil inesperado no teste de concorrência: ${userId}`)
            },
          }),
        }),
      }
    })
    mockGetByUser.mockResolvedValue([])

    // Garantir que A já esteja aguardando o perfil antes de iniciar B;
    // caso contrário, B pode invalidar A antes de A alcançar esta query.
    const signInAPromise = authService.signIn({ email: 'a@labhub.com', password: 'secret' })
    await aQueryStarted

    const signInBPromise = authService.signIn({ email: 'b@labhub.com', password: 'secret' })
    await bQueryStarted

    // B termina primeiro; a conclusão de A não pode sobrescrever B.
    resolveB({
      data: {
        id: 'u-b', email: 'b@labhub.com', name: 'B', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })
    const userB = await signInBPromise
    expect(userB.id).toBe('u-b')
    expect(authService.getCurrentUser()?.id).toBe('u-b')

    resolveA({
      data: {
        id: 'u-a', email: 'a@labhub.com', name: 'A', role: 'role-viewer',
        status: 'active', is_super_admin: false, workspace_ids: [],
        accent: 'blue', theme_variant: 'dark',
      },
      error: null,
    })

    await expect(signInAPromise).rejects.toThrow(/login invalidado/i)
    expect(authService.getCurrentUser()?.id).toBe('u-b')
  })
})

describe('authService.signIn — auto-heal de profile ausente (F1-B)', () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockGetSession.mockReset()
    mockFrom.mockReset()
    mockGetByUser.mockReset()
  })

  it('recria o profile como pending — NUNCA active — sem autorização implícita de workspace', async () => {
    // Auth user válido, mas o profile row não existe (fetchUserProfile → null).
    mockSignIn.mockResolvedValue({
      data: { user: { id: 'u-orphan', email: 'orphan@labhub.com' } },
      error: null,
    })
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))

    let insertPayload: Record<string, unknown> | null = null
    // Chain dupla: SELECT (perfil ausente) e INSERT (auto-heal).
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload
        return {
          select: () => ({
            single: async () => ({ data: { ...payload, role: 'viewer' }, error: null }),
          }),
        }
      },
    }))

    const authService = await loadAuthService()
    const user = await authService.signIn({ email: 'orphan@labhub.com', password: 'secret' })

    // Perfil recriado como PENDING (estado inicial de conta ainda não aprovada).
    expect(insertPayload).not.toBeNull()
    expect(insertPayload!.status).toBe('pending')
    expect(insertPayload!.status).not.toBe('active')
    // Sem autorização implícita: nenhum workspace atribuído no auto-heal.
    expect(insertPayload!.workspace_ids).toEqual([])
    expect(insertPayload!.is_super_admin).toBe(false)
    // toDbUser converte roleId → role no payload gravado (viewer, nunca admin).
    expect(insertPayload!.role).toBe('role-viewer')

    // O usuário resultante do login é pending (AuthGuard → /approval-pending).
    expect(user.status).toBe('pending')
    expect(user.status).not.toBe('active')
  })

  it('não invoca o auto-heal quando o profile já existe (pending preservado)', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: { id: 'u-pendente', email: 'pend@labhub.com' } },
      error: null,
    })

    let insertCalled = false
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'u-pendente', email: 'pend@labhub.com', name: 'Pend', role: 'role-viewer',
              status: 'pending', is_super_admin: false, workspace_ids: [],
              accent: 'blue', theme_variant: 'dark',
            },
            error: null,
          }),
        }),
      }),
      insert: () => {
        insertCalled = true
        return { select: () => ({ single: async () => ({ data: null, error: null }) }) }
      },
    }))
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))

    const authService = await loadAuthService()
    const user = await authService.signIn({ email: 'pend@labhub.com', password: 'secret' })

    expect(user.status).toBe('pending')
    // Perfil já existe → o login apenas lê; NENHUM INSERT de auto-heal ocorre.
    expect(insertCalled).toBe(false)
  })
})