import { getCol, setCol } from './db'
import { workspaceStore } from '../core/workspaces/store'

/**
 * Resolve a chave física de uma coleção no momento da operação.
 *
 * `null` significa "sem sessão": o serviço falha fechado — leitura vazia,
 * escrita no-op. Ver `cacheNamespace.ts` para a regra de identidade do cache.
 */
export type CollectionKeyResolver = () => string | null

/**
 * Sem sessão autenticada não há cache — nem para ler, nem para escrever.
 *
 * Exportado para diagnóstico. O serviço hoje NÃO lança: uma sessão que expira
 * no meio de uma renderização derrubaria a tela inteira, e uma lista vazia é
 * fail-closed na mesma medida. Ver o comentário em `key()`.
 */
export class NoCacheIdentityError extends Error {
  readonly collection: string

  constructor(collection: string) {
    super(`Sem sessão autenticada: cache de "${collection}" não acessível.`)
    this.name = 'NoCacheIdentityError'
    this.collection = collection
  }
}

export function createLocalService<T extends { id: string; workspace_id?: string }>(
  collection: string,
  enableWorkspaceFilter = true,
  resolveKey?: CollectionKeyResolver,
) {
  /**
   * Chave da operação, ou `null` quando não há sessão.
   *
   * `null` é fail-closed: sem identidade não existe cache, e um cache "anônimo"
   * seria um cache compartilhado com outro nome — a bug original.
   *
   * Não lança. Um `throw` aqui derrubaria a tela inteira quando a sessão
   * expirasse no meio de uma renderização, e uma lista vazia é fail-closed
   * igualmente: o usuário não vê nada de ninguém, nem precisa ver um erro para
   * isso acontecer. Escrever é no-op pelo mesmo motivo.
   */
  function key(): string | null {
    if (!resolveKey) return collection
    return resolveKey()
  }

  function getAll(noFilter?: boolean): T[] {
    const k = key()
    if (!k) return []
    const items = getCol<T>(k)
    if (noFilter || !enableWorkspaceFilter) return items
    return workspaceStore.filter(items)
  }

  function getById(id: string): T | undefined {
    return getAll().find((item) => item.id === id)
  }

  function create(data: Omit<T, 'id'> & { id?: string }): T {
    const k = key()
    const wsId = enableWorkspaceFilter && !(data as any).workspace_id
      ? workspaceStore.activeWorkspaceId
      : undefined
    const newItem = {
      ...data,
      id: (data as Partial<T>).id ?? crypto.randomUUID(),
      ...(wsId ? { workspace_id: wsId } : {}),
    } as T
    // Sem sessão o item é devolvido ao chamador (a escrita na API já aconteceu)
    // mas não é persistido: sem chave, não há onde persistir.
    if (!k) return newItem
    const items = getCol<T>(k)
    items.push(newItem)
    setCol(k, items)
    return newItem
  }

  function update(id: string, data: Partial<T>): T | undefined {
    const k = key()
    if (!k) return undefined
    const items = getCol<T>(k)
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return undefined
    items[index] = { ...items[index], ...data }
    setCol(k, items)
    return items[index]
  }

  function remove(id: string): boolean {
    const k = key()
    if (!k) return false
    const items = getCol<T>(k)
    const filtered = items.filter((item) => item.id !== id)
    if (filtered.length === items.length) return false
    setCol(k, filtered)
    return true
  }

  function query(predicate: (item: T) => boolean): T[] {
    return getAll().filter(predicate)
  }

  return { getAll, getById, create, update, remove, query }
}
