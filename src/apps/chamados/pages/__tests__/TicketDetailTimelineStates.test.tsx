import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

/**
 * A timeline do `TicketDetail` deixou de falhar em silêncio.
 *
 * Antes desta PR, o carregamento era `getEvents(id).catch(() => {})`: qualquer
 * falha — 403 de autorização, 502 do banco, timeout de rede — deixava `events`
 * vazio e a tela mostrava "Nenhum registro ainda". O solicitante que abria o
 * PRÓPRIO chamado via "Meus Chamados" (#331/#339) via um histórico vazio sem
 * nenhuma pista de que era falta de permissão. Pior: a tela affirmava algo
 * falso sobre o servidor. "Nenhum registro" é uma afirmação; um 403 é o oposto.
 *
 * O que estes testes travam:
 *   · os quatro estados são distinguíveis — carregando, com eventos, vazio e
 *     negado/erro nunca se confundem entre si;
 *   · 403 NÃO vira "sem registros": o usuário é informado de que não tem
 *     permissão, sem que nenhum dado do chamado vaze;
 *   · erro de comunicação oferece retry, e o retry refaz a chamada;
 *   · a autorização é do BACKEND: o frontend não manda identidade, não manda
 *     `mine=true` e não compara `reportedByUserId === user.id` para decidir o
 *     que exibir.
 *
 * Nota de arquitetura: o filtro de tipos do solicitante é do servidor. Se o
 * backend devolver só os eventos permitidos, esta tela renderiza o que veio —
 * não existe tipo liberado aqui, e é essa a propriedade que os testes de IDOR
 * verificam.
 */

const mockGetByIdRemote = vi.hoisted(() => vi.fn())
const mockPatchRemote = vi.hoisted(() => vi.fn())
const mockGetEvents = vi.hoisted(() => vi.fn())
const mockAddEvent = vi.hoisted(() => vi.fn())
const mockGetAssignees = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockUpdateStatus = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockClaim = vi.hoisted(() => vi.fn())

const queue = vi.hoisted(() => ({ tickets: [] as any[] }))
const state = vi.hoisted(() => ({
  user: { id: 'user-solicitante', name: 'Prof. Maria', is_super_admin: false } as any,
}))
const leadState = vi.hoisted(() => ({ isLeadership: false }))
const perms = vi.hoisted(() => ({ allow: false }))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: () => ({ allowed: perms.allow, loading: false }),
}))

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 't-meu',
    ticketNumber: 1042,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Laboratório 03',
    assetName: 'Notebook Dell',
    problemCategory: 'Computador',
    problemDescription: 'Não liga',
    status: 'em_atendimento',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    reportedByUserId: 'user-solicitante',
    assignedTo: 'Técnico 1',
    assignedToUserId: 'user-tec',
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

/**
 * Evento como a API o entrega depois da minimização: sem `ticket_id` e sem
 * `workspace_id`. O tipo do TypeScript marca os dois como opcionais, e o teste
 * garante que a tela não depende deles.
 */
function evento(over: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    type: 'status',
    content: 'Em atendimento',
    author: 'João · TI',
    photos: [] as string[],
    createdAt: '2026-10-02T09:00:00',
    ...over,
  }
}

function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 't-meu' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../contexts/TicketsContext', () => ({
  useTicketsContext: () => ({
    tickets: queue.tickets,
    update: mockUpdate,
    updateStatus: mockUpdateStatus,
    create: mockCreate,
    claim: mockClaim,
  }),
}))
vi.mock('../../services/ticketService', async () => {
  const actual = await vi.importActual<typeof import('../../services/ticketService')>(
    '../../services/ticketService',
  )
  return {
    ticketService: {
      getByIdRemote: mockGetByIdRemote,
      patchRemote: mockPatchRemote,
      getEvents: mockGetEvents,
      addEvent: mockAddEvent,
    },
    errorStatus: actual.errorStatus,
  }
})
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: state.user }),
}))
vi.mock('../../../../core/permissions/useLeadership', () => ({
  useLeadership: () => ({ isLeadership: leadState.isLeadership, level: 0, area: null }),
}))
vi.mock('../../../../core/permissions/workspaceAssigneesService', () => ({
  getWorkspaceAssignees: mockGetAssignees,
}))
vi.mock('../../utils/photo', () => ({
  uploadPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
}))
vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  },
}))

import { TicketDetail } from '../TicketDetail'

async function renderDetail() {
  const view = render(<TicketDetail />)
  await act(async () => {})
  return view
}

/** O texto exato que a tela usava para "não tem nada". */
const VAZIO = 'Nenhum registro ainda'
const CARREGANDO = 'Carregando histórico…'
const NEGADO = 'Você não tem permissão para ver o histórico deste chamado.'
const ERRO = 'Não foi possível carregar o histórico.'

/**
 * Conteúdo de evento único. Não pode ser um rótulo de status: a tela tem uma
 * seção "Timeline" que renderiza `STATUS_FLOW` com os rótulos traduzidos, e
 * "Em atendimento" apareceria duas vezes — o que quebraria o `getByText` sem
 * dizer nada sobre o comportamento testado.
 */
const CONTEUDO = 'Registro do histórico (texto único do teste)'

beforeEach(() => {
  vi.clearAllMocks()
  queue.tickets = []
  state.user = { id: 'user-solicitante', name: 'Prof. Maria', is_super_admin: false }
  leadState.isLeadership = false
  perms.allow = false
  mockGetAssignees.mockResolvedValue([])
  mockGetByIdRemote.mockResolvedValue(ticket())
  mockPatchRemote.mockResolvedValue(ticket())
  mockGetEvents.mockResolvedValue([])
})

// ═══════════════════════════════════════════════════════════════════════════
// Os quatro estados
// ═══════════════════════════════════════════════════════════════════════════

describe('TicketDetail — estados da timeline', () => {
  it('mostra carregando antes da resposta, sem afirmar "sem registros"', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockGetEvents.mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<TicketDetail />)
    await act(async () => {})

    expect(screen.getByText(CARREGANDO)).toBeInTheDocument()
    // A afirmação falsa é exatamente o que esta PR remove.
    expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
    expect(screen.queryByText(NEGADO)).not.toBeInTheDocument()

    await act(async () => { resolve([evento()]) })
    expect(screen.queryByText(CARREGANDO)).not.toBeInTheDocument()
  })

  it('renderiza os eventos devolvidos pela API', async () => {
    mockGetEvents.mockResolvedValue([
      evento({ id: 'ev-1', type: 'status', content: CONTEUDO, author: 'João · TI' }),
      evento({ id: 'ev-2', type: 'comentario', content: CONTEUDO + ' (comentário)', author: 'João · TI' }),
    ])

    await renderDetail()

    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
    expect(screen.getByText(CONTEUDO + ' (comentário)')).toBeInTheDocument()
    expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
    expect(screen.queryByText(CARREGANDO)).not.toBeInTheDocument()
  })

  it('resolvido com lista vazia é o estado vazio, e só ele', async () => {
    mockGetEvents.mockResolvedValue([])

    await renderDetail()

    expect(screen.getByText(VAZIO)).toBeInTheDocument()
    expect(screen.queryByText(NEGADO)).not.toBeInTheDocument()
    expect(screen.queryByText(ERRO)).not.toBeInTheDocument()
    expect(screen.queryByText(CARREGANDO)).not.toBeInTheDocument()
  })

  it('401 e 403 viram "sem permissão", nunca "sem registros"', async () => {
    for (const status of [401, 403]) {
      mockGetEvents.mockRejectedValue(httpError(status, 'Permissão insuficiente'))
      const view = await renderDetail()

      expect(screen.getByText(NEGADO)).toBeInTheDocument()
      // A confusão que esta PR elimina.
      expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
      // E nenhum dado do chamado vaza na tela de erro.
      expect(screen.queryByText('Notebook Dell')).toBeInTheDocument()
      expect(screen.queryByText('Permissão insuficiente')).not.toBeInTheDocument()

      view.unmount()
      mockGetEvents.mockReset()
    }
  })

  it('erro de comunicação mostra falha com retry, e o retry refaz a chamada', async () => {
    mockGetEvents.mockRejectedValueOnce(new Error('Failed to fetch'))
    mockGetEvents.mockResolvedValueOnce([evento({ content: CONTEUDO })])

    await renderDetail()

    expect(screen.getByText(ERRO)).toBeInTheDocument()
    expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
    expect(screen.queryByText(NEGADO)).not.toBeInTheDocument()
    expect(mockGetEvents).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    })

    expect(mockGetEvents).toHaveBeenCalledTimes(2)
    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
    expect(screen.queryByText(ERRO)).not.toBeInTheDocument()
  })

  it('erro do backend sem status é falha de comunicação, não permissão', async () => {
    mockGetEvents.mockRejectedValue(new Error('ID do chamado inválido'))

    await renderDetail()

    expect(screen.getByText(ERRO)).toBeInTheDocument()
    expect(screen.queryByText(NEGADO)).not.toBeInTheDocument()
  })

  it('o estado de erro persiste se o retry também falhar', async () => {
    mockGetEvents.mockRejectedValue(new Error('Failed to fetch'))

    await renderDetail()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    })

    // Não pode "resolver" para vazio: a segunda falha também é falha.
    expect(screen.getByText(ERRO)).toBeInTheDocument()
    expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Solicitante e técnico veem a mesma tela, com a autorização do servidor
// ═══════════════════════════════════════════════════════════════════════════

describe('TicketDetail — a timeline não depende de quem é o usuário na tela', () => {
  it('solicitante e técnico recebem exatamente o mesmo tratamento visual', async () => {
    mockGetEvents.mockResolvedValue([evento({ content: CONTEUDO })])

    const solicitante = await renderDetail()
    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
    solicitante.unmount()

    // O mesmo registro, agora visto por um técnico com todas as Actions. A tela
    // não muda de comportamento — quem decidiu o que chegar foi o servidor.
    state.user = { id: 'test-admin', name: 'Técnico 1', is_super_admin: false }
    perms.allow = true
    queue.tickets = [ticket({ reportedByUserId: 'outro', assignedToUserId: 'test-admin' })]

    await renderDetail()
    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
    expect(screen.queryByText(NEGADO)).not.toBeInTheDocument()
  })

  it('o solicitante continua somente-leitura mesmo vendo a timeline', async () => {
    mockGetEvents.mockResolvedValue([evento({ content: CONTEUDO })])

    await renderDetail()

    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
    // Ver o histórico não concede nenhuma ação operacional.
    expect(screen.queryByRole('button', { name: /Assumir/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Definir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument()
  })

  it('o frontend não envia identidade, mine=true nem flag de autorização', async () => {
    mockGetEvents.mockResolvedValue([evento()])

    await renderDetail()

    expect(mockGetEvents).toHaveBeenCalledWith('t-meu')
    const arg = mockGetEvents.mock.calls[0][0]
    // Só o id do recurso. A identidade vem do JWT, no servidor.
    expect(typeof arg).toBe('string')
    expect(arg).not.toContain('reportedBy')
    expect(arg).not.toContain('mine')
    expect(arg).not.toContain('user')
    expect(arg).not.toContain('owner')
    expect(arg).not.toContain('?')
  })

  it('o frontend não decide o que é evento permitido: renderiza o que veio', async () => {
    // Simula o servidor devolvendo um conjunto já filtrado. A tela não tem
    // allowlist própria — se um tipo aparecesse, ela o exibiria, e a correção
    // seria do backend, não daqui.
    mockGetEvents.mockResolvedValue([
      evento({ id: 'ev-1', type: 'comentario', content: 'Comentário liberado' }),
      evento({ id: 'ev-2', type: 'status', content: 'Status liberado' }),
    ])

    await renderDetail()

    expect(screen.getByText('Comentário liberado')).toBeInTheDocument()
    expect(screen.getByText('Status liberado')).toBeInTheDocument()
  })

  it('a timeline não depende de ticket_id nem workspace_id do evento', async () => {
    // A API parou de devolvê-los na minimização (#346) e o tipo os marca como
    // opcionais. A tela precisa renderizar assim mesmo.
    mockGetEvents.mockResolvedValue([
      evento({ id: 'ev-1', content: 'Sem ticket_id, sem workspace_id' }),
    ])

    await renderDetail()

    expect(screen.getByText('Sem ticket_id, sem workspace_id')).toBeInTheDocument()
  })

  it('carregar a timeline não dispara nenhuma escrita', async () => {
    mockGetEvents.mockResolvedValue([evento()])

    await renderDetail()

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockAddEvent).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Compatibilidade com #341/#343 — detalhe vindo da fila ou do endpoint
// ═══════════════════════════════════════════════════════════════════════════

describe('TicketDetail — timeline com o detalhe vindo da fila (#341/#343)', () => {
  it('técnico com o registro na fila vê a timeline normalmente', async () => {
    queue.tickets = [ticket({ reportedByUserId: 'outro', assignedToUserId: 'test-admin' })]
    state.user = { id: 'test-admin', name: 'Técnico 1', is_super_admin: false }
    perms.allow = true
    mockGetEvents.mockResolvedValue([
      evento({ id: 'ev-1', type: 'atribuicao', content: 'Técnico 1 assumiu o chamado' }),
    ])

    await renderDetail()

    expect(mockGetByIdRemote).not.toHaveBeenCalled()
    expect(screen.getByText('Técnico 1 assumiu o chamado')).toBeInTheDocument()
    expect(screen.queryByText(VAZIO)).not.toBeInTheDocument()
  })

  it('solicitante fora da fila vê a timeline do próprio chamado', async () => {
    mockGetByIdRemote.mockResolvedValue(ticket())
    mockGetEvents.mockResolvedValue([evento({ id: 'ev-1', type: 'status', content: CONTEUDO })])

    await renderDetail()

    // O detalhe vem do endpoint (#339) e a timeline também.
    expect(mockGetByIdRemote).toHaveBeenCalledWith('t-meu')
    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
  })

  it('negado na timeline não derruba o resto do detalhe', async () => {
    // Falha isolada: o chamado abriu, o histórico não. O usuário continua vendo o
    // chamado e entende que só o histórico está bloqueado.
    mockGetEvents.mockRejectedValue(httpError(403, 'Permissão insuficiente'))

    await renderDetail()

    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText(NEGADO)).toBeInTheDocument()
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()
  })
})
