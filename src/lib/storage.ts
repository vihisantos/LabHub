import { getCol, setCol } from './db'
import { workspaceStore } from '../core/workspaces/store'

export function createLocalService<T extends { id: string; workspace_id?: string }>(collection: string, enableWorkspaceFilter = true) {
  function getAll(noFilter?: boolean): T[] {
    const items = getCol<T>(collection)
    if (noFilter || !enableWorkspaceFilter) return items
    return workspaceStore.filter(items)
  }

  function getById(id: string): T | undefined {
    return getAll().find((item) => item.id === id)
  }

  function create(data: Omit<T, 'id'> & { id?: string }): T {
    const items = getCol<T>(collection)
    const wsId = enableWorkspaceFilter && !(data as any).workspace_id
      ? workspaceStore.activeWorkspaceId
      : undefined
    const newItem = {
      ...data,
      id: (data as Partial<T>).id ?? crypto.randomUUID(),
      ...(wsId ? { workspace_id: wsId } : {}),
    } as T
    items.push(newItem)
    setCol(collection, items)
    return newItem
  }

  function update(id: string, data: Partial<T>): T | undefined {
    const items = getCol<T>(collection)
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return undefined
    items[index] = { ...items[index], ...data }
    setCol(collection, items)
    return items[index]
  }

  function remove(id: string): boolean {
    const items = getCol<T>(collection)
    const filtered = items.filter((item) => item.id !== id)
    if (filtered.length === items.length) return false
    setCol(collection, filtered)
    return true
  }

  function query(predicate: (item: T) => boolean): T[] {
    return getAll().filter(predicate)
  }

  return { getAll, getById, create, update, remove, query }
}
