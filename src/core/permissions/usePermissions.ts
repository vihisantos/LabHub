import { useCallback, useEffect, useState } from 'react'
import type { Role, Permission } from './types'
import { permissionService } from './service'
import { useAuth } from '../auth/useAuth'

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    permissionService.initDefaults()
    const data = permissionService.getAll()
    setRoles(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: Omit<Role, 'id'>) => {
    const role = permissionService.create(data)
    setRoles((prev) => [...prev, role])
    return role
  }, [])

  const update = useCallback((id: string, data: Partial<Role>) => {
    const role = permissionService.update(id, data)
    if (role) {
      setRoles((prev) => prev.map((r) => (r.id === id ? role : r)))
    }
    return role
  }, [])

  const remove = useCallback((id: string) => {
    permissionService.remove(id)
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { roles, loading, create, update, remove, reload: load }
}

export function usePermissions() {
  const { user } = useAuth()

  const role = user ? permissionService.getRoleForUser(user.role) : undefined

  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!user) return false
    if (user.role === 'admin') return true
    return permissionService.hasPermission(role, permission)
  }, [user, role])

  const hasAnyPermission = useCallback((permissions: Permission[]): boolean => {
    return permissions.some((p) => hasPermission(p))
  }, [hasPermission])

  const hasAllPermissions = useCallback((permissions: Permission[]): boolean => {
    return permissions.every((p) => hasPermission(p))
  }, [hasPermission])

  return { role, hasPermission, hasAnyPermission, hasAllPermissions }
}
