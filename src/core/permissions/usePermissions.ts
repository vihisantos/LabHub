import { useCallback, useEffect, useState } from 'react'
import type { Role, AppAccessLevel } from './types'
import { permissionService } from './service'
import { useAuth } from '../auth/AuthContext'

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    permissionService.initDefaults()
    permissionService.migrate()
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

/** Nível de acesso do usuário atual por aplicativo (cargo + override individual) */
export function useAppAccess() {
  const { user } = useAuth()
  const [role, setRole] = useState<Role | undefined>(() =>
    user ? permissionService.getRoleForUser(user.roleId) : undefined,
  )

  useEffect(() => {
    if (!user) {
      setRole(undefined)
      return
    }
    permissionService.initDefaults()
    permissionService.migrate()
    setRole(permissionService.getRoleForUser(user.roleId))
  }, [user])

  const getLevel = useCallback((appId: string): AppAccessLevel | null => {
    if (!user) return null
    if (user.is_super_admin) return 'full'
    return permissionService.resolveAppAccess(role, user, appId)
  }, [user, role])

  const canAccessApp = useCallback((appId: string): boolean => {
    return getLevel(appId) !== null
  }, [getLevel])

  const isFullAccess = useCallback((appId: string): boolean => {
    return getLevel(appId) === 'full'
  }, [getLevel])

  return { role, canAccessApp, getLevel, isFullAccess }
}
