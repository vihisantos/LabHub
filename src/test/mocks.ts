import { clearCache } from '../lib/db'
import { authService } from '../core/auth/service'
import type { User } from '../core/auth/types'

vi.mock('../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({
    role: { id: 'test-role', name: 'Administrador', key: 'admin', appAccess: {} },
    getLevel: () => 'full',
    canAccessApp: () => true,
    isFullAccess: () => true,
    canManageQr: () => true,
  }),
}))

const adminUser = {
  id: 'test-admin',
  email: 'admin@test.local',
  name: 'Admin Teste',
  roleId: 'role-technician',
  status: 'active' as const,
  is_super_admin: true,
  workspace_ids: [],
  accent: 'blue' as const,
  theme_variant: 'dark' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as User

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

let authSpy: ReturnType<typeof vi.spyOn> | undefined

beforeEach(() => {
  clearCache()
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  authSpy = vi.spyOn(authService, 'getCurrentUser').mockReturnValue(adminUser)
})

afterEach(() => {
  vi.useRealTimers()
  authSpy?.mockRestore()
})
