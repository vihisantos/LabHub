import { useEffect, useState } from 'react'
import type { Role } from './types'
import { permissionService } from './service'
import { useAuth } from '../auth/useAuth'
import {
  isLeadershipRole,
  leadershipAreaOf,
  leadershipLevelOf,
  type LeadershipArea,
} from './leadership'

/**
 * RBAC 2.0 (Fase 4/5): expõe a classificação de liderança do cargo de quem
 * está logado. Liderança NUNCA deriva de appAccess — só do cargo.
 * O admin absoluto (is_super_admin) administra o app "admin"; não é
 * automaticamente líder/coordenador de unidades (áreas são do cargo).
 */
export function useLeadership() {
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

  const isLeadership = isLeadershipRole(role)
  const level = leadershipLevelOf(role)
  const area: LeadershipArea | null = leadershipAreaOf(role)

  return { user, role, isLeadership, level, area }
}