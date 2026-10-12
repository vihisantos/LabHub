import { defaultDb, pcareDb, stockDb } from './supabase'
import { createLocalService, type CollectionKeyResolver } from './storage'
import { getCol, setCol } from './db'

const DIRTY_KEY = 'labhub_dirty_collections'
const SYNC_LOG_KEY = 'labhub_sync_log'

function getDirtySet(): Set<string> {
  try {
    const raw = localStorage.getItem(DIRTY_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveDirtySet(dirty: Set<string>) {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]))
  } catch {
    /* localStorage unavailable — dirty set remains in memory, next sync will reconcile */
  }
}

export function markDirty(collection: string) {
  const dirty = getDirtySet()
  dirty.add(collection)
  saveDirtySet(dirty)
}

export function clearDirty(collection: string) {
  const dirty = getDirtySet()
  dirty.delete(collection)
  saveDirtySet(dirty)
}

export function getDirtyCollections(): string[] {
  return [...getDirtySet()]
}

export function getPendingChanges(): number {
  return getDirtySet().size
}

const DELETED_KEY = 'labhub_deleted_ids'

function getDeletedMap(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(DELETED_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveDeletedMap(map: Record<string, string[]>) {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(map))
  } catch {
    /* localStorage unavailable — tombstones remain in memory, next sync will reconcile */
  }
}

function getDeletedIds(collection: string): string[] {
  return getDeletedMap()[collection] || []
}

// Registra um id removido localmente para ser apagado também no remoto no próximo sync.
function markDeleted(collection: string, id: string) {
  const map = getDeletedMap()
  map[collection] = [...new Set([...(map[collection] || []), id])]
  saveDeletedMap(map)
  // Nova intenção de exclusão: reinicia o controle de tentativas do id, para
  // que um estado 'unverifiable' antigo não silencie uma exclusão nova.
  const attempts = getDeleteAttemptsMap()
  const perCollection = attempts[collection]
  if (perCollection && perCollection[id]) {
    delete perCollection[id]
    if (Object.keys(perCollection).length === 0) delete attempts[collection]
    saveDeleteAttemptsMap(attempts)
  }
}

/**
 * Descarta o tombstone de UM id — somente quando a exclusão remota foi
 * COMPROVADA (o `DELETE ... RETURNING` devolveu a linha). Um 204 vazio não
 * prova nada: sob RLS, "sem erro" significa apenas que 0 linhas foram
 * afetadas. Por isso nunca limpamos a coleção inteira de uma vez — o
 * `clearDeleted` em lote anterior descartava intenções de exclusão que o
 * servidor jamais executou (parte do loop do incidente P0.1).
 */
function forgetDeleted(collection: string, id: string) {
  const map = getDeletedMap()
  const list = map[collection]
  if (list && list.includes(id)) {
    map[collection] = list.filter((x) => x !== id)
    if (map[collection].length === 0) delete map[collection]
    saveDeletedMap(map)
  }
  const attempts = getDeleteAttemptsMap()
  if (attempts[collection]?.[id]) {
    delete attempts[collection][id]
    if (Object.keys(attempts[collection]).length === 0) delete attempts[collection]
    saveDeleteAttemptsMap(attempts)
  }
}

// ── Controle de tentativas de exclusão por tombstone ────────────────────────
//
// A garantia de exclusão do PostgREST é o RETURNING: só a presença da linha
// no `data` prova que ela saiu. Sem prova (RLS esconde a linha, usuário sem
// policy de DELETE, ou a linha nunca existiu no remoto), o tombstone NÃO é
// descartado — mas também não pode gerar requisições para sempre. Após
// MAX_DELETE_ATTEMPTS tentativas sem prova, o id é marcado `unverifiable`:
// retido (recuperável), diagnosticável e sem novas requisições nos ciclos
// rotineiros.

const DELETE_ATTEMPTS_KEY = 'labhub_delete_attempts'
const MAX_DELETE_ATTEMPTS = 3

type DeleteAttemptRecord = { attempts: number; at: string; status?: 'unverifiable' }

function getDeleteAttemptsMap(): Record<string, Record<string, DeleteAttemptRecord>> {
  try {
    return JSON.parse(localStorage.getItem(DELETE_ATTEMPTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveDeleteAttemptsMap(map: Record<string, Record<string, DeleteAttemptRecord>>) {
  try {
    localStorage.setItem(DELETE_ATTEMPTS_KEY, JSON.stringify(map))
  } catch {
    /* storage indisponível: tentativas ficam em memória até o próximo ciclo */
  }
}

function recordDeleteAttempt(collection: string, id: string): DeleteAttemptRecord {
  const map = getDeleteAttemptsMap()
  const collectionMap = (map[collection] = map[collection] || {})
  const attempts = (collectionMap[id]?.attempts ?? 0) + 1
  const record: DeleteAttemptRecord = {
    attempts,
    at: new Date().toISOString(),
    ...(attempts >= MAX_DELETE_ATTEMPTS ? { status: 'unverifiable' as const } : {}),
  }
  collectionMap[id] = record
  saveDeleteAttemptsMap(map)
  return record
}

/** Ids cuja exclusão ainda deve ser TENTADA neste ciclo (sem prova ≤ limite). */
function getRetryableDeletedIds(collection: string): string[] {
  const attempts = getDeleteAttemptsMap()[collection] || {}
  return getDeletedIds(collection).filter((id) => attempts[id]?.status !== 'unverifiable')
}

export interface SyncLogEntry {
  collection: string
  itemCount: number
  status: 'ok' | 'simulated' | 'error'
  at: string
}

export function getSyncLog(): SyncLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]')
  } catch {
    return []
  }
}

export function getLastSyncedAt(): Date | null {
  const logs = getSyncLog()
  const last = logs.filter((l) => l.status !== 'error').at(-1)
  return last ? new Date(last.at) : null
}

function logSync(collection: string, itemCount: number, status: 'ok' | 'simulated' | 'error') {
  try {
    const logs = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]')
    logs.push({ collection, itemCount, status, at: new Date().toISOString() })
    if (logs.length > 100) logs.splice(0, logs.length - 100)
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(logs))
  } catch {}
}

function compareTimestamps(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b)
}

// Coleções locais (apenas storage local, sem tabela remota no Supabase)
const LOCAL_ONLY_COLLECTIONS = [
  'assets',
  'chamados',
  'rooms',
  'sla_configs',
  'audit_logs',
  'user_profiles',
  'roles',
]

// Coleções com tabela remota → schema no Supabase.
// Só o que existe aqui deve ser puxado/empurrado do remoto.
const REMOTE_DB: Record<string, 'pcare' | 'stock' | 'public'> = {
  // schema pcare
  pcs: 'pcare',
  parts: 'pcare',
  part_usage: 'pcare',
  maintenance: 'pcare',
  checklist_templates: 'pcare',
  pc_checklists: 'pcare',
  action_logs: 'pcare',
  // schema stock
  stock_items: 'stock',
  stock_movements: 'stock',
  stock_kits: 'stock',
  stock_maintenance: 'stock',
  inventory_cycles: 'stock',
  inventory_counts: 'stock',
  notifications: 'stock',
  // schema public
  workspaces: 'public',
  // NOTA: `public.assets` (Patrimônio) NÃO é uma coleção do motor local-first.
  // É snake_case e append-only via `asset_movements`; o Patrimônio fala direto
  // com o Supabase (RLS) em `src/core/patrimonio/`. Ver
  // `docs/patrimonio/data-layer.md`.
}

function getDbFor(collection: string): NonNullable<typeof pcareDb> | null {
  const which = REMOTE_DB[collection]
  if (which === 'pcare') return pcareDb
  if (which === 'stock') return stockDb
  if (which === 'public') return defaultDb
  return null
}

// Mapeamento: nome da coleção local → nome da tabela no Supabase
// (necessário quando o nome local difere do nome da tabela remota)
const TABLE_NAME_MAP: Record<string, string> = {
  inventory_cycles: 'stock_inventory_cycles',
  inventory_counts: 'stock_inventory_counts',
}

function getTableName(collection: string): string {
  return TABLE_NAME_MAP[collection] ?? collection
}

export interface SyncResult {
  synced: number
  failed: string[]
}

// ── Classificação de falhas de sincronização ────────────────────────────────
//
// O cliente diferencia quatro situações:
//  - sucesso        → operação confirmada pelo servidor → estado local limpo;
//  - 'transient'    → falha temporária (rede/5xx/429/JWT) → retry com backoff;
//  - 'auth'         → rejeição PERMANENTE de autorização (403/RLS) → bloqueio:
//                     para de repetir, fica diagnosticável, dados preservados;
//  - 'unknown'      → resultado remoto DESCONHECIDO → nunca é sucesso →
//                     backoff e estado local preservado até re-tentativa.
//
// A classificação só lê o erro (código/mensagem); nenhuma permissão é
// ampliada e nenhuma política é contornada.

export type SyncFailureKind = 'auth' | 'transient' | 'unknown'

export class SyncError extends Error {
  readonly kind: SyncFailureKind
  readonly collection: string

  constructor(kind: SyncFailureKind, collection: string, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'SyncError'
    this.kind = kind
    this.collection = collection
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

export function classifySyncError(e: unknown): SyncFailureKind {
  const code = String((e as { code?: unknown } | null)?.code ?? '')
  const message = String((e as { message?: unknown } | null)?.message ?? e ?? '')
  // HTTP status code may be in e.status or e.statusCode (Supabase client)
  const status = Number((e as { status?: unknown; statusCode?: unknown } | null)?.status ?? (e as { statusCode?: unknown } | null)?.statusCode ?? 0)

  // Rede/fetch: recuperável com nova tentativa.
  if (e instanceof TypeError) return 'transient'
  if (/failed to fetch|networkerror|network request failed|fetch failed|econn|etimedout|timed? ?out|socket hang up/i.test(message)) {
    return 'transient'
  }

  // Autorização negada (RLS / policy). Repetir não muda o resultado: só a
  // mudança de permissão no servidor resolve.
  if (code === '42501' || code === '42503') return 'auth'
  if (/row-level security|permission denied|insufficient_privilege|not authorized|forbidden|access denied/i.test(message)) {
    return 'auth'
  }

  // Codes de 3 dígitos são status HTTP (códigos de erro do Postgres têm 5 dígitos).
  if (/^\d{3}$/.test(code)) {
    const status = Number(code)
    if (status === 403) return 'auth'
    if (status === 401) return 'transient' // token: o refresh do supabase-js resolve
    if (status === 429 || status >= 500) return 'transient'
  }

  // HTTP status code no objeto de erro (ex.: 406, 400, etc.)
  if (status) {
    if (status === 403) return 'auth'
    if (status === 401) return 'transient'
    if (status === 429 || status >= 500) return 'transient'
    // 406 = schema inválido / não exposto: erro permanente de configuração
    if (status === 406) return 'auth'
    if (status === 400 || status === 404) return 'auth'
  }

  // JWT expirado: o refresh automático torna a próxima tentativa válida.
  if (code === 'PGRST301') return 'transient'

  // Erros do PostgREST com código PGRSTxxx que indicam erro de configuração/schema
  if (/^PGRST(106|200|201|202|203|204|205)$/.test(code)) return 'auth'

  return 'unknown'
}

// ── Backoff de falhas temporárias/desconhecidas ─────────────────────────────

const RETRY_KEY = 'labhub_sync_retry'
const TRANSIENT_RETRY_BASE_MS = 30_000
const TRANSIENT_RETRY_MAX_MS = 15 * 60_000

type RetryRecord = { attempts: number; nextAt: number; lastAt: string; lastError: string }

function getRetryMap(): Record<string, RetryRecord> {
  try {
    return JSON.parse(localStorage.getItem(RETRY_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveRetryMap(map: Record<string, RetryRecord>) {
  try {
    localStorage.setItem(RETRY_KEY, JSON.stringify(map))
  } catch {
    /* storage indisponível: backoff em memória até o próximo ciclo */
  }
}

function recordTransientFailure(collection: string, message: string) {
  const map = getRetryMap()
  const attempts = (map[collection]?.attempts ?? 0) + 1
  const delay = Math.min(TRANSIENT_RETRY_BASE_MS * 2 ** (attempts - 1), TRANSIENT_RETRY_MAX_MS)
  map[collection] = {
    attempts,
    nextAt: Date.now() + delay,
    lastAt: new Date().toISOString(),
    lastError: message.slice(0, 300),
  }
  saveRetryMap(map)
}

function clearRetry(collection: string) {
  const map = getRetryMap()
  if (map[collection]) {
    delete map[collection]
    saveRetryMap(map)
  }
}

// ── Bloqueio por autorização (falha permanente) ─────────────────────────────
//
// Uma resposta 403/RLS não é erro de rede: o cliente não tem permissão e não
// terá até a política mudar. Em vez de reenviar as mesmas operações a cada
// ciclo (o loop do incidente: ~37 mil DELETEs + ~434 POST 403 em 6 h), a
// coleção é bloqueada: sem requisições nos ciclos rotineiros, com os dados
// locais (dirty + tombstones) preservados e o estado visível para
// diagnóstico. O bloqueio expira em BLOCKED_REPROBE_MS para UMA nova
// tentativa (auto-recuperação após correção no servidor), é limpo quando a
// identidade da sessão muda, e pode ser limpo explicitamente via
// `retrySyncCollection`.

const BLOCKER_KEY = 'labhub_sync_blockers'
const BLOCKED_REPROBE_MS = 24 * 60 * 60 * 1000

export interface SyncBlocker {
  kind: 'auth'
  code: string
  message: string
  at: string
  userId: string | null
  /** Instante a partir do qual UMA nova tentativa é permitida (re-probe). */
  reprobeAt: number
}

function getBlockerMap(): Record<string, SyncBlocker> {
  try {
    return JSON.parse(localStorage.getItem(BLOCKER_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveBlockerMap(map: Record<string, SyncBlocker>) {
  try {
    localStorage.setItem(BLOCKER_KEY, JSON.stringify(map))
  } catch {
    /* storage indisponível: bloqueio em memória até o próximo ciclo */
  }
}

/** Diagnóstico: coleções bloqueadas por falha de autorização (403/RLS). */
export function getSyncBlockers(): Record<string, SyncBlocker> {
  return { ...getBlockerMap() }
}

function recordBlocker(collection: string, e: unknown, userId: string | null) {
  const map = getBlockerMap()
  map[collection] = {
    kind: 'auth',
    code: String((e as { code?: unknown } | null)?.code ?? ''),
    message: String((e as { message?: unknown } | null)?.message ?? e ?? '').slice(0, 300),
    at: new Date().toISOString(),
    userId,
    reprobeAt: Date.now() + BLOCKED_REPROBE_MS,
  }
  saveBlockerMap(map)
}

function clearBlocker(collection: string) {
  const map = getBlockerMap()
  if (map[collection]) {
    delete map[collection]
    saveBlockerMap(map)
  }
}

/**
 * Recuperação EXPLÍCITA: remove bloqueio, backoff e tentativas de exclusão da
 * coleção para que o próximo ciclo re-tente tudo do zero. Chamar após
 * corrigir permissões/policies no servidor. Nada de dado local é apagado.
 */
export function retrySyncCollection(collection: string) {
  clearBlocker(collection)
  clearRetry(collection)
  const attempts = getDeleteAttemptsMap()
  if (attempts[collection]) {
    delete attempts[collection]
    saveDeleteAttemptsMap(attempts)
  }
}

/**
 * Recupera TODAS as coleções bloqueadas por falha de autorização (auth).
 * Remove os bloqueios e limpa o estado de retry/tentativas de exclusão
 * para que o próximo ciclo tente sincronizar novamente.
 * Não apaga dados locais (dirty, tombstones).
 */
export function retryBlockedCollections(): string[] {
  const blockers = getSyncBlockers()
  const blockedCollections = Object.keys(blockers)
  for (const collection of blockedCollections) {
    retrySyncCollection(collection)
  }
  return blockedCollections
}

async function getSessionUserId(db: NonNullable<typeof pcareDb>): Promise<string | null> {
  try {
    const { data } = await db.auth.getSession()
    return data?.session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Libera um bloqueio apenas quando a identidade da sessão mudou de forma
 * CONFIRMADA. Sem identidade confiável (sessão ilegível), mantém o bloqueio:
 * liberar às cegas reabriria o fluxo de tentativas que este patch elimina.
 */
async function refreshBlockerIdentity(collection: string, db: NonNullable<typeof pcareDb>): Promise<void> {
  const blocker = getBlockerMap()[collection]
  if (!blocker) return
  const currentUserId = await getSessionUserId(db)
  if (currentUserId && blocker.userId && currentUserId !== blocker.userId) {
    clearBlocker(collection)
  }
}

/**
 * Gate de tentativa: 'blocked' (falha de autorização pendente),
 * 'backoff' (falha temporária ainda dentro do intervalo) ou null (tentar).
 */
function getGateSkip(collection: string): 'blocked' | 'backoff' | null {
  const now = Date.now()
  const blocker = getBlockerMap()[collection]
  if (blocker) {
    if (now < blocker.reprobeAt) return 'blocked'
    clearBlocker(collection) // janela de re-probe diária: UMA nova tentativa
  }
  const retry = getRetryMap()[collection]
  if (retry && now < retry.nextAt) return 'backoff'
  return null
}

// ── Single-flight por coleção ───────────────────────────────────────────────
//
// Várias instâncias de `useFastSync` (10 s cada, ~5 call sites montados em
// rotas diferentes) e o `useOnlineSync` (30 s) podem disparar a MESMA coleção
// ao mesmo tempo — e cada aba tem seu próprio runtime. Sem esta trava,
// execuções paralelas reenviavam as mesmas operações e multiplicavam o
// volume do incidente. Chamadas concorrentes da mesma coleção compartilham
// a mesma promessa; coleções distintas continuam independentes.

const inFlightByCollection = new Map<string, Promise<void>>()

function withCollectionLock(collection: string, fn: () => Promise<void>): Promise<void> {
  const existing = inFlightByCollection.get(collection)
  if (existing) return existing
  const run = fn()
  const tracked = run.finally(() => {
    inFlightByCollection.delete(collection)
  })
  inFlightByCollection.set(collection, tracked)
  return tracked
}

/**
 * Sincroniza UMA coleção isolada (push + pull) — usada por hooks de polling
 * rápido em módulos prioritários (chamados, notificações) sem rodar o syncAll
 * completo. Execução single-flight por coleção. Falhas NÃO são silenciadas:
 * são lançadas como `SyncError` com o tipo classificado ('auth' |
 * 'transient' | 'unknown') e o estado local (dirty + tombstones) permanece
 * intacto até uma tentativa bem-sucedida.
 */
export async function syncSingle(collection: string): Promise<void> {
  return withCollectionLock(collection, () => syncOneCollection(collection))
}

/**
 * Ciclo de UMA coleção: gate (bloqueio/backoff) + push + pull + atualização
 * do estado local. Qualquer falha preserva dirty/tombstones e é classificada
 * antes de ser propagada — nunca é tratada como sucesso.
 */
async function syncOneCollection(collection: string): Promise<void> {
  const db = getDbFor(collection)
  if (!db) {
    // Coleção local (sem tabela remota): nada a puxar/empurrar.
    clearDirty(collection)
    logSync(collection, getCol(collection).length, 'simulated')
    return
  }

  await refreshBlockerIdentity(collection, db)

  const skip = getGateSkip(collection)
  if (skip) {
    logSync(collection, getCol(collection).length, 'error')
    throw skip === 'blocked'
      ? new SyncError(
          'auth',
          collection,
          `Sincronização de "${collection}" bloqueada: autorização negada (403/RLS). Dados locais preservados; use retrySyncCollection() após corrigir permissões.`,
        )
      : new SyncError(
          'transient',
          collection,
          `Sincronização de "${collection}" adiada por backoff após falha temporária.`,
        )
  }

  try {
    await syncCollection(collection, db, getDirtySet())
    clearRetry(collection)
    clearDirty(collection)
    logSync(collection, getCol(collection).length, 'ok')
  } catch (e) {
    const kind = classifySyncError(e)
    const message = e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message ?? e)
    if (kind === 'auth') {
      // Falha permanente: bloqueia a coleção (sem novas requisições), guarda
      // o motivo para diagnóstico e preserva todo o estado local.
      recordBlocker(collection, e, await getSessionUserId(db))
    } else {
      // 'transient' | 'unknown': retry controlado com backoff exponencial
      // (30 s → 15 min). Resultado desconhecido nunca vira sucesso aqui.
      recordTransientFailure(collection, message)
    }
    logSync(collection, 0, 'error')
    throw e instanceof SyncError ? e : new SyncError(kind, collection, message, { cause: e })
  }
}

async function syncCollection(
  collection: string,
  db: NonNullable<typeof pcareDb>,
  dirty: Set<string>,
): Promise<'ok'> {
  const tableName = getTableName(collection)
  const items = getCol<{ id: string; updatedAt?: string }>(collection)
  const s = db.from(tableName)
  const { data: remoteItems, error } = await s.select('*')

  if (error) throw error

  const remoteMap = new Map<string, any>()
  for (const item of (remoteItems || []) as any[]) {
    remoteMap.set(item.id, item)
  }

  // Exclusões pendentes: cada DELETE pede a representação da linha excluída
  // (`.select('id')` → RETURNING). Só a linha devolvida PROVA que ela saiu;
  // `error: null` com `data` vazio (o caso do incidente: política de DELETE
  // restrita a super-admin → 0 linhas afetadas, HTTP 204) não prova nada. Sem
  // prova o tombstone fica e a tentativa é contada; após MAX_DELETE_ATTEMPTS
  // o id vira `unverifiable` (retido e diagnosticável, sem novas requisições).
  for (const id of getRetryableDeletedIds(collection)) {
    const { data: deletedRows, error: delErr } = await s.delete().eq('id', id).select('id')
    if (delErr) throw delErr
    if (Array.isArray(deletedRows) && deletedRows.length > 0) {
      forgetDeleted(collection, String(id))
    } else {
      recordDeleteAttempt(collection, id)
    }
  }

  // Sobe dados locais que não existem no remoto ou são mais recentes.
  const pendingDeletion = new Set(getDeletedIds(collection))
  if (dirty.has(collection)) {
    for (const local of items) {
      if (pendingDeletion.has(String(local.id))) continue
      const remote = remoteMap.get(local.id)
      if (!remote || compareTimestamps(local.updatedAt, (remote as any)?.updatedAt) > 0) {
        const { error: upsertErr } = await s.upsert(local as any, { onConflict: 'id' })
        if (upsertErr) throw upsertErr
      }
    }
  }

  // Puxa dados remotos que não existem localmente ou são mais recentes.
  // Itens com exclusão local pendente não ressuscitam: enquanto o DELETE não
  // for comprovado (ou permanecer não-comprovável), a intenção local de
  // exclusão prevalece sobre o remoto.
  let changed = false
  for (const [, remote] of remoteMap) {
    if (pendingDeletion.has(String((remote as any).id))) continue
    const idx = items.findIndex((l) => l.id === (remote as any).id)
    if (idx === -1) {
      ;(items as any[]).push(remote)
      changed = true
    } else if (compareTimestamps((remote as any).updatedAt, (items[idx] as any).updatedAt) > 0) {
      ;(items as any[])[idx] = remote
      changed = true
    }
  }

  if (changed || dirty.has(collection)) {
    setCol(collection, items)
  }

  return 'ok'
}

export async function syncAll(onItem?: (collection: string, current: number, total: number) => void): Promise<SyncResult> {
  // Sincroniza TODAS as coleções (não só as sujas) para puxar mudanças de outros dispositivos.
  // Coleções locais (sem tabela remota) são apenas limpas do conjunto sujo, sem rede.
  const allCollections = [...LOCAL_ONLY_COLLECTIONS, ...Object.keys(REMOTE_DB)]

  let synced = 0
  const failed: string[] = []
  let current = 0

  for (const collection of allCollections) {
    current++
    try {
      // Single-flight compartilhado com syncSingle: se um polling rápido já
      // está rodando esta coleção, reutiliza a execução em andamento.
      await withCollectionLock(collection, () => syncOneCollection(collection))
      synced++
      onItem?.(collection, current, allCollections.length)
    } catch (e) {
      // Isolamento por coleção: uma falha — inclusive permanente, que a
      // partir daí é pulada pelo gate — não impede as demais de progredir.
      console.warn(`[Sync] Failed to sync "${collection}":`, e)
      failed.push(collection)
    }
  }

  return { synced, failed }
}

/**
 * Serviço de cache local para uma coleção.
 *
 * `resolveKey` (opcional) é o gancho da #344: quando presente, cada operação
 * resolve a chave física no momento de executá-la, em vez de usar um nome fixo.
 * É assim que `chamados` vira `chamados:<userId>` sem que nenhum consumidor
 * precise concatenar string — e sem que um consumidor possa escolher a
 * identidade. As demais coleções seguem com a chave literal, inalteradas.
 */
export function createSyncService<T extends { id: string }>(
  collection: string,
  enableWorkspaceFilter = true,
  resolveKey?: CollectionKeyResolver,
) {
  const local = createLocalService<T>(collection, enableWorkspaceFilter, resolveKey)

  return {
    getAll: local.getAll,
    getById: local.getById,
    create(data: Omit<T, 'id'>): T {
      const item = local.create(data)
      markDirty(collection)
      return item
    },
    update(id: string, data: Partial<T>): T | undefined {
      const item = local.update(id, data)
      if (item) markDirty(collection)
      return item
    },
    remove(id: string): boolean {
      const result = local.remove(id)
      if (result) {
        if (REMOTE_DB[collection]) markDeleted(collection, id)
        markDirty(collection)
      }
      return result
    },
    query: local.query,
  }
}
