import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkspaceFilter } from '../useWorkspaceFilter'

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../WorkspaceContext', () => ({
  useWorkspace: vi.fn(),
}))

import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../WorkspaceContext'
import type { User } from '../../auth/types'
import type { Workspace } from '../types'

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>
const mockUseWorkspace = useWorkspace as ReturnType<typeof vi.fn>

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
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

function makeWorkspace(id: string): Workspace {
  return {
    id,
    name: id,
    slug: id,
    location: '',
    spreadsheet_url: '',
    color: '',
    disabled_apps: [],
    created_at: '',
    updated_at: '',
  }
}

const ITEMS = [
  { id: 'a', workspace_id: 'ws-1' },
  { id: 'b', workspace_id: 'ws-2' },
  { id: 'c', workspace_id: undefined },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useWorkspaceFilter — visibilidade por workspace do usuário', () => {
  it('usuário sem workspaces atribuídos vê nada (zero trust)', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: [] }) })
    mockUseWorkspace.mockReturnValue({ workspace: null })

    const { result } = renderHook(() => useWorkspaceFilter())

    expect(result.current.filterByWorkspace(ITEMS)).toHaveLength(0)
    expect(result.current.matchesWorkspace({ workspace_id: 'ws-1' })).toBe(false)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.activeWorkspaceId).toBeNull()
  })

  it('usuário com workspace_ids filtrado pelos seus workspaces (sem workspace ativo)', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: ['ws-1'] }) })
    mockUseWorkspace.mockReturnValue({ workspace: null })

    const { result } = renderHook(() => useWorkspaceFilter())

    const filtered = result.current.filterByWorkspace(ITEMS)
    // vê apenas itens do ws-1; itens sem workspace_id NÃO passam
    expect(filtered.map((i) => i.id)).toEqual(['a'])
    expect(result.current.matchesWorkspace({ workspace_id: 'ws-2' })).toBe(false)
    expect(result.current.matchesWorkspace({ workspace_id: undefined })).toBe(false)
  })

  it('usuário com workspace ativo vê apenas o do workspace ativo', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: ['ws-1', 'ws-2'] }) })
    mockUseWorkspace.mockReturnValue({ workspace: makeWorkspace('ws-2') })

    const { result } = renderHook(() => useWorkspaceFilter())

    const filtered = result.current.filterByWorkspace(ITEMS)
    // vê apenas itens do ws-2; sem workspace_id NÃO passa
    expect(filtered.map((i) => i.id)).toEqual(['b'])
    expect(result.current.activeWorkspaceId).toBe('ws-2')
    expect(result.current.matchesWorkspace({ workspace_id: 'ws-1' })).toBe(false)
  })

  it('super admin sem workspace ativo vê tudo', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true, workspace_ids: [] }) })
    mockUseWorkspace.mockReturnValue({ workspace: null })

    const { result } = renderHook(() => useWorkspaceFilter())

    expect(result.current.filterByWorkspace(ITEMS)).toHaveLength(3)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.matchesWorkspace({ workspace_id: 'ws-2' })).toBe(true)
  })

  it('super admin com workspace ativo vê só o workspace ativo', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true, workspace_ids: [] }) })
    mockUseWorkspace.mockReturnValue({ workspace: makeWorkspace('ws-1') })

    const { result } = renderHook(() => useWorkspaceFilter())

    const filtered = result.current.filterByWorkspace(ITEMS)
    // vê apenas itens do ws-1; sem workspace_id NÃO passa
    expect(filtered.map((i) => i.id)).toEqual(['a'])
    expect(result.current.matchesWorkspace({ workspace_id: 'ws-2' })).toBe(false)
    expect(result.current.matchesWorkspace({ workspace_id: undefined })).toBe(false)
  })
})
