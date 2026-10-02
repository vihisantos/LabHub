import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const TICKETS = vi.hoisted(() => [
  {
    id: 't1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: 'Admin Teste',
    assignedToUserId: 'test-admin',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-20T12:00:00Z',
    updatedAt: '2026-06-20T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't2',
    ticketNumber: 2,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Lab 2',
    assetName: '',
    problemCategory: 'Projetor',
    problemArea: 'academica',
    problemDescription: 'Projetor sem imagem',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Ana',
    reportedByEmail: '',
    assignedTo: 'Técnico 2',
    assignedToUserId: 'user-2',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-21T12:00:00Z',
    updatedAt: '2026-06-21T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't3',
    ticketNumber: 3,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 202',
    assetName: '',
    problemCategory: 'Áudio',
    problemArea: 'academica',
    problemDescription: 'Sem som',
    status: 'fechado',
    priority: 'normal',
    reportedBy: 'Prof. Bia',
    reportedByEmail: '',
    assignedTo: 'Admin Teste',
    assignedToUserId: 'test-admin',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: true,
    closedAt: '2026-06-22T12:00:00Z',
    closedBy: 'Admin Teste',
    statusNote: '',
    createdAt: '2026-06-19T12:00:00Z',
    updatedAt: '2026-06-22T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't4',
    ticketNumber: 4,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Lab 3',
    assetName: '',
    problemCategory: 'Impressora',
    problemArea: 'administrativa',
    problemDescription: 'Sem tinta',
    status: 'aberto',
    priority: 'alta',
    reportedBy: 'Prof. Carla',
    reportedByEmail: '',
    assignedTo: 'Técnico 4',
    assignedToUserId: 'user-4',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-18T12:00:00Z',
    updatedAt: '2026-06-18T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't5',
    ticketNumber: 5,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Lab 4',
    assetName: '',
    problemCategory: 'Rede',
    problemArea: 'academica',
    problemDescription: 'Cabo solto',
    status: 'a_caminho',
    priority: 'normal',
    reportedBy: 'Prof. Danilo',
    reportedByEmail: '',
    assignedTo: '',
    assignedToUserId: '',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-17T12:00:00Z',
    updatedAt: '2026-06-17T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't6',
    ticketNumber: 6,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 300',
    assetName: '',
    problemCategory: 'Projetor',
    problemArea: 'academica',
    problemDescription: 'HDMI queimado',
    status: 'em_atendimento',
    priority: 'urgente',
    reportedBy: 'Prof. Elena',
    reportedByEmail: '',
    assignedTo: 'Técnico 6',
    assignedToUserId: 'user-6',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-16T12:00:00Z',
    updatedAt: '2026-06-16T12:00:00Z',
    resolvedAt: null,
  },
])

const mockReload = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => ({ value: '' }))
const mockTickets = vi.hoisted(() => [] as any[])
const slaTicketFactory = vi.hoisted(() => (id: string, ticketNumber: number, createdAt: string, over: Record<string, unknown> = {}) => ({
  id,
  ticketNumber,
  workspace_id: 'ws-a',
  roomId: '',
  roomName: 'Sala SLA',
  assetName: '',
  problemCategory: 'Rede',
  problemArea: 'academica',
  problemDescription: 'Conexão instável',
  status: 'aberto',
  priority: 'normal',
  reportedBy: 'Prof. Hugo',
  reportedByEmail: '',
  assignedTo: 'Técnico 7',
  assignedToUserId: 'user-7',
  feedbackRating: null,
  feedbackComment: '',
  feedbackAt: null,
  archived: false,
  closedAt: null,
  closedBy: '',
  statusNote: '',
  createdAt,
  updatedAt: createdAt,
  resolvedAt: null,
  ...over,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(mockSearchParams.value)],
}))
// Meus Chamados vem de `GET /api/chamados?mine=true`. Este mock representa o
// RESPOSTA DO SERVIDOR: é a única fonte da tela quando o filtro de solicitante
// está ligado. `mockTickets` (o contexto) é a fila de trabalho e, nesse modo,
// não pode aparecer.
const mockListMine = vi.hoisted(() => vi.fn())
vi.mock('../../services/ticketService', () => ({
  ticketService: { listMine: mockListMine },
}))
vi.mock('../../contexts/TicketsContext', () => ({
  useTicketsContext: () => ({ tickets: mockTickets, loading: false, syncing: false, reload: mockReload }),
}))
// Usuário da sessão. Configurável para provar o caso "sem sessão" sem desmontar
// os outros describes.
const mockUser = vi.hoisted(() => ({
  current: { id: 'test-admin', name: 'Admin Teste' } as { id: string; name: string } | null,
}))
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser.current }),
}))

import { TicketList } from '../TicketList'

describe('TicketList — fila do técnico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.value = ''
    mockTickets.length = 0
    mockTickets.push(...TICKETS)
  })

  it('mostra apenas os chamados abertos atribuídos a mim em "Meus Atendimentos"', async () => {
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })

  it('botão de refresh chama reload e não recarrega a página', async () => {
    render(<TicketList />)
    await act(async () => {})

    const refreshBtn = screen.getByLabelText('Atualizar lista')
    fireEvent.click(refreshBtn)

    expect(mockReload).toHaveBeenCalledTimes(1)
  })

  it('filtros permanecem após refresh', async () => {
    render(<TicketList />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))
    expect(screen.getByText('#1')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Atualizar lista'))
    await act(async () => {})

    // Filtro "Meus Atendimentos" ainda ativo
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
  })
})

describe('TicketList — Fase 2.1: query params da Central inicializam os filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.value = ''
    mockTickets.length = 0
    mockTickets.push(...TICKETS)
  })

  it('?status=aberto inicializa o filtro de status existente', async () => {
    mockSearchParams.value = '?status=aberto'
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.queryByText('#5')).not.toBeInTheDocument()
    expect(screen.queryByText('#6')).not.toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()

    const chip = screen.getByRole('button', { name: /^Aberto/ }) as HTMLButtonElement
    expect(chip.className).toContain('bg-amber-500')
  })

  it('?status=em_andamento cobre os dois status existentes (a_caminho + em_atendimento)', async () => {
    mockSearchParams.value = '?status=em_andamento'
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
    expect(screen.queryByText('#4')).not.toBeInTheDocument()
  })

  it('?priority=alta inicializa o filtro de prioridade existente', async () => {
    mockSearchParams.value = '?priority=alta'
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#6')).not.toBeInTheDocument()
  })

  it('?unassigned=1 ativa "Sem responsável" (assignedToUserId vazio)', async () => {
    mockSearchParams.value = '?unassigned=1'
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#4')).not.toBeInTheDocument()

    const chip = screen.getByRole('button', { name: 'Sem responsável' }) as HTMLButtonElement
    expect(chip.className).toContain('bg-amber-500')
  })

  it('?status inválido é ignorado (comportamento padrão)', async () => {
    mockSearchParams.value = '?status=inexistente'
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })

  it('sem query params mantém o comportamento atual (ativos por padrão)', async () => {
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })

  it('chip "Sem responsável" alterna e não quebra os filtros existentes', async () => {
    render(<TicketList />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Sem responsável' }))
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.queryByText('#5')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Prioridades$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Urgente' }))
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#5')).not.toBeInTheDocument()
  })

  it('chip "Em andamento" cobre os dois status e o count soma os dois', async () => {
    render(<TicketList />)
    await act(async () => {})

    const chip = screen.getByRole('button', { name: /Em andamento/ }) as HTMLButtonElement
    expect(chip.className).not.toContain('bg-amber-500')

    fireEvent.click(screen.getByRole('button', { name: /Em andamento/ }))
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#4')).not.toBeInTheDocument()
  })
})

describe('TicketList — Fase 2.2: deep link ?sla= da Central (álertas de SLA)', () => {
  const NOW_SLA = new Date('2026-06-25T12:00:00Z')
  const HOUR = 1000 * 60 * 60
  const slaNear = () => slaTicketFactory('sla-near', 7, new Date(NOW_SLA.getTime() - 20 * HOUR).toISOString())
  const slaOverdue = () => slaTicketFactory('sla-overdue', 8, new Date(NOW_SLA.getTime() - 30 * HOUR).toISOString())
  const slaOverdueUnassigned = () =>
    slaTicketFactory('sla-overdue-unassigned', 9, new Date(NOW_SLA.getTime() - 30 * HOUR).toISOString(), {
      assignedTo: '',
      assignedToUserId: '',
    })
  const slaResolvedOverdue = () =>
    slaTicketFactory('sla-resolved-overdue', 10, new Date(NOW_SLA.getTime() - 30 * HOUR).toISOString(), {
      status: 'resolvido',
    })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.value = ''
  })

  it('?sla=near mostra apenas os próximos do vencimento (mesma regra do getSlaState)', async () => {
    mockSearchParams.value = '?sla=near'
    mockTickets.length = 0
    mockTickets.push(slaNear(), slaOverdue(), slaOverdueUnassigned(), slaResolvedOverdue())
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.queryByText('#8')).not.toBeInTheDocument()
    expect(screen.queryByText('#9')).not.toBeInTheDocument()
    expect(screen.queryByText('#10')).not.toBeInTheDocument()
  })

  it('?sla=overdue mostra apenas os vencidos em fluxo aberto (resolvidos fora)', async () => {
    mockSearchParams.value = '?sla=overdue'
    mockTickets.length = 0
    mockTickets.push(slaNear(), slaOverdue(), slaOverdueUnassigned(), slaResolvedOverdue())
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#8')).toBeInTheDocument()
    expect(screen.getByText('#9')).toBeInTheDocument()
    expect(screen.queryByText('#7')).not.toBeInTheDocument()
    expect(screen.queryByText('#10')).not.toBeInTheDocument()
  })

  it('?sla=overdue combina com ?unassigned=1 (filtro único, sem substituir os existentes)', async () => {
    mockSearchParams.value = '?sla=overdue&unassigned=1'
    mockTickets.length = 0
    mockTickets.push(slaNear(), slaOverdue(), slaOverdueUnassigned(), slaResolvedOverdue())
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#9')).toBeInTheDocument()
    expect(screen.queryByText('#8')).not.toBeInTheDocument()
    expect(screen.queryByText('#7')).not.toBeInTheDocument()
  })

  it('?sla inválido é ignorado (comportamento padrão)', async () => {
    mockSearchParams.value = '?sla=banana'
    mockTickets.length = 0
    mockTickets.push(slaNear(), slaOverdue(), slaOverdueUnassigned(), slaResolvedOverdue())
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getByText('#8')).toBeInTheDocument()
    expect(screen.getByText('#9')).toBeInTheDocument()
    expect(screen.getByText('#10')).toBeInTheDocument()
  })

  it('sem ?sla mantém o comportamento atual (nenhum filtro SLA ativo)', async () => {
    mockTickets.length = 0
    mockTickets.push(slaNear(), slaOverdue(), slaOverdueUnassigned(), slaResolvedOverdue())
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getByText('#8')).toBeInTheDocument()
    expect(screen.getByText('#9')).toBeInTheDocument()
    expect(screen.getByText('#10')).toBeInTheDocument()
  })
})

/**
 * Meus Chamados (solicitante) e Meus Atendimentos (responsável) são conceitos
 * DISTINTOS que o mesmo técnico pode ter ao mesmo tempo. Estes testes travam que:
 *   · a identidade do solicitante é o UUID da sessão (`reportedByUserId`), nunca
 *     nome/e-mail;
 *   · ser responsável NÃO faz o chamado ser "meu chamado", e vice-versa;
 *   · chamado anônimo (sem `reportedByUserId`) nunca é meu;
 *   · arquivados meus continuam alcançáveis em Meus Chamados — a exclusão de
 *     arquivados de "Meus Atendimentos" NÃO é copiada, porque ali é fila de
 *     trabalho em aberto e aqui é histórico de pedidos.
 */
describe('TicketList — Meus Chamados (escopo de servidor) x Meus Atendimentos (fila)', () => {
  const MEU = 'test-admin'

  const ticket = (over: Record<string, unknown> = {}) => ({
    id: 'a',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexao',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: 'maria@x.com',
    reportedByUserId: MEU,
    assignedTo: '',
    assignedToUserId: '',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-20T12:00:00Z',
    updatedAt: '2026-06-20T12:00:00Z',
    resolvedAt: null,
    ...over,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.value = ''
    mockUser.current = { id: MEU, name: 'Admin Teste' }
    // Fila de trabalho: estes NÃO podem aparecer em Meus Chamados.
    mockTickets.length = 0
    mockTickets.push(
      ticket({ id: 'fila-1', ticketNumber: 90, reportedByUserId: 'user-9', assignedToUserId: MEU }),
      ticket({ id: 'fila-2', ticketNumber: 91, reportedByUserId: null, assignedToUserId: MEU }),
    )
    // Resposta do servidor para mine=true: só o que EU abri.
    mockListMine.mockResolvedValue([
      ticket({ id: 'meu-1', ticketNumber: 1, reportedByUserId: MEU, assignedToUserId: MEU }),
      ticket({ id: 'meu-2', ticketNumber: 2, reportedByUserId: MEU, assignedToUserId: 'user-2' }),
      ticket({ id: 'meu-3', ticketNumber: 5, reportedByUserId: MEU, status: 'resolvido', resolvedAt: '2026-06-21T12:00:00Z' }),
      ticket({ id: 'meu-4', ticketNumber: 6, reportedByUserId: MEU, status: 'fechado', archived: true, closedAt: '2026-06-22T12:00:00Z' }),
    ])
  })

  it('Meus Chamados consulta o servidor (mine=true) e usa SÓ o que ele devolveu', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(mockListMine).toHaveBeenCalledTimes(1)
    // O que o servidor devolveu aparece...
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    // ...e a FILA não aparece — nem por filtro, nem por fallback.
    expect(screen.queryByText('#90')).not.toBeInTheDocument()
    expect(screen.queryByText('#91')).not.toBeInTheDocument()
  })

  it('o filtro de solicitante NÃO é aplicado sobre a fila em nenhum momento', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    // Os dois chamados da fila TÊM requestedBy/solicitante de outra pessoa (ou
    // nulo). Se o código filtrasse a fila no cliente, eles nunca apareceriam —
    // mas também nunca apareceriam os que o servidor devolveu. A prova é que a
    // fila não é consultada e listMine é.
    expect(mockListMine).toHaveBeenCalled()
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('se a consulta do servidor falha, NÃO volta para a fila', async () => {
    mockListMine.mockRejectedValue(new Error('Sem conexão'))
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.getByText('Sem conexão')).toBeInTheDocument()
    expect(screen.queryByText('#90')).not.toBeInTheDocument()
    expect(screen.queryByText('#91')).not.toBeInTheDocument()
    expect(screen.getByText('Nada a exibir por enquanto.')).toBeInTheDocument()
  })

  it('Meus Atendimentos usa a fila e NÃO chama mine=true', async () => {
    render(<TicketList />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))

    expect(mockListMine).not.toHaveBeenCalled()
    // Fila operacional: atribuição + só abertos
    expect(screen.getByText('#90')).toBeInTheDocument()
    expect(screen.getByText('#91')).toBeInTheDocument()
    // e nada do escopo pessoal aparece por acidente
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
  })

  it('voltar para Meus Chamados refaz a consulta do servidor', async () => {
    render(<TicketList />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Chamados' }))
    await act(async () => {})

    expect(mockListMine).toHaveBeenCalledTimes(1)
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.queryByText('#90')).not.toBeInTheDocument()
  })

  it('meu resolvido aparece; meu fechado fica atrás do chip Arquivados', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.queryByText('#6')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Arquivados/ }))

    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
  })

  it('o chip de status refina o conjunto do servidor sem trocar o escopo', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /^Resolvido/ }))

    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meus Chamados' }).className).toContain('bg-amber-500')
    expect(mockListMine).toHaveBeenCalledTimes(1)
  })

  it('busca textual e ordenação continuam funcionando sobre o conjunto do servidor', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('Buscar por #, sala, ativo ou problema...'), {
      target: { value: 'Lab 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sala' }))
    await act(async () => {})

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
  })

  it('o botão de atualizar refaz a consulta do servidor', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})
    expect(mockListMine).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Atualizar lista'))
    await act(async () => {})

    expect(mockListMine).toHaveBeenCalledTimes(2)
  })

  it('a rota /chamados/meus abre já no contexto de solicitante', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    const chipMeus = screen.getByRole('button', { name: 'Meus Chamados' }) as HTMLButtonElement
    const chipAtendimentos = screen.getByRole('button', { name: 'Meus Atendimentos' }) as HTMLButtonElement
    expect(chipMeus.className).toContain('bg-amber-500')
    expect(chipAtendimentos.className).not.toContain('bg-amber-500')
  })

  it('defesa em profundidade: sem sessão, nem o que o servidor devolveu aparece', async () => {
    mockUser.current = null
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.getByText('Você ainda não abriu nenhum chamado nesta unidade')).toBeInTheDocument()
  })

  it('servidor devolveu vazio: estado vazio com mensagem própria', async () => {
    mockListMine.mockResolvedValue([])
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.getByText('Você ainda não abriu nenhum chamado nesta unidade')).toBeInTheDocument()
    expect(screen.queryByText('#90')).not.toBeInTheDocument()
  })

  it('os dois chips são mutuamente exclusivos (fila x solicitante)', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))
    const chipMeus = screen.getByRole('button', { name: 'Meus Chamados' }) as HTMLButtonElement
    const chipAtendimentos = screen.getByRole('button', { name: 'Meus Atendimentos' }) as HTMLButtonElement
    expect(chipAtendimentos.className).toContain('bg-amber-500')
    expect(chipMeus.className).not.toContain('bg-amber-500')
  })
})
