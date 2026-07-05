import { pcareDb, stockDb } from './supabase'
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

export interface SyncResult {
  synced: number
  failed: string[]
}

export async function syncAll(onItem?: (collection: string, current: number, total: number) => void): Promise<SyncResult> {
  const dirty = getDirtyCollections()
  if (dirty.length === 0) return { synced: 0, failed: [] }

  let synced = 0
  const failed: string[] = []

  for (const collection of dirty) {
    try {
      const items = getCol<{ id: string; updatedAt?: string }>(collection)

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

        // Sobe dados locais que não existem no remoto ou são mais recentes
        for (const local of items) {
          const remote = remoteMap.get(local.id)
          if (!remote || compareTimestamps(local.updatedAt, (remote as any)?.updatedAt) > 0) {
            const { error: upsertErr } = await s.upsert(local as any, { onConflict: 'id' })
            if (upsertErr) throw upsertErr
          }
        }

        // Puxa dados remotos que não existem localmente ou são mais recentes
        for (const [, remote] of remoteMap) {
          const idx = items.findIndex((l) => l.id === (remote as any).id)
          if (idx === -1) {
            ;(items as any[]).push(remote)
          } else if (compareTimestamps((remote as any).updatedAt, (items[idx] as any).updatedAt) > 0) {
            ;(items as any[])[idx] = remote
          }
        }

        setCol(collection, items)
        logSync(collection, items.length, 'ok')
      } else {
        await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300))
        logSync(collection, items.length, 'simulated')
      }

      clearDirty(collection)
      synced++
      onItem?.(collection, 1, dirty.length)
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
      if (result) markDirty(collection)
      return result
    },
    query: local.query,
  }
}
