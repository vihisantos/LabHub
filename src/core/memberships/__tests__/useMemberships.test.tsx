import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMemberships } from '../useMemberships'
import type { Membership } from '../types'

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../auth/AuthContext'

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>

function makeMembership(workspaceId: string, status: Membership['status'] = 'active'): Membership {
  return {
    id: `m-${workspaceId}`,
    profile_id: 'u-1',
    workspace_id: workspaceId,
    role_id: 'role-viewer',
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMemberships — estado de carregamento explícito', () => {
  it('antes de carregar (undefined/false) ⇒ membershipsLoaded=false — NENHUMA decisão', () => {
    mockUseAuth.mockReturnValue({ user: { memberships: undefined, membershipsLoaded: undefined } })
    const { result } = renderHook(() => useMemberships())

    expect(result.current.membershipsLoaded).toBe(false)
    expect(result.current.memberships).toBeUndefined()
  })

  it('sem usuário autenticado ⇒ não carregado, sem lista', () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useMemberships())

    expect(result.current.membershipsLoaded).toBe(false)
    expect(result.current.memberships).toBeUndefined()
  })

  it('carregado com memberships ⇒ lista (pode conter vária com status)', () => {
    mockUseAuth.mockReturnValue({
      user: { memberships: [makeMembership('ws-1'), makeMembership('ws-2', 'suspended')], membershipsLoaded: true },
    })
    const { result } = renderHook(() => useMemberships())

    expect(result.current.membershipsLoaded).toBe(true)
    expect(result.current.memberships?.map((m) => m.workspace_id)).toEqual(['ws-1', 'ws-2'])
  })

  it('carregado SEM memberships ⇒ [] (fail-closed), nunca cai em workspace_ids', () => {
    // workspace_ids preenchido, mas a fonte de autorização (memberships) está vazia.
    mockUseAuth.mockReturnValue({ user: { memberships: [], membershipsLoaded: true, workspace_ids: ['ws-legado'] } })
    const { result } = renderHook(() => useMemberships())

    expect(result.current.membershipsLoaded).toBe(true)
    expect(result.current.memberships).toEqual([])
  })
})