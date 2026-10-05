import type { Ticket, TicketFormData, ChamadosReport } from '../types'
import type { TicketEvent, TicketEventInput } from '../types'
import { createSyncService } from '../../../lib/sync'
import { getCol, setCol } from '../../../lib/db'
import { currentUserCollectionKey } from '../../../lib/cacheNamespace'
import { logService } from '../../../core/logs/service'
import { defaultDb } from '../../../lib/supabase'

/**
 * Fila operacional de Chamados — cache namespaced por usuário (#344).
 *
 * A coleção física é `chamados:<userId>`, resolvida do `sub` do JWT a cada
 * operação. Consequência que fecha a issue: **não existe caminho de leitura que
 * atravesse usuários.** B resolve `chamados:B`, que não contém nada de A — nem
 * quando o `pullRemote` de B falha, nem quando B é de outra unidade, nem
 * quando A e B dividem o workspace (por isso `workspace_id` não serviria: é
 * fronteira de tenant, não de pessoa).
 *
 * Offline legítimo intacto: o cache de A continua em `chamados:A` depois do
 * logout, do F5 e de semanas sem rede, e A o reencontra ao logar de novo.
 * `signOut` não apaga nada, e não precisa.
 *
 * A chave legada `chamados` (sem dono) NÃO é adotada: não há como provar de quem
 * ela era. Ela fica inerte no IndexedDB — ver `cacheNamespace.ts`.
 *
 * `resolveKey` é o gancho que faz isso acontecer num lugar só. Nenhum consumidor
 * concatena string, e a identidade não é parâmetro de nenhum método.
 */
const local = createSyncService<Ticket>(
  'chamados',
  true,
  () => currentUserCollectionKey('chamados'),
)

/**
 * Chave física do cache da fila do usuário da sessão.
 *
 * `null` sem sessão. Chamado pelo hook e pelos alertas, que leem a coleção
 * direto — o mesmo resolvedor, e não uma concatenação própria.
 */
export function chamadosCacheKey(): string | null {
  return currentUserCollectionKey('chamados')
}

const API_BASE = '/api/chamados'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (defaultDb) {
    try {
      const { data } = await defaultDb.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } catch {
      // Session unavailable — request proceeds without auth header;
      // the backend will return 401 if authentication is required.
    }
  }
  return headers
}

/**
 * Erro de requisição ao backend, com o status HTTP preservado.
 *
 * O `status` é o que permite à tela distinguir `404` (chamado inexistente) de
 * `403` (existe, mas não é do usuário) sem adivinhar pela mensagem — e, mais
 * importante, sem tratar acesso negado como sucesso. A mensagem continua sendo a
 * que o backend devolveu.
 */
export type TicketRequestError = Error & { status?: number }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(url, {
    headers: authHeaders,
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      (body as { error?: string }).error || `Erro na requisição (${res.status})`,
    ) as TicketRequestError
    err.status = res.status
    throw err
  }
  return body as T
}

/** Lê o status HTTP de um erro do serviço, se houver. */
export function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  return null
}

/** Garante que campos obrigatórios estejam presentes no ticket. */
function normalizeTicket<T extends Ticket>(ticket: T): T {
  if (!ticket.createdAt || isNaN(new Date(ticket.createdAt).getTime())) {
    ticket.createdAt = new Date().toISOString()
  }
  if (ticket.ticketNumber == null) {
    ticket.ticketNumber = 0
  }
  return ticket
}

/**
 * Coleção bruta do cache da fila, do usuário da sessão.
 *
 * `[]` sem sessão — fail-closed. Antes era `getCol('chamados')`, que lia a
 * chave compartilhada e por isso expunha a fila do usuário anterior.
 *
 * Usada por `useTickets` (Realtime e saneamento), `ticketAlerts` e
 * `CoordinatorHome`. É o mesmo resolvedor do `local` acima: um lugar só decide de
 * quem é o cache.
 */
export function cachedTickets(): Ticket[] {
  const key = chamadosCacheKey()
  return key ? getCol<Ticket>(key) : []
}

/**
 * Grava a fila inteira no namespace do usuário da sessão.
 *
 * Sem sessão, um `Set` vazio: o registro foi autorizado para um usuário que já
 * não está na sessão, e gravá-lo sob `null` o tornaria compartilhado de novo.
 */
function persistTickets(tickets: Ticket[]) {
  const key = chamadosCacheKey()
  if (!key) return
  tickets.forEach(normalizeTicket)
  setCol(key, tickets)
}

/** Cache do usuário da sessão: INSERT e o caminho pessoal. */
function persistLocal(ticket: Ticket) {
  const key = chamadosCacheKey()
  if (!key) return
  normalizeTicket(ticket)
  const items = getCol<Ticket>(key)
  const idx = items.findIndex((t) => t.id === ticket.id)
  if (idx === -1) items.push(ticket)
  else items[idx] = ticket
  setCol(key, items)
}

/**
 * Mescla a fila remota no cache do usuário da sessão.
 *
 * Só grava quando o `pullRemote` foi autorizado — isto é, quando o backend
 * respondeu 200. É a mesma condição de antes da #344; o que muda é a chave.
 */
function mergeRemote(remote: Ticket[]) {
  const key = chamadosCacheKey()
  if (!key) return
  const items = getCol<Ticket>(key)
  const map = new Map(items.map((t) => [t.id, t]))
  for (const t of remote) {
    const existing = map.get(t.id)
    if (!existing || (t.updatedAt || '') > (existing.updatedAt || '')) {
      map.set(t.id, t)
    }
  }
  setCol(key, [...map.values()])
}

export const ticketService = {
  getAll: () => local.getAll(),

  persistTickets,

  getById: (id: string) => local.getById(id),

  /**
   * Busca por id no cache BRUTO, sem o filtro de workspace.
   *
   * Só o usuário da sessão enxerga a fila dele: `getCol` recebe
   * `chamados:<userId>`, então o id de A simplesmente não existe aqui. Era um
   * bypass explícito do filtro — agora é um bypass do namespace, e o namespace
   * não tem exce��ão.
   */
  getByIdNoFilter: (id: string) => {
    const key = chamadosCacheKey()
    return key ? getCol<Ticket>(key).find((t) => t.id === id) : undefined
  },

  isArchived: (ticket: Ticket) => ticket.archived === true || ticket.status === 'fechado',

  getActive: () => local.query((t) => !(t.archived === true || t.status === 'fechado')),

  getArchived: () => local.query((t) => t.archived === true || t.status === 'fechado'),

  /** Cria um chamado na API (fonte de verdade) e persiste localmente como cache. */
  create: async (data: TicketFormData): Promise<Ticket> => {
    const { ticket } = await request<{ ticket: Ticket }>(API_BASE, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    persistLocal(ticket)
    logService.log({
      userId: 'public',
      userName: data.reportedBy || 'Anônimo',
      action: 'created',
      entity: 'ticket',
      entityId: ticket.id,
      entityLabel: `#${ticket.ticketNumber}`,
      details: { roomName: data.roomName, problem: data.problemCategory, area: data.problemArea },
    })
    return ticket
  },

  /**
   * Cria um chamado e devolve o tracking_token (credencial do professor).
   * Usar nas páginas públicas — o token é retornado uma única vez.
   */
  createWithToken: async (data: TicketFormData): Promise<{ ticket: Ticket; trackingToken: string }> => {
    const { ticket, tracking_token } = await request<{ ticket: Ticket; tracking_token?: string }>(API_BASE, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    persistLocal(ticket)
    if (!tracking_token) {
      throw new Error('Falha ao gerar o código de acompanhamento. Tente novamente.')
    }
    return { ticket, trackingToken: tracking_token }
  },

  update: (id: string, data: Partial<Ticket>) => {
    const ticket = local.update(id, data)
    if (ticket) {
      logService.log({
        userId: 'system',
        userName: 'Sistema',
        action: data.status ? 'status_changed' : 'updated',
        entity: 'ticket',
        entityId: ticket.id,
        entityLabel: `#${ticket.ticketNumber}`,
        details: data.status ? { newStatus: data.status } : undefined,
      })
      request<{ ticket: Ticket }>(`${API_BASE}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
        .then((res) => persistLocal(res.ticket))
        .catch(() => {
          // Falha de rede: mantém local; próximo pullRemote reconcilia.
        })
    }
    return ticket
  },

  remove: (id: string) => {
    const ok = local.remove(id)
    if (ok) {
      request(`${API_BASE}/${id}`, { method: 'DELETE' }).catch(() => {})
    }
    return ok
  },

  /**
   * Lê UM chamado pelo endpoint individual `GET /api/chamados/:id`.
   *
   * ⚠️ NÃO grava na coleção local `chamados`, e isso é deliberado (#342).
   *
   * A coleção `chamados` é a cache da FILA OPERACIONAL: ela é alimentada por
   * `pullRemote`, que só responde a quem tem `ticket.view`. Este método, ao
   * contrário, também responde ao solicitante do próprio chamado
   * (`reportedByUserId == g.user_id`, PR #339) — que não tem `ticket.view` e por
   * isso nunca popula a fila.
   *
   * Quando este método gravava o resultado, um chamado lido no escopo pessoal
   * entrava na cache da fila. Como a coleção não é namespaced por usuário e o
   * `signOut` não limpa nada, esse registro sobrevivia à sessão: em navegador
   * compartilhado, o usuário seguinte logava, o `pullRemote` dele voltava `403`
   * e o `load()` ainda renderizava a cache local — enxergando o chamado de
   * outra pessoa. Exposição de dados no cliente; o backend continuava correto.
   *
   * A regra é por VIA DE ACESSO, não por conteúdo: nenhuma comparação de
   * identidade, `reportedByUserId` ou `mine=true` participa. Ler por id é leitura
   * pura; a fila é escrita só pelos caminhos operacionais.
   */
  getByIdRemote: async (id: string): Promise<Ticket> => {
    if (!id || id === 'undefined') throw new Error('ID do chamado inválido')
    const { ticket } = await request<{ ticket: Ticket }>(`${API_BASE}/${id}`)
    return ticket
  },

  /**
   * PATCH em um chamado pelo endpoint individual, sem passar pela coleção local.
   *
   * `update()` só alcança a API quando o registro JÁ está na cache
   * (`local.update` devolve `undefined` para um id ausente, e o PATCH fica dentro
   * do `if (ticket)`). Como `getByIdRemote` não popula mais a cache, um chamado
   * aberto por deep link — fora da fila do usuário — ficaria sem escrita: a tela
   * mostraria o botão e a ação seria descartada em silêncio.
   *
   * Este método fecha esse buraco sem reintroduzir a escrita na cache da fila.
   * Ele não decide autorização: o PATCH é autorizado no servidor pelas mesmas
   * vias de sempre, e devolve o registro já atualizado.
   */
  patchRemote: async (id: string, data: Partial<Ticket>): Promise<Ticket> => {
    const { ticket } = await request<{ ticket: Ticket }>(`${API_BASE}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    return ticket
  },

  /** Busca chamados pelo nome do professor na API (público). */
  getByReporter: async (name: string): Promise<Ticket[]> => {
    const { tickets } = await request<{ tickets: Ticket[] }>(
      `${API_BASE}?reportedBy=${encodeURIComponent(name)}`,
    )
    return tickets || []
  },

  /** Histórico (timeline) de eventos de um chamado, do mais novo ao mais antigo. */
  getEvents: async (id: string): Promise<TicketEvent[]> => {
    const { events } = await request<{ events: TicketEvent[] }>(`${API_BASE}/${id}/events`)
    return events || []
  },

  /**
   * COMEÇAR ATENDIMENTO — o técnico assume o chamado para si de forma atômica
   * no servidor. Lança erro 409 se outro técnico já assumiu o chamado.
   */
  claim: async (id: string): Promise<Ticket> => {
    const ticket = await request<{ ticket: Ticket }>(`${API_BASE}/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((res) => res.ticket)
    persistLocal(ticket)
    logService.log({
      userId: 'system',
      userName: 'Sistema',
      action: 'updated',
      entity: 'ticket',
      entityId: ticket.id,
      entityLabel: `#${ticket.ticketNumber}`,
      details: { newOwner: ticket.assignedTo, claimed: true },
    })
    return ticket
  },

  /** Adiciona um comentário ao chamado (máx 2 fotos por evento). */
  addEvent: async (id: string, data: TicketEventInput): Promise<TicketEvent> => {
    const { event } = await request<{ event: TicketEvent }>(`${API_BASE}/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return event
  },

  query: (predicate: (item: Ticket) => boolean) => local.query(predicate),

  getOpenByAsset: (assetId: string, assetSource: string) => {
    return local.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource && (t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento')
    )
  },

  getOpenByRoom: (roomId: string) => {
    return local.query(
      (t) => t.roomId === roomId && (t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento')
    )
  },

  getHistoryByAsset: (assetId: string, assetSource: string) => {
    return local.query(
      (t) => t.assetId === assetId && t.assetSource === assetSource
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  },

  /** Puxa os chamados do servidor e mescla no cache local (mais recente por updatedAt). */
  pullRemote: async (): Promise<void> => {
    const { tickets } = await request<{ tickets: Ticket[] }>(API_BASE)
    mergeRemote(tickets || [])
  },

  /**
   * Meus Chamados — consulta de escopo PESSOAL, resolvida NO SERVIDOR.
   *
   * `mine=true` faz o backend aplicar `reportedByUserId = <identidade do JWT>`
   * e NÃO exigir `ticket.view`. É esta chamada — e não um filtro no React —
   * que autoriza o conjunto de dados da tela "Meus Chamados".
   *
   * O resultado NÃO é mesclado no cache local (`mergeRemote`): aquela coleção
   * é a fila de trabalho e é compartilhada com a lista geral; misturar os dois
   * escopos faria o filtro do cliente virar a única garantia de isolamento.
   *
   * `workspace_id` é opcional e apenas ESTREITA o resultado — o servidor o
   * valida como membership. O UUID do solicitante nunca vem daqui: é sempre o
   * da sessão.
   */
  listMine: async (params: { workspace_id?: string } = {}): Promise<Ticket[]> => {
    const qs = new URLSearchParams()
    qs.set('mine', 'true')
    if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
    const { tickets } = await request<{ tickets: Ticket[] }>(`${API_BASE}?${qs.toString()}`)
    return tickets || []
  },

  /** Relatório agregado no servidor (período opcional em ISO: from/to). */
  getReports: async (params: { from?: string; to?: string; workspace_id?: string } = {}): Promise<ChamadosReport> => {
    const qs = new URLSearchParams()
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const { report } = await request<{ report: ChamadosReport }>(`${API_BASE}/reports${suffix}`)
    return report
  },
}
