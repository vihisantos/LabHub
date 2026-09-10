import { defaultDb } from '../../lib/supabase'
import type { Membership } from './types'
import { isActive } from './types'
import type { User } from '../auth/types'
import type { Workspace } from '../workspaces/types'

const ACTIVE = 'active'

function requireDb() {
  if (!defaultDb) throw new Error('Supabase não configurado. Verifique as variáveis de ambiente.')
}

/** Campos que participam da comparação de pertencimento ativo. */
type ActiveMembershipRow = Pick<Membership, 'workspace_id' | 'role_id' | 'status'>

/**
 * Workspaces com membership ATIVA — autorização efetiva do usuário.
 * `undefined` (não carregado) ⇒ `[]`: nunca decide visibilidade.
 */
export function getActiveMembershipWorkspaceIds(
  memberships: Pick<Membership, 'workspace_id' | 'status'>[] | undefined,
): string[] {
  if (!memberships) return []
  return [
    ...new Set(
      memberships.filter((m) => m.status === ACTIVE).map((m) => m.workspace_id),
    ),
  ]
}

/**
 * Pertencimento ATIVO a um workspace. `undefined` ⇒ false (fail-closed).
 * `profiles.workspace_ids` nunca participa (compat de dados).
 */
export function isActiveMember(
  memberships: Pick<Membership, 'workspace_id' | 'status'>[] | undefined,
  workspaceId: string,
): boolean {
  if (!memberships) return false
  return memberships.some(
    (m) => m.workspace_id === workspaceId && m.status === ACTIVE,
  )
}

/**
 * Seleção de workspaces atribuídos — FONTE ÚNICA de visibilidade (design 9.2,
 * §3.2). Pertencimento = membership ATIVA; `membershipsLoaded !== true` ⇒ nada
 * visível. `profiles.workspace_ids` nunca participa (compat, nunca autorização).
 */
export function selectAssignedWorkspaces(all: Workspace[], user: User | null): Workspace[] {
  return all.filter((w) => {
    if (!user) return true
    if (user.status === 'pending') return false
    if (user.is_super_admin) return true
    if (user.membershipsLoaded !== true) return false
    return isActiveMember(user.memberships, w.id)
  })
}

/** Ids ativos para alimentar filtros/stores (mesma fonte de §3.2). */
export function assignedWorkspaceIds(user: User | null | undefined): string[] {
  if (!user || user.membershipsLoaded !== true) return []
  return getActiveMembershipWorkspaceIds(user.memberships)
}

/**
 * Compara o multiset de memberships ATIVAS de dois usuários (design 9.2, seção 3.3).
 * Antes do carregamento (nada carregado nos dois lados) quaisquer valores são
 * equivalentes — nenhum evento é emitido até as memberships carregarem.
 * `workspace_ids` nunca participa desta comparação (coluna é compat de dados).
 */
export function areMembershipsEqual(
  a: ActiveMembershipRow[],
  b: ActiveMembershipRow[],
): boolean {
  const signature = (rows: ActiveMembershipRow[]) =>
    rows
      .filter((m) => m.status === ACTIVE)
      .map((m) => `${m.workspace_id}|${m.role_id}|${m.status}`)
      .sort()
      .join(';')
  return signature(a) === signature(b)
}

export const membershipService = {
  /**
   * Memberships do usuário logado via client (policy `memberships_select` = super
   * admin OU membro do workspace). A RLS decide o que é exposto: um membro comum
   * recebe apenas as linhas dos workspaces a que pertence, nunca memberships alheias.
   * Falha de query === erro propagado (o chamador trata como `membershipsLoaded=false`,
   * nunca como `[]`).
   */
  async getMine(): Promise<Membership[]> {
    requireDb()
    const { data, error } = await defaultDb!.from('memberships').select('*')
    if (error) throw error
    return (data ?? []) as Membership[]
  },

  /** Workspaces em que o usuário logado tem membership ATIVA (autorização efetiva). */
  async getActiveWorkspaceIds(): Promise<string[]> {
    const rows = await membershipService.getMine()
    return rows.filter(isActive).map((m) => m.workspace_id)
  },

  /**
   * Contexto EXCLUSIVAMENTE administrativo. A segurança nunca vem da confiança no
   * `userId`: é a RLS `memberships_select` do token que executa a query (userId é só
   * filtro). Token não-admin consultando por outrem recebe `[]` (coberto por teste
   * de IDOR).
   */
  async getByUser(userId: string): Promise<Membership[]> {
    requireDb()
    const { data, error } = await defaultDb!
      .from('memberships')
      .select('*')
      .eq('profile_id', userId)
    if (error) throw error
    return (data ?? []) as Membership[]
  },

  /**
   * Slug estável do cargo a partir do `role_id` da membership (tabela `roles`, policy
   * `roles_select` = super admin OU blueprint global OU membro do workspace).
   * Usado APENAS para autorização de ações e badges de cargo — **nunca** para
   * visibilidade/seleção de workspace (pertencimento é decidido só por `isActive`).
   * Falha degrada ação/badge (retorna null), jamais bloqueia o workspace.
   */
  async resolveRoleSlug(roleId: string): Promise<string | null> {
    requireDb()
    const { data, error } = await defaultDb!
      .from('roles')
      .select('slug')
      .eq('id', roleId)
      .maybeSingle()
    if (error) return null
    return data?.slug ?? null
  },
}