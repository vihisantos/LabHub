import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../../chamados/types'

const mockGetByIdRemote = vi.hoisted(() => vi.fn())
const mockGetByIdNoFilter = vi.hoisted(() => vi.fn())
const mockSubmitFeedback = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: {
    getByIdRemote: mockGetByIdRemote,
    getByIdNoFilter: mockGetByIdNoFilter,
    submitFeedback: mockSubmitFeedback,
  },
}))

import { FeedbackPage } from '../FeedbackPage'

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

function renderFeedback() {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/feedback/:ticketId" element={<FeedbackPage />} />
    </Routes>,
    { initialEntries: ['/chamados-publico/feedback/t-1'] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FeedbackPage', () => {
  it('mostra carregando enquanto busca o chamado', () => {
    mockGetByIdRemote.mockReturnValue(new Promise(() => {}))
    renderFeedback()

    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('mostra avaliação do chamado carregado', async () => {
    mockGetByIdRemote.mockResolvedValue(makeTicket())
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText('Avaliar Atendimento')).toBeInTheDocument()
    expect(screen.getByText('Chamado #5')).toBeInTheDocument()
    expect(screen.getByText('Enviar avaliação')).toBeInTheDocument()
  })

  it('chamado não encontrado', async () => {
    mockGetByIdRemote.mockRejectedValue(new Error('não encontrado'))
    mockGetByIdNoFilter.mockReturnValue(null)
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('bloqueia avaliação antes da resolução', async () => {
    mockGetByIdRemote.mockResolvedValue(makeTicket({ status: 'aberto' }))
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText(/ainda está/)).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.queryByText('Enviar avaliação')).not.toBeInTheDocument()
  })

  it('mostra avaliação já enviada', async () => {
    mockGetByIdRemote.mockResolvedValue(
      makeTicket({ feedbackRating: 5, feedbackComment: 'Muito bom!', feedbackAt: '2026-06-25T12:00:00Z' }),
    )
    renderFeedback()
    await act(async () => {})

    expect(screen.getByText('Avaliação enviada')).toBeInTheDocument()
    expect(screen.getByText('Muito bom!')).toBeInTheDocument()
  })

  it('envia a avaliação e mostra agradecimento', async () => {
    mockGetByIdRemote.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockResolvedValue(makeTicket({ feedbackRating: 4 }))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('4 estrelas'))
    fireEvent.change(screen.getByPlaceholderText('Conte como foi a experiência...'), {
      target: { value: 'Atendimento rápido' },
    })
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(mockSubmitFeedback).toHaveBeenCalledWith('t-1', 4, 'Atendimento rápido')
    expect(screen.getByText('Obrigado pelo feedback!')).toBeInTheDocument()
  })

  it('mostra erro ao falhar o envio', async () => {
    mockGetByIdRemote.mockResolvedValue(makeTicket())
    mockSubmitFeedback.mockRejectedValue(new Error('Falha de rede'))
    renderFeedback()
    await act(async () => {})

    fireEvent.click(screen.getByLabelText('5 estrelas'))
    fireEvent.click(screen.getByText('Enviar avaliação'))
    await act(async () => {})

    expect(screen.getByText('Falha de rede')).toBeInTheDocument()
  })
})
