const CACHE = new Map<string, any[]>()
let DB: IDBDatabase | null = null
let ready = false
let initPromise: Promise<void> | null = null

const DB_NAME = 'labhub'
const STORE = 'collections'

function prom<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** Limpa o cache em memória e o localStorage (para testes) */
export function clearCache() {
  CACHE.clear()
  for (const name of COLLECTIONS) {
    localStorage.removeItem(`labhub_${name}`)
  }
}

export function resetCache() {
  clearCache()
  ready = false
  initPromise = null
  DB = null
}

export async function initDB(): Promise<void> {
  if (ready) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    DB = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })

    const tx = DB.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const keys = await prom(store.getAllKeys())

    for (const key of keys) {
      const data = await prom(store.get(key))
      if (data) CACHE.set(String(key), data)
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
    })

    migrateLocalStorage()
    ready = true
  })()

  return initPromise
}

export function isReady(): boolean {
  return ready
}

export function getCol<T>(name: string): T[] {
  return (CACHE.get(name) as T[]) ?? []
}

export function setCol<T>(name: string, data: T[]): void {
  CACHE.set(name, data)
  if (!DB) return
  const tx = DB.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(data, name)
}

const COLLECTIONS = [
  'pcs',
  'parts',
  'part_usage',
  'maintenance',
  'checklist_templates',
  'pc_checklists',
  'action_logs',
  'stock_items',
  'stock_movements',
  'stock_kits',
  'stock_maintenance',
  'stock_photos',
  'inventory_cycles',
  'inventory_counts',
]

function migrateLocalStorage(): void {
  const PREFIX = 'labhub_'
  let migrated = false

  for (const name of COLLECTIONS) {
    if (CACHE.has(name)) continue
    try {
      const raw = localStorage.getItem(`${PREFIX}${name}`)
      if (raw) {
        const data = JSON.parse(raw)
        if (Array.isArray(data) && data.length > 0) {
          CACHE.set(name, data)
          if (DB) {
            const tx = DB.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).put(data, name)
          }
          migrated = true
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  if (migrated) {
    for (const name of COLLECTIONS) {
      localStorage.removeItem(`${PREFIX}${name}`)
    }
    localStorage.removeItem('labhub_dirty_collections')
  }
}
