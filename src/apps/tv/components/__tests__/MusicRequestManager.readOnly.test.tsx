import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StationError } from '../../services/stationService'

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  playNext: vi.fn(),
  addToast: vi.fn(),
  pendingRequest: {
    id: 'req-1',
    youtube_url: 'https://www.youtube.com/watch?v=abc123',
    youtube_video_id: 'abc123',
    title: 'Música do Lab',
    requested_by: 'u-aluno',
    requested_by_name: 'Aluno Teste',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    workspace_id: 'ws-1',
    created_at: '2026-01-01T00:00:00Z',
  } as const,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-current', roleId: 'role-coord', is_super_admin: false } }),
}))

vi.mock('../../contexts/MusicPlayerCommandContext', () => ({
  useMusicPlayerCommand: () => ({ playNext: mocks.playNext }),
}))

vi.mock('../../hooks/useMusicRequests', () => ({
  useMusicRequests: () => ({
    requests: [mocks.pendingRequest],
    pending: [mocks.pendingRequest],
    loading: false,
    approve: mocks.approve,
    reject: mocks.reject,
  }),
}))

vi.mock('../../../../lib/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))

import { MusicRequestManager } from '../MusicRequestManager'

describe('MusicRequestManager readOnly (RBAC TV — nível `read`)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('READ: mantém consulta, SEM ação mutável (sem "Ouvir agora"/Aprovar/Recusar)', () => {
    render(<MusicRequestManager readOnly />)

    expect(screen.getByText('Música do Lab')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ouvir agora/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Recusar/ })).not.toBeInTheDocument()
  })

  it('FULL: exibe "Ouvir agora" (PLAY NOW) e Aprovar/Recusar', () => {
    render(<MusicRequestManager />)

    expect(screen.getByRole('button', { name: /Ouvir agora/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprovar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recusar/ })).toBeInTheDocument()
  })

  it('FULL: "Ouvir agora" envia o comando PLAY NOW (station_track_change via playNext) e gera toast de sucesso', async () => {
    vi.useRealTimers()
    mocks.playNext.mockImplementation(() => Promise.resolve(undefined))
    render(<MusicRequestManager />)

    fireEvent.click(screen.getByRole('button', { name: /Ouvir agora/ }))

    await waitFor(() => {
      expect(mocks.playNext).toHaveBeenCalledWith({
        id: 'req-1',
        queue_id: '',
        youtube_video_id: 'abc123',
        title: 'Música do Lab',
        duration_seconds: 0,
        position: 0,
        created_at: '2026-01-01T00:00:00Z',
      })
    })
    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalledWith('success', expect.stringContaining('display'))
    })
    expect(mocks.playNext).toHaveBeenCalledTimes(1)
  })

  it('FULL: erro da estação gera toast de erro (StationError)', async () => {
    vi.useRealTimers()
    mocks.playNext.mockImplementation(() => Promise.reject(new StationError('RPC_ERROR', 'Falha na estação')))
    render(<MusicRequestManager />)

    fireEvent.click(screen.getByRole('button', { name: /Ouvir agora/ }))

    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalledWith('error', 'Falha na estação')
    })
    expect(mocks.playNext).toHaveBeenCalledTimes(1)
  })
})