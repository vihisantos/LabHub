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
describe('TicketList — Meus Chamados (solicitante) x Meus Atendimentos (responsavel)', () => {
  const MEU = 'test-admin'

  const meu = (over: Record<string, unknown> = {}) => ({
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
    mockTickets.length = 0
    mockTickets.push(
      // 1) EU abri e EU sou o responsavel -> nos DOIS contextos
      meu({ id: 'a', ticketNumber: 1, reportedByUserId: MEU, assignedToUserId: MEU, assignedTo: 'Admin Teste' }),
      // 2) EU abri, responsavel e outro -> so Meus Chamados
      meu({ id: 'b', ticketNumber: 2, reportedByUserId: MEU, assignedToUserId: 'user-2', assignedTo: 'Tecnico 2' }),
      // 3) outro abriu, EU sou o responsavel -> so Meus Atendimentos
      meu({ id: 'c', ticketNumber: 3, reportedByUserId: 'user-3', assignedToUserId: MEU, assignedTo: 'Admin Teste' }),
      // 4) anonimo (sem reportedByUserId), EU sou o responsavel -> NUNCA e meu
      meu({ id: 'd', ticketNumber: 4, reportedByUserId: null, assignedToUserId: MEU, assignedTo: 'Admin Teste' }),
      // 5) meu, resolvido -> aparece em Meus Chamados no padrao (Ativos)
      meu({ id: 'e', ticketNumber: 5, reportedByUserId: MEU, status: 'resolvido', resolvedAt: '2026-06-21T12:00:00Z' }),
      // 6) meu, fechado/arquivado -> so via chip Arquivados
      meu({ id: 'f', ticketNumber: 6, reportedByUserId: MEU, status: 'fechado', archived: true, closedAt: '2026-06-22T12:00:00Z' }),
      // 7) nem meu nem atribuido a mim -> nunca
      meu({ id: 'g', ticketNumber: 7, reportedByUserId: 'user-9', assignedToUserId: 'user-9' }),
    )
  })

  it('Meus Chamados lista so os chamados abertos por mim (reportedByUserId)', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    // abertos por mim
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    // resolvido por mim tambem (nao arquivado)
    expect(screen.getByText('#5')).toBeInTheDocument()
    //-responsavel meu, mas abertos por outro
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
    // anonimo
    expect(screen.queryByText('#4')).not.toBeInTheDocument()
    // nem meu nem meu
    expect(screen.queryByText('#7')).not.toBeInTheDocument()
  })

  it('Meus Atendimentos lista so os chamados atribuidos a mim, e apenas abertos', async () => {
    render(<TicketList />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
    // atribuido a mim, mas anonimo
    expect(screen.getByText('#4')).toBeInTheDocument()
    // abertos por mim, mas de outro tecnico
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
    // resolvido sai da fila de trabalho
    expect(screen.queryByText('#5')).not.toBeInTheDocument()
    expect(screen.queryByText('#6')).not.toBeInTheDocument()
  })

  it('um tecnico pode estar nos dois contextos ao mesmo tempo, sem conflito', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    // #1:abri por mim E atribuido a mim -> visivel nos dois
    expect(screen.getByText('#1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))

    expect(screen.getByText('#1')).toBeInTheDocument()
    // #3 so aparece como atendimento (outra pessoa abriu)
    expect(screen.getByText('#3')).toBeInTheDocument()
    // #2 (abri eu) nao e atendimento meu
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
  })

  it('ser responsavel NAO torna o chamado um "Meus Chamados" (e vice-versa)', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    // atribuido a mim, mas aberto por outro => fora de Meus Chamados
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
    // aberto por mim, atribuido a outro => nao entra em Meus Chamados? SIM entra
    expect(screen.getByText('#2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
  })

  it('chamado anonimo (sem reportedByUserId) nunca pertence a Meus Chamados', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.queryByText('#4')).not.toBeInTheDocument()
  })

  it('arquivados meus continuam alcancaveis em Meus Chamados (regra diferente da fila)', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    // fechado nao entra no padrao (Ativos)
    expect(screen.queryByText('#6')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Arquivados/ }))

    expect(screen.getByText('#6')).toBeInTheDocument()
    // e o escopo de solicitante SOBREVIVE ao chip de status
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })

  it('em Meus Chamados, o chip de status refina sem trocar o escopo', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /^Resolvido/ }))

    // so o resolvido que EU abri
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    // o resolvido de outra pessoa continua fora
    expect(screen.queryByText('#3')).not.toBeInTheDocument()

    const chipMeus = screen.getByRole('button', { name: 'Meus Chamados' }) as HTMLButtonElement
    expect(chipMeus.className).toContain('bg-amber-500')
  })

  it('a rota /chamados/meus abre ja no contexto de solicitante', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    const chipMeus = screen.getByRole('button', { name: 'Meus Chamados' }) as HTMLButtonElement
    const chipAtendimentos = screen.getByRole('button', { name: 'Meus Atendimentos' }) as HTMLButtonElement
    const chipAtivos = screen.getByRole('button', { name: /^Ativos/ }) as HTMLButtonElement
    expect(chipMeus.className).toContain('bg-amber-500')
    expect(chipAtendimentos.className).not.toContain('bg-amber-500')
    expect(chipAtivos.className).not.toContain('bg-amber-500')
  })

  it('sem sessao autenticada a lista fica vazia em vez de expor a fila', async () => {
    mockUser.current = null
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.queryByText('#1')).not.toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
    expect(screen.queryByText('#7')).not.toBeInTheDocument()
    expect(screen.getByText('Você ainda não abriu nenhum chamado nesta unidade')).toBeInTheDocument()
  })

  it('a lista nao vazia de Meus Chamados usa o texto de estado proprio', async () => {
    mockTickets.length = 0
    mockTickets.push(meu({ id: 'z', ticketNumber: 9, reportedByUserId: 'outro' }))
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    expect(screen.getByText('Você ainda não abriu nenhum chamado nesta unidade')).toBeInTheDocument()
  })

  it('os dois chips sao mutuamente exclusivos (fila x solicitante)', async () => {
    render(<TicketList defaultScope="chamados" />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Meus Atendimentos' }))
    const chipMeus = screen.getByRole('button', { name: 'Meus Chamados' }) as HTMLButtonElement
    const chipAtendimentos = screen.getByRole('button', { name: 'Meus Atendimentos' }) as HTMLButtonElement
    expect(chipAtendimentos.className).toContain('bg-amber-500')
    expect(chipMeus.className).not.toContain('bg-amber-500')
  })
})
