import { describe, it, expect, beforeEach } from 'vitest'
import { permissionService } from '../service'

describe('permissionService.canManageQr', () => {
  beforeEach(() => {
    localStorage.clear()
    permissionService.initDefaults()
  })

  it('sem usuário → bloqueado', () => {
    expect(permissionService.canManageQr(undefined, null)).toBe(false)
    expect(permissionService.canManageQr(undefined, undefined)).toBe(false)
  })

  it('super admin → sempre permite, independente do cargo', () => {
    const role = permissionService.getRoleForUser('role-viewer')
    expect(permissionService.canManageQr(role, { is_super_admin: true })).toBe(true)
    expect(permissionService.canManageQr(undefined, { is_super_admin: true })).toBe(true)
  })

  it('técnico (manageQr true) → permite mesmo sem is_super_admin', () => {
    const role = permissionService.getRoleForUser('role-technician')
    expect(role?.manageQr).toBe(true)
    expect(permissionService.canManageQr(role, { is_super_admin: false })).toBe(true)
  })

  it('visualizador (manageQr false) → bloqueado', () => {
    const role = permissionService.getRoleForUser('role-viewer')
    expect(role?.manageQr).toBe(false)
    expect(permissionService.canManageQr(role, { is_super_admin: false })).toBe(false)
  })

  it('cargo sem a flag definida → bloqueado', () => {
    expect(permissionService.canManageQr({ id: 'x' } as any, { is_super_admin: false })).toBe(false)
  })

  it('migração preenche manageQr para cargos existentes sem a flag', () => {
    localStorage.clear()
    permissionService.initDefaults()

    const legacyFull = permissionService.create({
      name: 'Legado Full',
      description: '',
      appAccess: { chamados: 'full' },
      isDefault: false,
    })
    const legacyRead = permissionService.create({
      name: 'Legado Read',
      description: '',
      appAccess: { chamados: 'read' },
      isDefault: false,
    })
    expect(legacyFull.manageQr).toBeUndefined()

    permissionService.migrate()

    expect(permissionService.getById(legacyFull.id)?.manageQr).toBe(true)
    expect(permissionService.getById(legacyRead.id)?.manageQr).toBe(false)
  })
})
