import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { membershipService } from '../memberships/service'
import { leadershipFromSlug, type LeadershipArea } from './leadership'

/**
 * RBAC 2.0 (#296 PR-4C): a liderança passa a vir da MEMBERSHIP ATIVA da
 * unidade selecionada:
 *
 *   memberships (profile_id, workspace_id, status='active')
 *     → role_id
 *     → public.roles.slug   (`lider` | `coordinator`)
 *
 * ANTES (legado, removido aqui):
 *   profiles.role → roleId → coleção local `roles` (localStorage) → Role
 *
 * A coleção local e `profiles.role` NÃO participam mais desta decisão. O cargo
 * sozinho nunca concede acesso: quem decide a área `coordination` continua
 * sendo o servidor (`useCoordinator` → `get_coordinator_units`, RPCs 047) e a
 * área `team` é sempre escopada à unidade ativa (uma membership de liderança
 * em A não abre liderança em B).
 *
 * API PÚBLICA PRESERVADA (`{ user, role, isLeadership, level, area }`) — os
 * consumidores (`TicketDetail`, `LeadershipAreaGuard`, `LiderHome`) não mudam.
 * `slug` foi acrescentado; `role` é um objeto mínimo derivado do slug real do
 * banco, com o shape que `leadership.ts` já consome.
 *
 * FAIL-CLOSED enquanto carrega: `isLeadership=false` e `role=undefined` até a
 * membership estar resolvida. Nunca assume liderança por otimismo.
 */
export function useLeadership() {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? null

  // Identidade à qual o cargo resolvido PERTENCE. Trocar de usuário ou de
  // unidade invalida o slug anterior na mesma renderização (fail-closed), em vez
  // de exibir o cargo da unidade anterior enquanto a nova consulta corre — era o
  // que quebrava o requisito "liderança em A não abre em B".
  const resolveKey = `${user?.id ?? ''}|${workspaceId ?? ''}`
  const [settled, setSettled] = useState<{ key: string; slug: string | null } | null>(null)

  const resolve = useCallback(async () => {
    const key = `${user?.id ?? ''}|${workspaceId ?? ''}`
    // Sem usuário ou sem unidade ⇒ não há o que esperar: sem cargo, resolvido.
    if (!user || !workspaceId) {
      setSettled({ key, slug: null })
      return
    }
    // `membershipsLoaded !== true` NÃO é "sem cargo": é "ainda não se sabe".
    // Fica pendente (loading) para o guard exibir o loader em vez de
    // "acesso restrito". Nunca decide antes de carregar.
    if (user.membershipsLoaded !== true) return
    const active = user.memberships?.find(
      (m) => m.workspace_id === workspaceId && m.status === 'active',
    )
    if (!active?.role_id) {
      setSettled({ key, slug: null })
      return
    }
    try {
      const found = await membershipService.resolveRoleSlug(active.role_id)
      setSettled({ key, slug: found })
    } catch {
      // Falha fechada: sem cargo conhecido, sem liderança.
      setSettled({ key, slug: null })
    }
  }, [user, workspaceId])

  useEffect(() => {
    // Enquanto a sessão carrega, nada é decidido.
    if (authLoading) return
    void resolve()
  }, [authLoading, resolve])

  // Enquanto o slug guardado não for da identidade corrente, o cargo é
  // descartado e a UI fica em loading (nunca mostra a liderança de outra
  // unidade, nem por um tick).
  const pending = settled?.key !== resolveKey
  const slug = pending ? null : settled!.slug

  const leadership = leadershipFromSlug(slug)
  const isLeadership = leadership !== null
  const level = leadership?.leadershipLevel ?? 0
  const area: LeadershipArea | null = leadership?.area ?? null

  // Shape mínimo compatível com `Role` para consumidores que só leem
  // `name`/`isLeadership`/`leadershipLevel` (ex.: LiderHome). O slug é a
  // única fonte; nada vem da coleção local.
  const role = leadership
    ? ({
        id: `slug:${slug}`,
        key: slug,
        name: leadership.area === 'coordination' ? 'Coordenador multiunidades' : 'Líder de unidade',
        isLeadership: true,
        leadershipLevel: leadership.leadershipLevel,
      } as unknown as import('./types').Role)
    : undefined

  return { user, role, slug, isLeadership, level, area, loading: authLoading || pending }
}
