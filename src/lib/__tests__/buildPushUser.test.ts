import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPushUser } from '../buildPushUser'
import type { User } from '../../core/auth/types'
import type { Membership } from '../../core/permissions/membership'

/**
 * F2-D-N1 — `buildPushUser.user.apps`.
 *
 * O objetivo é provar que o payload de push NÃO carrega mais a cadeia legada
 * (`User.app_access` → `resolveAppAccess` → `Role.appAccess`) e que o campo
 * `apps`, agora vazio por decisão, não decide nada.
 *
 * O mock de `permissionService` abaixo é proposital: se `buildPushUser` voltar a
 * chamar `resolveAppAccess`/`getRoleForUser`, o mock LANÇA e o teste quebra. É
 * um detector, não um arranjo.
 */
const mockResolveAppAccess = vi.fn(() => {
  throw new Error('buildPushUser NÃO pode chamar resolveAppAccess (F2-D-N1)')
})
const mockGetRoleForUser = vi.fn(() => {
  throw new Error('buildPushUser NÃO pode chamar getRoleForUser (F2-D-N1)')
})

vi.mock('../../core/permissions/service', () => ({
  permissionService: {
    getRoleForUser: mockGetRoleForUser,
    resolveAppAccess: mockResolveAppAccess,
  },
}))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
    roleId: 'role-technician',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [],
    memberships: [],
    membershipsLoaded: true,
    accent: 'blue',
    theme_variant: 'dark',
    created_at: '',
    updated_at: '',
    ...overrides,
  } as User
}

function membership(ws: string, status: Membership['status'] = 'active'): Membership {
  return {
    id: `m-${ws}`,
    profile_id: 'u-1',
    workspace_id: ws,
    role_id: 'r-a',
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildPushUser — não depende da fonte legada (F2-D-N1 §6)', () => {
  it('não chama resolveAppAccess nem getRoleForUser', () => {
    buildPushUser(makeUser())
    expect(mockResolveAppAccess).not.toHaveBeenCalled()
    expect(mockGetRoleForUser).not.toHaveBeenCalled()
  })

  it('apps sai vazio, sem níveis e sem override', () => {
    // Um usuário que no legado teria 'full' em tudo continua enviando {}.
    const payload = buildPushUser(
      makeUser({
        app_access: { chamados: 'full', reservalab: 'full', stock: 'full' },
      } as Partial<User>),
    )
    expect(payload.apps).toEqual({})
  })

  it('alterar User.app_access não muda o payload', () => {
    const sem = buildPushUser(makeUser())
    const comFull = buildPushUser(
      makeUser({ app_access: { chamados: 'full' } } as Partial<User>),
    )
    const comNone = buildPushUser(
      makeUser({ app_access: { chamados: 'none' } } as Partial<User>),
    )
    // Nenhuma chave do payload pode depender do override individual.
    expect(comFull.apps).toEqual(sem.apps)
    expect(comNone.apps).toEqual(sem.apps)
  })

  it('alterar Role.appAccess (o cargo local) não muda o payload', () => {
    // `roleId` é o que a função recebe; o cargo local nunca é consultado, logo
    // dois cargos com appAccess diferente produzem exatamente o mesmo payload.
    const comoTecnico = buildPushUser(makeUser({ roleId: 'role-technician' }))
    const comoVisualizador = buildPushUser(makeUser({ roleId: 'role-viewer' }))
    expect(comoVisualizador.apps).toEqual(comoTecnico.apps)
    expect(mockGetRoleForUser).not.toHaveBeenCalled()
  })

  it('super admin também recebe apps vazio (nada é concedido por aí)', () => {
    const payload = buildPushUser(makeUser({ is_super_admin: true }))
    expect(payload.apps).toEqual({})
    // O campo separado continua presente — quem decide super admin é o servidor.
    expect(payload.is_super_admin).toBe(true)
  })
})

describe('buildPushUser — campos funcionais preservados (F2-D-N1 §6)', () => {
  it('mantém id, name, role, is_super_admin, workspace_ids e notify_settings', () => {
    const payload = buildPushUser(
      makeUser({
        name: 'Ana',
        roleId: 'role-lider',
        is_super_admin: true,
        memberships: [membership('ws-1')],
        membershipsLoaded: true,
        notify_settings: { muted: true, apps: { stock: { inapp: true, push: false } } },
      } as Partial<User>),
    )
    expect(payload.id).toBe('u-1')
    expect(payload.name).toBe('Ana')
    expect(payload.role).toBe('role-lider')
    expect(payload.is_super_admin).toBe(true)
    expect(payload.workspace_ids).toEqual(['ws-1'])
    expect(payload.notify_settings).toEqual({
      muted: true,
      apps: { stock: { inapp: true, push: false } },
    })
  })

  it('a chave `apps` continua presente (contrato e diagnóstico preservados)', () => {
    // A remoção é do VALOR, não da chave: a tela de diagnóstico de inscrições
    // continua renderizando o campo, agora vazio.
    const payload = buildPushUser(makeUser())
    expect(Object.prototype.hasOwnProperty.call(payload, 'apps')).toBe(true)
    expect(payload.apps).toEqual({})
  })

  it('não inventa Actions nem consulta RLS para montar o payload', () => {
    // O módulo do payload não importa nada além de tipos e de `assignedWorkspaceIds`:
    // sem membershipService.can, sem useCanAccessAction, sem supabase. Comentários
    // são removidos antes do casamento — a prova é sobre CÓDIGO, não prosa.
    const fonte = require('fs')
      .readFileSync(require('path').resolve(__dirname, '../buildPushUser.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(fonte).not.toMatch(/useCanAccessAction/)
    expect(fonte).not.toMatch(/\.can\(/)
    expect(fonte).not.toMatch(/supabase/)
    // E a única dependência de dados é a de workspaces (memberships ativas).
    expect(fonte).toMatch(/assignedWorkspaceIds/)
  })
})

describe('buildPushUser — workspace_ids derivado de memberships (compat de payload)', () => {
  it('usa memberships ativas, nunca a coluna legada', () => {
    const payload = buildPushUser(
      makeUser({
        workspace_ids: ['ws-legado'],
        memberships: [membership('ws-1'), membership('ws-2')],
        membershipsLoaded: true,
      }),
    )
    expect(payload.workspace_ids?.sort()).toEqual(['ws-1', 'ws-2'])
  })

  it('suspensas/removidas ficam de fora (fail-closed)', () => {
    const payload = buildPushUser(
      makeUser({
        memberships: [membership('ws-1'), { ...membership('ws-2'), status: 'suspended' }],
        membershipsLoaded: true,
      }),
    )
    expect(payload.workspace_ids).toEqual(['ws-1'])
  })

  it('não carregado ⇒ [] (nunca legado)', () => {
    const payload = buildPushUser(
      makeUser({ memberships: undefined, membershipsLoaded: false, workspace_ids: ['ws-legado'] }),
    )
    expect(payload.workspace_ids).toEqual([])
  })
})
