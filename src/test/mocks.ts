import { clearCache } from '../lib/db'
import { authService } from '../core/auth/service'
import type { User } from '../core/auth/types'

vi.mock('../core/permissions/usePermissions', () => ({
  // F2-D-N2: o hook `useAppAccess` (e seus getters `getLevel`/`canAccessApp`/
  // `isFullAccess`) foi REMOVIDO junto com a cadeia legada de `appAccess`. Só
  // o gate RBAC2 por Action permanece.
  //
  // RBAC 2.0 (#296 PR-4C): gate por Action. Default = concedido, para não
  // trancar as telas de escrita nos testes que não exercitam autorização.
  // Testes de autorização sobrescrevem via `mockUseCanAccessAction`.
  useCanAccessAction: () => ({ allowed: true, loading: false }),
}))

vi.mock('../core/workspaces/store', () => ({
  workspaceStore: {
    get activeWorkspaceId() { return null },
    get isAdmin() { return true },
    get userWorkspaceIds() { return [] as string[] },
    filter: <T,>(rows: T[]) => rows,
    matches: () => true,
    set: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
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

/**
 * Define o usuário da sessão para o teste.
 *
 * Precisa ser reexportado porque vários testes chamam `vi.restoreAllMocks()` no
 * `beforeEach` — e isso derruba o spy de `getCurrentUser` instalado aqui. Sem
 * sessão, a cache namespaced da #344 não tem chave, e todo teste de Chamados
 * passa a ler `[]` (ou a lançar `NoCacheIdentityError`) por um motivo que não
 * tem nada a ver com o que está sendo testado.
 */
export function setTestUser(over: Partial<User> | null = {}) {
  authSpy = vi.spyOn(authService, 'getCurrentUser').mockReturnValue(
    over === null ? null : ({ ...adminUser, ...over } as User),
  )
  return authSpy
}

beforeEach(() => {
  clearCache()
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  setTestUser()
})

afterEach(() => {
  vi.useRealTimers()
  authSpy?.mockRestore()
})
