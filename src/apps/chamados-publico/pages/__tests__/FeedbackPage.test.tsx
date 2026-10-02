import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../../chamados/types'

const mockGetByToken = vi.hoisted(() => vi.fn())
const mockGetByIdNoFilter = vi.hoisted(() => vi.fn())
const mockSubmitFeedback = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: { getByIdNoFilter: mockGetByIdNoFilter },
}))

vi.mock('../../../chamados/services/publicTicketService', () => ({
  publicTicketService: {
    getByToken: mockGetByToken,
    submitFeedback: mockSubmitFeedback,
  },
  toTicket: (p: Ticket) => p,
  // O mock precisa reexportar a classe de erro real: o FeedbackPage decide
  // entre "avaliação já enviada" e "falha" por `instanceof` + status 409.
  PublicTicketRequestError: class PublicTicketRequestError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'PublicTicketRequestError'
      this.status = status
    }
  },
}))

import { FeedbackPage } from '../FeedbackPage'
// Importada do modulo MOCKADO: e a classe que o FeedbackPage usa no
// `instanceof` para separar 409 (ja avaliado) de falha de rede.
import { PublicTicketRequestError } from '../../../chamados/services/publicTicketService'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 5,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'resolvido',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    resolvedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

function renderFeedback(token = 'tok') {
  window.history.replaceState({}, '', `/chamados-publico/feedback/t-1?token=${token}`)
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/feedback/:ticketId" element={<FeedbackPage />} />
    </Routes>,
    { initialEntries: [`/chamados-publico/feedback/t-1?token=${token}`] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Garante um estado limpo entre os testes (evita token/cache de outro teste)
  try {
    localStorage.removeItem(`chamado_token_t-1`)
  } catch {
    /* localStorage indisponível */
  }
})

describe('FeedbackPage', () => {
  it('mostra carregando enquanto busca o chamado', () => {
    mockGetByToken.mockReturnValue(new Promise(() => {}))
    renderFeedback()

    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('mostra avaliação do chamado carregado via token', async () => {
    mockGetByToken.mockResolvedValue(makeTicket())
    renderFeedback()
    await act(async () => {})

    expect(mockGetByToken).toHaveBeenCalledWith('tok')
    expect(screen.getByText('Avaliar Atendimento')).toBeInTheDocument()
    expect(screen.getByText('Chamado #5')).toBeInTheDocument()
    expect(screen.getByText('Enviar avaliação')).toBeInTheDocument()
  })

  it('sem token não faz acesso anônimo remoto — usa cache local', async () => {
    mockGetByIdNoFilter.mockReturnValue(makeTicket())
    renderFeedback('')
    await act(async () => {})

    expect(mockGetByToken).not.toHaveBeenCalled()
    expect(screen.getByText('Avaliar Atendimento')).toBeInTheDocument()
  })

  it('chamado não encontrado', async () => {
    mockGetByToken.mockRejectedValue(new Error('não encontrado'))
    mockGetByIdNoFilter.mockReturnValue(null)
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('bloqueia avaliação antes da resolução', async () => {
    mockGetByToken.mockResolvedValue(makeTicket({ status: 'aberto' }))
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText(/ainda está/)).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.queryByText('Enviar avaliação')).not.toBeInTheDocument()
  })

  it('mostra avaliação já enviada', async () => {
    mockGetByToken.mockResolvedValue(
      makeTicket({ feedbackRating: 5, feedbackComment: 'Muito bom!', feedbackAt: '2026-06-25T12:00:00Z' }),
    )
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText('Avaliação enviada')).toBeInTheDocument()
    expect(screen.getByText('Muito bom!')).toBeInTheDocument()
  })

  it('envia a avaliação via token e mostra agradecimento', async () => {
    mockGetByToken.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockResolvedValue(makeTicket({ feedbackRating: 4 }))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('4 estrelas'))
    fireEvent.change(screen.getByPlaceholderText('Conte como foi a experiência...'), {
      target: { value: 'Atendimento rápido' },
    })
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(mockSubmitFeedback).toHaveBeenCalledWith('tok', 4, 'Atendimento rápido')
    expect(screen.getByText('Obrigado pelo feedback!')).toBeInTheDocument()
  })

  it('mostra erro ao falhar o envio', async () => {
    mockGetByToken.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockRejectedValue(new Error('Falha de rede'))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('5 estrelas'))
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(screen.getByText('Falha de rede')).toBeInTheDocument()
  })
  it('409 do backend vira o estado "avaliação enviada", nao erro genérico', async () => {
    mockGetByToken.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockRejectedValue(
      new PublicTicketRequestError('Chamado já avaliado', 409),
    )
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('5 estrelas'))
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(screen.getByText('Avaliação enviada')).toBeInTheDocument()
    expect(screen.queryByText('Chamado já avaliado')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument()
  })

  it('409 recarrega o chamado para trazer a nota e o comentário já registrados', async () => {
    mockGetByToken
      .mockResolvedValueOnce(makeTicket())
      .mockResolvedValueOnce(
        makeTicket({
          feedbackRating: 5,
          feedbackComment: 'Atendimento excelente',
          feedbackAt: '2026-06-25T12:00:00Z',
        }),
      )
    mockSubmitFeedback.mockRejectedValue(new PublicTicketRequestError('Chamado já avaliado', 409))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('3 estrelas'))
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(screen.getByText('Avaliação enviada')).toBeInTheDocument()
    expect(screen.getByText('Atendimento excelente')).toBeInTheDocument()
  })

  it('falha de rede continua sendo erro genérico (409 não é tratado como rede)', async () => {
    mockGetByToken.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockRejectedValue(new Error('Falha de rede'))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('5 estrelas'))
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(screen.getByText('Falha de rede')).toBeInTheDocument()
    expect(screen.queryByText('Avaliação enviada')).not.toBeInTheDocument()
  })
})
