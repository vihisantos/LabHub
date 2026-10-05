const CACHE = new Map<string, any[]>()
let DB: IDBDatabase | null = null
let ready = false
let initPromise: Promise<void> | null = null

const DB_NAME = 'labhub'
const STORE = 'collections'

/**
 * Separador da chave namespaced por usuário (`chamados:<userId>`).
 *
 * `initDB` usa este prefixo para decidir o que é uma coleção namespaced e o que
 * é uma chave legada sem dono conhecido. Precisa ser um caractere que não
 * aparece em nome de coleção nem em uuid, e nunca no início da chave — assim
 * `chamados` (legado) e `chamados:abc` (de A) nunca se confundem.
 */
export const NAMESPACE_SEPARATOR = ':'

/**
 * Chave namespaced? `chamados:abc` sim; `chamados` (legado) não.
 *
 * Usado por `initDB` para não transformar uma coleção namespaced em parte do
 * cache em memória compartilhado.
 */
export function isNamespacedKey(key: string): boolean {
  const i = key.indexOf(NAMESPACE_SEPARATOR)
  return i > 0 && i < key.length - 1
}

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

    // Cada chave do IndexedDB vira uma entrada PRÓPRIA no `CACHE`, e sempre foi
    // assim — `chamados:A` e `chamados:B` não se misturam aqui, porque as duas
    // entradas têm chaves distintas e nada as une.
    //
    // `getCol` só é acessível por nome exato de chave, e o único código que
    // constrói esse nome é `currentUserCollectionKey`, que monta
    // `chamados:<usuário da sessão>`. Não existe API de enumeração de coleções
    // exportada, então não há caminho pelo qual B obtenha a chave de A a partir
    // de uma entrada em memória de A.
    //
    // A chave legada `chamados` (sem dono conhecido) também entra no `CACHE`,
    // e isso é deliberado: ela fica inerte. Nada a chama, porque `getAll` da fila
    // resolve a chave namespaced. Ver `cacheNamespace.ts` para por que ela não
    // pode ser adotada por inferência.
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

const changeListeners = new Map<string, Set<() => void>>()

/**
 * Registra um observador passivo de gravações na coleção `name` (disparado a
 * cada `setCol`). Não é uma fonte de dados nem polling/subscription: apenas a
 * notificação de que o cache foi gravado. Retorna a função que remove o
 * observador.
 */
export function onCollectionChange(name: string, listener: () => void): () => void {
  let set = changeListeners.get(name)
  if (!set) {
    set = new Set()
    changeListeners.set(name, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) changeListeners.delete(name)
  }
}

function notifyCollectionChange(name: string): void {
  const set = changeListeners.get(name)
  if (set) {
    for (const listener of set) {
      listener()
    }
  }
}

export function setCol<T>(name: string, data: T[]): void {
  CACHE.set(name, data)
  notifyCollectionChange(name)
  if (!DB) return
  const tx = DB.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(data, name)
}

const COLLECTIONS = [
  'assets',
  'global_assets',
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
