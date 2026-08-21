import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../../chamados/types'

const mockGetById = vi.hoisted(() => vi.fn())
const mockGetByIdRemote = vi.hoisted(() => vi.fn())
const mockSubmitFeedback = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: {
    getById: mockGetById,
    getByIdRemote: mockGetByIdRemote,
    submitFeedback: mockSubmitFeedback,
    getAll: vi.fn().mockReturnValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    addEvent: vi.fn(),
  },
}))

vi.mock('../../../../lib/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => {},
}))

import { TicketSuccess } from '../TicketSuccess'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Sala 101',
    assetName: 'PC-01',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    resolvedAt: null,
    ...overrides,
  }
}

function renderSuccess() {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/track" element={<div>acompanhar</div>} />
      <Route path="/chamados-publico/ticket/:ticketId" element={<TicketSuccess />} />
    </Routes>,
    { initialEntries: ['/chamados-publico/ticket/t-1'] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('default'),
  })
  mockGetByIdRemote.mockResolvedValue(makeTicket())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TicketSuccess', () => {
  it('chamado não encontrado mostra erro', async () => {
    mockGetById.mockReturnValue(null)
    mockGetByIdRemote.mockRejectedValue(new Error('não encontrado'))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('mostra os dados do chamado aberto', async () => {
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('PC-01')).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.getByText('Atualiza automaticamente')).toBeInTheDocument()
    expect(screen.getByText('Acompanhar e avaliar depois')).toBeInTheDocument()
  })

  it('atualiza o status ao vivo pelo polling', async () => {
    mockGetById.mockReturnValue(makeTicket())
    mockGetByIdRemote.mockResolvedValue(
      makeTicket({ status: 'em_atendimento', statusNote: 'Técnico a caminho' }),
    )
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText('Técnico a caminho')).toBeInTheDocument()
  })

  it('indica ausência de conexão quando o polling falha', async () => {
    mockGetById.mockReturnValue(makeTicket())
    mockGetByIdRemote.mockRejectedValue(new Error('offline'))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Sem conexão — tenta de novo automaticamente')).toBeInTheDocument()
  })

  it('mostra conclusão para chamado resolvido', async () => {
    mockGetById.mockReturnValue(
      makeTicket({ status: 'resolvido', resolvedAt: '2026-06-25T12:00:00Z' }),
    )
    mockGetByIdRemote.mockResolvedValue(makeTicket({ status: 'resolvido', resolvedAt: '2026-06-25T12:00:00Z' }))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Seu chamado foi concluído. Obrigado!')).toBeInTheDocument()
  })

  it('(A) Notification indisponível — renderiza sem crash', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Notification', undefined)
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('(B) Notification disponível — renderiza normalmente', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('(C) PushManager indisponível — seção de push não aparece, sem exceção', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Notification', { permission: 'default' })
    const originalPushManager = window.PushManager
    delete (window as unknown as Record<string, unknown>).PushManager
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.queryByText('Ativar notificações')).not.toBeInTheDocument()
    expect(screen.queryByText('Receba um aviso quando o status mudar')).not.toBeInTheDocument()

    if (originalPushManager) {
      ;(window as unknown as Record<string, unknown>).PushManager = originalPushManager
    }
  })

  it('(D) localStorage indisponível — renderiza sem crash', async () => {
    const getItemSpy = vi.fn(() => { throw new SecurityError('localStorage blocked') })
    const setItemSpy = vi.fn(() => { throw new SecurityError('localStorage blocked') })
    vi.stubGlobal('localStorage', { getItem: getItemSpy, setItem: setItemSpy })
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('(E) Permission denied — renderiza e mostra seção de push com texto de bloqueio', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    })
    ;(window as unknown as Record<string, unknown>).PushManager = class {}
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: vi.fn() },
      configurable: true,
    })
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('Notificações bloqueadas no navegador. Libere o acesso para receber avisos do status.')).toBeInTheDocument()

    delete (window as unknown as Record<string, unknown>).PushManager
  })

  it('(F) Service Worker register falha — componente continua renderizando', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    ;(window as unknown as Record<string, unknown>).PushManager = class {}
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockRejectedValue(new Error('SW registration failed')),
      },
      configurable: true,
    })
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('Ativar notificações')).toBeInTheDocument()

    delete (window as unknown as Record<string, unknown>).PushManager
  })

  it('(G) PushManager.subscribe falha — componente continua renderizando', async () => {
    const fakePushManager = {
      subscribe: vi.fn().mockRejectedValue(new Error('subscribe failed')),
    }
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    ;(window as unknown as Record<string, unknown>).PushManager = class {}
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({ pushManager: fakePushManager }),
      },
      configurable: true,
    })
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()

    delete (window as unknown as Record<string, unknown>).PushManager
  })

  it('(H) Navegação pós-criação funciona — botão de acompanhar está visível', async () => {
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Acompanhar e avaliar depois')).toBeInTheDocument()
  })

  it('(I) Polling e realtime atualizam o status', async () => {
    mockGetById.mockReturnValue(makeTicket())
    mockGetByIdRemote.mockResolvedValue(
      makeTicket({ status: 'em_atendimento', statusNote: 'Técnico chegou' }),
    )
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText('Técnico chegou')).toBeInTheDocument()
  })
})
