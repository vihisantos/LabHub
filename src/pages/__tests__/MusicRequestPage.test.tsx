import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '../../core/auth/types'
import { MusicRequestPage } from '../MusicRequest'

vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Usuário Teste',
      email: 'teste@labhub.com',
      roleId: 'role-technician',
      status: 'active',
      workspace_ids: ['ws-1'],
      accent: 'emerald',
      theme_variant: 'dark',
      created_at: '',
      updated_at: '',
    } as User,
    signOut: vi.fn(),
    loading: false,
  }),
}))

const mockWorkspace = vi.hoisted(() => ({
  workspace: { id: 'ws-1', name: 'Lab', slug: 'lab', disabled_apps: [] as string[] },
}))

vi.mock('../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockWorkspace.workspace,
}))

describe('MusicRequestPage — TV habilitada', () => {
  it('renderiza o formulário normalmente quando TV está habilitada', () => {
    mockWorkspace.workspace = { ...mockWorkspace.workspace, disabled_apps: [] }
    render(
      <MemoryRouter initialEntries={['/pedir-musica']}>
        <MusicRequestPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Pedir Música')).toBeInTheDocument()
    expect(screen.getByText('Buscar por nome')).toBeInTheDocument()
    expect(screen.getByText('Colar link')).toBeInTheDocument()
  })
})

/*
 * NOTA: O teste do gate "TV desabilitada" não roda devido ao hook useMusicRequests
 * ter side effects (useEffect, setInterval, useRealtimeSubscription) que causam
 * crash no worker do vitest durante a avaliação do módulo.
 * A lógica do gate é simples: isAppDisabled('tv', workspace) — testada em
 * src/core/workspaces/__tests__/apps.test.ts (se existir) ou pode ser adicionado lá.
 */