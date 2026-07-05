import { getCol, setCol } from './db'

export function createLocalService<T extends { id: string }>(collection: string) {
  function getAll(): T[] {
    return getCol<T>(collection)
  }

  function getById(id: string): T | undefined {
    return getAll().find((item) => item.id === id)
  }

  function create(data: Omit<T, 'id'>): T {
    const items = getAll()
    const newItem = {
      ...data,
      id: crypto.randomUUID(),
    } as unknown as T
    items.push(newItem)
    setCol(collection, items)
    return newItem
  }

  function update(id: string, data: Partial<T>): T | undefined {
    const items = getAll()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return undefined
    items[index] = { ...items[index], ...data }
    setCol(collection, items)
    return items[index]
  }

  function remove(id: string): boolean {
    const items = getAll()
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
