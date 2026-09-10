import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_ROLES, LeadershipLevel, resolveRoleId, type Role } from '../types'
import { permissionService } from '../service'
import {
  isLeadershipRole,
  leadershipLevelOf,
  leadershipLabelOf,
  leadershipAreaOf,
  isHigherLeadership,
} from '../leadership'

function roleWith(def: ReturnType<typeof defaultRole>, overrides: Partial<Role> = {}): Role {
  return { ...def, ...overrides }
}

function defaultRole(id: string): Role {
  return DEFAULT_ROLES.find((r) => r.id === id)!
}

describe('Cargo Líder (role-lider) e classificação de liderança (Fase 4/5 RBAC 2.0)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('existe nos DEFAULT_ROLES como liderança de nível 1, sem ser default', () => {
    const lider = defaultRole('role-lider')
    expect(lider).toBeDefined()
    expect(lider.key).toBe('lider')
    expect(lider.isDefault).toBe(false)
    expect(lider.isLeadership).toBe(true)
    expect(lider.leadershipLevel).toBe(LeadershipLevel.Leader)
    expect(lider.appAccess).toMatchObject({
      chamados: 'full',
      stock: 'read',
      'pc-care': 'read',
    })
    // Escopo de unidade: sem tv (mult. unidades), sem dashboard/admin/reservalab.
    expect(lider.appAccess.tv).toBeUndefined()
    expect(lider.appAccess.dashboard).toBeUndefined()
    expect(lider.appAccess.admin).toBeUndefined()
    expect(lider.appAccess.reservalab).toBeUndefined()
  })

  it('classifica cada cargo canônico (técnico/visualizador executantes; líder/coordenador lideranças)', () => {
    const tech = defaultRole('role-technician')
    const view = defaultRole('role-viewer')
    const lider = defaultRole('role-lider')
    const coord = defaultRole('role-coordinator')

    expect(isLeadershipRole(tech)).toBe(false)
    expect(isLeadershipRole(view)).toBe(false)
    expect(isLeadershipRole(lider)).toBe(true)
    expect(isLeadershipRole(coord)).toBe(true)

    expect(leadershipLevelOf(view)).toBe(LeadershipLevel.None)
    expect(leadershipLevelOf(lider)).toBe(LeadershipLevel.Leader)
    expect(leadershipLevelOf(coord)).toBe(LeadershipLevel.Coordinator)
  })

  it('helpers de liderança: labels e áreas por cargo', () => {
    const lider = defaultRole('role-lider')
    const coord = defaultRole('role-coordinator')
    const view = defaultRole('role-viewer')

    expect(leadershipLabelOf(lider)).toBe('Líder de unidade')
    expect(leadershipLabelOf(coord)).toBe('Coordenador multiunidades')
    expect(leadershipLabelOf(view)).toBeNull()
    expect(leadershipLabelOf(undefined)).toBeNull()

    expect(leadershipAreaOf(coord)).toBe('coordination')
    expect(leadershipAreaOf(lider)).toBe('team')
    expect(leadershipAreaOf(view)).toBeNull()
    expect(leadershipAreaOf({ ...coord, key: undefined })).toBeNull()
    expect(leadershipAreaOf({ ...lider, key: 'custom' })).toBeNull()
    expect(leadershipAreaOf(null)).toBeNull()
  })

  it('hierarquia: coordenador > líder > executante', () => {
    const lider = defaultRole('role-lider')
    const coord = defaultRole('role-coordinator')
    const tech = defaultRole('role-technician')

    expect(isHigherLeadership(coord, lider)).toBe(true)
    expect(isHigherLeadership(lider, tech)).toBe(true)
    expect(isHigherLeadership(lider, coord)).toBe(false)
    expect(isHigherLeadership(tech, lider)).toBe(false)
  })

  it('cargo de liderança sem nível definido em campo não conta como não-liderança (flag é a fonte)', () => {
    const odd = roleWith(defaultRole('role-viewer'), { isLeadership: undefined, leadershipLevel: undefined })
    expect(isLeadershipRole(odd)).toBe(false)
    const half = roleWith(defaultRole('role-lider'), { isLeadership: true, leadershipLevel: undefined })
    expect(isLeadershipRole(half)).toBe(true)
    expect(leadershipLevelOf(half)).toBe(LeadershipLevel.None)
  })

  it('migrate() semeia o cargo Líder em instalações que não o conheciam (idempotente)', () => {
    permissionService.initDefaults()
    expect(permissionService.getById('role-lider')).toBeDefined()

    permissionService.remove('role-lider')
    expect(permissionService.getById('role-lider')).toBeUndefined()

    permissionService.migrate()
    expect(permissionService.getById('role-lider')?.name).toBe('Líder')
    permissionService.migrate()
    expect(permissionService.getAll()).toHaveLength(4)
  })

  it('migrate() faz backfill de isLeadership/leadershipLevel em cargos antigos', () => {
    permissionService.initDefaults()
    // Cargo canônico "antigo" (sem classificação de liderança) é recuperado.
    permissionService.update('role-coordinator', {
      isLeadership: undefined,
      leadershipLevel: undefined,
    }) as unknown
    expect(permissionService.getById('role-coordinator')?.isLeadership).toBeUndefined()

    permissionService.migrate()
    const coord = permissionService.getById('role-coordinator')!
    expect(coord.isLeadership).toBe(true)
    expect(coord.leadershipLevel).toBe(LeadershipLevel.Coordinator)

    // Cargo customizado sem classificação vira executante (fail-closed).
    const custom = permissionService.create({
      name: 'Estagiário',
      description: 'Cargo personalizado',
      appAccess: { chamados: 'read' },
      isDefault: false,
    })
    permissionService.migrate()
    const migrated = permissionService.getById(custom.id)!
    expect(migrated.isLeadership).toBe(false)
    expect(migrated.leadershipLevel).toBe(LeadershipLevel.None)
  })

  it('resolveRoleId mapeia "lider" legado para o cargo canônico', () => {
    expect(resolveRoleId('lider')).toBe('role-lider')
  })

  it('ordenado por hierarquia serve de fonte única para a UI (labels consistentes)', () => {
    const coord = defaultRole('role-coordinator')
    const lider = defaultRole('role-lider')
    const tech = defaultRole('role-technician')
    const sorted = [tech, lider, coord].sort((a, b) => (leadershipLevelOf(a) - leadershipLevelOf(b)) || a.name.localeCompare(b.name))
    expect(sorted.map((r) => r.id)).toEqual(['role-technician', 'role-lider', 'role-coordinator'])
  })
})