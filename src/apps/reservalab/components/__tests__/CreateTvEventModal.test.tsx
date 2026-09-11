import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TvDevice } from '@/apps/tv/types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

vi.mock('@/core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-1', name: 'Campus A', slug: 'campus-a' } }),
}))

vi.mock('@/apps/tv/services/supabase', () => ({
  fetchWorkspaceDevices: vi.fn(),
  createEvent: vi.fn(),
}))

import { CreateTvEventModal } from '../CreateTvEventModal'
import { fetchWorkspaceDevices, createEvent } from '@/apps/tv/services/supabase'

function makeDevice(id: string, name: string): TvDevice {
  return {
    id,
    name,
    workspace_id: 'ws-1',
    user_id: null,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

const draft = { title: 'Aula de Matemática', description: 'Prof. X', startDate: null, endDate: null }

describe('CreateTvEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    ;(createEvent as any).mockResolvedValue(undefined)
  })

  it('avisa quando o campus não tem TV ativada', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    expect(await screen.findByText('Nenhuma TV ativada neste campus')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar evento' })).not.toBeInTheDocument()
  })

  it('pergunta qual TV quando há mais de uma e grava o device escolhido', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1'), makeDevice('d2', 'TV 2')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    const tv2 = await screen.findByText('TV 2')
    fireEvent.click(tv2)
    fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }))

    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: draft.title, device_id: 'd2', is_active: true }),
      )
    })
    expect(await screen.findByText('Evento criado na TV TV 2')).toBeInTheDocument()
  })

  it('seleciona automaticamente quando há apenas uma TV', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    const btn = await screen.findByRole('button', { name: 'Criar evento' })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ device_id: 'd1' }))
    })
  })
})
