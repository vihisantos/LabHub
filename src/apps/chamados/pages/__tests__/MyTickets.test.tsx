import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

/**
 * Meus Chamados — a ÁREA PESSOAL do solicitante (#337).
 *
 * Estos testes travam o contrato da tela, não o da implementação:
 *   · a coleção vem de `listMine()` (`GET /api/chamados?mine=true`), nunca da
 *     fila operacional — nem como fonte, nem como fallback de erro;
 *   · não existe filtro operacional aqui;
 *   · há UMA pesquisa simples (número, assunto, local) sobre o conjunto já
 *     autorizado;
 *   · os chamados são agrupados por data de atualização, do mais recente para
 *     o mais antigo;
 *   · loading, vazio, erro e retry existem.
 */

const mockListMine = vi.hoisted(() => vi.fn())
vi.mock('../../services/ticketService', () => ({
  ticketService: { listMine: mockListMine },
}))

// A fila operacional existe e está disponível — a prova é que ela NÃO aparece.
const mockQueueTickets = vi.hoisted(() => [] as any[])
const mockContextReload = vi.hoisted(() => vi.fn())
vi.mock('../../contexts/TicketsContext', () => ({
  useTicketsContext: () => ({
    tickets: mockQueueTickets,
    loading: false,
    syncing: false,
    reload: mockContextReload,
  }),
}))

const mockNavigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('')],
  useLocation: () => ({ pathname: '/chamados/meus' }),
  Link: ({ children }: { children: unknown }) => children,
}))

import { MyTickets } from '../MyTickets'

const NOW = new Date(2026, 9, 5, 14, 30) // 05/10/2026 14:30 (local)

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    ticketNumber: 1042,
    workspace_id: 'ws-a',
    roomId: 'r-1',
    roomName: 'Laboratório 03',
    assetName: 'Notebook Dell',
    problemCategory: 'Computador',
    problemDescription: 'Não liga',
    problemArea: 'academica',
    status: 'em_atendimento',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    reportedByUserId: 'user-meu',
    assignedTo: 'Técnico 1',
    assignedToUserId: 'user-tec',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-10-01T10:00:00',
    updatedAt: '2026-10-05T08:42:00',
    resolvedAt: null,
    ...over,
  }
}

const HOJE = ticket({ id: 'hoje', ticketNumber: 1042, updatedAt: '2026-10-05T08:42:00' })
const HOJE_TARDE = ticket({
  id: 'hoje-tarde',
  ticketNumber: 1043,
  assetName: 'Projetor Epson',
  roomName: 'Sala 204',
  problemCategory: 'Projetor',
  status: 'aberto',
  updatedAt: '2026-10-05T13:05:00',
})
const ONTEM = ticket({
  id: 'ontem',
  ticketNumber: 1038,
  assetName: 'Projetor BenQ',
  roomName: 'Sala 204',
  problemCategory: 'Projetor',
  status: 'resolvido',
  updatedAt: '2026-10-04T22:00:00',
})
const ANTIGO = ticket({
  id: 'antigo',
  ticketNumber: 1021,
  assetName: 'Impressora HP',
  roomName: 'Coordenação',
  problemCategory: 'Impressora',
  status: 'fechado',
  archived: true,
  updatedAt: '2026-09-30T14:20:00',
})

async function renderMyTickets() {
  const view = render(<MyTickets />)
  await act(async () => {})
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  mockQueueTickets.length = 0
  mockListMine.mockResolvedValue([HOJE, ONTEM, ANTIGO])
  vi.setSystemTime(NOW)
})

// ── Dados ────────────────────────────────────────────────────────────────────

describe('MyTickets — fonte dos dados (contrato #331)', () => {
  it('consulta listMine() (GET /api/chamados?mine=true)', async () => {
    await renderMyTickets()

    expect(mockListMine).toHaveBeenCalledTimes(1)
    expect(mockContextReload).not.toHaveBeenCalled()
  })

  it('mostra exatamente o que o servidor devolveu', async () => {
    await renderMyTickets()

    expect(screen.getByText('#1042')).toBeInTheDocument()
    expect(screen.getByText('#1038')).toBeInTheDocument()
    expect(screen.getByText('#1021')).toBeInTheDocument()
  })

  it('nunca mistura a fila operacional na coleção', async () => {
    mockQueueTickets.push(
      ticket({ id: 'fila-1', ticketNumber: 900, roomName: 'Fila TI' }),
      ticket({ id: 'fila-2', ticketNumber: 901, roomName: 'Outra fila' }),
    )
    await renderMyTickets()

    expect(screen.queryByText('#900')).not.toBeInTheDocument()
    expect(screen.queryByText('#901')).not.toBeInTheDocument()
    expect(screen.getByText('#1042')).toBeInTheDocument()
  })

  it('não lê reportedByUserId como fronteira de autorização', async () => {
    // O servidor devolve o que É dele; a tela não recalcula o escopo nem
    // descarta nada por UUID de solicitante.
    const resposta = [
      ticket({ id: 'a', ticketNumber: 1, reportedByUserId: 'outro-uuid' }),
      ticket({ id: 'b', ticketNumber: 2, reportedByUserId: null }),
    ]
    mockListMine.mockResolvedValue(resposta)
    await renderMyTickets()

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('chamado resolvido e fechado continuam visíveis (é histórico, não fila)', async () => {
    await renderMyTickets()

    expect(screen.getByText('Resolvido')).toBeInTheDocument()
    expect(screen.getByText('Fechado')).toBeInTheDocument()
  })
})

// ── Sem filtros operacionais ─────────────────────────────────────────────────

describe('MyTickets — não é a fila operacional', () => {
  it('não tem chips de status, prioridade, responsável, sala ou ordenação', async () => {
    await renderMyTickets()

    for (const label of [
      'Ativos',
      'Arquivados',
      'Meus Atendimentos',
      'Sem responsável',
      'Prioridades',
      'Urgente',
      'Todas as salas',
      'Mais recentes',
      'SLA',
      'Prioridade',
    ]) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}`) })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('não mostra os campos de atendimento que são ferramenta do técnico', async () => {
    await renderMyTickets()

    expect(screen.queryByText('Técnico 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
  })

  it('separa as duas experiências com texto explícito', async () => {
    await renderMyTickets()

    expect(screen.getByText(/Chamados que/)).toBeInTheDocument()
    expect(screen.getByText(/fila de trabalho da equipe de TI fica em/)).toBeInTheDocument()
  })

  it('não oferece o "Meus Atendimentos" (que é recorte de trabalho, não pessoal)', async () => {
    await renderMyTickets()

    expect(screen.queryByRole('button', { name: 'Meus Atendimentos' })).not.toBeInTheDocument()
  })
})

// ── Item ─────────────────────────────────────────────────────────────────────

describe('MyTickets — item do chamado', () => {
  it('mostra número, assunto, local, status e última atualização', async () => {
    await renderMyTickets()

    expect(screen.getByText('#1042')).toBeInTheDocument()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('Laboratório 03')).toBeInTheDocument()
    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText(/Atualizado hoje às 08:42/)).toBeInTheDocument()
  })

  it('a item abre o detalhe do chamado', async () => {
    await renderMyTickets()

    fireEvent.click(screen.getByText('Notebook Dell'))
    expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/hoje')
  })

  it('chamado sem local não quebra o card', async () => {
    mockListMine.mockResolvedValue([ticket({ id: 'sem-local', roomName: '' })])
    await renderMyTickets()

    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })
})

// ── Agrupamento por data ─────────────────────────────────────────────────────

describe('MyTickets — agrupamento por data', () => {
  it('separa Hoje, Ontem e datas anteriores', async () => {
    await renderMyTickets()

    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ontem' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '30/09/2026' })).toBeInTheDocument()
  })

  it('ordena os grupos do mais recente para o mais antigo', async () => {
    await renderMyTickets()

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings).toEqual(['Hoje', 'Ontem', '30/09/2026'])
  })

  it('ordena dentro do grupo da atualização mais recente para a mais antiga', async () => {
    mockListMine.mockResolvedValue([HOJE, HOJE_TARDE, ONTEM, ANTIGO])
    await renderMyTickets()

    const hojeGroup = screen.getByRole('heading', { name: 'Hoje' }).parentElement as HTMLElement
    const numeros = Array.from(hojeGroup.querySelectorAll('span'))
      .map((el) => el.textContent)
      .filter((t) => t && /^#\d+$/.test(t))
    expect(numeros).toEqual(['#1043', '#1042'])
  })

  it('agrupa pela atualização, não pela data de abertura', async () => {
    mockListMine.mockResolvedValue([
      ticket({ id: 'velho', createdAt: '2026-09-01T10:00:00', updatedAt: '2026-10-05T09:00:00' }),
    ])
    await renderMyTickets()

    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '01/09/2026' })).not.toBeInTheDocument()
  })
})

// ── Pesquisa ─────────────────────────────────────────────────────────────────

describe('MyTickets — pesquisa simples', () => {
  const input = () => screen.getByLabelText('Pesquisar chamado') as HTMLInputElement

  it('filtra por número do chamado', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: '1038' } })

    expect(screen.getByText('#1038')).toBeInTheDocument()
    expect(screen.queryByText('#1042')).not.toBeInTheDocument()
    expect(screen.queryByText('#1021')).not.toBeInTheDocument()
  })

  it('filtra por assunto', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: 'Impressora' } })

    expect(screen.getByText('#1021')).toBeInTheDocument()
    expect(screen.queryByText('#1042')).not.toBeInTheDocument()
  })

  it('filtra por local', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: 'Sala 204' } })

    expect(screen.getByText('#1038')).toBeInTheDocument()
    expect(screen.queryByText('#1042')).not.toBeInTheDocument()
  })

  it('a pesquisa NÃO traz nada de fora do conjunto do servidor', async () => {
    mockQueueTickets.push(ticket({ id: 'fila', ticketNumber: 900, roomName: 'Sala 204' }))
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: 'Sala 204' } })

    // A fila tem uma "Sala 204", mas ela não existe para esta tela.
    expect(screen.queryByText('#900')).not.toBeInTheDocument()
  })

  it('pesquisa vazia devolve todos os chamados pessoais', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: '   ' } })

    expect(screen.getByText('#1042')).toBeInTheDocument()
    expect(screen.getByText('#1038')).toBeInTheDocument()
    expect(screen.getByText('#1021')).toBeInTheDocument()
  })

  it('sem resultado mostra estado próprio (não "você não tem chamados")', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: 'inexistente' } })

    expect(screen.getByText('Você ainda não abriu nenhum chamado.')).toBeInTheDocument()
    expect(screen.queryByText('Você ainda não abriu nenhum chamado')).not.toBeInTheDocument()
  })

  it('limpar a pesquisa restaura a lista completa', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: 'inexistente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))

    expect(screen.getByText('#1042')).toBeInTheDocument()
    expect(screen.queryByText('Você ainda não abriu nenhum chamado.')).not.toBeInTheDocument()
  })

  it('a pesquisa não refaz a chamada ao servidor (é apresentação)', async () => {
    await renderMyTickets()

    fireEvent.change(input(), { target: { value: '1038' } })

    expect(mockListMine).toHaveBeenCalledTimes(1)
  })

  it('existe exatamente UMA pesquisa na tela', async () => {
    await renderMyTickets()

    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
  })
})

// ── Estados ──────────────────────────────────────────────────────────────────

describe('MyTickets — estados', () => {
  it('loading: mostra esqueleto, sem tela branca e sem a lista', async () => {
    let resolve: (v: unknown[]) => void = () => {}
    mockListMine.mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<MyTickets />)
    await act(async () => {})

    expect(screen.getByLabelText('Pesquisar chamado')).toBeInTheDocument()
    expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0)
    expect(screen.queryByText('#1042')).not.toBeInTheDocument()

    await act(async () => { resolve([HOJE]) })
    expect(document.querySelectorAll('.skeleton-shimmer').length).toBe(0)
    expect(screen.getByText('#1042')).toBeInTheDocument()
  })

  it('vazio: mensagem amigável com CTA para o fluxo de abertura existente', async () => {
    mockListMine.mockResolvedValue([])
    await renderMyTickets()

    expect(screen.getByText('Você ainda não abriu nenhum chamado')).toBeInTheDocument()
    expect(screen.getByText(/abra um chamado e ele aparecerá aqui/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }))
    expect(mockNavigate).toHaveBeenCalledWith('/chamados-publico/new')
  })

  it('erro: mostra o estado de erro e NÃO cai na fila', async () => {
    mockListMine.mockRejectedValue(new Error('Falha de rede'))
    await renderMyTickets()

    expect(screen.getByText('Não foi possível carregar seus chamados.')).toBeInTheDocument()
    expect(screen.getByText('Falha de rede')).toBeInTheDocument()
    expect(screen.queryByText('Você ainda não abriu nenhum chamado')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  })

  it('erro mesmo com a fila operacional disponível na tela', async () => {
    mockQueueTickets.push(ticket({ id: 'fila-1', ticketNumber: 900 }))
    mockListMine.mockRejectedValue(new Error('Falha de rede'))
    await renderMyTickets()

    expect(screen.queryByText('#900')).not.toBeInTheDocument()
    expect(screen.queryByText('#1042')).not.toBeInTheDocument()
  })

  it('erro: retry refaz a consulta do servidor pessoal', async () => {
    mockListMine.mockRejectedValueOnce(new Error('Falha de rede'))
    await renderMyTickets()
    expect(screen.getByText('Não foi possível carregar seus chamados.')).toBeInTheDocument()

    mockListMine.mockResolvedValue([HOJE])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    })

    expect(mockListMine).toHaveBeenCalledTimes(2)
    expect(mockContextReload).not.toHaveBeenCalled()
    expect(screen.getByText('#1042')).toBeInTheDocument()
    expect(screen.queryByText('Não foi possível carregar seus chamados.')).not.toBeInTheDocument()
  })

  it('retry continua na frente de erro enquanto o servidor falhar', async () => {
    mockListMine.mockRejectedValue(new Error('Falha de rede'))
    await renderMyTickets()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    })

    expect(mockListMine).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Não foi possível carregar seus chamados.')).toBeInTheDocument()
  })
})
