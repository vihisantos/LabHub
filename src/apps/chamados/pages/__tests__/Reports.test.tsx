import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockGetReports = vi.hoisted(() => vi.fn())
const mockUser = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

const REPORT = vi.hoisted(() => ({
  total: 3,
  period: { from: '2026-05-26T12:00:00Z', to: '2026-06-25T12:00:00Z' },
  byStatus: { aberto: 1, resolvido: 2 },
  byPriority: { normal: 3 },
  byCategory: { Internet: 2, Projetor: 1 },
  byArea: { academica: 3 },
  byRoom: [['Sala 101', 2], ['Lab 2', 1]],
  byTechnician: [
    {
      name: 'Técnico A',
      open: 1,
      resolved: 2,
      total: 3,
      avgResolutionHours: 4.5,
      rating: 4.8,
      ratingCount: 2,
    },
  ],
  tickets: [
    {
      id: 'ticket-23',
      ticketNumber: 23,
      status: 'aberto',
      category: 'Internet',
      area: 'academica',
      roomName: 'Sala 101',
      technician: 'Técnico A',
      createdAt: '2026-06-20T12:00:00Z',
      resolvedAt: null,
      rating: null,
      comment: '',
      resolutionMinutes: null,
      serviceMinutes: 18,
      timeToAssignedMinutes: 12,
    },
  ],
  avgResolutionHours: 4.5,
  feedback: { count: 2, average: 4.8 },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))
// O Reports importa useAuth de core/auth/useAuth (não de AuthContext).
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser.current }),
}))
vi.mock('../../services/ticketService', () => ({
  ticketService: { getReports: mockGetReports },
}))
vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-a', name: 'Anhembi Piracicaba' } }),
}))

import { Reports } from '../Reports'

describe('Reports — relatório de chamados', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetReports.mockResolvedValue(REPORT)
    mockUser.current = { id: 'u-1', name: 'Vitor', email: 'vitor@labhub.app' }
  })

  it('carrega e exibe as métricas do período', async () => {
    render(<Reports />)
    await act(async () => {})

    expect(screen.getByText(/Anhembi Piracicaba/)).toBeInTheDocument()
    expect(screen.getByText(/Chamados no período/)).toBeInTheDocument()
    expect(screen.getAllByText(/4h 30min \(270 min\)/).length).toBeGreaterThan(0)
    expect(screen.getByText('Tempo médio de resolução')).toBeInTheDocument()
    expect(screen.getAllByText('Técnico A').length).toBeGreaterThan(0)
    expect(screen.getByText(/2 avaliações/)).toBeInTheDocument()
  })

  it('envia o período selecionado para o servidor', async () => {
    render(<Reports />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await act(async () => {})

    const calls = mockGetReports.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const last = calls[calls.length - 1][0]
    expect(last.from).toContain('2026-06-18')
    expect(last.workspace_id).toBe('ws-a')
  })

  it('combina filtros de técnico, status e categoria na consulta', async () => {
    render(<Reports />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.change(screen.getByLabelText('Técnico'), { target: { value: 'Técnico A' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolvido' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Internet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await act(async () => {})

    const last = mockGetReports.mock.calls.at(-1)?.[0]
    expect(last).toMatchObject({ technician: 'Técnico A', status: 'resolvido', category: 'Internet', workspace_id: 'ws-a' })
  })

  it('abre os chamados filtrados em um diálogo de detalhes', async () => {
    render(<Reports />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Ver Internet (2)' }))

    expect(screen.getByRole('dialog', { name: 'Chamados de Internet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /#23 · Internet · Sala 101/ })).toBeInTheDocument()
    expect(screen.getByText('12 min')).toBeInTheDocument()
    expect(screen.getByText('18 min')).toBeInTheDocument()
  })
})

describe('Reports — envio por email desativado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetReports.mockResolvedValue(REPORT)
  })

  it('informa que o envio está pausado e explica que o relatório não foi enviado', async () => {
    mockUser.current = { id: 'u-1', name: 'Vitor', email: 'vitor@labhub.app' }
    render(<Reports />)
    await act(async () => {})

    expect(screen.getByText('O envio por e-mail está temporariamente desativado.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar relatório semanal' }))
    expect(screen.getByText('Envio desativado no momento')).toBeInTheDocument()
    expect(screen.getByText(/O relatório não foi enviado/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('email@exemplo.com')).not.toBeInTheDocument()
  })
})

