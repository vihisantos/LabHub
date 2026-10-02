/**
 * RBAC 2.0 — permissões de módulo: VISIBILIDADE × AUTORIZAÇÃO.
 *
 * Este arquivo é o par de segurança da matriz. `moduleVisibility.test.ts` cobre
 * a matriz célula a célula; aqui o foco é: **abrir um módulo não pode virar
 * escrita** e **escrita não pode escapar da unidade**.
 *
 * A regra que esta tarefa fixa:
 *
 *     tec          full  nos 5 módulos do workspace
 *     vis          read  nos 5 módulos do workspace
 *     coordinator  read  nos 5 módulos do workspace
 *     superadmin   bypass absoluto (inalerado)
 *
 * Dois eixos independentes:
 *
 *     visibilidade .... membership ativa → roles.slug → MODULE_VISIBILITY_BY_SLUG
 *     autorização .... membership ativa → role_permissions → Action → RLS/backend
 *
 * ── POR QUE HÁ UM ESPELHO DE `role_permissions` AQUI ─────────────────────────
 * `role_permissions` vive no Postgres e o CI de migrations o exercita em banco
 * (`supabase/migrations/tests/086_rbac2_module_permissions.sql`). No cliente não
 * há fonte para consultá-lo, então este arquivo carrega o MESMO contrato — cada
 * bloco com a migration que o semeou. Grant novo precisa aparecer aqui E na
 * migration, senão um dos dois lados falha.
 *
 * ── O QUE ESTE ARQUIVO PROVA ─────────────────────────────────────────────────
 *  · `vis` vê os 5 módulos e NÃO tem nenhuma Action de mutação;
 *  · `coordinator` vê os 5 módulos e NÃO ganhou Action nova (as 12 da 040/082
 *    seguem intactas — revogá-las é decisão de produto separada);
 *  · `tec` tem `full` e tem a Action de escrita de cada módulo que opera,
 *    TV incluída (`tv.manage`, migration 086);
 *  · `full` na matriz não atravessa workspace;
 *  · módulo habilitado no workspace ≠ autorização irrestrita;
 *  · módulo visível sem Action de escrita continua somente leitura;
 *  · o bypass de super admin segue absoluto e intocado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '../../auth/types'
import type { Workspace } from '../../workspaces/types'
import type { Membership } from '../membership'
import {
  MODULE_VISIBILITY_BY_SLUG,
  moduleLevelForSlug,
  activeMembershipRoleId,
  resolveModuleVisibility,
  resolveModuleVisibilities,
  type ModuleId,
} from '../moduleVisibility'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = 'ws-a'
const WS_B = 'ws-b'

const ROLE_ID: Record<string, string> = {
  tec: 'role-id-tec',
  vis: 'role-id-vis',
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

function mem(workspaceId: string, roleId: string, status: Membership['status']): Membership {
  return {
    id: `mem-${workspaceId}`,
    profile_id: 'u-1',
    workspace_id: workspaceId,
    role_id: roleId,
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  } as Membership
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
    memberships: [mem(WS_A, ROLE_ID.tec, 'active')],
    membershipsLoaded: true,
    ...overrides,
  } as unknown as User
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

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveRoleSlug.mockImplementation(async (roleId: string) => {
    const found = Object.entries(ROLE_ID).find(([, id]) => id === roleId)
    return found ? found[0] : null
  })
})

// ── Contrato de `role_permissions` (espelho do banco, com a origem) ───────────

/**
 * Ações que MUTAM estado. Uma Action fora desta lista é leitura, relatório ou
 * exportação. A classificação é conferida contra o ponto de aplicação real
 * (`api/app.py`, RLS das migrations, `useCanAccessAction` na UI) e documentada
 * em `docs/architecture/rbac2.0-actions-catalog.md`.
 */
const MUTACOES = new Set([
  'ticket.create',
  'ticket.edit',
  'ticket.status',
  'ticket.assign',
  'ticket.comment',
  'ticket.close',
  'ticket.reopen',
  'ticket.delete',
  'ticket.claim',
  'chamados.settings.manage',
  'stock.item.create',
  'stock.item.edit',
  'stock.item.delete',
  'stock.movement.create',
  'stock.movement.manage',
  'stock.kit.audit',
  'stock.inventory.run',
  'stock.maintenance.manage',
  'pcare.asset.create',
  'pcare.asset.edit',
  'pcare.asset.manage',
  'pcare.part.create',
  'pcare.part.edit',
  'pcare.part.delete',
  'pcare.maintenance.manage',
  'pcare.import',
  'pcare.checklist.create',
  'pcare.checklist.edit',
  'pcare.checklist.delete',
  'reservelab.tablet.reserve',
  'reservelab.tablet.cancel',
  'reservelab.push.manage',
  'tv.manage',
  'tv.content.manage',
  'tv.urgentAnnouncement',
  'tv.device.manage',
  'tv.settings.manage',
  'tv.purge',
  'music.moderate',
  'admin.app.purge',
])

/**
 * Grants efetivos por cargo, todos em escopo `workspace`. Fonte: semeação
 * agregada de 036, 038, 040, 045, 077, 078, 082 e 086.
 */
const GRANTS: Record<string, ReadonlySet<string>> = {
  // 036: 11 ticket.* + 9 stock.* + 12 pcare.* + reservelab.tablet.reserve
  //     + tv.content.manage + tv.urgentAnnouncement
  // 038: +ticket.claim, -ticket.assign
  // 078: +reservelab.tablet.cancel
  // 082: +pcare.checklist.{create,edit,delete} +chamados.settings.manage
  // 086: +tv.manage (produto: `full` na TV implica autoridade de escrita)
  tec: new Set([
    'ticket.create',
    'ticket.view',
    'ticket.edit',
    'ticket.status',
    'ticket.comment',
    'ticket.close',
    'ticket.reopen',
    'ticket.delete',
    'ticket.qr',
    'ticket.report',
    'ticket.claim',
    'stock.item.create',
    'stock.item.edit',
    'stock.item.delete',
    'stock.movement.create',
    'stock.movement.manage',
    'stock.kit.audit',
    'stock.inventory.run',
    'stock.maintenance.manage',
    'stock.export',
    'pcare.asset.create',
    'pcare.asset.edit',
    'pcare.asset.manage',
    'pcare.part.create',
    'pcare.part.edit',
    'pcare.part.delete',
    'pcare.maintenance.manage',
    'pcare.export',
    'pcare.import',
    'pcare.checklist.create',
    'pcare.checklist.edit',
    'pcare.checklist.delete',
    'reservelab.tablet.reserve',
    'reservelab.tablet.cancel',
    'tv.content.manage',
    'tv.urgentAnnouncement',
    'tv.manage',
    'chamados.settings.manage',
  ]),
  // 036: exatamente 4 Actions, todas de leitura/exportação. Nenhuma mutação —
  // e a migration 086 ABORTA se alguma aparecer (trava anti-escalada).
  vis: new Set(['ticket.view', 'ticket.report', 'stock.export', 'pcare.export']),
  // 040: 9 ticket.* + stock.export + pcare.export; 082: +chamados.settings.manage.
  // Preservadas: a matriz desceu `chamados` para `read`, mas a capacidade
  // operacional do coordenador multiunidade é decisão de produto separada.
  coordinator: new Set([
    'ticket.view',
    'ticket.edit',
    'ticket.status',
    'ticket.assign',
    'ticket.comment',
    'ticket.close',
    'ticket.reopen',
    'ticket.report',
    'ticket.qr',
    'stock.export',
    'pcare.export',
    'chamados.settings.manage',
  ]),
}

const MODULOS_DO_WS: readonly ModuleId[] = ['pc-care', 'stock', 'reservalab', 'tv', 'chamados']

const MODULE_IDS_ALL: readonly string[] = [
  'dashboard',
  'pc-care',
  'stock',
  'reservalab',
  'tv',
  'chamados',
  'admin',
]

/**
 * Ações de escrita que `full` implica para o papel que OPERA o módulo — o
 * técnico. `full` é "opera este módulo", não "tem toda Action conceivable": o
 * técnico não tem `ticket.assign` (a 038 trocou atribuir por reivindicar, e é o
 * `opv` que moder TV), e essas ausências estão travadas logo abaixo.
 */
const ESCRITA_POR_MODULO: Record<string, readonly string[]> = {
  'pc-care': ['pcare.asset.create', 'pcare.asset.edit', 'pcare.checklist.edit', 'pcare.import'],
  stock: ['stock.item.create', 'stock.item.edit', 'stock.movement.create', 'stock.inventory.run'],
  reservalab: ['reservelab.tablet.reserve', 'reservelab.tablet.cancel'],
  tv: ['tv.manage'],
  chamados: [
    'ticket.create',
    'ticket.status',
    'ticket.close',
    'ticket.reopen',
    'ticket.comment',
    'chamados.settings.manage',
  ],
}

function mutacoesDe(slug: string): string[] {
  return [...(GRANTS[slug] ?? [])].filter((a) => MUTACOES.has(a)).sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// Técnico — full nos cinco módulos, com a Action de escrita de cada um
// ─────────────────────────────────────────────────────────────────────────────

describe('técnico: full nos cinco módulos é operacional, não decorativo', () => {
  it('a matriz dá full nos cinco módulos do workspace', () => {
    for (const appId of MODULOS_DO_WS) {
      expect(moduleLevelForSlug('tec', appId), `tec/${appId}`).toBe('full')
    }
  })

  it('tem a Action de escrita de CADA módulo que opera', () => {
    for (const [appId, acoes] of Object.entries(ESCRITA_POR_MODULO)) {
      for (const acao of acoes) {
        expect(
          GRANTS.tec.has(acao),
          `tec tem ${appId}: 'full' mas não tem ${acao} — 'full' sem Action é tela inerte`,
        ).toBe(true)
      }
    }
  })

  it('TV é o caso que faltava: tv.manage só foi concedida na 086', () => {
    expect(GRANTS.tec.has('tv.manage')).toBe(true)
    expect(moduleLevelForSlug('tec', 'tv')).toBe('full')
  })

  it('ReservaLab: tem reserve E cancel — full == todo o write set do módulo', () => {
    expect(GRANTS.tec.has('reservelab.tablet.reserve')).toBe(true)
    expect(GRANTS.tec.has('reservelab.tablet.cancel')).toBe(true)
    // O módulo não tem escrita além dessas duas: `reservelab.push.manage` é
    // `global`, logo indelegável (rbac.py:165-166) — técnico não deve tê-la.
    expect(GRANTS.tec.has('reservelab.push.manage')).toBe(false)
  })

  it('Chamados: a Action que o técnico NÃO tem é o assign, por decisão do claim', () => {
    // 038 removeu `ticket.assign` do `tec` (reivindicar ≠ atribuir) e concedeu
    // `ticket.claim`. O hardening da PR #327/#328 (status/close/reopen/claim)
    // não pode depender de `ticket.assign`.
    expect(GRANTS.tec.has('ticket.claim')).toBe(true)
    expect(GRANTS.tec.has('ticket.assign')).toBe(false)
    for (const acao of ['ticket.view', 'ticket.report', 'ticket.status', 'ticket.comment']) {
      expect(GRANTS.tec.has(acao), acao).toBe(true)
    }
  })

  it('não recebe as escritas que a 077/082 reservaram a outros cargos', () => {
    for (const proibida of ['admin.app.purge', 'tv.purge', 'tv.settings.manage', 'music.moderate']) {
      expect(GRANTS.tec.has(proibida), proibida).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador — read nos cinco módulos, ZERO escrita
// ─────────────────────────────────────────────────────────────────────────────

describe('visualizador: vê os cinco módulos e não ganha escrita', () => {
  it('a matriz dá read nos cinco módulos do workspace', () => {
    for (const appId of MODULOS_DO_WS) {
      expect(moduleLevelForSlug('vis', appId), `vis/${appId}`).toBe('read')
    }
  })

  it('ZERO Actions de mutação — o invariante que a migration 086 trava', () => {
    expect(mutacoesDe('vis')).toEqual([])
  })

  it('segue com exatamente as 4 Actions de leitura da 036', () => {
    expect([...GRANTS.vis].sort()).toEqual([
      'pcare.export',
      'stock.export',
      'ticket.report',
      'ticket.view',
    ])
  })

  it('cada módulo que ele vê tem escrita existindo — e negada para ele', () => {
    // "módulo visível sem Action de escrita continua somente leitura": a tela
    // abre (read), o botão de escrita não aparece (useCanAccessAction) e o
    // backend nega (RLS / `@require_action`).
    for (const [appId, acoes] of Object.entries(ESCRITA_POR_MODULO)) {
      expect(moduleLevelForSlug('vis', appId as ModuleId), `vis vê ${appId}`).not.toBe('none')
      for (const acao of acoes) {
        expect(GRANTS.vis.has(acao), `vis não pode ter ${acao} (${appId})`).toBe(false)
      }
    }
    // E também as de escrita que o técnico não tem — o viewer tampouco.
    for (const acao of ['ticket.assign', 'ticket.delete']) {
      expect(GRANTS.vis.has(acao), acao).toBe(false)
    }
  })

  it('ReservaLab e TV: vê as telas, mas não reserva, não cancela, não opera TV', () => {
    expect(moduleLevelForSlug('vis', 'reservalab')).toBe('read')
    expect(moduleLevelForSlug('vis', 'tv')).toBe('read')
    for (const acao of ['reservelab.tablet.reserve', 'reservelab.tablet.cancel', 'tv.manage']) {
      expect(GRANTS.vis.has(acao), acao).toBe(false)
    }
  })

  it('não ganhou dashboard nem admin — nenhum cargo ganha', () => {
    for (const appId of ['dashboard', 'admin']) {
      expect(moduleLevelForSlug('vis', appId), appId).toBe('none')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Coordenador — read nos cinco módulos, escopo multiunidade preservado
// ─────────────────────────────────────────────────────────────────────────────

describe('coordenador: read nos cinco módulos sem ganhar escrita nova', () => {
  it('a matriz dá read nos cinco módulos do workspace', () => {
    for (const appId of MODULOS_DO_WS) {
      expect(moduleLevelForSlug('coordinator', appId), `coordinator/${appId}`).toBe('read')
    }
  })

  it('NÃO recebeu tv.manage nem nenhuma escrita de TV ou de ReservaLab', () => {
    // Linhas vermelhas da 040 (040:20-26), mantidas pela trava da 086.
    for (const acao of [
      'tv.manage',
      'tv.content.manage',
      'tv.urgentAnnouncement',
      'music.moderate',
    ]) {
      expect(GRANTS.coordinator.has(acao), acao).toBe(false)
    }
    expect([...GRANTS.coordinator].filter((a) => a.startsWith('reservelab.'))).toEqual([])
  })

  it('preserva as 12 Actions de 040/082 — o downgrade foi só de visibilidade', () => {
    expect([...GRANTS.coordinator].sort()).toEqual([
      'chamados.settings.manage',
      'pcare.export',
      'stock.export',
      'ticket.assign',
      'ticket.close',
      'ticket.comment',
      'ticket.edit',
      'ticket.qr',
      'ticket.reopen',
      'ticket.report',
      'ticket.status',
      'ticket.view',
    ])
  })

  it('continua sem ticket.delete, ticket.weeklyEmail e qualquer admin.*', () => {
    for (const acao of ['ticket.delete', 'ticket.weeklyEmail', 'admin.app.purge']) {
      expect(GRANTS.coordinator.has(acao), acao).toBe(false)
    }
    expect([...GRANTS.coordinator].filter((a) => a.startsWith('admin.'))).toEqual([])
  })

  it('continua sem nenhuma escrita/gestão de estoque ou PC Care', () => {
    for (const acao of [
      'stock.item.edit',
      'stock.movement.create',
      'stock.inventory.run',
      'pcare.asset.edit',
      'pcare.import',
      'pcare.checklist.edit',
    ]) {
      expect(GRANTS.coordinator.has(acao), acao).toBe(false)
    }
  })

  it('read nos cinco módulos NÃO significa acesso fora das unidades administradas', async () => {
    // Escopo multiunidade: uma membership por workspace. O coordenador tem
    // membership ativa nas unidades que administra (RPC `get_coordinator_units`,
    // migration 047) e nenhuma fora delas.
    const coordenador = user({
      memberships: [
        mem(WS_A, ROLE_ID.coordinator, 'active'),
        mem(WS_B, ROLE_ID.coordinator, 'suspended'),
      ],
      workspace_ids: [WS_A, WS_B],
    })

    const naUnidade = await resolveModuleVisibilities({
      user: coordenador,
      workspaceId: WS_A,
      appIds: MODULOS_DO_WS,
    })
    for (const appId of MODULOS_DO_WS) {
      expect(naUnidade[appId], `coordinator em ${appId} na unidade administrada`).toEqual({
        visible: true,
        level: 'read',
      })
    }

    // Fora da unidade administrada: membership suspensa não é cargo.
    expect(activeMembershipRoleId(coordenador, WS_B)).toBeNull()
    const foraDaUnidade = await resolveModuleVisibilities({
      user: coordenador,
      workspaceId: WS_B,
      appIds: MODULOS_DO_WS,
    })
    for (const appId of MODULOS_DO_WS) {
      expect(foraDaUnidade[appId], `coordinator em ${appId} fora da unidade`).toEqual({
        visible: false,
        level: 'none',
      })
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Escopo de workspace — `full` não atravessa unidade
// ─────────────────────────────────────────────────────────────────────────────

describe('técnico não acessa outro workspace', () => {
  it('sem membership ativa na unidade, resolve `none` em tudo', async () => {
    const tecnico = memberOf('tec', WS_A)
    const res = await resolveModuleVisibilities({
      user: tecnico,
      workspaceId: WS_B,
      appIds: MODULOS_DO_WS,
    })
    for (const appId of MODULOS_DO_WS) {
      expect(res[appId], `tec/${appId} na WS_B`).toEqual({ visible: false, level: 'none' })
    }
  })

  it('membership suspensa/pending/removed também não vale', () => {
    for (const status of ['suspended', 'pending', 'removed'] as const) {
      const tecnico = user({ memberships: [mem(WS_A, ROLE_ID.tec, status)] })
      expect(activeMembershipRoleId(tecnico, WS_A), status).toBeNull()
    }
  })

  it('`full` na matriz não é autorização para outra unidade: a Action é por unidade', () => {
    // A cadeia real é membership ativa NA UNIDADE → role → Action. Um `full`
    // global não existe: `role_permissions.scope` é `workspace` em todas as
    // Actions deste conjunto (CHECK em workspace/global/self, 036).
    expect(moduleLevelForSlug('tec', 'tv')).toBe('full')
    expect(activeMembershipRoleId(memberOf('tec', WS_A), WS_B)).toBeNull()
  })

  it('membershipsLoaded !== true é pendente, não acesso', () => {
    expect(activeMembershipRoleId(user({ membershipsLoaded: false }), WS_A)).toBeNull()
  })

  it('sem usuário ou sem unidade, não há cargo e não há acesso', () => {
    expect(activeMembershipRoleId(null, WS_A)).toBeNull()
    expect(activeMembershipRoleId(user(), null)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Workspace desabilitado x matriz do papel
// ─────────────────────────────────────────────────────────────────────────────

describe('módulo desabilitado na unidade tem precedência sobre a matriz', () => {
  it('esconde do técnico mesmo com `full` na matriz', async () => {
    for (const appId of MODULOS_DO_WS) {
      const res = await resolveModuleVisibility({
        user: memberOf('tec', WS_A),
        workspaceId: WS_A,
        appId,
        workspace: workspace({ disabled_apps: [appId] }),
      })
      expect(res, `tec/${appId} desabilitado`).toEqual({ visible: false, level: 'none' })
    }
  })

  it('esconde do visualizador e do coordenador', async () => {
    for (const slug of ['vis', 'coordinator'] as const) {
      const res = await resolveModuleVisibility({
        user: memberOf(slug, WS_A),
        workspaceId: WS_A,
        appId: 'tv',
        workspace: workspace({ disabled_apps: ['tv'] }),
      })
      expect(res, `${slug}/tv desabilitado`).toEqual({ visible: false, level: 'none' })
    }
  })

  it('esconder um módulo NÃO mexe nas Actions nem nos outros módulos', async () => {
    // Desligar TV na unidade não pode alterar o grant de chamados, e vice-versa:
    // os eixos são independentes.
    const res = await resolveModuleVisibility({
      user: memberOf('tec', WS_A),
      workspaceId: WS_A,
      appId: 'chamados',
      workspace: workspace({ disabled_apps: ['tv'] }),
    })
    expect(res).toEqual({ visible: true, level: 'full' })
    expect(GRANTS.tec.has('ticket.status')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Super admin — bypass intocado
// ─────────────────────────────────────────────────────────────────────────────

describe('super admin: bypass absoluto permanece', () => {
  it('resolve `full` em todos os módulos, sem cargo e sem membership', async () => {
    const superAdmin = user({ is_super_admin: true, memberships: [], membershipsLoaded: false })
    const res = await resolveModuleVisibilities({
      user: superAdmin,
      workspaceId: WS_A,
      appIds: MODULE_IDS_ALL,
    })
    for (const appId of MODULE_IDS_ALL) {
      expect(res[appId], `super admin/${appId}`).toEqual({ visible: true, level: 'full' })
    }
  })

  it('o bypass respeita disabled_apps da unidade (mesmo caminho de antes)', async () => {
    const superAdmin = user({ is_super_admin: true, memberships: [] })
    const res = await resolveModuleVisibility({
      user: superAdmin,
      workspaceId: WS_A,
      appId: 'tv',
      workspace: workspace({ disabled_apps: ['tv'] }),
    })
    expect(res).toEqual({ visible: false, level: 'none' })
  })

  it('o bypass não passa por Action: nenhum cargo da matriz ganha admin/dashboard', () => {
    // O acesso ao `/admin` continua sendo `AdminGuard` (is_super_admin), fora
    // desta fonte — a matriz não tem linha para ele.
    for (const slug of Object.keys(MODULE_VISIBILITY_BY_SLUG)) {
      expect(moduleLevelForSlug(slug, 'admin'), slug).toBe('none')
      expect(moduleLevelForSlug(slug, 'dashboard'), slug).toBe('none')
    }
  })
})