import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_ROLES, resolveRoleId } from '../types'
import { permissionService } from '../service'
import { authService } from '../../auth/service'

function coordinatorRole() {
  return DEFAULT_ROLES.find((r) => r.id === 'role-coordinator')!
}

function viewerRole() {
  return DEFAULT_ROLES.find((r) => r.id === 'role-viewer')!
}

function plainUser(): { is_super_admin?: boolean; app_access?: undefined } {
  return { is_super_admin: false }
}

describe('Cargo Coordenador Multiunidade (role-coordinator)', () => {
  let spy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    spy?.mockRestore()
  })

  function as(user: { roleId: string; is_super_admin: boolean }) {
    spy = vi.spyOn(authService, 'getCurrentUser').mockReturnValue(user as never)
  }

  it('existe nos DEFAULT_ROLES com appAccess coerente e não é default', () => {
    const role = coordinatorRole()
    expect(role).toBeDefined()
    expect(role.key).toBe('coordinator')
    expect(role.isDefault).toBe(false)
    expect(role.manageQr).toBe(true)
    expect(role.appAccess).toMatchObject({
      chamados: 'full',
      stock: 'read',
      'pc-care': 'read',
      tv: 'read',
    })
    // Nada além do escopo operacional: sem reservalab, sem dashboard, sem admin.
    expect(role.appAccess.reservalab).toBeUndefined()
    expect(role.appAccess.dashboard).toBeUndefined()
    expect(role.appAccess.admin).toBeUndefined()
    // O default de registro continua sendo o Visualizador (regressão).
    expect(DEFAULT_ROLES.find((r) => r.isDefault)?.id).toBe('role-viewer')
  })

  it('resolveRoleId aceita coordinator novo e legado sem quebrar regressões', () => {
    expect(resolveRoleId('coordinator')).toBe('role-coordinator')
    expect(resolveRoleId('role-coordinator')).toBe('role-coordinator')
    expect(resolveRoleId('technician')).toBe('role-technician')
    expect(resolveRoleId('viewer')).toBe('role-viewer')
    expect(resolveRoleId('admin')).toBe('role-technician') // legado preservado
    expect(resolveRoleId(null)).toBe('role-viewer')
  })

  it('migrate() semeia o cargo novo em instalações existentes (idempotente)', () => {
    permissionService.initDefaults()
    // Simula instalação que ainda não conhecia o cargo.
    permissionService.remove('role-coordinator')
    expect(permissionService.getById('role-coordinator')).toBeUndefined()

    permissionService.migrate()
    expect(permissionService.getById('role-coordinator')).toBeDefined()
    expect(permissionService.getById('role-coordinator')?.name).toBe('Coordenador Multiunidade')

    permissionService.migrate()
    expect(permissionService.getAll()).toHaveLength(3)
  })

  it('resolveAppAccess: coordenador lê/apps de operação e full em chamados', () => {
    const role = coordinatorRole()
    const user = plainUser()
    expect(permissionService.resolveAppAccess(role, user, 'chamados')).toBe('full')
    expect(permissionService.resolveAppAccess(role, user, 'stock')).toBe('read')
    expect(permissionService.resolveAppAccess(role, user, 'pc-care')).toBe('read')
    expect(permissionService.resolveAppAccess(role, user, 'tv')).toBe('read')
    // Sem acesso fora do escopo (fail-closed: ausente = sem app).
    expect(permissionService.resolveAppAccess(role, user, 'reservalab')).toBeNull()
    expect(permissionService.resolveAppAccess(role, user, 'admin')).toBeNull()
  })

  it('override app_access=none vence (fail-closed) e read vence o full do cargo', () => {
    const role = coordinatorRole()
    // Bloqueio individual explícito sobrepõe o cargo.
    expect(
      permissionService.resolveAppAccess(role, { app_access: { chamados: 'none' } }, 'chamados'),
    ).toBeNull()
    expect(permissionService.canAccessApp(role, { app_access: { chamados: 'none' } }, 'chamados')).toBe(false)
    // Override read limita o full do cargo.
    expect(
      permissionService.resolveAppAccess(role, { app_access: { chamados: 'read' } }, 'chamados'),
    ).toBe('read')
  })

  it('canManageQr: coordenador e super admin; visualizador não', () => {
    expect(permissionService.canManageQr(coordinatorRole(), plainUser())).toBe(true)
    expect(permissionService.canManageQr(viewerRole(), plainUser())).toBe(false)
    expect(permissionService.canManageQr(viewerRole(), { is_super_admin: true })).toBe(true)
  })

  it('canWriteApp: separa Super Admin (bypass) do coordenador', () => {
    as({ roleId: 'role-viewer', is_super_admin: true })
    permissionService.initDefaults()
    // Super admin escreve mesmo sendo viewer.
    expect(permissionService.canWriteApp('chamados')).toBe(true)
    expect(permissionService.canWriteApp('stock')).toBe(true)

    as({ roleId: 'role-coordinator', is_super_admin: false })
    // Coordenador: full em chamados, read (sem escrita) em stock/pc-care/tv.
    expect(permissionService.canWriteApp('chamados')).toBe(true)
    expect(permissionService.canWriteApp('stock')).toBe(false)
    expect(permissionService.canWriteApp('pc-care')).toBe(false)
    expect(permissionService.canWriteApp('tv')).toBe(false)
  })

  it('regressão: técnico (full) e visualizador (read) inalterados', () => {
    const tech = DEFAULT_ROLES.find((r) => r.key === 'technician')!
    const view = viewerRole()
    const user = plainUser()
    expect(permissionService.resolveAppAccess(tech, user, 'chamados')).toBe('full')
    expect(permissionService.resolveAppAccess(tech, user, 'stock')).toBe('full')
    expect(permissionService.resolveAppAccess(view, user, 'chamados')).toBe('read')
    expect(permissionService.resolveAppAccess(view, user, 'stock')).toBe('read')

    permissionService.initDefaults()
    as({ roleId: 'role-technician', is_super_admin: false })
    expect(permissionService.canWriteApp('chamados')).toBe(true)
    as({ roleId: 'role-viewer', is_super_admin: false })
    expect(permissionService.canWriteApp('chamados')).toBe(false)
  })
})