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
    expect(screen.getAllByText('4.5h').length).toBeGreaterThan(0)
    expect(screen.getByText('Tempo médio de resolução')).toBeInTheDocument()
    expect(screen.getByText('Técnico A')).toBeInTheDocument()
    expect(screen.getByText(/2 avaliações/)).toBeInTheDocument()
  })

  it('envia o período selecionado para o servidor', async () => {
    render(<Reports />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: '7 dias' }))
    await act(async () => {})

    const calls = mockGetReports.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const last = calls[calls.length - 1][0]
    expect(last.from).toContain('2026-06-18')
    expect(last.workspace_id).toBe('ws-a')
  })
})

describe('Reports — destinatário do resumo por email', () => {
  function campoEmail(): HTMLInputElement {
    return screen.getByPlaceholderText('email@exemplo.com') as HTMLInputElement
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetReports.mockResolvedValue(REPORT)
  })

  it('usa o e-mail institucional quando existe', async () => {
    mockUser.current = {
      id: 'u-1',
      name: 'Vitor',
      email: 'vitor@labhub.app',
      institutionalEmail: 'vitor@univ.edu',
    }
    render(<Reports />)
    await act(async () => {})

    fireEvent.focus(campoEmail())
    expect(campoEmail().value).toBe('vitor@univ.edu')
  })

  it('cai no e-mail da conta quando não há institucional', async () => {
    mockUser.current = { id: 'u-1', name: 'Vitor', email: 'vitor@labhub.app' }
    render(<Reports />)
    await act(async () => {})

    fireEvent.focus(campoEmail())
    expect(campoEmail().value).toBe('vitor@labhub.app')
  })

  it('ignora institucional vazio, em vez de pré-preencher ""', async () => {
    mockUser.current = {
      id: 'u-1',
      name: 'Vitor',
      email: 'vitor@labhub.app',
      institutionalEmail: '   ',
    }
    render(<Reports />)
    await act(async () => {})

    fireEvent.focus(campoEmail())
    expect(campoEmail().value).toBe('vitor@labhub.app')
  })

  it('não sobrescreve o que a pessoa já digitou', async () => {
    mockUser.current = {
      id: 'u-1',
      name: 'Vitor',
      email: 'vitor@labhub.app',
      institutionalEmail: 'vitor@univ.edu',
    }
    render(<Reports />)
    await act(async () => {})

    fireEvent.change(campoEmail(), { target: { value: 'coorte@univ.edu' } })
    fireEvent.focus(campoEmail())
    expect(campoEmail().value).toBe('coorte@univ.edu')
  })
})
