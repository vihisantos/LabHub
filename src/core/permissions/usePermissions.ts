import { useCallback, useEffect, useState } from 'react'
import type { Role, AppAccessLevel } from './types'
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

/** Nível de acesso do usuário atual por aplicativo (cargo + override individual) */
export function useAppAccess() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
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

  /**
   * RBAC 2.0 (#296 PR-4C): autorização por ACTION, resolvida no servidor.
   *
   * USA `memberships → role_permissions → Action` (a MESMA cadeia que o RLS
   * aplica em `user_can_manage_tv` / `can_manage_workspace_apps`), em vez de
   * `role` + `app_access` locais. Prefira este caminho sempre que a operação já
   * tiver Action correspondente — é a forma de a UI parar de divergir do
   * enforcement do banco.
   *
   * `workspaceId` é opcional: sem ele, usa a unidade ativa (coerente com o
   * escopo `workspace` das Actions). Sem unidade ativa, `membershipService.can`
   * devolve `false` (fail-closed).
   */
  const canAccessByAction = useCallback(
    async (action: string, workspaceId?: string | null): Promise<boolean> => {
      const target = workspaceId ?? workspace?.id ?? null
      try {
        return await membershipService.can(user, action, target)
      } catch {
        return false
      }
    },
    [user, workspace?.id],
  )

  return { role, canAccessApp, getLevel, isFullAccess, canAccessByAction }
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
