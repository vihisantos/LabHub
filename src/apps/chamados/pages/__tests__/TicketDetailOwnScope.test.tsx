import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

/**
 * TicketDetail — detalhe resolvido por `GET /api/chamados/:id` quando o registro
 * não está na coleção da fila operacional.
 *
 * Contexto: a coleção local (`TicketsContext`) é a FILA de trabalho. Ela nunca
 * cobre o chamado do solicitante que vem de "Meus Chamados" — a lista pessoal vem
 * de `listMine()`, por outro caminho — então a tela caía em "Chamado não
 * encontrado" mesmo com o backend já autorizando o acesso (PR #339).
 *
 * O que estes testes travam:
 *   · solicitante abre o PRÓPRIO chamado e vê o detalhe real;
 *   · usuário com `ticket.view` continua resolvendo pela fila, sem chamada extra;
 *   · `404` continua sendo "não encontrado";
 *   · `403` NÃO vira sucesso, não vira "não encontrado" e não cai na fila;
 *   · a autorização é do servidor: o frontend não manda identidade, não manda
 *     `mine=true` e não reimplementa regra de RBAC.
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

// Coleção da fila — controlável por teste. Vazio reproduz o solicitante.
const queue = vi.hoisted(() => ({ tickets: [] as any[] }))
const state = vi.hoisted(() => ({
  user: { id: 'test-admin', name: 'Admin Teste', is_super_admin: false } as any,
}))
const leadState = vi.hoisted(() => ({ isLeadership: false }))

// O mock global de `usePermissions` CONCEDE tudo por padrão. Para reproduzir o
// solicitante de verdade é preciso negar explicitamente — senão o teste
// "somente-leitura" passaria por acidente, com o usuário dono de todas as
// Actions.
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

/** Erro com status, como o `ticketService` produz a partir da resposta HTTP. */
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
  // `errorStatus` é o mesmo helper do serviço real: a página o consome, e o
  // mock precisa refletir o contrato em vez de improvisar.
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

beforeEach(() => {
  vi.clearAllMocks()
  queue.tickets = []
  state.user = { id: 'user-solicitante', name: 'Prof. Maria', is_super_admin: false }
  leadState.isLeadership = false
  mockGetEvents.mockResolvedValue([])
  mockGetAssignees.mockResolvedValue([])
  mockGetByIdRemote.mockResolvedValue(ticket())
  mockPatchRemote.mockResolvedValue(ticket())
})

// O solicitante não tem Action `ticket.*` nenhuma.
beforeEach(() => {
  perms.allow = false
})

// ── Solicitante: o próprio chamado, sem `ticket.view` ────────────────────────

describe('TicketDetail — chamado vindo de Meus Chamados (fora da fila)', () => {
  it('solicitante sem ticket.view abre o próprio chamado e vê o detalhe', async () => {
    await renderDetail()

    // Não está na fila, então o registro vem do endpoint individual.
    expect(mockGetByIdRemote).toHaveBeenCalledWith('t-meu')
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.getByText('Laboratório 03')).toBeInTheDocument()
    // E não é a tela de "não encontrado".
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()
  })

  it('a fila não é a fonte do detalhe quando ela não tem o registro', async () => {
    queue.tickets = [ticket({ id: 'outro-da-fila', ticketNumber: 999 })]
    await renderDetail()

    // A fila foi consultada, mas o registro exibido é o do endpoint.
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.queryByText('#999')).not.toBeInTheDocument()
  })

  it('mostra estado de carregamento em vez de "não encontrado"', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockGetByIdRemote.mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<TicketDetail />)
    await act(async () => {})

    expect(screen.getByLabelText('Carregando chamado')).toBeInTheDocument()
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()

    await act(async () => { resolve(ticket()) })
    expect(screen.queryByLabelText('Carregando chamado')).not.toBeInTheDocument()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })

  it('solicitante fica somente-leitura: nenhuma ação operacional é exposta', async () => {
    // `perms.allow = false` (beforeEach): o solicitante não tem nenhuma Action
    // `ticket.*`, que é exatamente o caso que a #339 abriu.
    await renderDetail()

    // O detalhe carrega, mas os controles de atendimento não aparecem.
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assumir/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Definir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Alta$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument()
  })

  it('carregar o detalhe não dispara nenhuma escrita', async () => {
    await renderDetail()

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('nenhuma identidade ou parâmetro de escopo é enviado pelo frontend', async () => {
    await renderDetail()

    expect(mockGetByIdRemote).toHaveBeenCalledWith('t-meu')
    const arg = mockGetByIdRemote.mock.calls[0][0]
    // Só o id do recurso. Nada de solicitante, workspace, mine ou flag de
    // autorização: a identidade vem do JWT, no servidor.
    expect(typeof arg).toBe('string')
    expect(arg).not.toContain('reportedBy')
    expect(arg).not.toContain('mine')
    expect(arg).not.toContain('user')
  })
})

// ── Área operacional: comportamento intacto ─────────────────────────────────

describe('TicketDetail — área operacional não muda', () => {
  it('com o registro na fila, não busca no endpoint individual', async () => {
    queue.tickets = [ticket({ reportedByUserId: 'outro', assignedToUserId: 'test-admin' })]
    state.user = { id: 'test-admin', name: 'Técnico 1', is_super_admin: false }

    await renderDetail()

    expect(mockGetByIdRemote).not.toHaveBeenCalled()
    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
  })

  it('técnico responsável continua vendo e usando as ações', async () => {
    queue.tickets = [ticket({ assignedToUserId: 'test-admin', assignedTo: 'Admin Teste' })]
    state.user = { id: 'test-admin', name: 'Admin Teste', is_super_admin: false }
    perms.allow = true

    await renderDetail()

    expect(screen.getByText('Notebook Dell')).toBeInTheDocument()
    expect(mockGetByIdRemote).not.toHaveBeenCalled()
    // Tendo `ticket.edit`, os controles de atendimento continuam disponíveis.
    expect(screen.getByRole('button', { name: 'Definir' })).toBeInTheDocument()
  })
})

// ── Estados de erro ────────────────────────────────────────────────────────

describe('TicketDetail — resposta do servidor é respeitada', () => {
  it('404 continua tratado como chamado inexistente', async () => {
    mockGetByIdRemote.mockRejectedValue(httpError(404, 'Chamado não encontrado'))

    await renderDetail()

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
  })

  it('403 vira acesso negado — não sucesso, não "não encontrado"', async () => {
    mockGetByIdRemote.mockRejectedValue(httpError(403, 'Permissão insuficiente'))

    await renderDetail()

    expect(screen.getByText('Você não tem acesso a este chamado')).toBeInTheDocument()
    // A mensagem original do servidor não é exposta como se fosse erro técnico,
    // e — sobretudo — nada do chamado é renderizado.
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
    expect(screen.queryByText('Permissão insuficiente')).not.toBeInTheDocument()
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()
  })

  it('403 não mostra nenhum outro registro da fila no lugar', async () => {
    // A fila tem OUTRO chamado. O ID da rota é 't-meu', então a fila não
    // resolve o detalhe e o endpoint é consultado — e nega.
    queue.tickets = [ticket({ id: 'da-fila', ticketNumber: 999 })]
    mockGetByIdRemote.mockRejectedValue(httpError(403, 'Permissão insuficiente'))

    await renderDetail()

    expect(mockGetByIdRemote).toHaveBeenCalledWith('t-meu')
    expect(screen.getByText('Você não tem acesso a este chamado')).toBeInTheDocument()
    // O registro alheio da fila não pode aparecer como se fosse o detalhe.
    expect(screen.queryByText('#999')).not.toBeInTheDocument()
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
  })

  it('erro sem status (rede) mostra falha de comunicação, não "não encontrado"', async () => {
    mockGetByIdRemote.mockRejectedValue(new Error('Failed to fetch'))

    await renderDetail()

    expect(screen.getByText('Não foi possível carregar o chamado')).toBeInTheDocument()
    expect(screen.queryByText('Notebook Dell')).not.toBeInTheDocument()
    // Falha de rede não pode se passar por "o chamado não existe".
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()
  })

  it('erro do cliente sem status também não vira "não encontrado"', async () => {
    mockGetByIdRemote.mockRejectedValue(new Error('ID do chamado inválido'))

    await renderDetail()

    expect(screen.getByText('Não foi possível carregar o chamado')).toBeInTheDocument()
    expect(screen.queryByText('Você não tem acesso a este chamado')).not.toBeInTheDocument()
    expect(screen.queryByText('Chamado não encontrado')).not.toBeInTheDocument()
  })
})

// ── Escrita em registro vindo do endpoint ──────────────────────────────────

describe('TicketDetail — escrita com registro fora da fila (#342)', () => {
  it('fora da fila, a escrita vai por PATCH no recurso, não pela cache da fila', async () => {
    // Usuário operacional por deep link: o chamado não está na fila. Como
    // `getByIdRemote` não grava mais na coleção (#342), `update` do contexto
    // não alcançaria a API — a escrita precisa ir direto ao recurso.
    queue.tickets = []
    state.user = { id: 'test-admin', name: 'Técnico 1', is_super_admin: true }
    perms.allow = true
    mockGetByIdRemote.mockResolvedValue(ticket({ assignedToUserId: 'test-admin' }))
    mockPatchRemote.mockResolvedValue(ticket({ assignedToUserId: 'test-admin' }))

    await renderDetail()
    expect(mockGetByIdRemote).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByPlaceholderText('Mensagem personalizada...'), {
      target: { value: 'Sem conexao' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Definir' }))
    })

    // `update` do contexto NÃO pode ser o caminho: ele só PATCHa registros que
    // já estão na cache local.
    expect(mockPatchRemote).toHaveBeenCalledWith('t-meu', { statusNote: 'Sem conexao' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('com o registro na fila, a escrita continua pelo contexto (caminho operacional)', async () => {
    queue.tickets = [ticket({ assignedToUserId: 'test-admin', assignedTo: 'Admin Teste' })]
    state.user = { id: 'test-admin', name: 'Admin Teste', is_super_admin: false }
    perms.allow = true

    await renderDetail()

    fireEvent.change(screen.getByPlaceholderText('Mensagem personalizada...'), {
      target: { value: 'Testei a sala' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Definir' }))
    })

    expect(mockUpdate).toHaveBeenCalledWith('t-meu', { statusNote: 'Testei a sala' })
    expect(mockPatchRemote).not.toHaveBeenCalled()
    expect(mockGetByIdRemote).not.toHaveBeenCalled()
  })

  it('falha na escrita fora da fila é exibida, não engolida', async () => {
    queue.tickets = []
    state.user = { id: 'test-admin', name: 'Técnico 1', is_super_admin: true }
    perms.allow = true
    mockGetByIdRemote.mockResolvedValue(ticket({ assignedToUserId: 'test-admin' }))
    mockPatchRemote.mockRejectedValue(httpError(403, 'Permissão insuficiente'))

    await renderDetail()

    fireEvent.change(screen.getByPlaceholderText('Mensagem personalizada...'), {
      target: { value: 'Tentativa' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Definir' }))
    })

    expect(screen.getByText('Permissão insuficiente')).toBeInTheDocument()
  })
})
