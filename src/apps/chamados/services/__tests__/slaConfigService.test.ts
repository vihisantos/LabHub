import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '../../../../core/auth/types'
import { DEFAULT_SLA_HOURS } from '../../types'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
  pcareDb: null,
  stockDb: null,
}))

async function loadService() {
  vi.resetModules()
  const mod = await import('../slaConfigService')
  const db = await import('../../../../lib/db')
  return { slaConfigService: mod.slaConfigService, ...db }
}

/**
 * Thenable no estilo supabase-js. `membershipService.can` (a cadeia RBAC 2.0
 * real: memberships → role_id → role_permissions@workspace) é exercitada de
 * verdade aqui — o mock é só da ION do Supabase, não da autorização. Quem
 * decide ALLOW/DENY é a implementação real de `can`.
 */
function thenable<T>(json: T) {
  return {
    then: (resolve: (v: T) => void, reject: (e: unknown) => void) =>
      Promise.resolve(json).then(resolve, reject),
  }
}

const WS_A = 'ws-a'
const WS_B = 'ws-b'
const ROLE_TEC = 'role-uuid-tec'
const ROLE_VIS = 'role-uuid-vis'

let dbResult: { data: unknown; error: unknown }
let chainFilters: Record<string, unknown>
let chainTable: string
let throwOnBuild = false

function mockDb() {
  mockFrom.mockImplementation((table: string) => ({
    select: (selection: string) => {
      chainTable = table
      chainFilters = { __selection: selection }
      const node: Record<string, unknown> = {
        ...thenable(dbResult),
        eq: (column: string, value: unknown) => {
          chainFilters[column] = value
          return node
        },
        limit: (_n: number) => {
          if (throwOnBuild) throw new Error('boom')
          return node
        },
      }
      return node
    },
  }))
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'u@x.com',
    name: 'U',
    roleId: 'role-technician',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [WS_A],
    memberships: [
      { id: 'm-1', profile_id: 'u-1', workspace_id: WS_A, role_id: ROLE_TEC, status: 'active' },
    ],
    membershipsLoaded: true,
    ...overrides,
  } as unknown as User
}

async function setCurrentUser(u: User | null) {
  const { authService } = await import('../../../../core/auth/service')
  vi.spyOn(authService, 'getCurrentUser').mockReturnValue(u)
}

const HOURS = { baixa: 10, normal: 4, alta: 3, urgente: 1 }
const HOURS_2 = { baixa: 1, normal: 2, alta: 3, urgente: 4 }

beforeEach(() => {
  vi.clearAllMocks()
  dbResult = { data: [{ id: 'rp-1' }], error: null }
  chainFilters = {}
  throwOnBuild = false
  mockDb()
})

describe('slaConfigService — RBAC 2.0 por Action na escrita (F2-D-G)', () => {
  it('Caso 1 — Action presente => update permitido e persistido', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(user())

    await slaConfigService.update(WS_A, HOURS)

    // A consulta real foi a de role_permissions, na sessão do usuário.
    expect(chainTable).toBe('role_permissions')
    expect(chainFilters.action).toBe('chamados.settings.manage')
    expect(chainFilters.scope).toBe('workspace')
    expect(chainFilters.role_id).toBe(ROLE_TEC)

    expect(slaConfigService.getHours(WS_A)).toEqual(HOURS)
    expect(getCol('sla_configs')).toHaveLength(1)
  })

  it('Caso 2 — Action ausente => update NEGADO e nada é persistido', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(user())
    // A role da membership não tem a Action (equivalente a `vis`, que no
    // legado tinha `chamados: read`): a consulta não retorna a permission.
    dbResult = { data: [], error: null }

    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('Caso 3 — workspace errado (Action da unidade A não vale na B) => NEGADO', async () => {
    const { slaConfigService, getCol } = await loadService()
    // Membro apenas de WS_A; tenta configurar WS_B.
    await setCurrentUser(user())

    await expect(slaConfigService.update(WS_B, HOURS)).rejects.toThrow(/Permissão insuficiente/)
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('Caso 4 — membership inativa => NEGADO (fail-closed)', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(
      user({
        memberships: [
          { id: 'm-1', profile_id: 'u-1', workspace_id: WS_A, role_id: ROLE_TEC, status: 'suspended' },
        ],
      } as Partial<User>),
    )

    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('Caso 4b — memberships não carregadas => NEGADO (fail-closed)', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user({ membershipsLoaded: false } as Partial<User>))

    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
  })

  it('Caso 5 — Super Admin => permitido SEM membership (bypass preservado)', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(
      user({ is_super_admin: true, memberships: [], membershipsLoaded: true } as Partial<User>),
    )

    await slaConfigService.update(WS_A, HOURS)
    expect(slaConfigService.getHours(WS_A)).toEqual(HOURS)
    expect(getCol('sla_configs')).toHaveLength(1)
  })

  it('Caso 5b — usuário ausente => NEGADO (nunca adivinha o caller)', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(null)

    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
  })

  it('Caso 5c — falha na consulta de permission => NEGADO (nunca vira allow)', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user())
    dbResult = { data: null, error: { message: 'rls' } }

    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
  })

  it('não consulta o app legado (app_access) para autorizar', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user())

    await slaConfigService.update(WS_A, HOURS)

    // Nenhuma tabela de perfis/app_access foi lida: quem decide é
    // role_permissions (mesma cadeia do RLS via user_has_action).
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(chainTable).toBe('role_permissions')
  })
})

describe('slaConfigService — ensureConfig NÃO materializa config na leitura (F2-D-G §8)', () => {
  it('Caso 6 — getFor() não cria configuração para usuário SEM permissão', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(user({ membershipsLoaded: false } as Partial<User>))

    const config = slaConfigService.getFor(WS_A)

    // Devolve o padrão efêmero…
    expect(config.workspace_id).toBe(WS_A)
    expect(config.hours).toEqual(DEFAULT_SLA_HOURS)
    // …sem tocar a coleção.
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('Caso 7 — getHours() não cria configuração', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(null)

    const hours = slaConfigService.getHours(WS_A)

    expect(hours).toEqual(DEFAULT_SLA_HOURS)
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('Caso 8 — primeiro acesso de uma workspace nova não gera escrita silenciosa', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(user())

    // Leitura repetida (é o que o Dashboard/Coordinator faz ao montar).
    slaConfigService.getFor(WS_A)
    slaConfigService.getHours(WS_A)
    slaConfigService.getHoursForTickets()

    expect(getCol('sla_configs')).toHaveLength(0)
    expect(slaConfigService.getHoursForTickets()).toEqual({})
  })

  it('Caso 8b — leituras também não marcam a coleção como suja (sync)', async () => {
    const { slaConfigService } = await loadService()
    const sync = await import('../../../../lib/sync')

    slaConfigService.getFor(WS_A)
    slaConfigService.getHours(WS_A)

    expect(sync.getDirtyCollections()).not.toContain('sla_configs')
  })

  it('Caso 9 — criação explícita ocorre SOMENTE pelo caminho autorizado', async () => {
    const { slaConfigService, getCol } = await loadService()

    // Leitura não cria; escrita sem Action não cria.
    await setCurrentUser(user({ membershipsLoaded: false } as Partial<User>))
    slaConfigService.getFor(WS_A)
    await expect(slaConfigService.update(WS_A, HOURS)).rejects.toThrow(/Permissão insuficiente/)
    expect(getCol('sla_configs')).toHaveLength(0)

    // Com a membership ativa + Action, a criação acontece dentro de `update`.
    await setCurrentUser(user())
    await slaConfigService.update(WS_A, HOURS)
    expect(getCol('sla_configs')).toHaveLength(1)
    expect(slaConfigService.getFor(WS_A).hours).toEqual(HOURS)
  })
})

describe('slaConfigService — comportamento de leitura preservado', () => {
  it('getFor devolve o que está salvo; id estável por unidade', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user())

    await slaConfigService.update(WS_A, HOURS)
    const config = slaConfigService.getFor(WS_A)
    expect(config.id).toBe(WS_A)
    expect(config.hours).toEqual(HOURS)
    expect(slaConfigService.getFor(WS_A).id).toBe(config.id)
  })

  it('getFor sem unidade devolve o padrão __default__ sem escrever', async () => {
    const { slaConfigService, getCol } = await loadService()
    const config = slaConfigService.getFor('')
    expect(config.workspace_id).toBe('__default__')
    expect(getCol('sla_configs')).toHaveLength(0)
  })

  it('getHoursForTickets agrupa por workspace apenas o que foi salvo', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user({ memberships: [
      { id: 'm-1', profile_id: 'u-1', workspace_id: WS_A, role_id: ROLE_TEC, status: 'active' },
      { id: 'm-2', profile_id: 'u-1', workspace_id: WS_B, role_id: ROLE_VIS, status: 'active' },
    ] } as Partial<User>))

    await slaConfigService.update(WS_A, HOURS)
    const map = slaConfigService.getHoursForTickets()

    expect(map[WS_A]).toEqual(HOURS)
    // WS_B nunca foi salva: não aparece (o consumidor cai em DEFAULT_SLA_HOURS
    // via getSlaHours, como antes desta migration).
    expect(map[WS_B]).toBeUndefined()
  })

  it('update normaliza valores inválidos e negativos', async () => {
    const { slaConfigService } = await loadService()
    await setCurrentUser(user())

    await slaConfigService.update(WS_A, {} as never)
    expect(slaConfigService.getHours(WS_A)).toEqual(DEFAULT_SLA_HOURS)

    // Negativo vai a 0; fracionário arredonda; NaN cai no default.
    await slaConfigService.update(WS_A, { baixa: -5, normal: 3.6, alta: NaN, urgente: 2 } as never)
    expect(slaConfigService.getHours(WS_A)).toEqual({ baixa: 0, normal: 4, alta: 8, urgente: 2 })
  })

  it('update em unidade sem config cria a linha (não duplica a cada save)', async () => {
    const { slaConfigService, getCol } = await loadService()
    await setCurrentUser(user())

    await slaConfigService.update(WS_A, HOURS)
    await slaConfigService.update(WS_A, HOURS_2)

    expect(getCol('sla_configs')).toHaveLength(1)
    expect(slaConfigService.getHours(WS_A)).toEqual(HOURS_2)
  })
})
