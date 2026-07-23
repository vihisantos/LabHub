import { useCallback, useEffect, useState } from 'react'
import type { UserProfile, UserProfileFormData } from './types'
import { userService } from './service'

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = userService.getAll()
    setUsers(data.sort((a, b) => a.displayName.localeCompare(b.displayName)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: UserProfileFormData) => {
    const user = userService.create(data)
    setUsers((prev) => [...prev, user].sort((a, b) => a.displayName.localeCompare(b.displayName)))
    return user
  }, [])

  const update = useCallback((id: string, data: Partial<UserProfile>) => {
    const user = userService.update(id, data)
    if (user) {
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)).sort((a, b) => a.displayName.localeCompare(b.displayName)))
    }
    return user
  }, [])

  const deactivate = useCallback((id: string) => {
    userService.deactivate(id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }, [])

  const remove = useCallback((id: string) => {
    userService.remove(id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }, [])

  return { users, loading, create, update, deactivate, remove, reload: load }
}
