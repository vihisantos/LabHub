import { useCallback, useEffect, useState } from 'react'
import type { Role } from './types'
import { permissionService } from './service'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { membershipService } from '../memberships/service'

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

/**
 * RBAC 2.0 (#296 PR-4C): gate de UI por Action, ASSÍNCRONO e fail-closed.
 *
 * Enquanto `loading` for `true` o consumidor deve tratar como **negado** — um
 * gate de UI não abre por omissão. Erro de consulta também vira `false`
 * (`membershipService.can` já é fail-closed; aqui só normalizamos o estado).
 *
 *   const { allowed, loading } = useCanAccessAction('tv.manage')
 *   {allowed && <AbasDeEscrita />}
 */
export function useCanAccessAction(
  action: string,
  workspaceId?: string | null,
): { allowed: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const target = workspaceId ?? workspace?.id ?? null
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (authLoading) return
    setLoading(true)
    setAllowed(false)
    membershipService
      .can(user, action, target)
      .then((result) => {
        if (cancelled) return
        setAllowed(result)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAllowed(false)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, action, target, authLoading])

  return { allowed, loading }
}
