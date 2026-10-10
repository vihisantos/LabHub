import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FeedbackReminder } from '../FeedbackReminder'
import { recordFeedbackReminder } from '../../utils/pendingFeedback'
import type { Ticket } from '../../types'

const mockSubmitFeedback = vi.hoisted(() => vi.fn())
vi.mock('../../services/ticketService', () => ({
  ticketService: { submitFeedback: mockSubmitFeedback },
  errorStatus: (err: unknown) =>
    err && typeof err === 'object' && 'status' in err
      ? (err as { status?: unknown }).status
      : null,
}))

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1050,
    roomId: 'r-1',
    roomName: 'Laboratório 03',
    assetName: 'Projetor Epson',
    problemCategory: 'Projetor',
    problemDescription: 'Não liga',
    status: 'resolvido',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-10-01T10:00:00',
    updatedAt: '2026-10-05T08:42:00',
    resolvedAt: null,
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockSubmitFeedback.mockResolvedValue(ticket())
})

describe('FeedbackReminder — aviso', () => {
  it('não renderiza nada sem pendências', () => {
    render(<FeedbackReminder pending={[]} />)
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
  })

  it('mostra um convite discreto para uma pendência', () => {
    render(<FeedbackReminder pending={[ticket()]} />)

    expect(screen.getByLabelText('Avaliações pendentes')).toBeInTheDocument()
    expect(screen.getByText('Como foi o atendimento?')).toBeInTheDocument()
    expect(screen.getByText('Projetor Epson')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Avaliar/ })).toBeInTheDocument()
  })

  it('lista compacta para várias pendências', () => {
    render(
      <FeedbackReminder
        pending={[
          ticket({ id: 'a', assetName: 'Projetor Epson' }),
          ticket({ id: 'b', assetName: 'Impressora HP' }),
        ]}
      />,
    )

    expect(screen.getByText('Como foram esses atendimentos?')).toBeInTheDocument()
    expect(screen.getByText('Projetor Epson')).toBeInTheDocument()
    expect(screen.getByText('Impressora HP')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Avaliar/ })).toHaveLength(2)
  })

  it('pode ser dispensado sem bloquear a tela', () => {
    render(<FeedbackReminder pending={[ticket()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar lembrete de avaliação' }))
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
  })

  it('para de aparecer após o limite de lembretes (não repete a cada visita)', () => {
    const first = render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} />)
    expect(screen.getByLabelText('Avaliações pendentes')).toBeInTheDocument()
    first.unmount()

    const second = render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} />)
    expect(screen.getByLabelText('Avaliações pendentes')).toBeInTheDocument()
    second.unmount()

    render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} />)
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
  })

  it('um chamado já no limite não esconde os demais', () => {
    recordFeedbackReminder('velho', 'user-1')
    recordFeedbackReminder('velho', 'user-1')
    render(
      <FeedbackReminder
        userId="user-1"
        pending={[
          ticket({ id: 'velho', assetName: 'Projetor Antigo' }),
          ticket({ id: 'novo', assetName: 'Notebook Dell' }),
        ]}
      />,
    )

    expect(screen.queryByText('Projetor Antigo')).not.toBeInTheDocument()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })

  it('escopo por usuário: o limite de uma conta não esconde o aviso de outra', () => {
    recordFeedbackReminder('t-1', 'user-1')
    recordFeedbackReminder('t-1', 'user-1')

    const view = render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} userId="user-1" />)
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
    view.unmount()

    render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} userId="user-2" />)
    expect(screen.getByLabelText('Avaliações pendentes')).toBeInTheDocument()
  })

  it('descarta a pendência que o servidor deixou de listar', () => {
    const view = render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} />)
    expect(screen.getByLabelText('Avaliações pendentes')).toBeInTheDocument()

    view.rerender(<FeedbackReminder pending={[]} />)
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
  })
})

describe('FeedbackReminder — avaliação autenticada', () => {
  it('abre o formulário com estrelas e comentário', () => {
    render(<FeedbackReminder pending={[ticket()]} />)

    fireEvent.click(screen.getByRole('button', { name: /Avaliar/ }))

    expect(screen.getByRole('radio', { name: '5 estrelas' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Comentário (opcional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviar avaliação/ })).toBeInTheDocument()
  })

  it('não envia sem uma nota escolhida', () => {
    render(<FeedbackReminder pending={[ticket()]} />)
    fireEvent.click(screen.getByRole('button', { name: /Avaliar/ }))

    expect(screen.getByRole('button', { name: /Enviar avaliação/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Enviar avaliação/ }))
    expect(mockSubmitFeedback).not.toHaveBeenCalled()
  })

  it('envia pelo endpoint autenticado e remove após confirmação', async () => {
    const onRated = vi.fn()
    render(
      <FeedbackReminder
        pending={[ticket({ id: 't-9', assetName: 'Projetor Epson' }), ticket({ id: 't-10', assetName: 'Impressora HP' })]}
        userId="user-1"
        onRated={onRated}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Avaliar/ })[0])

    fireEvent.click(screen.getByRole('radio', { name: '5 estrelas' }))
    fireEvent.change(screen.getByPlaceholderText('Comentário (opcional)'), {
      target: { value: 'Ótimo atendimento' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Enviar avaliação/ }))
    await act(async () => {})

    expect(mockSubmitFeedback).toHaveBeenCalledWith('t-9', 5, 'Ótimo atendimento')
    expect(onRated).toHaveBeenCalledTimes(1)
    // O chamado avaliado sai; o outro continua pendente.
    expect(screen.queryByText('Projetor Epson')).not.toBeInTheDocument()
    expect(screen.getByText('Impressora HP')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/avaliação foi registrada/i)
  })

  it('falha mantém o formulário aberto para nova tentativa e não afirma sucesso', async () => {
    mockSubmitFeedback.mockRejectedValueOnce(new Error('Falha de rede'))
    const onRated = vi.fn()
    render(<FeedbackReminder pending={[ticket({ id: 't-9' })]} onRated={onRated} />)
    fireEvent.click(screen.getByRole('button', { name: /Avaliar/ }))
    fireEvent.click(screen.getByRole('radio', { name: '4 estrelas' }))
    fireEvent.click(screen.getByRole('button', { name: /Enviar avaliação/ }))
    await act(async () => {})

    expect(screen.getByRole('alert')).toHaveTextContent('Falha de rede')
    expect(onRated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Enviar avaliação/ })).toBeInTheDocument()

    // Segunda tentativa funciona.
    mockSubmitFeedback.mockResolvedValueOnce(ticket())
    fireEvent.click(screen.getByRole('button', { name: /Enviar avaliação/ }))
    await act(async () => {})
    expect(onRated).toHaveBeenCalledTimes(1)
  })

  it('409 do servidor encerra a pendência sem erro de rede', async () => {
    const conflict = new Error('Chamado já avaliado') as Error & { status: number }
    conflict.status = 409
    mockSubmitFeedback.mockRejectedValueOnce(conflict)
    const onRated = vi.fn()
    render(<FeedbackReminder pending={[ticket({ id: 't-9' })]} onRated={onRated} />)
    fireEvent.click(screen.getByRole('button', { name: /Avaliar/ }))
    fireEvent.click(screen.getByRole('radio', { name: '3 estrelas' }))
    fireEvent.click(screen.getByRole('button', { name: /Enviar avaliação/ }))
    await act(async () => {})

    expect(onRated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Avaliações pendentes')).not.toBeInTheDocument()
  })

  it('cancelar volta para a lista sem enviar nada', () => {
    render(<FeedbackReminder pending={[ticket({ id: 't-1' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Avaliar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mockSubmitFeedback).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Avaliar/ })).toBeInTheDocument()
  })
})
