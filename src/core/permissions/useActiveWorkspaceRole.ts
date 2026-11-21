import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { membershipService } from '../memberships/service'
import type { User } from '../auth/types'

interface ActiveWorkspaceRoleState {
  roleSlug: string | null
  isTechnician: boolean
  loading: boolean
}

/**
 * Retorna apenas a membership do próprio usuário, ativa e no workspace
 * selecionado. Não usa profiles.roleId nem workspace_ids legados.
 */
export function activeMembershipForWorkspace(
  user: User | null,
  workspaceId: string | null | undefined,
) {
  if (
    !user ||
    user.status !== 'active' ||
    user.is_super_admin ||
    user.membershipsLoaded !== true ||
    !workspaceId
  ) return null

  return user.memberships?.find(
    (item) =>
      item.profile_id === user.id &&
      item.workspace_id === workspaceId &&
      item.status === 'active',
  ) ?? null
}

// Mais de um componente pode consultar o mesmo cargo (banner global + prompt
// legado). Compartilhar a Promise evita consultas duplicadas à tabela roles.
const roleSlugPromises = new Map<string, Promise<string | null>>()

function resolveRoleSlugCached(roleId: string): Promise<string | null> {
  const cached = roleSlugPromises.get(roleId)
  if (cached) return cached
  const pending = membershipService.resolveRoleSlug(roleId).then((slug) => {
    if (!slug) roleSlugPromises.delete(roleId)
    return slug
  }).catch(() => {
    roleSlugPromises.delete(roleId)
    return null
  })
  roleSlugPromises.set(roleId, pending)
  return pending
}

/**
 * Resolve o cargo exclusivamente pela membership ativa do usuário no workspace
 * selecionado. Falha de carregamento ou ausência de membership é fail-closed.
 */
export function useActiveWorkspaceRole(): ActiveWorkspaceRoleState {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const [roleSlug, setRoleSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const finish = (slug: string | null) => {
      if (cancelled) return
      setRoleSlug(slug)
      setLoading(false)
    }

    const membership = activeMembershipForWorkspace(user, workspace?.id)

    if (!membership?.role_id) {
      setRoleSlug(null)
      setLoading(false)
      return () => { cancelled = true }
    }

    setLoading(true)
    setRoleSlug(null)
    resolveRoleSlugCached(membership.role_id).then(finish)

    return () => { cancelled = true }
  }, [user, workspace?.id])

  return {
    roleSlug,
    isTechnician: roleSlug === 'tec',
    loading,
  }
}
