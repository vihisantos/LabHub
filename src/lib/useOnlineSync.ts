import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { syncAll, getPendingChanges, getSyncLog, getLastSyncedAt, type SyncLogEntry, retryBlockedCollections } from './sync'

/**
 * Runtime de sincronização COMPARTILHADO por todos os consumidores de
 * `useOnlineSync`.
 *
 * Antes, cada componente montado criava o próprio estado, os próprios
 * listeners e o próprio `setInterval` de 30s — e, como o guarda `syncing` era
 * por instância, várias execuções de `syncAll()` rodavam EM PARALELO puxando
 * as mesmas tabelas. O RootLayout do PC Care, por exemplo, monta o hook 4× ao
 * mesmo tempo (layout, `useSyncToasts`, `OnlineBanner` e `SyncStatusBadge`);
 * medimos 4 chamadas de `syncAll` no mount (pico de 4 simultâneas) e +4 a
 * cada janela de 30s (ver `useOnlineSync.multiInstance.test.tsx`).
 *
 * Agora existe UMA rotina por app:
 *  - execução single-flight: chamadas concorrentes compartilham a promessa em
 *    andamento (inclusive as duplicadas do StrictMode);
 *  - um único intervalo de 30s e um único conjunto de listeners de
 *    online/offline/storage, mantidos por contagem de referência enquanto
 *    houver ao menos um consumidor montado;
 *  - estado compartilhado via `useSyncExternalStore`: todos os consumidores
 *    veem o mesmo `syncing`/`syncError`/`lastSync`/...
 *
 * O contrato do hook (shape de retorno) e a cadência de 30s são preservados,
 * assim como o comportamento local-first: nada aqui lê ou grava dados —
 * `syncAll` continua responsável por push/pull e os tombstones/dirty-set de
 * `src/lib/sync.ts` permanecem intactos.
 */

const SYNC_INTERVAL_MS = 30000

type SyncListener = () => void

const listeners = new Set<SyncListener>()

let online = typeof navigator !== 'undefined' ? navigator.onLine : true
let syncing = false
let syncError: string | null = null
let lastSync: Date | null = null
let pendingChanges = 0
let syncLog: SyncLogEntry[] = []
let inFlight: Promise<void> | null = null
let refCount = 0
let intervalId: ReturnType<typeof setInterval> | null = null

function readLogState() {
  lastSync = getLastSyncedAt()
  pendingChanges = getPendingChanges()
  syncLog = getSyncLog()
}

readLogState()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Executa `syncAll` uma única vez mesmo com chamadores concorrentes: quem
 * chegar durante uma execução recebe a MESMA promessa. Erros não disparam
 * nova tentativa por si só — a retomada vem do intervalo/evento online.
 */
function runSync(): Promise<void> {
  if (inFlight) return inFlight
  if (!navigator.onLine) return Promise.resolve()

  syncing = true
  syncError = null
  notify()

  const run = (async () => {
    try {
      const result = await syncAll()
      readLogState()
      if (result.failed.length > 0) {
        syncError = `Falha ao sincronizar: ${result.failed.join(', ')}`
      }
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Erro desconhecido'
      console.warn('[Sync] triggerSync failed:', e)
    } finally {
      syncing = false
      inFlight = null
      notify()
    }
  })()
  inFlight = run
  return run
}

function goOnline() {
  online = true
  notify()
  void runSync()
}

function goOffline() {
  online = false
  notify()
}

function onStorage() {
  pendingChanges = getPendingChanges()
  notify()
}

function tick() {
  pendingChanges = getPendingChanges()
  if (navigator.onLine && !syncing) void runSync()
  notify()
}

function startGlobal() {
  online = navigator.onLine
  window.addEventListener('online', goOnline)
  window.addEventListener('offline', goOffline)
  window.addEventListener('storage', onStorage)
  intervalId = setInterval(tick, SYNC_INTERVAL_MS)
  // Sincronização inicial UMA vez por sessão de runtime (primeiro consumidor).
  // Consumidores que montam depois compartilham o MESMO estado global e não
  // precisam forçar um novo ciclo: o intervalo de 30s já cobre a atualização.
  void runSync()
}

function stopGlobal() {
  window.removeEventListener('online', goOnline)
  window.removeEventListener('offline', goOffline)
  window.removeEventListener('storage', onStorage)
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function subscribe(listener: SyncListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Snapshots estáveis entre notificações (requisito do useSyncExternalStore).
const getOnlineSnapshot = () => online
const getSyncingSnapshot = () => syncing
const getSyncErrorSnapshot = () => syncError
const getLastSyncSnapshot = () => lastSync
const getPendingSnapshot = () => pendingChanges
const getSyncLogSnapshot = () => syncLog

export function useOnlineSync() {
  const onlineState = useSyncExternalStore(subscribe, getOnlineSnapshot)
  const syncingState = useSyncExternalStore(subscribe, getSyncingSnapshot)
  const syncErrorState = useSyncExternalStore(subscribe, getSyncErrorSnapshot)
  const lastSyncState = useSyncExternalStore(subscribe, getLastSyncSnapshot)
  const pendingState = useSyncExternalStore(subscribe, getPendingSnapshot)
  const syncLogState = useSyncExternalStore(subscribe, getSyncLogSnapshot)

  const triggerSync = useCallback(() => runSync(), [])
  const refreshLog = useCallback(() => {
    readLogState()
    notify()
  }, [])

  const retryBlocked = useCallback(async () => {
    const blockedCollections = retryBlockedCollections()
    if (blockedCollections.length > 0) {
      // Trigger a sync after clearing the blockers
      await runSync()
    }
    return blockedCollections
  }, [])

  // Listeners + intervalo globais: criados uma vez para o primeiro consumidor
  // e removidos quando o último desmonta (contagem de referência).
  // A sincronização inicial é disparada pelo próprio runtime (startGlobal),
  // não por cada consumidor — evita ciclos redundantes a cada mount/remount.
  useEffect(() => {
    refCount++
    if (refCount === 1) startGlobal()
    return () => {
      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) stopGlobal()
    }
  }, [])

  return {
    online: onlineState,
    syncing: syncingState,
    syncError: syncErrorState,
    lastSync: lastSyncState,
    triggerSync,
    pendingChanges: pendingState,
    syncLog: syncLogState,
    refreshLog,
    retryBlocked,
  }
}

/**
 * Apenas para testes: reseta o runtime compartilhado (estado, execução em
 * andamento, listeners e intervalo globais) entre casos de teste.
 */
export function __resetOnlineSyncForTests() {
  stopGlobal()
  listeners.clear()
  inFlight = null
  refCount = 0
  syncing = false
  syncError = null
  online = typeof navigator !== 'undefined' ? navigator.onLine : true
  readLogState()
}