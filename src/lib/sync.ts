import { defaultDb, pcareDb, stockDb } from './supabase'
import { createLocalService } from './storage'
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

function clearDeleted(collection: string) {
  const map = getDeletedMap()
  if (map[collection]) {
    delete map[collection]
    saveDeletedMap(map)
  }
}

// Registra um id removido localmente para ser apagado também no remoto no próximo sync.
function markDeleted(collection: string, id: string) {
  const map = getDeletedMap()
  map[collection] = [...new Set([...(map[collection] || []), id])]
  saveDeletedMap(map)
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
  'problem_templates',
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
  global_assets: 'public',
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
  global_assets: 'assets',
}

function getTableName(collection: string): string {
  return TABLE_NAME_MAP[collection] ?? collection
}

export interface SyncResult {
  synced: number
  failed: string[]
}

/**
 * Sincroniza UMA coleção isolada (push + pull) — usada por hooks de polling
 * rápido em módulos prioritários (chamados, notificações) sem rodar o syncAll completo.
 */
export async function syncSingle(collection: string): Promise<void> {
  const dirty = getDirtySet()
  const db = getDbFor(collection)

  if (db) {
    await syncCollection(collection, db, dirty)
    logSync(collection, getCol(collection).length, 'ok')
  } else {
    // Coleção local (sem tabela remota): nada a puxar/empurrar.
    logSync(collection, getCol(collection).length, 'simulated')
  }
  clearDirty(collection)
}

async function syncCollection(
  collection: string,
  db: NonNullable<typeof pcareDb>,
  dirty: Set<string>,
): Promise<'ok' | 'simulated' | 'error'> {
  const tableName = getTableName(collection)
  const items = getCol<{ id: string; updatedAt?: string }>(collection)
  const s = db.from(tableName)
  const { data: remoteItems, error } = await s.select('*')

  if (error) throw error

  const remoteMap = new Map<string, any>()
  for (const item of (remoteItems || []) as any[]) {
    remoteMap.set(item.id, item)
  }

  // Apaga do remoto itens removidos localmente (propagação de exclusão)
  for (const id of getDeletedIds(collection)) {
    const { error: delErr } = await s.delete().eq('id', id)
    if (delErr) throw delErr
  }

  // Sobe dados locais que não existem no remoto ou são mais recentes
  if (dirty.has(collection)) {
    for (const local of items) {
      const remote = remoteMap.get(local.id)
      if (!remote || compareTimestamps(local.updatedAt, (remote as any)?.updatedAt) > 0) {
        const { error: upsertErr } = await s.upsert(local as any, { onConflict: 'id' })
        if (upsertErr) throw upsertErr
      }
    }
  }

  // Puxa dados remotos que não existem localmente ou são mais recentes
  let changed = false
  for (const [, remote] of remoteMap) {
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

  // Sync concluído com sucesso: limpa os tombstones já propagados
  clearDeleted(collection)

  return 'ok'
}

export async function syncAll(onItem?: (collection: string, current: number, total: number) => void): Promise<SyncResult> {
  const dirty = getDirtySet()
  // Sincroniza TODAS as coleções (não só as sujas) para puxar mudanças de outros dispositivos.
  // Coleções locais (sem tabela remota) são apenas limpas do conjunto sujo, sem rede.
  const allCollections = [...LOCAL_ONLY_COLLECTIONS, ...Object.keys(REMOTE_DB)]

  let synced = 0
  const failed: string[] = []
  let current = 0

  for (const collection of allCollections) {
    current++
    const db = getDbFor(collection)
    try {
      if (db) {
        await syncCollection(collection, db, dirty)
        logSync(collection, getCol(collection).length, 'ok')
      } else {
        // Coleção local: apenas limpa o flag sujo, sem rede nem sleep.
        clearDirty(collection)
        synced++
        onItem?.(collection, current, allCollections.length)
        continue
      }

      clearDirty(collection)
      synced++
      onItem?.(collection, current, allCollections.length)
    } catch (e) {
      console.warn(`[Sync] Failed to sync "${collection}":`, e)
      logSync(collection, 0, 'error')
      failed.push(collection)
    }
  }

  return { synced, failed }
}

export function createSyncService<T extends { id: string }>(collection: string) {
  const local = createLocalService<T>(collection)

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
