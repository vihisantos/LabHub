/**
 * F2-D-K — Nova fonte de visibilidade de módulos (RBAC 2.0).
 *
 * Três blocos:
 *   1. EQUIVALÊNCIA — a matriz nova é comparada, célula a célula, com
 *      `DEFAULT_ROLES[].appAccess` (a fonte legada que ela substitui). Se a
 *      matriz divergir do comportamento atual, o teste falha: o F2-D-K proíbe
 *      redesenho de política.
 *   2. SEGURANÇA / FONTE DE DADOS — a nova resolução NÃO pode ler
 *      `user.app_access`, `Role.appAccess` nem `profiles.role`, e não infere
 *      permissão a partir de Actions.
 *   3. EIXOS — super admin, `workspace.disabled_apps`, escopo por unidade e a
 *      independência dos guards que NÃO devem voltar para cá (Admin/Coordenador/
 *      Líder).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '../../auth/types'
import type { Workspace } from '../../workspaces/types'
import { DEFAULT_ROLES } from '../types'
import type { Membership } from '../membership'
import {
  MODULE_IDS,
  MODULE_VISIBILITY_BY_SLUG,
  UNMAPPED_SLUGS,
  moduleLevelForSlug,
  moduleLevelForMembership,
  activeMembershipRoleId,
  resolveModuleVisibility,
  resolveModuleVisibilities,
  type ModuleId,
  type ModuleLevel,
} from '../moduleVisibility'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = 'ws-a'
const WS_B = 'ws-b'
const ROLE_ID: Record<string, string> = {
  tec: 'role-id-tec',
  vis: 'role-id-vis',
  lider: 'role-id-lider',
  coordinator: 'role-id-coordinator',
  opv: 'role-id-opv',
  est: 'role-id-est',
  adm: 'role-id-adm',
}

const { mockResolveRoleSlug } = vi.hoisted(() => ({ mockResolveRoleSlug: vi.fn() }))

vi.mock('../../memberships/service', async () => {
  const actual = await vi.importActual<typeof import('../../memberships/service')>(
    '../../memberships/service',
  )
  return {
    membershipService: {
      ...actual.membershipService,
      resolveRoleSlug: (...args: unknown[]) => mockResolveRoleSlug(...args),
    },
  }
})

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'u@x.com',
    name: 'U',
    roleId: 'role-technician',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [WS_A],
    memberships: [mem(WS_A, ROLE_ID.tec, 'active')],
    membershipsLoaded: true,
    ...overrides,
  } as unknown as User
}

/** Linha de `memberships` completa (mesmo shape da tabela, migration 036). */
function mem(
  workspaceId: string,
  roleId: string,
  status: 'active' | 'pending' | 'suspended' | 'removed',
): Membership {
  return {
    id: 'mem-1',
    profile_id: 'u-1',
    workspace_id: workspaceId,
    role_id: roleId,
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  }
}

function memberOf(slug: keyof typeof ROLE_ID, workspaceId = WS_A): User {
  return user({
    memberships: [mem(workspaceId, ROLE_ID[slug], 'active')],
    workspace_ids: [workspaceId],
  })
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: WS_A, name: 'Campus A', slug: 'ws-a', disabled_apps: [], ...overrides } as Workspace
}

/** Source of truth para o mock do banco: role_id → slug. */
beforeEach(() => {
  vi.clearAllMocks()
  mockResolveRoleSlug.mockImplementation(async (roleId: string) => {
    const found = Object.entries(ROLE_ID).find(([, id]) => id === roleId)
    return found ? found[0] : null
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. EQUIVALÊNCIA COM A MATRIZ LEGADA (DEFAULT_ROLES)
// ─────────────────────────────────────────────────────────────────────────────

describe('equivalência com DEFAULT_ROLES (fonte legada substituída)', () => {
  // Mapa explícito: `key` legado -> `slug` canônico de public.roles.
  const LEGACY_KEY_TO_SLUG: Record<string, string> = {
    technician: 'tec',
    viewer: 'vis',
    lider: 'lider',
    coordinator: 'coordinator',
  }

  it('a matriz cobre exatamente os 4 cargos com appAccess declarado', () => {
    expect(Object.keys(MODULE_VISIBILITY_BY_SLUG).sort()).toEqual(
      Object.values(LEGACY_KEY_TO_SLUG).sort(),
    )
  })

  // Matriz esperada, escrita à mão a partir do F2-D-J §D (role x app). Serve de
  // trava contra alguém "melhorar" a política sem querer.
  const ESPERADO: Record<string, Partial<Record<ModuleId, ModuleLevel>>> = {
    tec: { 'pc-care': 'full', stock: 'full', reservalab: 'read', chamados: 'full' },
    vis: { 'pc-care': 'read', stock: 'read', reservalab: 'dash', chamados: 'read' },
    lider: { 'pc-care': 'read', stock: 'read', chamados: 'full' },
    coordinator: {
      'pc-care': 'read',
      stock: 'read',
      tv: 'read',
      chamados: 'full',
      reservalab: 'read',
    },
  }

  for (const [slug, esperado] of Object.entries(ESPERADO)) {
    it(`${slug}: matriz nova = matriz do F2-D-J, célula a célula`, () => {
      for (const appId of MODULE_IDS) {
        expect(moduleLevelForSlug(slug, appId)).toBe(esperado[appId] ?? 'none')
      }
    })

    it(`${slug}: é idêntico ao appAccess do DEFAULT_ROLES legado`, () => {
      const legado = DEFAULT_ROLES.find(
        (r) => r.key === Object.keys(LEGACY_KEY_TO_SLUG).find((k) => LEGACY_KEY_TO_SLUG[k] === slug),
      )
      expect(legado, `DEFAULT_ROLES deveria ter o cargo do slug ${slug}`).toBeDefined()
      for (const appId of MODULE_IDS) {
        const viaLegado = (legado!.appAccess as Record<string, ModuleLevel | undefined>)[appId]
        expect(moduleLevelForSlug(slug, appId)).toBe(viaLegado ?? 'none')
      }
    })
  }

  it('nenhum cargo declara dashboard nem admin (super admin only, como hoje)', () => {
    for (const slug of Object.keys(MODULE_VISIBILITY_BY_SLUG)) {
      expect(moduleLevelForSlug(slug, 'dashboard')).toBe('none')
      expect(moduleLevelForSlug(slug, 'admin')).toBe('none')
    }
  })

  it('opv/est/adm estão declarados como NÃO mapeados, com a lacuna documentada', () => {
    expect(UNMAPPED_SLUGS).toEqual(['opv', 'est', 'adm'])
    for (const slug of UNMAPPED_SLUGS) {
      expect(MODULE_VISIBILITY_BY_SLUG[slug]).toBeUndefined()
      // fail-closed: sem linha na matriz ⇒ nenhum módulo
      for (const appId of MODULE_IDS) {
        expect(moduleLevelForSlug(slug, appId)).toBe('none')
      }
    }
  })

  it('slug desconhecido, vazio ou nulo ⇒ none (fail-closed)', () => {
    for (const slug of [null, undefined, '', 'cargo-local-desconhecido', 'role-x']) {
      expect(moduleLevelForSlug(slug, 'pc-care')).toBe('none')
    }
  })

  it('módulo fora do registry ⇒ none (não invisa rota)', () => {
    expect(moduleLevelForSlug('tec', 'chamados-dashboard')).toBe('none')
    expect(moduleLevelForSlug('tec', 'app-inexistente')).toBe('none')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEGURANÇA / FONTE DE DADOS
// ─────────────────────────────────────────────────────────────────────────────

describe('a nova fonte NÃO consulta o legado', () => {
  it('funciona com app_access e roleId legado COMPLETAMENTE divergentes', async () => {
    // O usuário mente no legado: diz que é coordinator e que não tem acesso a
    // nada. A fonte nova tem que responder pelo slug da MEMBERSHIP (tec).
    const lying = user({
      roleId: 'role-coordinator',
      app_access: { 'pc-care': 'none', stock: 'none', chamados: 'none', dashboard: 'full' },
    } as Partial<User>)

    const pcCare = await resolveModuleVisibility({
      user: lying,
      workspaceId: WS_A,
      appId: 'pc-care',
    })
    const dashboard = await resolveModuleVisibility({
      user: lying,
      workspaceId: WS_A,
      appId: 'dashboard',
    })

    // pc-care: 'full' (tec pela membership) — apesar do override legado 'none'
    expect(pcCare).toEqual({ visible: true, level: 'full' })
    // dashboard: 'none' — apesar do override legado dizer 'full'
    expect(dashboard).toEqual({ visible: false, level: 'none' })
  })

  it('a resolução lê SOMENTE memberships da unidade pedida', async () => {
    const u = memberOf('vis', WS_A)
    await resolveModuleVisibility({ user: u, workspaceId: WS_B, appId: 'pc-care' })

    // Não pediu o slug: membership na unidade B não existe ⇒ nem consulta o banco.
    expect(mockResolveRoleSlug).not.toHaveBeenCalled()
  })

  it('activeMembershipRoleId ignora membership suspensa/pending/removed', () => {
    for (const status of ['suspended', 'pending', 'removed'] as const) {
      const u = user({
        memberships: [{ workspace_id: WS_A, role_id: ROLE_ID.tec, status }],
      } as unknown as Partial<User>)
      expect(activeMembershipRoleId(u, WS_A)).toBeNull()
    }
  })

  it('activeMembershipRoleId não usa profiles.workspace_ids nem user.roleId', () => {
    const u = user({
      // workspace_ids mente (inclui WS_B), mas não há membership lá:
      workspace_ids: [WS_A, WS_B],
    } as unknown as Partial<User>)
    expect(activeMembershipRoleId(u, WS_B)).toBeNull()
  })

  it('membershipsLoaded !== true ⇒ pendente (nada decidido, sem negar por falta de dado)', () => {
    const u = user({ membershipsLoaded: false } as unknown as Partial<User>)
    expect(activeMembershipRoleId(u, WS_A)).toBeNull()
  })

  it('falha ao resolver o slug ⇒ fail-closed (none), nunca acesso', async () => {
    mockResolveRoleSlug.mockRejectedValue(new Error('rede'))
    const res = await resolveModuleVisibility({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appId: 'pc-care',
    })
    expect(res).toEqual({ visible: false, level: 'none' })
  })

  it('slug que o banco não conhece ⇒ fail-closed', async () => {
    mockResolveRoleSlug.mockResolvedValue(null)
    const res = await resolveModuleVisibility({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appId: 'pc-care',
    })
    expect(res).toEqual({ visible: false, level: 'none' })
  })

  it('NÃO infere visibilidade pela existência de Actions (uso explícito do slug)', async () => {
    // `opv` tem 6 Actions de TV, mas não tem linha na matriz ⇒ não vê TV.
    // Se a implementação inferisse de role_permissions, isto quebraria.
    const opv = memberOf('opv')
    const tv = await resolveModuleVisibility({ user: opv, workspaceId: WS_A, appId: 'tv' })
    expect(tv).toEqual({ visible: false, level: 'none' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. EIXOS: super admin, disabled_apps, escopo por unidade
// ─────────────────────────────────────────────────────────────────────────────

describe('super admin', () => {
  it('bypass ⇒ full em todos os módulos, sem depender de membership', async () => {
    const superAdmin = user({
      is_super_admin: true,
      memberships: [],
      membershipsLoaded: true,
    } as unknown as Partial<User>)
    for (const appId of MODULE_IDS) {
      const res = await resolveModuleVisibility({
        user: superAdmin,
        workspaceId: WS_A,
        appId,
      })
      expect(res, `super admin em ${appId}`).toEqual({ visible: true, level: 'full' })
    }
  })

  it('bypass não consulta o banco de cargos', async () => {
    const superAdmin = user({ is_super_admin: true, memberships: [] } as unknown as Partial<User>)
    await resolveModuleVisibility({ user: superAdmin, workspaceId: WS_A, appId: 'pc-care' })
    expect(mockResolveRoleSlug).not.toHaveBeenCalled()
  })

  it('super admin NÃO substitui profiles.role (bypass é is_super_admin)', () => {
    const superAdmin = user({ is_super_admin: true, roleId: 'role-viewer' } as unknown as Partial<User>)
    expect(moduleLevelForMembership({ user: superAdmin, workspaceId: WS_A, appId: 'stock', slug: null })).toBe('full')
  })
})

describe('workspace.disabled_apps (segundo eixo, por unidade)', () => {
  it('módulo desabilitado na unidade ⇒ não visível, mesmo para super admin', async () => {
    const superAdmin = user({ is_super_admin: true, memberships: [] } as unknown as Partial<User>)
    const res = await resolveModuleVisibility({
      user: superAdmin,
      workspaceId: WS_A,
      appId: 'tv',
      workspace: workspace({ disabled_apps: ['tv'] }),
    })
    expect(res).toEqual({ visible: false, level: 'none' })
  })

  it('módulo desabilitado esconde um cargo com nível alto (nada de bypass de unidade)', async () => {
    const res = await resolveModuleVisibility({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appId: 'pc-care',
      workspace: workspace({ disabled_apps: ['pc-care'] }),
    })
    expect(res).toEqual({ visible: false, level: 'none' })
  })

  it('desabilitar OUTRO módulo não afeta o primeiro', async () => {
    const res = await resolveModuleVisibility({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appId: 'pc-care',
      workspace: workspace({ disabled_apps: ['tv'] }),
    })
    expect(res).toEqual({ visible: true, level: 'full' })
  })

  it('dashboard/admin nunca são desabilitáveis (não estão em APPS_CONFIGURABLE)', async () => {
    // Espelha `APPS_CONFIGURABLE` (core/workspaces/apps.ts:6-8).
    const { APPS_CONFIGURABLE } = await import('../../workspaces/apps')
    expect(APPS_CONFIGURABLE).not.toContain('dashboard')
    expect(APPS_CONFIGURABLE).not.toContain('admin')
  })
})

describe('escopo por unidade (multiunidade)', () => {
  it('a visibilidade é da unidade pedida, não de "alguma membership"', async () => {
    const u = user({
      memberships: [
        { workspace_id: WS_A, role_id: ROLE_ID.lider, status: 'active' },
        { workspace_id: WS_B, role_id: ROLE_ID.vis, status: 'active' },
      ],
      workspace_ids: [WS_A, WS_B],
    } as unknown as User)

    // Na unidade A (lider) o TV é invisível…
    expect(
      await resolveModuleVisibility({ user: u, workspaceId: WS_A, appId: 'tv' }),
    ).toEqual({ visible: false, level: 'none' })
    // …na unidade B (viewer) o TV também, mas o nível de pc-care difere.
    expect(
      await resolveModuleVisibility({ user: u, workspaceId: WS_B, appId: 'pc-care' }),
    ).toEqual({ visible: true, level: 'read' })
  })

  it('slug da unidade B não vale para a unidade A', async () => {
    const u = memberOf('vis', WS_B)
    // membership do usuário está em B; A não tem membership ⇒ none
    expect(
      await resolveModuleVisibility({ user: u, workspaceId: WS_A, appId: 'stock' }),
    ).toEqual({ visible: false, level: 'none' })
  })

  it('sem unidade ativa ⇒ none para todos os módulos', async () => {
    for (const appId of MODULE_IDS) {
      const res = await resolveModuleVisibility({
        user: memberOf('tec'),
        workspaceId: null,
        appId,
      })
      expect(res).toEqual({ visible: false, level: 'none' })
    }
  })
})

describe('níveis (semântica dash/read/full preservada)', () => {
  it('viewer tem reservalab em dash — que NÃO é read nem full', async () => {
    const res = await resolveModuleVisibility({
      user: memberOf('vis'),
      workspaceId: WS_A,
      appId: 'reservalab',
    })
    expect(res.level).toBe('dash')
    // Consumidores reais: Layout redireciona p/ dashboard, Navbar filtra abas,
    // UpcomingPopup exige 'full'.
    expect(res.level === 'full').toBe(false)
  })

  it('técnico tem reservalab em read (acima de dash, abaixo de full)', async () => {
    const res = await resolveModuleVisibility({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appId: 'reservalab',
    })
    expect(res.level).toBe('read')
  })

  it('ninguém além de super admin tem reservalab em full', async () => {
    // Fato do F2-D-J: `full` em reservalab não existe em DEFAULT_ROLES.
    for (const slug of ['tec', 'vis', 'lider', 'coordinator']) {
      expect(moduleLevelForSlug(slug, 'reservalab')).not.toBe('full')
    }
  })
})

describe('resolução em lote', () => {
  it('resolve vários módulos com UMA consulta de cargo', async () => {
    mockResolveRoleSlug.mockClear()
    const res = await resolveModuleVisibilities({
      user: memberOf('coordinator'),
      workspaceId: WS_A,
      appIds: ['pc-care', 'stock', 'tv', 'chamados', 'reservalab', 'dashboard'],
    })
    expect(mockResolveRoleSlug).toHaveBeenCalledTimes(1)
    expect(res['tv']).toEqual({ visible: true, level: 'read' })
    expect(res['dashboard']).toEqual({ visible: false, level: 'none' })
  })

  it('lote respeita disabled_apps e bypass', async () => {
    const res = await resolveModuleVisibilities({
      user: memberOf('tec'),
      workspaceId: WS_A,
      appIds: ['pc-care', 'stock', 'tv'],
      workspace: workspace({ disabled_apps: ['stock'] }),
    })
    expect(res['pc-care']).toEqual({ visible: true, level: 'full' })
    expect(res['stock']).toEqual({ visible: false, level: 'none' })
    expect(res['tv']).toEqual({ visible: false, level: 'none' })
  })
})

describe('usuário ausente', () => {
  it('null/undefined ⇒ none em tudo, sem exceção', async () => {
    for (const u of [null, undefined]) {
      const res = await resolveModuleVisibility({ user: u, workspaceId: WS_A, appId: 'pc-care' })
      expect(res).toEqual({ visible: false, level: 'none' })
    }
    const lote = await resolveModuleVisibilities({
      user: null,
      workspaceId: WS_A,
      appIds: ['pc-care', 'stock'],
    })
    expect(lote['pc-care']).toEqual({ visible: false, level: 'none' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Independência dos guards que NÃO devem usar esta fonte
// ─────────────────────────────────────────────────────────────────────────────

describe('guards com mecanismo próprio (não devem ser migrados para cá)', () => {
  it('admin: a fonte resolve admin como none para não-super-admin, mas quem decide é is_super_admin', () => {
    // A matriz de visibilidade NÃO concede admin. O `AdminGuard` decide por
    // `user.is_super_admin` e este PR não o tocou.
    for (const slug of Object.keys(MODULE_VISIBILITY_BY_SLUG)) {
      expect(moduleLevelForSlug(slug, 'admin')).toBe('none')
    }
    const superAdmin = user({ is_super_admin: true } as Partial<User>)
    expect(moduleLevelForMembership({ user: superAdmin, workspaceId: WS_A, appId: 'admin', slug: null })).toBe('full')
  })

  it('liderança: a fonte de liderança é o slug da membership, a mesma base usada aqui', () => {
    // `useLeadership` (core/permissions/useLeadership.ts) resolve o slug da
    // membership ativa; `LEADERSHIP_BY_SLUG` só reconhece lider/coordinator.
    // Ou seja: a mesma cadeia `membership → roles.slug`, sem `app_access`.
    const lider = memberOf('lider')
    expect(activeMembershipRoleId(lider, WS_A)).toBe(ROLE_ID.lider)
    // E o cargo de liderança existe na matriz de módulos:
    expect(moduleLevelForSlug('lider', 'chamados')).toBe('full')
  })

  it('a fonte de visibilidade não importa LeadershipAreaGuard nem useCoordinator', async () => {
    const mod = await import('../moduleVisibility')
    const src = Object.keys(mod).join(' ')
    expect(src).not.toContain('LeadershipAreaGuard')
    expect(src).not.toContain('useCoordinator')
    expect(src).not.toContain('useAppAccess')
  })
})
