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
  reserveEventUpsert: vi.fn(),
}))

import { CreateTvEventModal } from '../CreateTvEventModal'
import { fetchWorkspaceDevices, reserveEventUpsert } from '@/apps/tv/services/supabase'

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

const draft = {
  title: 'Aula de Matemática',
  description: 'Prof. X',
  reservationDate: '25/06/2026',
  reservationId: null,
  timeStartMinutes: 450,
  timeEndMinutes: 560,
}

describe('CreateTvEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    ;(reserveEventUpsert as any).mockResolvedValue({ event_id: 'evt-1', schedule_id: 'sch-1' })
  })

  it('avisa quando o campus não tem TV ativada', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    expect(await screen.findByText('Nenhuma TV ativada neste campus')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Programar evento' })).not.toBeInTheDocument()
  })

  it('permite selecionar múltiplas TVs (1..N) e envia os ids no RPC', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1'), makeDevice('d2', 'TV 2')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    await screen.findByText('TV 1')
    fireEvent.click(screen.getByText('TV 1'))
    fireEvent.click(screen.getByText('TV 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Programar evento' }))

    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: draft.title, targetDeviceIds: ['d1', 'd2'] }),
      )
    })
    expect(await screen.findByText(/Evento programado/)).toBeInTheDocument()
  })

  it('mantém sempre ao menos uma TV selecionada', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    // Com uma única TV ela já vem selecionada; clicar de novo não deve desmarcar.
    fireEvent.click(await screen.findByText('TV 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Programar evento' }))

    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ targetDeviceIds: ['d1'] }),
      )
    })
  })

  it('envia data da reserva em ISO e horário somente quando completo', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationDate: '2026-06-25',
          reservationId: null,
          timeStart: '07:30',
          timeEnd: '09:20',
        }),
      )
    })
  })

  it('envia horário null quando a reserva não declara horário', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    render(<CreateTvEventModal draft={{ ...draft, timeStartMinutes: null, timeEndMinutes: null }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ timeStart: null, timeEnd: null }),
      )
    })
  })

  it('adiciona datas adicionais (sem duplicatas, sem datas antes da reserva)', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    const { container } = render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    await screen.findByText('TV 1')
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.min).toBe('2026-06-25')

    // Duplicata bloqueada
    fireEvent.change(input, { target: { value: '2026-06-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(input, { target: { value: '2026-06-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByText('Esta data já foi adicionada.')).toBeInTheDocument()

    // Antes da reserva bloqueada
    fireEvent.change(input, { target: { value: '2026-06-24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByText(/anteriores à data da reserva/)).toBeInTheDocument()

    // Data válida entra na lista
    fireEvent.change(input, { target: { value: '2026-06-27' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByText('27/06/2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Programar evento' }))

    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ additionalDates: ['2026-06-26', '2026-06-27'] }),
      )
    })
  })

  it('remove data adicional ao clicar no X', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    const { container } = render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    await screen.findByText('TV 1')
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-06-27' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByText('27/06/2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remover 27/06/2026' }))
    expect(screen.queryByText('27/06/2026')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Programar evento' }))
    await waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(expect.objectContaining({ additionalDates: null }))
    })
  })

  it('mostra erro amigável quando o RPC falha, sem expor detalhes internos', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    ;(reserveEventUpsert as any).mockRejectedValue({ message: 'TV_WORKSPACE_FULL_REQUIRED' })
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    expect(await screen.findByText(/acesso completo/)).toBeInTheDocument()
    expect(screen.queryByText(/TV_WORKSPACE_FULL_REQUIRED/)).not.toBeInTheDocument()
  })

  it('mostra mensagem genérica para erro desconhecido', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1')])
    ;(reserveEventUpsert as any).mockRejectedValue({ message: 'column device_id does not exist' })
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    expect(await screen.findByText(/Não foi possível criar o evento na TV/)).toBeInTheDocument()
    expect(screen.queryByText(/column device_id/)).not.toBeInTheDocument()
  })

  it('desabilita o botão até escolher ao menos uma TV', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([makeDevice('d1', 'TV 1'), makeDevice('d2', 'TV 2')])
    render(<CreateTvEventModal draft={draft} onClose={vi.fn()} />)

    await screen.findByText('TV 1')
    const btn = screen.getByRole('button', { name: 'Programar evento' })
    // Nenhuma TV pré-selecionada quando há mais de uma
    expect(btn.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByText('TV 2'))
    expect(screen.getByRole('button', { name: 'Programar evento' }).hasAttribute('disabled')).toBe(false)
  })
})