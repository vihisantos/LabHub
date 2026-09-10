import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTeam } from '../useTeam'
import { getLeaderTeam, getLastTeamServiceError } from '../teamService'
import { workspaceStore } from '../../workspaces/store'

vi.mock('../teamService', () => ({
  getLeaderTeam: vi.fn(),
  getLastTeamServiceError: vi.fn(),
}))

const storeImpl = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const state = { id: null as string | null }
  return { listeners, state }
})

vi.mock('../../workspaces/store', () => ({
  workspaceStore: {
    get activeWorkspaceId() {
      return storeImpl.state.id
    },
    get isAdmin() {
      return false
    },
    get userWorkspaceIds() {
      return storeImpl.state.id ? [storeImpl.state.id] : []
    },
    filter: <T,>(rows: T[]) => rows,
    matches: () => true,
    set(workspace: { id: string } | null) {
      storeImpl.state.id = workspace?.id ?? null
      storeImpl.listeners.forEach((onChange) => onChange())
    },
    subscribe(onChange: () => void) {
      storeImpl.listeners.add(onChange)
      return () => {
        storeImpl.listeners.delete(onChange)
      }
    },
  },
}))

const mockedGetTeam = vi.mocked(getLeaderTeam)
const mockedError = vi.mocked(getLastTeamServiceError)

function workspace(id: string, name: string) {
  return {
    id,
    name,
    slug: '',
    location: '',
    spreadsheet_url: '',
    color: '',
    disabled_apps: [],
    created_at: '',
    updated_at: '',
  }
}

const ws1 = workspace('ws1', 'Campus A')
const ws2 = workspace('ws2', 'Campus B')

function member(id: string): import('../membership').TeamMember {
  return {
    membership: {
      id: `membership-${id}`,
      profile_id: `u-${id}`,
      workspace_id: 'ws1',
      role_id: 'role-x',
      status: 'active',
      managed_by: 'm-lider',
      created_at: '',
      updated_at: '',
    },
    profile: null,
  } as import('../membership').TeamMember
}

beforeEach(() => {
  storeImpl.state.id = null
  storeImpl.listeners.clear()
  vi.clearAllMocks()
})

describe('useTeam — equipe do líder no workspace ativo (fail-closed)', () => {
  it('sem workspace ativo → equipe vazia, sem erro', async () => {
    const { result } = renderHook(() => useTeam())
    await act(async () => {})
    expect(result.current.loading).toBe(false)
    expect(result.current.team).toEqual([])
    expect(result.current.failed).toBe(false)
    expect(mockedGetTeam).not.toHaveBeenCalled()
  })

  it('carrega a equipe do workspace ativo', async () => {
    act(() => workspaceStore.set(ws1, false, ['ws1']))
    mockedGetTeam.mockResolvedValue([member('1'), member('2')])
    mockedError.mockReturnValue(null)

    const { result } = renderHook(() => useTeam())
    await act(async () => {})

    expect(mockedGetTeam).toHaveBeenCalledWith('ws1')
    expect(result.current.team).toHaveLength(2)
    expect(result.current.failed).toBe(false)
    expect(result.current.loading).toBe(false)
    expect(result.current.workspaceId).toBe('ws1')
  })

  it('erro no servidor → failed=true (vazio legítimo não é erro)', async () => {
    act(() => workspaceStore.set(ws1, false, ['ws1']))
    mockedGetTeam.mockResolvedValue([])
    mockedError.mockReturnValue('RPC negou')

    const { result } = renderHook(() => useTeam())
    await act(async () => {})
    expect(result.current.failed).toBe(true)
  })

  it('vazio legítimo → failed=false (estado vazio honesto)', async () => {
    act(() => workspaceStore.set(ws1, false, ['ws1']))
    mockedGetTeam.mockResolvedValue([])
    mockedError.mockReturnValue(null)

    const { result } = renderHook(() => useTeam())
    await act(async () => {})
    expect(result.current.failed).toBe(false)
  })

  it('trocar de workspace na sessão re-consulta a equipe do novo escopo', async () => {
    act(() => workspaceStore.set(ws1, false, ['ws1']))
    mockedGetTeam.mockResolvedValue([])
    mockedError.mockReturnValue(null)

    const { result } = renderHook(() => useTeam())
    await act(async () => {})

    act(() => workspaceStore.set(ws2, false, ['ws1', 'ws2']))
    await act(async () => {})

    expect(mockedGetTeam).toHaveBeenLastCalledWith('ws2')
    expect(result.current.workspaceId).toBe('ws2')
  })
})