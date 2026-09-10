import { useAuth } from '../auth/AuthContext'
import type { Membership } from './types'

/**
 * RBAC 2.0 — Fase 9.2: expõe as memberships do usuário autenticado (estado já
 * publicado pelo ciclo de auth — `authService.fetchUserProfile` carrega perfil +
 * memberships em paralelo).
 *
 * Semântica explícita de loading (NUNCA caia em `workspace_ids`):
 *   - `membershipsLoaded === true`  ⇒ `memberships` é um array (pode ser `[]`);
 *   - `membershipsLoaded === false` ⇒ NENHUMA decisão de visibilidade/escopo.
 */
export function useMemberships(): {
  memberships: Membership[] | undefined
  membershipsLoaded: boolean
} {
  const { user } = useAuth()
  return {
    memberships: user?.memberships,
    membershipsLoaded: user?.membershipsLoaded === true,
  }
}