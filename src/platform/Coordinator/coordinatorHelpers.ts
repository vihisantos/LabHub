import type { Membership, MembershipStatus, TeamMember, TeamMemberProfile } from '../../core/permissions/membership'
import { permissionService } from '../../core/permissions/service'
import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../core/permissions/coordinatorService'

/**
 * Helpers puros da Área do Coordenador (RBAC 2.0, Fases 8.2 + 9 + 10).
 *
 * Nenhum deles decide autorização: apenas formatam exibição (iniciais/rótulos)
 * ou projetam o MESMO conjunto de candidatos que o Postgres aceita (o RPC 047
 * continua a autoridade — a UI restringe visualmente ao que o servidor valida).
 */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

/**
 * Rótulo do cargo da MEMBERSHIP (o que o coordenador gerencia), casando o
 * `role_id` (uuid) com a tabela `roles`. Sem correspondência (ex.: cargo fora do
 * conjunto atribuível), cai no cargo do perfil para exibição — nunca inventa.
 */
export function roleLabelFor(
  membership: Membership,
  profile: TeamMemberProfile | null,
  rolesById: Map<string, CoordinatorRoleOption>,
): string {
  const option = rolesById.get(membership.role_id)
  if (option) return option.name
  if (!profile) return '—'
  const role = permissionService.getRoleForUser(profile.roleId)
  return role?.name ?? profile.roleId
}

export interface ManagerOption {
  membershipId: string
  label: string
  note: string
}

/**
 * Fase 8.2: gestores que o RPC 047 aceita para um membro NESTA unidade — a
 * própria membership de coordenação OU uma liderança já subordinada direta a
 * ela. Espelha exatamente o check de escopo do servidor ("manager is outside
 * the coordinator scope"): a UI restringe visualmente ao mesmo conjunto e o
 * Postgres continua a autoridade (nada de regra nova no frontend).
 */
export function managerOptionsForMember(
  unit: CoordinatedUnit,
  member: TeamMember,
): ManagerOption[] {
  const current = member.membership.managed_by
  const options: ManagerOption[] = [
    {
      membershipId: unit.coordination.id,
      label: 'Coordenador(a) desta unidade',
      note: 'Equipe vinculada direto à coordenação',
    },
  ]
  for (const leader of unit.leaders) {
    if (leader.leadership.id === member.membership.id) continue
    if (leader.leadership.id === current) continue
    options.push({
      membershipId: leader.leadership.id,
      label: leader.profile?.name ?? 'Membro sem perfil',
      note: leader.profile?.email ?? 'Liderança da unidade',
    })
  }
  return options
}

/**
 * C4 (PR B #236) — SOMA dos indicadores de Pessoal da Central.
 *
 * Função pura equivalente à computação inline de `CoordinatorHome.tsx`
 * (líderes / membros / pendências / suspensos / removidos). Recebe SOMENTE os
 * dados que o chamador já autorizou e agrega sobre exatamente esses inputs —
 * sem descoberta de unidades, sem `profiles.workspace_ids`, sem membership,
 * Supabase, RPC, hooks ou cache. A autorização é da camada superior.
 *
 * Semântica preservada à risca (não simplificar):
 * - `leaderCount`  = soma de `u.leaders.length`;
 * - `memberCount`  = soma de `l.members.length` por liderança;
 * - `pendingCount` = soma dos tamanhos de todas as listas de requests
 *                    recebidas (conta a lista inteira, como o shell);
 * - `suspendedCount` = membros inativos com `membership.status === 'suspended'`;
 * - `removedCount`   = membros inativos com `membership.status === 'removed'`.
 * Categorias suspensos × removidos permanecem separadas. Zero é legítimo.
 */
export interface CoordinatorPeopleSummary {
  leaderCount: number
  memberCount: number
  pendingCount: number
  suspendedCount: number
  removedCount: number
}

export function summarizePeopleCounts(
  units: CoordinatedUnit[],
  requestsByUnit: Record<string, CoordinatorRequest[]>,
  inactiveByUnit: Record<string, CoordinatorInactiveMember[]>,
): CoordinatorPeopleSummary {
  const leaderCount = units.reduce((acc, u) => acc + u.leaders.length, 0)
  const memberCount = units.reduce(
    (acc, u) => acc + u.leaders.reduce((a, l) => a + l.members.length, 0),
    0,
  )
  const pendingCount = Object.values(requestsByUnit).reduce((acc, list) => acc + list.length, 0)
  const suspendedCount = Object.values(inactiveByUnit).reduce(
    (acc, list) => acc + list.filter((m) => m.membership.status === 'suspended').length,
    0,
  )
  const removedCount = Object.values(inactiveByUnit).reduce(
    (acc, list) => acc + list.filter((m) => m.membership.status === 'removed').length,
    0,
  )
  return { leaderCount, memberCount, pendingCount, suspendedCount, removedCount }
}

/**
 * PR 275 — DIRETÓRIO de pessoas da Central, READ-ONLY.
 *
 * A aba Pessoal vira uma visão de LEITURA do pessoal vinculado às unidades do
 * escopo. Os dados vêm EXCLUSIVAMENTE das leituras fail-closed já existentes
 * (o shell já as carrega por unidade):
 *   - `units[].leaders`            → liderança subordinada direta + cada membro
 *                                    da equipe (RPCs 047, escopo ativo);
 *   - `requestsByUnit[unit]`       → memberships PENDING (RPC 065/066);
 *   - `inactiveByUnit[unit]`       → memberships SUSPENDED/REMOVED (RPC 066).
 *
 * Nenhuma consulta nova ao banco: a autorização já foi decidida no servidor em
 * cada uma dessas leituras — o diretório apenas PROJETA o mesmo conjunto.
 * Administradores de workspace e pares de coordenação NÃO aparecem (linha
 * vermelha: o coordenador não alcança adm/coordinator) e nenhum status é
 * inventado — `membership.status` é a fonte de verdade.
 */

/** Linha do diretório: pessoa + a membership que a vincula à unidade do escopo. */
export interface PeopleRow {
  membership: Membership
  profile: TeamMemberProfile | null
  roleLabel: string
  unitId: string
  unitName: string
  status: MembershipStatus
}

/** Status exibível (fonte: `membership.status` — nunca inventado). */
export function peopleStatusLabel(status: MembershipStatus): string {
  switch (status) {
    case 'active':
      return 'Ativo'
    case 'pending':
      return 'Pendente'
    case 'suspended':
      return 'Suspenso'
    case 'removed':
      return 'Removido'
  }
}

/**
 * Projeta o diretório do escopo (ver doc acima). Ordena por nome (locale pt-BR)
 * e desduplica por `membership.id` (defesa: uma membership nunca fecha em duas
 * fontes, mas se vier, não vira duas linhas).
 */
export function composePeopleRows(
  units: CoordinatedUnit[],
  requestsByUnit: Record<string, CoordinatorRequest[]>,
  inactiveByUnit: Record<string, CoordinatorInactiveMember[]>,
  rolesById: Map<string, CoordinatorRoleOption>,
): PeopleRow[] {
  const rows: PeopleRow[] = []
  const seen = new Set<string>()
  const push = (row: PeopleRow) => {
    if (seen.has(row.membership.id)) return
    seen.add(row.membership.id)
    rows.push(row)
  }

  for (const unit of units) {
    for (const leader of unit.leaders) {
      push({
        membership: leader.leadership,
        profile: leader.profile,
        roleLabel: roleLabelFor(leader.leadership, leader.profile, rolesById),
        unitId: unit.unitId,
        unitName: unit.unitName,
        status: leader.leadership.status,
      })
      for (const member of leader.members) {
        push({
          membership: member.membership,
          profile: member.profile,
          roleLabel: roleLabelFor(member.membership, member.profile, rolesById),
          unitId: unit.unitId,
          unitName: unit.unitName,
          status: member.membership.status,
        })
      }
    }
    for (const pending of requestsByUnit[unit.unitId] ?? []) {
      push({
        membership: pending.membership,
        profile: pending.profile,
        roleLabel: roleLabelFor(pending.membership, pending.profile, rolesById),
        unitId: unit.unitId,
        unitName: unit.unitName,
        status: pending.membership.status,
      })
    }
    for (const inactive of inactiveByUnit[unit.unitId] ?? []) {
      push({
        membership: inactive.membership,
        profile: inactive.profile,
        roleLabel: roleLabelFor(inactive.membership, inactive.profile, rolesById),
        unitId: unit.unitId,
        unitName: unit.unitName,
        status: inactive.membership.status,
      })
    }
  }

  return rows.sort(
    (a, b) =>
      (a.profile?.name ?? '—').localeCompare(b.profile?.name ?? '—', 'pt-BR') ||
      (a.profile?.email ?? '').localeCompare(b.profile?.email ?? ''),
  )
}

export interface PeopleFilters {
  query: string
  status: MembershipStatus | 'all'
}

/**
 * Filtro da UI (busca por nome/e-mail + status). Filtra SOMENTE o conjunto já
 * escopado pelo servidor; nunca decide autorização. A busca é server-less de
 * propósito: o volume vem das RPCs por unidade (pequeno) e a lista já está em
 * memória — paginar no cliente não é necessário aqui.
 */
export function filterPeopleRows(
  rows: PeopleRow[],
  { query, status }: PeopleFilters,
): PeopleRow[] {
  const q = query.trim().toLocaleLowerCase('pt-BR')
  return rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false
    if (q === '') return true
    const name = row.profile?.name ?? ''
    const email = row.profile?.email ?? ''
    return (
      name.toLocaleLowerCase('pt-BR').includes(q) ||
      email.toLocaleLowerCase('pt-BR').includes(q)
    )
  })
}