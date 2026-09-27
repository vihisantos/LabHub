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
 * Membership ATIVA do usuário numa unidade específica (RBAC 2.0).
 * É o elo que liga `user → workspace → role_id`, usado tanto por `can()`
 * quanto pela resolução de cargo por unidade. `undefined` ⇒ nenhuma.
 */
export function activeMembershipIn(
  memberships: Pick<Membership, 'workspace_id' | 'status' | 'role_id'>[] | undefined,
  workspaceId: string | null | undefined,
): Pick<Membership, 'workspace_id' | 'status' | 'role_id'> | undefined {
  if (!memberships || !workspaceId) return undefined
  return memberships.find(
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
 * Contexto EXCLUSIVAMENTE administrativo: anexa as memberships a uma lista de
 * usuários (leitura via RLS do token admin — `getByUser`). Falha por usuário ⇒
 * `membershipsLoaded=false` (nunca `[]` silencioso). Usado pelas telas de
 * gestão (UsersPage/UserDetailPage) para decidir escopo/exibição por
 * memberships sem migrar as escritas (9.2-C).
 */
export async function attachMemberships(users: User[]): Promise<User[]> {
  return Promise.all(
    users.map(async (u) => {
      try {
        const rows = await membershipService.getByUser(u.id)
        return { ...u, memberships: rows, membershipsLoaded: true }
      } catch {
        return { ...u, membershipsLoaded: false }
      }
    }),
  )
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
    const info = await membershipService.resolveRoleInfo([roleId])
    return info.get(roleId)?.slug ?? null
  },

  /**
   * RBAC 2.0 (PR #284): slug + nome dos cargos de uma lista de `role_id`s em
   * UMA query (tabela `roles`). Para exibição administrativa por unidade
   * (Configuração de acesso). Falha ⇒ mapa vazio (o chamador usa fallback).
   */
  async resolveRoleInfo(roleIds: string[]): Promise<Map<string, { slug: string; name: string }>> {
    const out = new Map<string, { slug: string; name: string }>()
    const ids = [...new Set((roleIds ?? []).filter(Boolean))]
    if (ids.length === 0) return out
    requireDb()
    const { data, error } = await defaultDb!
      .from('roles')
      .select('id,slug,name')
      .in('id', ids)
    if (error || !Array.isArray(data)) return out
    for (const r of data as { id: string; slug: string; name: string }[]) {
      if (r?.id) out.set(r.id, { slug: r.slug, name: r.name })
    }
    return out
  },

  /**
   * RBAC 2.0 — AUTORIZAÇÃO POR ACTION (fonte de verdade do backend/RLS).
   *
   * Cadeia, espelhando `user_can_manage_tv` (077) e
   * `can_manage_workspace_apps` (076):
   *
   *   is_super_admin                    → true (bypass global)
   *   membership do usuário na unidade
   *     status = 'active'                → senão false
   *   role_permissions
   *     role_id  = membership.role_id
   *     action   = <action>
   *     scope    = 'workspace'           → senão false
   *
   * DECISÕES (por que é fail-closed em cada etapa):
   *  · `user` ausente/vazio → false. Nunca "adivinhe" o caller.
   *  · `workspaceId` ausente → false: Action com escopo `workspace` não tem
   *    contexto de unidade para resolver a membership. Coerente com
   *    `rbac_can` no Python (`if not workspace_id: return False`).
   *  · `membershipsLoaded !== true` → false. Antes do carregamento não há
   *    decisão; nunca cair em `workspace_ids` nem em `[]` silencioso.
   *  · memberships `pending/suspended/removed` → false.
   *  · membership em OUTRA unidade → false. O vínculo é sempre
   *    `m.workspace_id === workspaceId`; é isto que garante o isolamento
   *    multiunidade exigido pelo servidor.
   *  · erro de rede/RLS/query → false. `error` NUNCA vira `true`.
   *
   * Leitura feita com a SESSÃO DO USUÁRIO (`defaultDb`, token do Supabase
   * Auth) — nunca `service_role`. A exposição é decidida pela RLS
   * `role_permissions_select` (036), que já permite a roles globais
   * (`workspace_id IS NULL`), como `tec`/`opv`/`adm`.
   */
  async can(
    user: User | null | undefined,
    action: string,
    workspaceId: string | null | undefined,
  ): Promise<boolean> {
    // Super Admin: bypass global, independente de membership (como em
    // `tv_can_manage_workspace` e `rbac_can`).
    if (!user) return false
    if (user.is_super_admin === true) return true

    const wanted = String(action ?? '').trim()
    if (!wanted) return false
    if (!workspaceId) return false
    if (user.membershipsLoaded !== true) return false

    const membership = activeMembershipIn(user.memberships, workspaceId)
    if (!membership?.role_id) return false

    try {
      requireDb()
      const { data, error } = await defaultDb!
        .from('role_permissions')
        .select('id')
        .eq('role_id', membership.role_id)
        .eq('action', wanted)
        .eq('scope', 'workspace')
        .limit(1)
      if (error) return false
      return Array.isArray(data) && data.length > 0
    } catch {
      // Falha fechada: exceção jamais concede acesso.
      return false
    }
  },
}
