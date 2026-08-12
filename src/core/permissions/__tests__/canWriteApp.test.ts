import { describe, it, expect, beforeEach } from 'vitest'
import { permissionService } from '../service'
import { authService } from '../../auth/service'
import type { User } from '../../auth/types'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'u@labhub.com',
    name: 'Usuário',
    roleId: 'role-viewer',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [],
    accent: 'emerald',
    theme_variant: 'dark',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function setCurrentUser(user: User | null) {
  vi.mocked(authService.getCurrentUser).mockReturnValue(user)
}

beforeEach(() => {
  localStorage.clear()
  permissionService.initDefaults()
})

describe('permissionService.canWriteApp', () => {
  it('sem usuário → bloqueado', () => {
    setCurrentUser(null)
    expect(permissionService.canWriteApp('stock')).toBe(false)
  })

  it('super admin → sempre permite', () => {
    setCurrentUser(makeUser({ roleId: 'role-viewer', is_super_admin: true }))
    expect(permissionService.canWriteApp('stock')).toBe(true)
    expect(permissionService.canWriteApp('reservalab')).toBe(true)
  })

  it('technician → escreve em apps com acesso full, não em read', () => {
    setCurrentUser(makeUser({ roleId: 'role-technician' }))
    expect(permissionService.canWriteApp('stock')).toBe(true)
    expect(permissionService.canWriteApp('pc-care')).toBe(true)
    expect(permissionService.canWriteApp('reservalab')).toBe(false)
  })

  it('viewer → somente leitura', () => {
    setCurrentUser(makeUser({ roleId: 'role-viewer' }))
    expect(permissionService.canWriteApp('stock')).toBe(false)
    expect(permissionService.canWriteApp('pc-care')).toBe(false)
    expect(permissionService.canWriteApp('chamados')).toBe(false)
  })

  it('valor legado (key) também resolve o cargo', () => {
    setCurrentUser(makeUser({ roleId: 'technician' }))
    expect(permissionService.canWriteApp('stock')).toBe(true)
  })

  it('override individual full → permite mesmo com cargo viewer', () => {
    setCurrentUser(makeUser({ roleId: 'role-viewer', app_access: { stock: 'full' } }))
    expect(permissionService.canWriteApp('stock')).toBe(true)
    expect(permissionService.canWriteApp('pc-care')).toBe(false)
  })

  it('override individual none → bloqueia mesmo com cargo full', () => {
    setCurrentUser(makeUser({ roleId: 'role-technician', app_access: { stock: 'none' } }))
    expect(permissionService.canWriteApp('stock')).toBe(false)
  })

  it('requireWrite lança erro para usuário sem escrita', () => {
    setCurrentUser(makeUser({ roleId: 'role-viewer' }))
    expect(() => permissionService.requireWrite('stock')).toThrow('somente leitura')
  })

  it('requireWrite não lança para super admin', () => {
    setCurrentUser(makeUser({ roleId: 'role-viewer', is_super_admin: true }))
    expect(() => permissionService.requireWrite('stock')).not.toThrow()
  })
})
