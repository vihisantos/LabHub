import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { mockUseModuleLevel, mockNavigate } = vi.hoisted(() => ({
  mockUseModuleLevel: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/core/permissions/useModuleVisibility', () => ({
  useModuleLevel: (...args: unknown[]) => mockUseModuleLevel(...args),
}))

vi.mock('@/core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-1', name: 'Campus A', slug: 'campus-a' } }),
}))

vi.mock('@/apps/reservalab/hooks/useUpcomingReservations', () => ({
  useUpcomingReservations: () => ({
    labReservas: [{ label: 'Lab 01', horario: '07h30 às 09h20', responsavel: 'Prof. X' }],
    tabletReservas: [],
  }),
}))

import { UpcomingReservationPopup } from '../UpcomingReservationPopup'

describe('UpcomingReservationPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 10))
  })

  it('mostra o pop-up para quem tem acesso full ao ReservaLab', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'full', visible: true, loading: false })
    render(<UpcomingReservationPopup />)

    expect(screen.getByRole('dialog', { name: 'Reserva chegando' })).toBeInTheDocument()
    expect(screen.getByText('Reserva chegando em 20 min')).toBeInTheDocument()
  })

  it('não mostra para quem não tem acesso full', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'read', visible: true, loading: false })
    render(<UpcomingReservationPopup />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Ver reservas" navega para o ReservaLab', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'full', visible: true, loading: false })
    render(<UpcomingReservationPopup />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver reservas' }))
    expect(mockNavigate).toHaveBeenCalledWith('/reservalab')
  })

  it('"Dispensar" fecha o pop-up', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'full', visible: true, loading: false })
    render(<UpcomingReservationPopup />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
