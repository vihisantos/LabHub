/**
 * RBAC 2.0 (#296 PR-4C) — `useLeadership()` resolve o cargo pela membership
 * ATIVA da unidade selecionada (`memberships.role_id → public.roles.slug`).
 *
 * Cobre o requisito de escopo por unidade: uma membership de liderança em A
 * NÃO pode aparecer enquanto a unidade corrente é B — nem por um tick.
 *
 * Os testes usam `await act(async () => {})` (padrão do repo) para dar flush nas
 * promises, pois o setup global liga `vi.useFakeTimers()` e `waitFor` não resolve.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const authState = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
}))
const workspaceState = vi.hoisted(() => ({ workspaceId: 'ws-a' as string | null }))
const roleSlug = vi.hoisted(() => ({ value: null as string | null }))

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}))

vi.mock('../../workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: workspaceState.workspaceId ? { id: workspaceState.workspaceId } : null,
  }),
}))

vi.mock('../../memberships/service', () => ({
  membershipService: {
    resolveRoleSlug: vi.fn(async () => roleSlug.value),
  },
}))

import { useLeadership } from '../useLeadership'
import { membershipService } from '../../memberships/service'

const membership = (workspace_id: string, role_id: string | null, status = 'active') => ({
  workspace_id,
  role_id,
  status,
})

const userWith = (memberships: unknown[], loaded = true) => ({
  id: 'u-1',
  memberships,
  membershipsLoaded: loaded,
})

const wrapper = ({ children }: { children: ReactNode }) => children

beforeEach(() => {
  vi.clearAllMocks()
  workspaceState.workspaceId = 'ws-a'
  authState.loading = false
  authState.user = null
  roleSlug.value = null
})

describe('useLeadership — cargo vem da membership ativa da unidade (PR-4C)', () => {
  it('lider na unidade ativa ⇒ liderança com area team', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider')])
    roleSlug.value = 'lider'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.slug).toBe('lider')
    expect(result.current.isLeadership).toBe(true)
    expect(result.current.area).toBe('team')
    expect(result.current.role?.name).toBe('Líder de unidade')
    expect(membershipService.resolveRoleSlug).toHaveBeenCalledWith('r-lider')
  })

  it('coordinator na unidade ativa ⇒ area coordination', async () => {
    authState.user = userWith([membership('ws-a', 'r-coord')])
    roleSlug.value = 'coordinator'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.area).toBe('coordination')
    expect(result.current.role?.name).toBe('Coordenador multiunidades')
  })

  it('slug desconhecido (tec) ⇒ sem liderança (fail-closed)', async () => {
    authState.user = userWith([membership('ws-a', 'r-tec')])
    roleSlug.value = 'tec'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.isLeadership).toBe(false)
    expect(result.current.slug).toBe('tec')
    expect(result.current.role).toBeUndefined()
    expect(result.current.level).toBe(0)
  })

  it('membership de OUTRA unidade é ignorada (resolveRoleSlug nem é chamado)', async () => {
    authState.user = userWith([membership('ws-b', 'r-lider')])
    roleSlug.value = 'lider'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.isLeadership).toBe(false)
    expect(membershipService.resolveRoleSlug).not.toHaveBeenCalled()
  })

  it('membership suspensa não concede liderança', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider', 'suspended')])
    roleSlug.value = 'lider'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.isLeadership).toBe(false)
    expect(membershipService.resolveRoleSlug).not.toHaveBeenCalled()
  })

  it('membershipsLoaded !== true ⇒ loading, sem cargo (fail-closed)', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider')], false)

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(true)
    expect(result.current.isLeadership).toBe(false)
    expect(result.current.slug).toBeNull()
    // Memberships não carregadas não são consultadas: nada é decidido.
    expect(membershipService.resolveRoleSlug).not.toHaveBeenCalled()
  })

  it('erro em resolveRoleSlug ⇒ sem liderança (fail-closed)', async () => {
    vi.mocked(membershipService.resolveRoleSlug).mockRejectedValueOnce(new Error('offline'))
    authState.user = userWith([membership('ws-a', 'r-lider')])

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.isLeadership).toBe(false)
    expect(result.current.slug).toBeNull()
  })

  it('sem usuário ⇒ sem liderança, sem loading eterno', async () => {
    authState.user = null

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.isLeadership).toBe(false)
    expect(result.current.role).toBeUndefined()
  })

  it('API pública preservada: user/role/isLeadership/level/area + slug/loading', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider')])
    roleSlug.value = 'lider'

    const { result } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})

    expect(Object.keys(result.current).sort()).toEqual(
      ['area', 'isLeadership', 'level', 'loading', 'role', 'slug', 'user'].sort(),
    )
    expect(result.current.user?.id).toBe('u-1')
    expect(result.current.level).toBeGreaterThan(0)
  })

  it('TROCA DE UNIDADE: liderança de A não aparece enquanto B carrega', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider'), membership('ws-b', 'r-tec')])
    roleSlug.value = 'lider'

    const { result, rerender } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})
    expect(result.current.isLeadership).toBe(true)
    expect(result.current.slug).toBe('lider')

    // A consulta de B fica pendente, para inspecionar o frame intermediário.
    let releaseB: (v: string | null) => void = () => {}
    vi.mocked(membershipService.resolveRoleSlug).mockImplementationOnce(
      () => new Promise<string | null>((r) => { releaseB = r }),
    )
    roleSlug.value = 'tec'
    workspaceState.workspaceId = 'ws-b'

    // Rerender SINCRÔNICO: roda o efeito, mas a promise de B não resolveu.
    rerender()
    expect(membershipService.resolveRoleSlug).toHaveBeenCalledWith('r-tec')

    // Frame intermediário: nada de liderança residual de A, nem por um tick.
    expect(result.current.slug).toBeNull()
    expect(result.current.isLeadership).toBe(false)
    expect(result.current.role).toBeUndefined()
    expect(result.current.loading).toBe(true)

    // Resolve: o cargo de B é que vale — e B não é liderança.
    await act(async () => { releaseB('tec') })
    expect(result.current.loading).toBe(false)
    expect(result.current.slug).toBe('tec')
    expect(result.current.isLeadership).toBe(false)
  })

  it('troca de usuário também invalida o cargo anterior', async () => {
    authState.user = userWith([membership('ws-a', 'r-lider')])
    roleSlug.value = 'lider'

    const { result, rerender } = renderHook(() => useLeadership(), { wrapper })
    await act(async () => {})
    expect(result.current.isLeadership).toBe(true)

    let releaseNew: (v: string | null) => void = () => {}
    vi.mocked(membershipService.resolveRoleSlug).mockImplementationOnce(
      () => new Promise<string | null>((r) => { releaseNew = r }),
    )
    authState.user = { ...userWith([membership('ws-a', 'r-tec')]), id: 'u-2' }

    rerender()
    expect(result.current.slug).toBeNull()
    expect(result.current.isLeadership).toBe(false)

    await act(async () => { releaseNew(null) })
    expect(result.current.loading).toBe(false)
    expect(result.current.isLeadership).toBe(false)
  })
})
