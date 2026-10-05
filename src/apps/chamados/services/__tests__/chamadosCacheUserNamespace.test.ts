import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCol, setCol, isNamespacedKey } from '../../../../lib/db'
import { namespacedCollectionKey, currentUserCollectionKey } from '../../../../lib/cacheNamespace'
import { authService } from '../../../../core/auth/service'
import { ticketService, cachedTickets, chamadosCacheKey } from '../ticketService'
import { workspaceStore } from '../../../../core/workspaces/store'
import { TEST_CHAMADOS_KEY } from '../../../../test/helpers'
import { setTestUser } from '../../../../test/mocks'

/**
 * #344 — a fila operacional de Chamados não pode ser lida por outro usuário.
 *
 * Antes desta correção, a coleção física do IndexedDB era a chave literal
 * `chamados`. O `load()` do `useTickets` lê o cache ANTES de qualquer requisição,
 * e o `syncRemote` mantém o cache quando o `pullRemote` falha (`catch {}` +
 * `finally { load() }`). A cadeia do vazamento era:
 *
 *     A (com ticket.view) → GET /api/chamados → mergeRemote → IndexedDB "chamados"
 *       → logout (signOut não limpa cache nenhuma)
 *       → B → load() lê o cache de A na primeira renderização
 *       → pullRemote de B volta 403/503, é engolido, e a tela continua mostrando A
 *
 * A auditoria (#344) confirmou isso em execução, e confirmou o caso mais difícil:
 * **A e B no mesmo workspace** também se cruzam, porque `workspace_id` é fronteira
 * de tenant, não de pessoa.
 *
 * A correção é namespacing por `userId`: `chamados:<userId>`. A propriedade que a
 * torna suficiente é mais forte que "filtrar na leitura" — **não existe caminho de
 * leitura que atravesse**. B resolve `chamados:B`, que não contém nada de A, e o
 * cache offline legítimo de cada um sobrevive.
 *
 * Estes testes chamam o serviço e a camada de cache reais, sem mock de
 * armazenamento: a pergunta é sobre onde o dado foi gravado, e um mock de storage
 * responderia "onde o mock gravou".
 */

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

const USER_A = 'user-a'
const USER_B = 'user-b'
const WS_X = 'ws-x'
const WS_Y = 'ws-y'

const KEY_A = namespacedCollectionKey('chamados', USER_A)
const KEY_B = namespacedCollectionKey('chamados', USER_B)

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response)
}

function ticket(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    ticketNumber: 1042,
    workspace_id: WS_X,
    roomName: 'Laboratório 03',
    assetName: 'Notebook Dell',
    problemCategory: 'Computador',
    problemDescription: 'Não liga',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: 'maria@test.com',
    reportedByUserId: USER_A,
    assignedTo: '',
    assignedToUserId: '',
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

/** Sessão de A com `ticket.view`, unidade X. */
function loginAsA(workspace = WS_X) {
  setTestUser({ id: USER_A, workspace_ids: [workspace] } as any)
  workspaceStore.set({ id: workspace } as any, false, [workspace])
}

/** Sessão de B, unidade Y. */
function loginAsB(workspace = WS_Y) {
  setTestUser({ id: USER_B, workspace_ids: [workspace] } as any)
  workspaceStore.set({ id: workspace } as any, false, [workspace])
}

/** Encerra a sessão: `signOut` no serviço real não toca em cache nenhuma. */
function logout() {
  ;(authService as any).__resetForTests?.()
  vi.spyOn(authService, 'getCurrentUser').mockReturnValue(null)
  workspaceStore.set(null, false, [])
}

beforeEach(() => {
  vi.restoreAllMocks()
  setTestUser()
  // Zera TODAS as chaves possíveis, inclusive as de A e B dos testes anteriores:
  // o isolamento não pode depender de o teste anterior ter limpado.
  for (const key of [TEST_CHAMADOS_KEY, KEY_A, KEY_B, 'chamados']) {
    setCol(key, [])
  }
  workspaceStore.set(null, false, [])
})

// ═══════════════════════════════════════════════════════════════════════════
// A chave resolvida
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — a chave do cache vem da sessão', () => {
  it('resolve chamados:<userId> para cada usuário', () => {
    loginAsA()
    expect(chamadosCacheKey()).toBe(KEY_A)

    loginAsB()
    expect(chamadosCacheKey()).toBe(KEY_B)
  })

  it('sem sessão não há chave: fail-closed em vez de cache anônimo', () => {
    logout()
    // Um cache "anônimo" seria um cache compartilhado com outro nome — que é
    // exatamente a bug original.
    expect(chamadosCacheKey()).toBeNull()
    expect(currentUserCollectionKey('chamados')).toBeNull()
    expect(cachedTickets()).toEqual([])
  })

  it('sem sessão, getAll devolve vazio e nenhuma escrita acontece', async () => {
    loginAsA()
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()
    expect(getCol(KEY_A)).toHaveLength(1)

    logout()
    expect(ticketService.getAll()).toEqual([])
    expect(ticketService.getByIdNoFilter('t-a1')).toBeUndefined()
  })

  it('o namespace não depende de workspace nem de ticketNumber', () => {
    loginAsA(WS_X)
    const emX = chamadosCacheKey()
    loginAsA(WS_Y)
    const emY = chamadosCacheKey()
    // Mesma pessoa, outra unidade ativa: a chave é a MESMA. O namespace é de
    // pessoa, e o estreitamento por unidade continua sendo do filtro de leitura.
    expect(emX).toBe(emY)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 1, 2 e 3 — isolamento básico, mesmo workspace, workspace diferente
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — A não wrote, B não lê', () => {
  it('Teste 1: A popula a fila, B lê e não vê nada de A', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1'), ticket('t-a2')] })
    await ticketService.pullRemote()
    expect(ticketService.getAll()).toHaveLength(2)

    // B entra no MESMO navegador.
    loginAsB(WS_Y)
    mockFetch({ tickets: [] })
    await ticketService.pullRemote()

    expect(ticketService.getAll()).toEqual([])
    expect(ticketService.getByIdNoFilter('t-a1')).toBeUndefined()
    expect(cachedTickets()).toEqual([])
  })

  it('Teste 2: mesmo workspace — A e B em X, ainda não se cruzam', async () => {
    // Este é o caso que `workspace_id` não resolvia: dois usuários autorizados
    // na mesma unidade passam `workspaceStore.matches()` indistintivelmente.
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()
    expect(ticketService.getAll()).toHaveLength(1)

    loginAsB(WS_X) // MESMA unidade
    expect(ticketService.getAll()).toEqual([])
    expect(ticketService.getByIdNoFilter('t-a1')).toBeUndefined()
  })

  it('Teste 3: workspaces diferentes — nenhum registro de X aparece para B', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-x1'), ticket('t-x2')] })
    await ticketService.pullRemote()

    loginAsB(WS_Y)
    const filaB = ticketService.getAll()

    expect(filaB).toEqual([])
    // Nem por id, nem por sala, nem por solicitante — os três vetores.
    expect(filaB.some((t) => t.id === 't-x1')).toBe(false)
    expect(filaB.some((t) => t.roomName === 'Laboratório 03')).toBe(false)
    expect(filaB.some((t) => t.reportedBy === 'Prof. Maria')).toBe(false)
  })

  it('o cache de A continua íntegro no disco depois que B entra', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    loginAsB(WS_Y)
    ticketService.getAll()

    // A é quem volta a logar — e reencontra a fila. Offline não é o oposto de
    // isolado: cada um guarda a SUA.
    loginAsA(WS_X)
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-a1'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 4 — API indisponível não expõe o cache anterior
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — falha da API não vira exposição', () => {
  for (const status of [401, 403, 500, 502, 503]) {
    it(`Teste 4 (HTTP ${status}): A popula, B entra, API indisponível, B não vê nada de A`, async () => {
      loginAsA(WS_X)
      mockFetch({ tickets: [ticket('t-a1'), ticket('t-a2')] })
      await ticketService.pullRemote()
      expect(getCol(KEY_A)).toHaveLength(2)

      logout()
      loginAsB(WS_X)
      mockFetch({ error: 'indisponível' }, false, status)
      await ticketService.pullRemote().catch(() => {})

      // Este é o teste que fecha a #344: a falha remota preserva o cache do
      // usuário, e o cache preservado é o DELE — vazio.
      expect(ticketService.getAll()).toEqual([])
      expect(cachedTickets()).toEqual([])
      expect(ticketService.getByIdNoFilter('t-a1')).toBeUndefined()
    })
  }

  it('usuário sem ticket.view não recebe o cache de quem tem', async () => {
    // B é solicitante: `pullRemote` volta 403 e o cache local precisa ficar vazio.
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    logout()
    loginAsB(WS_X)
    mockFetch({ error: 'Permissão insuficiente' }, false, 403)
    await ticketService.pullRemote().catch(() => {})

    expect(ticketService.getAll()).toEqual([])
  })

  it('o cache local não é bypass de ticket.view nem de workspace', async () => {
    // B sem Action e de outra unidade: nem o `pullRemote` (403) nem o cache local
    // entregam nada. A única garantia é a chave.
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    logout()
    setTestUser({ id: USER_B, workspace_ids: [] } as any)
    workspaceStore.set(null, false, [])

    // Mesmo forçando a leitura de TODA chave de A, o serviço não monta a chave:
    expect(chamadosCacheKey()).toBe(KEY_B)
    expect(ticketService.getAll()).toEqual([])
    expect(getCol(KEY_B)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 5 e 6 — offline legítimo e F5
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — o offline legítimo continua funcionando', () => {
  it('Teste 5: sem rede, A continua vendo a fila DELE', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1'), ticket('t-a2')] })
    await ticketService.pullRemote()

    // Rede cai. `useTickets.syncRemote` engole o erro e o `finally` chama `load()`.
    mockFetch({ error: 'Failed to fetch' }, false, 0)
    await ticketService.pullRemote().catch(() => {})

    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-a1', 't-a2'])
    expect(ticketService.getActive()).toHaveLength(2)
    expect(ticketService.getByIdNoFilter('t-a2')).toBeDefined()
  })

  it('Teste 5b: 401/403/5xx também não limpam o cache do próprio usuário', async () => {
    // O ponto é direcional: falha de rede pode derrubar o cache DELE, nunca
    // revelar o de OUTRO. Nenhum destes códigos pode fazer A perder a fila.
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    for (const status of [401, 403, 500, 503]) {
      mockFetch({ error: 'x' }, false, status)
      await ticketService.pullRemote().catch(() => {})
      expect(ticketService.getByIdNoFilter('t-a1')).toBeDefined()
    }
  })

  it('Teste 6: F5 — a chave é a mesma, então o cache sobrevive', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    // F5 recria a página: o IndexedDB persiste e a sessão é restaurada
    // (`persistSession: true`). A chave é derivada do MESMO userId.
    const chaveAntes = chamadosCacheKey()
    loginAsA(WS_X)
    expect(chamadosCacheKey()).toBe(chaveAntes)
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-a1'])
  })

  it('o cache sobrevive a logout — de propósito, e é de A', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    logout()
    // A chave de A continua no disco. Não é lixo: é o offline de A.
    expect(getCol(KEY_A)).toHaveLength(1)
    expect(getCol(KEY_B)).toEqual([])

    // E B não o adota por estar lá.
    loginAsB(WS_Y)
    expect(ticketService.getAll()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 7 — TOKEN_REFRESHED
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — eventos de autenticação', () => {
  it('Teste 7: TOKEN_REFRESHED não derruba o cache do usuário', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    // Refresh de token: o `sub` é o mesmo, logo a chave é a mesma. O evento não
    // muda identidade, então não pode limpar nada.
    loginAsA(WS_X)
    expect(chamadosCacheKey()).toBe(KEY_A)
    expect(ticketService.getAll()).toHaveLength(1)
  })

  it('Teste 7b: refresh repetido não acumula nem apaga', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    for (let i = 0; i < 5; i++) {
      loginAsA(WS_X)
      expect(chamadosCacheKey()).toBe(KEY_A)
    }
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-a1'])
  })

  it('Teste 8: SIGNED_OUT impede reuso da chave anterior; B resolve a sua', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    logout()
    // Sem sessão, nenhuma chave é resolvida — nem a de A.
    expect(chamadosCacheKey()).toBeNull()

    loginAsB(WS_X)
    expect(chamadosCacheKey()).toBe(KEY_B)
    expect(ticketService.getAll()).toEqual([])

    mockFetch({ tickets: [ticket('t-b1')] })
    await ticketService.pullRemote()
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-b1'])
    // E as duas chaves coexistem no disco, cada uma com o dono certo.
    expect(getCol<any>(KEY_A).map((t) => t.id)).toEqual(['t-a1'])
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])
  })

  it('troca direta de user.id (sessão substituída) move o namespace', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    // Sem passar por `signOut`: o `user.id` da sessão é outro.
    loginAsB(WS_X)
    expect(ticketService.getAll()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 9 — múltiplas abas
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — múltiplas abas', () => {
  it('Teste 9: A em uma aba e B em outra nunca dividem chave', async () => {
    // Simula as duas abas percorrendo o mesmo `CACHE` em memória (o IndexedDB é
    // compartilhado entre abas de verdade; aqui o módulo é).
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    // "Aba de B": a sessão da aba B assume, o armazenamento é o mesmo.
    loginAsB(WS_Y)
    mockFetch({ tickets: [ticket('t-b1')] })
    await ticketService.pullRemote()

    // Aba de A volta a renderizar: recupera a SUA fila, e a de B continua à parte.
    loginAsA(WS_X)
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-a1'])
    loginAsB(WS_Y)
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-b1'])
  })

  it('a aba de B não propaga escrita na chave de A', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    loginAsB(WS_Y)
    mockFetch({ tickets: [ticket('t-b1')] })
    await ticketService.pullRemote()

    // `mergeRemote` de B só toca `chamados:B`.
    expect(getCol<any>(KEY_A).map((t) => t.id)).toEqual(['t-a1'])
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])
  })

  it('cada aba mantém a própria sessão: o namespace é local à aba', async () => {
    // Não há `BroadcastChannel` nem `storage` event, e a PR não introduz um:
    // cada aba resolve a chave do SEU `authService`. O IndexedDB compartilhado
    // deixa de ser problema porque a chave já separa.
    loginAsA(WS_X)
    const chaveA = chamadosCacheKey()
    loginAsB(WS_Y)
    const chaveB = chamadosCacheKey()

    expect(chaveA).not.toBe(chaveB)
    expect(chaveA).toBe(KEY_A)
    expect(chaveB).toBe(KEY_B)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 10 e 11 — getByIdNoFilter e Meus Chamados
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — getByIdNoFilter e o caminho pessoal', () => {
  it('Teste 10: getByIdNoFilter do id de A devolve undefined para B', () => {
    setCol(KEY_A, [ticket('t-a1')])

    loginAsB(WS_X)
    // Era um bypass explícito do filtro. Agora é um bypass do namespace — e o
    // namespace não tem exceção.
    expect(ticketService.getByIdNoFilter('t-a1')).toBeUndefined()
    expect(ticketService.getById('t-a1')).toBeUndefined()
    expect(ticketService.query(() => true)).toEqual([])
    expect(ticketService.getActive()).toEqual([])

    // A encontra o dele.
    loginAsA(WS_X)
    expect(ticketService.getByIdNoFilter('t-a1')).toBeDefined()
  })

  it('Teste 11: getByIdRemote continua sem gravar na fila (#342 preservado)', async () => {
    loginAsA(WS_X)
    mockFetch({ ticket: ticket('t-do-a') })
    await ticketService.getByIdRemote('t-do-a')

    // Leitura pura: não escreve nem em `chamados:A` nem na chave legada.
    expect(ticketService.getAll()).toEqual([])
    expect(cachedTickets()).toEqual([])
    expect(getCol(KEY_A)).toEqual([])
  })

  it('Teste 11b: listMine (Meus Chamados) não mergeia na fila', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-meu')] })
    const meus = await ticketService.listMine()

    // A lista pessoal volta do servidor, mas a fila fica intacta.
    expect(meus.map((t) => t.id)).toEqual(['t-meu'])
    expect(ticketService.getAll()).toEqual([])
    expect(getCol(KEY_A)).toEqual([])
  })

  it('a fila operacional e Meus Chamados não se misturam no mesmo cache', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-da-fila')] })
    await ticketService.pullRemote()
    mockFetch({ tickets: [ticket('t-meu')] })
    await ticketService.listMine()

    // Só o que a FILA autorizou está no cache — a lista pessoal não entra.
    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-da-fila'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 12 — a chave legada não é adotada
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — a chave legada `chamados` fica inerte', () => {
  it('Teste 12: B não adota o conteúdo legado como se fosse seu', async () => {
    // Conteúdo gravado quando a coleção ainda era compartilhada — não há como
    // provar de quem era.
    setCol('chamados', [ticket('t-legado-a'), ticket('t-legado-b')])

    loginAsA(WS_X)
    expect(ticketService.getAll()).toEqual([])
    expect(cachedTickets()).toEqual([])

    loginAsB(WS_Y)
    expect(ticketService.getAll()).toEqual([])
    expect(ticketService.getByIdNoFilter('t-legado-a')).toBeUndefined()
  })

  it('o pullRemote de B não funde o legado na chave de B', async () => {
    setCol('chamados', [ticket('t-legado-a')])

    loginAsB(WS_Y)
    mockFetch({ tickets: [ticket('t-b1')] })
    await ticketService.pullRemote()

    expect(ticketService.getAll().map((t) => t.id)).toEqual(['t-b1'])
    // O legado continua onde estava, intacto e sem leitor.
    expect(getCol('chamados')).toHaveLength(1)
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])
  })

  it('o legado não volta a ser lido por nenhum caminho derivado', () => {
    // `isNamespacedKey` distingue as duas formas sem ambiguidade: `chamados` não
    // é namespaced, `chamados:<uuid>` é. É o que permite tratar uma e outra
    // separadamente em qualquer lugar daqui em diante.
    expect(isNamespacedKey('chamados')).toBe(false)
    expect(isNamespacedKey(KEY_A)).toBe(true)
    expect(isNamespacedKey(KEY_B)).toBe(true)
    // Uma chave terminada em `:` não é um namespace válido — o userId não pode
    // ser vazio.
    expect(isNamespacedKey('chamados:')).toBe(false)
    // E o separador nunca aparece no início, então `chamados` nunca é confundido
    // com um namespace sem dono.
    expect(isNamespacedKey(':abc')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 13 — CoordinatorHome multiunidade
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — o Central multiunidade continua funcionando', () => {
  it('Teste 13: a fila do usuário reúne várias unidades e o filtro por unidade decide', async () => {
    // O Central lê a fila BRUTA multiunidade por desenho. Com namespace, ele lê
    // a fila bruta do USUÁRIO — que é o mesmo conjunto autorizado, e o filtro
    // por `visibleUnits` continua limitando a exibição.
    loginAsA(WS_X)
    mockFetch({
      tickets: [
        ticket('t-x1', { workspace_id: WS_X }),
        ticket('t-y1', { workspace_id: WS_Y }),
        ticket('t-x2', { workspace_id: WS_X }),
      ],
    })
    await ticketService.pullRemote()

    const brutos = cachedTickets()
    expect(brutos).toHaveLength(3)
    expect(brutos.map((t: any) => t.workspace_id).sort()).toEqual([WS_X, WS_X, WS_Y].sort())

    // E o estreitamento por unidade segue valendo do mesmo jeito.
    const soX = brutos.filter((t: any) => t.workspace_id === WS_X)
    expect(soX.map((t: any) => t.id)).toEqual(['t-x1', 't-x2'])

    // B, de outra unidade, não enxerga nada disso.
    loginAsB(WS_Y)
    expect(cachedTickets()).toEqual([])
  })

  it('o escopo multiunidade de A não é substituído pelo de B', async () => {
    loginAsA(WS_X)
    mockFetch({ tickets: [ticket('t-x1', { workspace_id: WS_X })] })
    await ticketService.pullRemote()
    loginAsB(WS_Y)
    mockFetch({ tickets: [ticket('t-y1', { workspace_id: WS_Y })] })
    await ticketService.pullRemote()

    loginAsA(WS_X)
    expect(cachedTickets().map((t: any) => t.workspace_id)).toEqual([WS_X])
    loginAsB(WS_Y)
    expect(cachedTickets().map((t: any) => t.workspace_id)).toEqual([WS_Y])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Teste 14 — realtime e o resto dos caminhos de escrita
// ═══════════════════════════════════════════════════════════════════════════

describe('#344 — toda escrita respeita o namespace', () => {
  it('persistTickets grava na chave do usuário da sessão', () => {
    loginAsA(WS_X)
    ticketService.persistTickets([ticket('t-r1')] as any)
    expect(getCol(KEY_A)).toHaveLength(1)
    expect(getCol(KEY_B)).toEqual([])
    expect(getCol('chamados')).toEqual([])
  })

  it('persistLocal (INSERT do realtime e criação) grava na chave do usuário', async () => {
    loginAsA(WS_X)
    mockFetch({ ticket: ticket('t-novo') })
    await ticketService.create({
      roomId: '', roomName: 'Sala 1', problemCategory: 'Internet',
      problemArea: 'academica', problemDescription: 'x', status: 'aberto',
      priority: 'normal', reportedBy: 'Prof.', reportedByEmail: '',
      assignedTo: '', assignedToUserId: '', archived: false, closedAt: null,
      closedBy: '', statusNote: '', createdAt: '2026-10-01T10:00:00',
      updatedAt: '2026-10-01T10:00:00', resolvedAt: null, workspace_id: WS_X,
    } as any)

    expect(getCol<any>(KEY_A).map((t) => t.id)).toEqual(['t-novo'])
    expect(getCol(KEY_B)).toEqual([])
  })

  it('update (PATCH) e remove mexem só na chave do usuário', async () => {
    loginAsA(WS_X)
    setCol(KEY_B, [ticket('t-b1')])
    setCol(KEY_A, [ticket('t-a1')])

    ticketService.update('t-a1', { status: 'em_atendimento' })
    expect(ticketService.getByIdNoFilter('t-a1')?.status).toBe('em_atendimento')
    // A chave de B não foitocada.
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])

    ticketService.remove('t-a1')
    expect(getCol(KEY_A)).toEqual([])
    expect(getCol(KEY_B)).toHaveLength(1)
  })

  it('mergeRemote de A não toca a chave de B', async () => {
    loginAsA(WS_X)
    setCol(KEY_B, [ticket('t-b1')])
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()

    expect(getCol<any>(KEY_A).map((t) => t.id)).toEqual(['t-a1'])
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])
  })

  it('mergeRemote só adiciona ao namespace do próprio usuário', async () => {
    // `mergeRemote` nunca removia (só mapeava por id). Isso segue verdade — mas
    // agora o "nunca remove" vale dentro do namespace, então a fila de A não
    // cresce com a de B.
    loginAsA(WS_X)
    setCol(KEY_B, [ticket('t-b1')])
    mockFetch({ tickets: [ticket('t-a1')] })
    await ticketService.pullRemote()
    mockFetch({ tickets: [ticket('t-a2')] })
    await ticketService.pullRemote()

    expect(getCol<any>(KEY_A).map((t) => t.id)).toEqual(['t-a1', 't-a2'])
    expect(getCol<any>(KEY_B).map((t) => t.id)).toEqual(['t-b1'])
  })
})
