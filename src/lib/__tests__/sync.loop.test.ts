import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetCache, getCol, setCol } from '../db'
import {
  syncSingle,
  syncAll,
  createSyncService,
  getDirtyCollections,
  classifySyncError,
  getSyncBlockers,
  retrySyncCollection,
  getSyncLog,
} from '../sync'

// ── Harness: mock de PostgREST em cadeia ────────────────────────────────────
//
// Reproduz o comportamento do supabase-js: `db.from(t)` devolve um builder
// vazio; os terminais (`select`, `delete`, `upsert`) iniciam um NOVO
// encadeamento quando chamados sobre um builder ainda sem terminal (como
// `s.select('*')`, `s.delete()`, `s.upsert(...)` no sync) e CONTINUAM a
// cadeia atual quando já há um terminal (como `.delete().eq('id', id).select('id')`).
// `await` dispara o handler do teste — que pode responder, retornar Promise
// ou lançar (falha de rede).
const harness = vi.hoisted(() => {
  type Step = { name: string; args: any[] }
  type Call = { table: string; action: 'select' | 'delete' | 'upsert'; id?: string; row?: any }

  const TERMINALS = ['select', 'delete', 'upsert']

  const state = {
    calls: [] as Call[],
    userId: 'user-1' as string | null,
    select: (_table: string): any => ({ data: [], error: null }),
    remove: (_table: string, id: string): any => ({ data: [{ id }], error: null }),
    upsert: (_table: string, _row: any): any => ({ data: null, error: null }),
  }

  function dispatch(table: string, steps: Step[]): Promise<any> {
    const terminal = steps.find((st) => TERMINALS.includes(st.name))
    if (!terminal) return Promise.resolve({ data: null, error: null })
    return Promise.resolve().then(() => {
      if (terminal.name === 'select') {
        state.calls.push({ table, action: 'select' })
        return state.select(table)
      }
      if (terminal.name === 'delete') {
        const eq = steps.find((st) => st.name === 'eq')
        const id = String(eq?.args?.[1] ?? '')
        state.calls.push({ table, action: 'delete', id })
        return state.remove(table, id)
      }
      const row = terminal.args[0]
      state.calls.push({ table, action: 'upsert', row })
      return state.upsert(table, row)
    })
  }

  function newChain(table: string, steps: Step[]): any {
    const chain: any = {}
    const append = (name: string) => (...args: any[]) => {
      steps.push({ name, args })
      return chain
    }
    for (const m of ['eq', 'in', 'lt', 'gt', 'lte', 'gte', 'neq', 'order', 'limit']) {
      chain[m] = append(m)
    }
    const start = (name: string) => (...args: any[]) => {
      if (steps.length === 0) return newChain(table, [{ name, args }])
      steps.push({ name, args })
      return chain
    }
    chain.select = start('select')
    chain.delete = start('delete')
    chain.upsert = start('upsert')
    chain.then = (resolve: any, reject: any) => dispatch(table, steps).then(resolve, reject)
    return chain
  }

  const db = {
    from: (table: string) => newChain(table, []),
    auth: {
      getSession: async () => ({
        data: { session: state.userId ? { user: { id: state.userId } } : null },
        error: null,
      }),
    },
  }

  return {
    db,
    state,
    reset() {
      state.calls = []
      state.userId = 'user-1'
      state.select = () => ({ data: [], error: null })
      state.remove = (_t: string, id: string) => ({ data: [{ id }], error: null })
      state.upsert = () => ({ data: null, error: null })
    },
    calls(table?: string, action?: string) {
      return state.calls.filter(
        (c) => (!table || c.table === table) && (!action || c.action === action),
      )
    },
  }
})

vi.mock('../supabase', () => ({
  defaultDb: harness.db,
  pcareDb: harness.db,
  stockDb: harness.db,
}))

// Isolamento por workspace controlável pelo teste (o mock global é pass-through).
vi.mock('../../core/workspaces/store', () => ({
  workspaceStore: {
    get activeWorkspaceId() {
      return 'ws-test'
    },
    get isAdmin() {
      return false
    },
    get userWorkspaceIds() {
      return ['ws-test']
    },
    filter: <T extends { workspace_id?: string }>(rows: T[]) =>
      rows.filter((r) => !r.workspace_id || r.workspace_id === 'ws-test'),
    matches: (row: { workspace_id?: string }) => !row?.workspace_id || row.workspace_id === 'ws-test',
    set: () => {},
    subscribe: () => () => {},
  },
}))

type Notif = { id: string; updatedAt?: string; title?: string; workspace_id?: string }

const notifService = () => createSyncService<Notif>('notifications')

function tombstones(collection = 'notifications'): string[] {
  try {
    const map = JSON.parse(localStorage.getItem('labhub_deleted_ids') || '{}')
    return (map[collection] as string[]) || []
  } catch {
    return []
  }
}

const rls403 = {
  code: '42501',
  message: 'new row violates row-level security policy for table "notifications"',
  details: '',
  hint: '',
}

beforeEach(() => {
  // Silencia (e inspeciona) os console.warn do syncAll — asserção de
  // diagnóstico no cenário 4. Recriado por teste: `vi.restoreAllMocks()` no
  // afterEach restaura o console original.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  harness.reset()
  resetCache()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('P0.1 — loop de sincronização de notificações', () => {
  // 1. Um POST rejeitado por RLS não dispara milhares de novas tentativas
  //    em ciclos sucessivos.
  it('403/RLS bloqueia a coleção após a primeira tentativa e para de reenviar', async () => {
    const svc = notifService()
    svc.create({ updatedAt: new Date().toISOString(), title: 'criada local' })

    harness.state.upsert = () => ({ data: null, error: rls403 })

    // 1º ciclo: a tentativa real acontece e FALHA como autorização (não é sucesso).
    await expect(syncSingle('notifications')).rejects.toMatchObject({ name: 'SyncError', kind: 'auth' })
    expect(harness.calls('notifications', 'select')).toHaveLength(1)
    expect(harness.calls('notifications', 'upsert')).toHaveLength(1)
    expect(getDirtyCollections()).toContain('notifications')
    expect(getSyncBlockers().notifications).toMatchObject({ kind: 'auth', code: '42501' })
    expect(getSyncLog().at(-1)).toMatchObject({ collection: 'notifications', status: 'error' })

    // 10 ciclos seguintes: NENHUMA nova requisição — o loop foi interrompido.
    for (let i = 0; i < 10; i++) {
      await expect(syncSingle('notifications')).rejects.toMatchObject({ kind: 'auth' })
    }
    expect(harness.calls('notifications', 'select')).toHaveLength(1)
    expect(harness.calls('notifications', 'upsert')).toHaveLength(1)
    expect(getDirtyCollections()).toContain('notifications')

    // Recuperação explícita após corrigir a permissão: volta a sincronizar
    // e limpa o estado — sem perder a operação pendente.
    harness.state.upsert = () => ({ data: null, error: null })
    retrySyncCollection('notifications')
    await expect(syncSingle('notifications')).resolves.toBeUndefined()
    expect(harness.calls('notifications', 'upsert')).toHaveLength(2)
    expect(getDirtyCollections()).not.toContain('notifications')
    expect(getSyncBlockers().notifications).toBeUndefined()
  })

  // 2. Um DELETE que retorna sucesso HTTP, mas não comprova a exclusão, não
  //    causa descarte inseguro de estado local.
  it('DELETE sem prova (204 vazio) mantém o tombstone e não ressuscita o item', async () => {
    const svc = notifService()
    const created = svc.create({ updatedAt: new Date().toISOString(), title: 'remover' })
    expect(svc.remove(created.id)).toBe(true)
    expect(tombstones()).toContain(created.id)

    // O remoto ainda contém a linha (RLS: 0 linhas afetadas, sem erro).
    harness.state.select = () => ({
      data: [{ id: created.id, updatedAt: '2026-01-01T00:00:00.000Z' }],
      error: null,
    })
    harness.state.remove = () => ({ data: [], error: null })

    // Ciclo 1: o pull/push conclui, mas o tombstone NÃO é descartado.
    await expect(syncSingle('notifications')).resolves.toBeUndefined()
    expect(tombstones()).toContain(created.id)
    expect(svc.getById(created.id)).toBeUndefined() // exclusão local prevalece

    // Tentativas 2 e 3 ainda acontecem (controladas)…
    await syncSingle('notifications')
    await syncSingle('notifications')
    expect(harness.calls('notifications', 'delete')).toHaveLength(3)

    // …a partir da 4ª não há novas requisições, mas o estado continua retido.
    await syncSingle('notifications')
    await syncSingle('notifications')
    expect(harness.calls('notifications', 'delete')).toHaveLength(3)
    expect(tombstones()).toContain(created.id)
    expect(JSON.parse(localStorage.getItem('labhub_delete_attempts') || '{}')).toMatchObject({
      notifications: { [created.id]: { attempts: 3, status: 'unverifiable' } },
    })

    // Recuperação explícita libera nova tentativa sem apagar nada.
    retrySyncCollection('notifications')
    await syncSingle('notifications')
    expect(harness.calls('notifications', 'delete')).toHaveLength(4)
  })

  // 3. Uma falha temporária permite nova tentativa controlada.
  it('falha temporária entra em backoff e permite nova tentativa após a janela', async () => {
    const svc = notifService()
    svc.create({ updatedAt: new Date().toISOString(), title: 'pendente' })

    harness.state.select = () => {
      throw new TypeError('Failed to fetch')
    }

    await expect(syncSingle('notifications')).rejects.toMatchObject({ name: 'SyncError', kind: 'transient' })
    expect(getDirtyCollections()).toContain('notifications') // não é sucesso
    expect(getSyncBlockers().notifications).toBeUndefined() // não virou bloqueio permanente
    expect(JSON.parse(localStorage.getItem('labhub_sync_retry') || '{}')).toMatchObject({
      notifications: { attempts: 1 },
    })

    // Imediatamente depois: sem nova requisição (backoff ativo).
    await expect(syncSingle('notifications')).rejects.toMatchObject({ kind: 'transient' })
    expect(harness.calls('notifications', 'select')).toHaveLength(1)

    // Após a janela de backoff: tenta de novo e, com a rede de volta, recupera.
    vi.setSystemTime(new Date(Date.now() + 31_000))
    harness.state.select = () => ({ data: [], error: null })
    await expect(syncSingle('notifications')).resolves.toBeUndefined()
    expect(harness.calls('notifications', 'select')).toHaveLength(2)
    expect(getDirtyCollections()).not.toContain('notifications')
    expect(JSON.parse(localStorage.getItem('labhub_sync_retry') || '{}')).not.toHaveProperty(
      'notifications',
    )
  })

  // 4. Uma falha permanente não bloqueia para sempre outras coleções independentes.
  it('falha permanente numa coleção não impede as demais de sincronizar', async () => {
    const svc = notifService()
    svc.create({ updatedAt: new Date().toISOString(), title: 'bloqueada' })
    harness.state.upsert = () => ({ data: null, error: rls403 })

    const first = await syncAll()
    expect(first.failed).toContain('notifications')
    expect(first.failed).not.toContain('workspaces')
    expect(first.synced).toBeGreaterThan(0)
    expect(harness.calls('workspaces', 'select')).toHaveLength(1)
    expect(
      vi.mocked(console.warn).mock.calls.some((c) => String(c[0]).includes('"notifications"')),
    ).toBe(true)

    // Ciclo seguinte: 'notifications' é pulada sem requisições; as demais seguem.
    const second = await syncAll()
    expect(second.failed).toContain('notifications')
    expect(second.synced).toBeGreaterThan(0)
    expect(harness.calls('workspaces', 'select')).toHaveLength(2)
    expect(harness.calls('notifications', 'select')).toHaveLength(1)
    expect(harness.calls('notifications', 'upsert')).toHaveLength(1)
  })

  // 5. Operações pendentes não são perdidas ao ocorrer uma falha.
  it('falha no meio do ciclo preserva dirty, tombstones e itens locais', async () => {
    const svc = notifService()
    const keep = svc.create({ updatedAt: new Date().toISOString(), title: 'manter' })
    const gone = svc.create({ updatedAt: new Date().toISOString(), title: 'remover' })
    expect(svc.remove(gone.id)).toBe(true)

    harness.state.select = () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(syncSingle('notifications')).rejects.toMatchObject({ kind: 'transient' })

    expect(getDirtyCollections()).toContain('notifications')
    expect(tombstones()).toContain(gone.id)
    expect(svc.getById(keep.id)).toBeDefined()

    // Rede de volta: as pendências são concluídas (upsert do item + DELETE provado).
    vi.setSystemTime(new Date(Date.now() + 31_000))
    harness.state.select = () => ({ data: [], error: null })
    await expect(syncSingle('notifications')).resolves.toBeUndefined()
    expect(harness.calls('notifications', 'upsert').some((c) => c.row?.id === keep.id)).toBe(true)
    expect(harness.calls('notifications', 'delete').some((c) => c.id === gone.id)).toBe(true)
    expect(getDirtyCollections()).not.toContain('notifications')
    expect(tombstones()).not.toContain(gone.id) // comprovado → limpo
  })

  // 6. Uma sincronização bem-sucedida continua limpando corretamente o estado local.
  it('sync OK limpa dirty, tombstones comprovados e registra log de sucesso', async () => {
    const svc = notifService()
    const stay = svc.create({ updatedAt: new Date().toISOString(), title: 'fica' })
    const removed = svc.create({ updatedAt: new Date().toISOString(), title: 'sai' })
    svc.remove(removed.id)
    // Exclusão COMPROVADA (RETURNING devolve a linha).
    harness.state.remove = () => ({ data: [{ id: removed.id }], error: null })

    await expect(syncSingle('notifications')).resolves.toBeUndefined()

    expect(getDirtyCollections()).not.toContain('notifications')
    expect(tombstones()).not.toContain(removed.id)
    expect(JSON.parse(localStorage.getItem('labhub_delete_attempts') || '{}')).not.toHaveProperty(
      'notifications',
    )
    expect(getSyncLog().at(-1)).toMatchObject({ collection: 'notifications', status: 'ok' })
    expect(getSyncBlockers().notifications).toBeUndefined()
    expect(svc.getById(stay.id)).toBeDefined()
  })

  // 7. O comportamento funciona com sincronizações concorrentes.
  it('execuções concorrentes da mesma coleção compartilham uma única requisição', async () => {
    const svc = notifService()
    svc.create({ updatedAt: new Date().toISOString(), title: 'única' })

    const results = await Promise.allSettled([
      syncSingle('notifications'),
      syncSingle('notifications'),
      syncSingle('notifications'),
      syncSingle('workspaces'),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'])

    // 3 chamadas da MESMA coleção → 1 execução (single-flight).
    expect(harness.calls('notifications', 'select')).toHaveLength(1)
    expect(harness.calls('notifications', 'upsert')).toHaveLength(1)
    // Coleções distintas continuam independentes.
    expect(harness.calls('workspaces', 'select')).toHaveLength(1)
    expect(getDirtyCollections()).not.toContain('notifications')
  })

  // 8. O isolamento por workspace e as regras de autorização não são enfraquecidos.
  it('classificação de autorização e isolamento por workspace permanecem intactos', async () => {
    // Classificação: 403/RLS é autorização; nada disso vira "sucesso".
    expect(classifySyncError(rls403)).toBe('auth')
    expect(classifySyncError({ code: '403', message: 'Forbidden' })).toBe('auth')
    expect(classifySyncError({ code: '401', message: 'Unauthorized' })).toBe('transient')
    expect(classifySyncError(new TypeError('Failed to fetch'))).toBe('transient')
    expect(classifySyncError({ code: 'PGRST301', message: 'JWT expired' })).toBe('transient')
    expect(classifySyncError({ message: 'resposta inesperada' })).toBe('unknown')

    const svc = notifService()
    const created = svc.create({ updatedAt: new Date().toISOString() })
    expect(created.workspace_id).toBe('ws-test') // stamping do workspace ativo intacto

    setCol('notifications', [
      { id: 'mine', workspace_id: 'ws-test' },
      { id: 'other', workspace_id: 'ws-other' },
      { id: 'global' },
    ])
    // O filtro de workspace segue valendo para leitura…
    expect(svc.getAll().map((n) => n.id).sort()).toEqual(['global', 'mine'])
    // …e nada é apagado do cache por causa do filtro.
    expect(getCol<Notif>('notifications').map((n) => n.id).sort()).toEqual(['global', 'mine', 'other'])

    // Sincronização com 403: falha, preserva dados e mantém o filtro aplicado.
    harness.state.upsert = () => ({ data: null, error: rls403 })
    await expect(syncSingle('notifications')).rejects.toMatchObject({ kind: 'auth' })
    expect(getSyncBlockers().notifications).toMatchObject({ kind: 'auth' })
    expect(svc.getAll().map((n) => n.id).sort()).toEqual(['global', 'mine'])
    expect(getCol('notifications')).toHaveLength(3)
    expect(getDirtyCollections()).toContain('notifications')

    // Nenhuma permissão foi ampliada: a única via de recuperação é explícita.
    retrySyncCollection('notifications')
    expect(getSyncBlockers().notifications).toBeUndefined()
    expect(getCol('notifications')).toHaveLength(3)
    expect(getDirtyCollections()).toContain('notifications')
  })
})
