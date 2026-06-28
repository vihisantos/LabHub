import { pcareDb, stockDb } from './supabase'
import { createLocalService } from './storage'

const DIRTY_KEY = 'labhub_dirty_collections'
const SYNC_LOG_KEY = 'labhub_sync_log'
const SYNCED_FLAG = 'labhub_synced_at'

function getDirtySet(): Set<string> {
  try {
    const raw = localStorage.getItem(DIRTY_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveDirtySet(dirty: Set<string>) {
  localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]))
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

function getItemKey(collection: string) {
  return `labhub_${collection}`
}

function getAllLocal<T>(collection: string): T[] {
  try {
    const raw = localStorage.getItem(getItemKey(collection))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setAllLocal<T>(collection: string, data: T[]) {
  localStorage.setItem(getItemKey(collection), JSON.stringify(data))
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

function hasSynced(): boolean {
  return !!localStorage.getItem(SYNCED_FLAG)
}

function markSynced() {
  localStorage.setItem(SYNCED_FLAG, new Date().toISOString())
}

export async function syncAll(onItem?: (collection: string, current: number, total: number) => void): Promise<void> {
  const dirty = getDirtyCollections()
  if (dirty.length === 0) return

  for (const collection of dirty) {
    try {
      const items = getAllLocal<{ id: string; updatedAt?: string }>(collection)

      const isPcare = ['pcs', 'parts', 'part_usage', 'maintenance', 'checklist_templates', 'pc_checklists', 'action_logs'].includes(collection)
      const supabase = isPcare ? pcareDb : stockDb

      if (supabase) {
        const s = supabase.from(collection)
        const { data: remoteItems, error } = await s.select('*')

        if (error) throw error

        const remoteMap = new Map<string, any>()
        for (const item of (remoteItems || []) as any[]) {
          remoteMap.set(item.id, item)
        }

        const alreadySynced = hasSynced()

        // Primeiro sync = pull-only; dados locais não sobem pro banco
        if (alreadySynced) {
          for (const local of items) {
            const remote = remoteMap.get(local.id)
            if (!remote || compareTimestamps(local.updatedAt, (remote as any)?.updatedAt) > 0) {
              const { error: upsertErr } = await s.upsert(local as any, { onConflict: 'id' })
              if (upsertErr) throw upsertErr
            }
          }
        }

        for (const [, remote] of remoteMap) {
          if (!items.some((l) => l.id === (remote as any).id)) {
            ;(items as any[]).push(remote)
          }
        }

        setAllLocal(collection, items)

        if (!alreadySynced) markSynced()

        logSync(collection, items.length, 'ok')
      } else {
        await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300))
        logSync(collection, items.length, 'simulated')
      }

      clearDirty(collection)
      onItem?.(collection, 1, dirty.length)
    } catch (e) {
      console.warn(`[Sync] Failed to sync "${collection}":`, e)
      logSync(collection, 0, 'error')
    }
  }
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
      if (result) markDirty(collection)
      return result
    },
    query: local.query,
  }
}
