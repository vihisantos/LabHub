import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setCol } from '../../../../lib/db'
import { ticketService } from '../ticketService'

/**
 * #342 — a coleção `chamados` não pode carregar dado de escopo pessoal.
 *
 * Este arquivo existe para responder UMA pergunta, do jeito que ela aconteceria
 * no navegador: **um usuário consegue herdar o chamado de outro pela cache?**
 *
 * A cadeia da exposição era:
 *
 *   1. A (sem `ticket.view`) abre o próprio chamado em Meus Chamados;
 *   2. `getByIdRemote()` busca em `GET /api/chamados/:id` — o backend autoriza,
 *      porque `reportedByUserId == A`;
 *   3. o método chamava `persistLocal()`, gravando o registro na coleção
 *      `chamados` — que é a cache da FILA;
 *   4. A faz logout. `authService.signOut()` não toca em cache nenhuma;
 *   5. B entra no mesmo navegador. `pullRemote()` de B volta `403` e é
 *      engolido; `load()` ainda renderiza o que está na cache local;
 *   6. B vê o chamado de A na fila operacional.
 *
 * Nada disso é falha de autorização — o backend continuava recusando tudo. É
 * escopo de cache: dado autorizado para um escopo, guardado no cache de outro.
 *
 * Os testes usam a coleção real de `src/lib/db` (o mesmo `setCol`/`getAll` que a
 * fila usa), e não um mock: a pergunta é sobre onde o dado foi gravado.
 */

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response)
}

/** Registro no formato de fila, para as asserções de cache. */
function ticket(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
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
    reportedByUserId: 'user-a',
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
  } as any
}

beforeEach(() => {
  vi.restoreAllMocks()
  setCol('chamados', [])
})

// ── 2) o caminho pessoal não escreve na cache da fila ──────────────────────

describe('#342 — getByIdRemote não persiste na cache da fila', () => {
  it('o registro lido no escopo pessoal não aparece em getAll()', async () => {
    mockFetch({ ticket: ticket('t-do-a') })

    await ticketService.getByIdRemote('t-do-a')

    expect(ticketService.getAll()).toHaveLength(0)
  })

  it('não depende de reportedByUserId: mesmo com solicitante preenchido, não grava', async () => {
    // A regra é por VIA DE ACESSO, não por conteúdo. Um chamado com
    // `reportedByUserId` de outra pessoa é lido igualmente e igualmente não é
    // gravado — a decisão não olha o campo.
    mockFetch({ ticket: ticket('t-de-outro', { reportedByUserId: 'user-b' }) })

    await ticketService.getByIdRemote('t-de-outro')

    expect(ticketService.getAll()).toHaveLength(0)
  })

  it('não depende de status, prioridade ou qualquer outro campo', async () => {
    for (const over of [
      { status: 'fechado', archived: true },
      { status: 'aberto' },
      { priority: 'urgente' },
    ]) {
      setCol('chamados', [])
      mockFetch({ ticket: ticket('t-x', over) })
      await ticketService.getByIdRemote('t-x')
      expect(ticketService.getAll()).toHaveLength(0)
    }
  })
})

// ── 4) TROCA DE USUÁRIO: o critério final da issue ─────────────────────────

describe('#342 — troca de usuário não herda dado pessoal', () => {
  it('A abre o próprio chamado, faz logout, B não enxerga nada', async () => {
    // ── Sessão A: abre o próprio chamado (sem ticket.view) ────────────────
    mockFetch({ ticket: ticket('t-do-a', { reportedByUserId: 'user-a' }) })
    const lidoPorA = await ticketService.getByIdRemote('t-do-a')

    // A viu o seu chamado.
    expect(lidoPorA.id).toBe('t-do-a')

    // ── logout de A ────────────────────────────────────────────────────────
    // `authService.signOut()` só encerra a sessão Supabase; não há limpeza de
    // cache. O que importa é que a coleta NÃO precisou ser limpa: o registro
    // nunca entrou.
    expect(ticketService.getAll()).toHaveLength(0)

    // ── Sessão B: novo login no MESMO navegador ────────────────────────────
    // B tem ticket.view; a fila dele sincroniza normalmente. O chamado de B
    // diverge em sala E em solicitante, para que as checagens não sejam
    // enganosas por acaso (o factory usa os mesmos valores padrão).
    mockFetch({
      tickets: [
        ticket('t-da-fila-b', {
          reportedByUserId: 'user-x',
          roomName: 'Sala 300',
          reportedBy: 'Prof. Carlos',
        }),
      ],
    })
    await ticketService.pullRemote()
    const filaDeB = ticketService.getAll()

    // B vê a própria fila...
    expect(filaDeB.map((t) => t.id)).toEqual(['t-da-fila-b'])
    // ...e NÃO vê nada de A — nem pelo id, nem pela sala, nem pelo assunto.
    expect(ticketService.getByIdNoFilter('t-do-a')).toBeUndefined()
    expect(filaDeB.some((t) => t.id === 't-do-a')).toBe(false)
    expect(filaDeB.some((t) => t.roomName === 'Laboratório 03')).toBe(false)
    expect(filaDeB.some((t) => t.reportedBy === 'Prof. Maria')).toBe(false)
  })

  it('B sem ticket.view (pullRemote 403) também não vê nada de A', async () => {
    mockFetch({ ticket: ticket('t-do-a', { reportedByUserId: 'user-a' }) })
    await ticketService.getByIdRemote('t-do-a')

    // B também é solicitante: o pullRemote dele volta 403.
    mockFetch({ error: 'Permissão insuficiente' }, false, 403)
    await ticketService.pullRemote().catch(() => {})

    // Mesmo assim, a lista local de B está vazia — não há cache herdada.
    expect(ticketService.getAll()).toHaveLength(0)
  })

  it('o registro de A não reaparece nem por getByIdNoFilter (busca sem filtro)', async () => {
    mockFetch({ ticket: ticket('t-do-a') })
    await ticketService.getByIdRemote('t-do-a')

    expect(ticketService.getByIdNoFilter('t-do-a')).toBeUndefined()
    expect(ticketService.getById('t-do-a')).toBeUndefined()
    expect(ticketService.query(() => true)).toHaveLength(0)
    expect(ticketService.getActive()).toHaveLength(0)
  })
})

// ── 3) a cache operacional legítima continua intacta ───────────────────────

describe('#342 — o fluxo operacional não regride', () => {
  it('pullRemote continua populando e reusando a cache da fila', async () => {
    mockFetch({ tickets: [ticket('t-1'), ticket('t-2')] })
    await ticketService.pullRemote()

    expect(ticketService.getAll().map((t) => t.id).sort()).toEqual(['t-1', 't-2'])
    expect(ticketService.getByIdNoFilter('t-1')).toBeDefined()
  })

  it('update() continua persistindo e chamando o PATCH', async () => {
    setCol('chamados', [ticket('t-1')])
    mockFetch({ ticket: ticket('t-1', { status: 'em_atendimento' }) })

    ticketService.update('t-1', { status: 'em_atendimento' })

    expect(ticketService.getByIdNoFilter('t-1')).toBeDefined()
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chamados/t-1', expect.objectContaining({ method: 'PATCH' }))
    })
  })

  it('create() continua persistindo (criação é caminho operacional)', async () => {
    mockFetch({ ticket: ticket('t-novo') })
    await ticketService.create({
      roomId: '',
      roomName: 'Sala 1',
      problemCategory: 'Internet',
      problemArea: 'academica',
      problemDescription: 'x',
      status: 'aberto',
      priority: 'normal',
      reportedBy: 'Prof.',
      reportedByEmail: '',
      assignedTo: '',
      assignedToUserId: '',
      archived: false,
      closedAt: null,
      closedBy: '',
      statusNote: '',
      createdAt: '2026-10-01T10:00:00',
      updatedAt: '2026-10-01T10:00:00',
      resolvedAt: null,
      workspace_id: 'ws-a',
    } as any)

    expect(ticketService.getByIdNoFilter('t-novo')).toBeDefined()
  })

  it('ler um chamado da fila NÃO a apaga nem a desloca', async () => {
    const original = [ticket('t-1'), ticket('t-2')]
    setCol('chamados', [...original])
    mockFetch({ ticket: ticket('t-2', { updatedAt: '2026-10-05T09:00:00' }) })

    await ticketService.getByIdRemote('t-2')

    const cache = ticketService.getAll()
    expect(cache).toHaveLength(2)
    expect(cache.map((t) => t.id).sort()).toEqual(['t-1', 't-2'])
  })

  it('cache legítima continua disponível quando o backend está indisponível', async () => {
    // Requisito 5: a fila não pode virar tela vazia por indisponibilidade.
    setCol('chamados', [ticket('t-cache')])

    mockFetch({ error: 'gateway' }, false, 502)
    await ticketService.pullRemote().catch(() => {})

    // O cache legítimo segue lá — a falha remota não apaga nada.
    expect(ticketService.getByIdNoFilter('t-cache')).toBeDefined()
    expect(ticketService.getAll()).toHaveLength(1)
  })
})
