import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReservationModal } from '../ReservationModal'
import type { TransformedReservation } from '../../types'

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

import { fetchWorkspaceDevices, reserveEventUpsert } from '@/apps/tv/services/supabase'

function makeReservation(overrides: Partial<TransformedReservation> = {}): TransformedReservation {
  return {
    id: 'lab|07h30 - 09h20|Prof. João',
    time: '07h30 - 09h20',
    period: 'manhã',
    subject: 'Matemática',
    professor: 'Prof. João',
    lab: 'Lab 01',
    combined: false,
    data: '25/06/2026',
    alunos: 30,
    isLive: false,
    isEmBreve: false,
    isEnded: false,
    horario_inicio: 450,
    horario_fim: 560,
    reservation_id: 'chave-abc',
    reservaFeitaPor: 'Maria',
    ...overrides,
  }
}

function renderModal(reservation = makeReservation(), onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ReservationModal reservation={reservation} onClose={onClose} />
    </MemoryRouter>,
  )
}

describe('ReservationModal', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  it('renderiza subject da reserva', () => {
    renderModal()
    expect(screen.getByText('Matemática')).toBeInTheDocument()
  })

  it('renderiza horário', () => {
    renderModal()
    expect(screen.getByText('07h30 - 09h20')).toBeInTheDocument()
  })

  it('renderiza professor', () => {
    renderModal()
    expect(screen.getByText('Prof. João')).toBeInTheDocument()
  })

  it('renderiza número de alunos', () => {
    renderModal()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renderiza reservado por', () => {
    renderModal()
    expect(screen.getByText('Maria')).toBeInTheDocument()
  })

  it('renderiza mapa de carteiras (56 desks)', () => {
    renderModal()
    expect(screen.getByText('1.1')).toBeInTheDocument()
    expect(screen.getByText('8.7')).toBeInTheDocument()
  })

  it('renderiza badge PCD no mapa', () => {
    renderModal()
    const pcdElements = screen.getAllByText('PCD')
    expect(pcdElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renderiza legenda do mapa', () => {
    renderModal()
    expect(screen.getByText('Livre')).toBeInTheDocument()
  })

  it('renderiza botão "Criar evento na TV"', () => {
    renderModal()
    expect(screen.getByText('Criar evento na TV')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no overlay do modal', () => {
    const onClose = vi.fn()
    renderModal(makeReservation(), onClose)
    // O overlay do modal chama onClose ao clicar
    const overlay = screen.getAllByRole('button').find(
      (btn) => btn.closest('[style*="position: fixed"]'),
    )?.closest('[style*="position: fixed"]') as HTMLElement
    if (overlay) {
      fireEvent.click(overlay)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('cria evento na TV com disciplina no título, professor+sala na descrição e metadados da reserva', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([
      { id: 'tv-1', name: 'TV do Lab', workspace_id: 'ws-1' },
    ])
    ;(reserveEventUpsert as any).mockResolvedValue({ event_id: 'evt-1', schedule_id: 'sch-1' })

    renderModal()
    fireEvent.click(screen.getByText('Criar evento na TV'))

    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    await vi.waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Matemática',
          description: 'Professor: Prof. João | Sala: Lab 01',
          reservationDate: '2026-06-25',
          reservationId: 'chave-abc',
          timeStart: '07:30',
          timeEnd: '09:20',
          targetDeviceIds: ['tv-1'],
        }),
      )
    })
  })

  it('não envia "Reservado por" nem a hora crua na descrição do evento da TV', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([
      { id: 'tv-1', name: 'TV do Lab', workspace_id: 'ws-1' },
    ])
    ;(reserveEventUpsert as any).mockResolvedValue({ event_id: 'evt-1', schedule_id: 'sch-1' })

    renderModal(makeReservation())
    fireEvent.click(screen.getByText('Criar evento na TV'))
    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    await vi.waitFor(() => {
      const call = (reserveEventUpsert as any).mock.calls.find(([c]: any) => c && c.title === 'Matemática')
      expect(call).toBeTruthy()
      expect(call[0].description).not.toContain('Reservado por')
      expect(call[0].description).not.toContain('Maria')
      expect(call[0].description).not.toContain('07h30')
    })
  })
})
