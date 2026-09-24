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

/** Rótulo fixo da coordenação como líder (RPC 047) — mesmo texto do `managerOptionsForMember`. */
export const COORDINATOR_LEADER_LABEL = 'Coordenador(a) desta unidade'

/** Linha do diretório: pessoa + a membership que a vincula à unidade do escopo. */
export interface PeopleRow {
  membership: Membership
  profile: TeamMemberProfile | null
  roleLabel: string
  unitId: string
  unitName: string
  status: MembershipStatus
  /** Liderança responsável pela membership (`managed_by` resolvido). */
  leader: PeopleLeader | null
}

/** Liderança responsável exibível — `managed_by` da membership resolvido. */
export interface PeopleLeader {
  /** membership que EXERCE a liderança (o `managed_by` da linha). */
  membershipId: string
  /** Nome exibível; `COORDINATOR_LEADER_LABEL` quando a coordenação. */
  name: string
  /** E-mail (liderança real) ou null (coordenação não carrega perfil aqui). */
  email: string | null
  /** true quando a liderança é a membership de coordenação da própria unidade. */
  isCoordination: boolean
}

/**
 * Índice de lideranças do escopo da unidade (coordenação + lideranças diretas)
 * usado para RESOLVER `membership.managed_by` em cada linha do diretório —
 * mesmo conjunto de candidatos que o RPC 047 aceita; nada inventado.
 */
type LeaderIndex = Map<string, PeopleLeader>

function managerIndexForUnit(unit: CoordinatedUnit): LeaderIndex {
  const index: LeaderIndex = new Map()
  index.set(unit.coordination.id, {
    membershipId: unit.coordination.id,
    name: COORDINATOR_LEADER_LABEL,
    email: null,
    isCoordination: true,
  })
  for (const leader of unit.leaders) {
    index.set(leader.leadership.id, {
      membershipId: leader.leadership.id,
      name: leader.profile?.name ?? 'Perfil não disponível',
      email: leader.profile?.email ?? null,
      isCoordination: false,
    })
  }
  return index
}

/** Resolve o líder de uma linha; `managed_by` NULL → `null` (sem líder). */
function leaderForRow(membership: Membership, index: LeaderIndex): PeopleLeader | null {
  if (membership.managed_by === null) return null
  return index.get(membership.managed_by) ?? null
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
    const leaderIndex = managerIndexForUnit(unit)
    for (const leader of unit.leaders) {
      push({
        membership: leader.leadership,
        profile: leader.profile,
        roleLabel: roleLabelFor(leader.leadership, leader.profile, rolesById),
        unitId: unit.unitId,
        unitName: unit.unitName,
        status: leader.leadership.status,
        leader: leaderForRow(leader.leadership, leaderIndex),
      })
      for (const member of leader.members) {
        push({
          membership: member.membership,
          profile: member.profile,
          roleLabel: roleLabelFor(member.membership, member.profile, rolesById),
          unitId: unit.unitId,
          unitName: unit.unitName,
          status: member.membership.status,
          leader: leaderForRow(member.membership, leaderIndex),
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
        leader: leaderForRow(pending.membership, leaderIndex),
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
        leader: leaderForRow(inactive.membership, leaderIndex),
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

// ---------------------------------------------------------------------------
// PR 277 — ESTRUTURA ORGANIZACIONAL do escopo (projeção pura, READ-ONLY).
// ---------------------------------------------------------------------------
//
// Mesmo princípio defendido na PR 276: os dados vêm EXCLUSIVAMENTE das leituras
// fail-closed que o shell já carrega (`units`, `requestsByUnit`,
// `inactiveByUnit`, `rolesById`). Nenhuma consulta nova, nenhuma migration,
// nenhum RPC, nada no Supabase. A autorização continua decidida no servidor; a
// UI apenas PROJETA a hierarquia sobre o conjunto já escopado.
//
// O agrupador abaixo converte a lista plana em:
//
//   ➜ UNIDADE
//   ➜  ├─ Coordenação            (COORDINATOR_LEADER_LABEL)
//   ➜  │    └─ pessoas (managed_by = coordenação)
//   ➜  ├─ Líder — Nome           (cada `unit.leaders[]`)
//   ➜  │    ├─ pessoas (managed_by = líder)
//   ➜  │    └─ (ou "Nenhuma pessoa vinculada" quando vazia)
//   ➜  └─ ...demais líderes, em ordem alfabética (pt-BR)
//
// Além do topo, uma seção FIXA "Sem responsável" agrega TODAS as memberships
// com `managed_by = NULL` (independentemente de status/status), com a
// coordenação tratada como NÍVEL SUPERIOR — nunca como uma linha comum.

export type PeopleResponsibleFilter = 'all' | 'coordination' | 'leaders' | 'unassigned'

/** Nó da hierarquia organizacional exibível pelo Coordenador. */
export interface PeopleGroup {
  /** Identificador estável do nó (chave única da UI). */
  id: string
  kind: 'coordination' | 'leader' | 'unassigned'
  /** Unidade de origem (vazia no grupo global "Sem responsável"). */
  unitId: string
  unitName: string
  /** Membership que EXERCE a liderança; no grupo "Sem responsável" = '' (não aplicável). */
  membershipId: string
  /** Rótulo do nó: `COORDINATOR_LEADER_LABEL` p/ coordenação, nome do líder, ou "Sem responsável". */
  label: string
  /** E-mail da liderança real (null p/ coordenação / grupo unassigned). */
  email: string | null
  /** true quando a coordenação da unidade é o responsável. */
  isCoordination: boolean
  /** Pessoas vinculadas ao nó (já escopadas + ordenadas). */
  people: PeopleRow[]
}

/** Estado de um nó de liderança vazio — a estrutura permanece (nenhuma invenção). */
export const GROUP_EMPTY_LEADER_LABEL = 'Nenhuma pessoa vinculada'
/** Rótulo do grupo fixo do topo. */
export const GROUP_UNASSIGNED_LABEL = 'Sem responsável'

const groupId = (kind: PeopleGroup['kind'], unitId: string, membershipId: string): string =>
  `${kind}:${unitId}:${membershipId}`

/**
 * Projeta a ESTRUTURA ORGANIZACIONAL do escopo: por unidade, um nó de
 * coordenação (sempre no topo da unidade) + um nó por liderança direta
 * (`unit.leaders[]`, mesmo conjunto do RPC 047 — ordem alfabética pt-BR), e um
 * nó FIXO "Sem responsável" agrupando todas as memberships com
 * `managed_by = NULL` (qualquer status).
 *
 * Cada membership é roteada pelo MESMO resolvedor da lista plana
 * (`leaderForRow` + `managerIndexForUnit`): coordenação → nó da coordenação;
 * líder → nó do líder; NULL → nó "Sem responsável". Lideranças SEM membros
 * continuam presentes (a estrutura é a organização, não o vínculo atual) e a
 * coordenação NUNCA vira linha de pessoa comum — é o nível superior.
 */
export function composePeopleGroups(
  units: CoordinatedUnit[],
  requestsByUnit: Record<string, CoordinatorRequest[]>,
  inactiveByUnit: Record<string, CoordinatorInactiveMember[]>,
  rolesById: Map<string, CoordinatorRoleOption>,
): PeopleGroup[] {
  const groups: PeopleGroup[] = []
  const unassigned: PeopleRow[] = []

  // Nós por unidade, na ordem do escopo (coordenação sempre primeiro; líderes
  // diretos em ordem alfabética pt-BR — mesmo conjunto do RPC 047).
  for (const unit of units) {
    groups.push({
      id: groupId('coordination', unit.unitId, unit.coordination.id),
      kind: 'coordination',
      unitId: unit.unitId,
      unitName: unit.unitName,
      membershipId: unit.coordination.id,
      label: COORDINATOR_LEADER_LABEL,
      email: null,
      isCoordination: true,
      people: [],
    })
    const leaders = [...unit.leaders].sort((a, b) =>
      (a.profile?.name ?? '—').localeCompare(b.profile?.name ?? '—', 'pt-BR'),
    )
    for (const leader of leaders) {
      groups.push({
        id: groupId('leader', unit.unitId, leader.leadership.id),
        kind: 'leader',
        unitId: unit.unitId,
        unitName: unit.unitName,
        membershipId: leader.leadership.id,
        label: leader.profile?.name ?? 'Perfil não disponível',
        email: leader.profile?.email ?? null,
        isCoordination: false,
        people: [],
      })
    }
  }

  // Roteia TODAS as linhas planas (MESMA projeção da lista, MESMO resolvedor):
  // `managed_by` da coordenação → nó da coordenação; de um líder → nó do líder;
  // NULL → seção fixa "Sem responsável". Nenhuma fila nova, nada inventado.
  const flat = composePeopleRows(units, requestsByUnit, inactiveByUnit, rolesById)
  for (const row of flat) {
    if (row.leader === null) {
      unassigned.push(row)
      continue
    }
    const target = groups.find((g) =>
      row.leader?.isCoordination
        ? g.kind === 'coordination' && g.unitId === row.unitId
        : g.kind === 'leader' &&
          g.unitId === row.unitId &&
          g.membershipId === row.leader?.membershipId,
    )
    if (target) target.people.push(row)
  }

  // Ordena as pessoas de cada nó por nome (pt-BR), estável.
  const sortByPersonName = (rows: PeopleRow[]): PeopleRow[] =>
    rows.sort(
      (a, b) =>
        (a.profile?.name ?? '—').localeCompare(b.profile?.name ?? '—', 'pt-BR') ||
        (a.profile?.email ?? '').localeCompare(b.profile?.email ?? ''),
    )
  for (const group of groups) sortByPersonName(group.people)

  // Nó fixo do topo: TODAS as memberships sem responsável (qualquer status).
  const unassignedGroup: PeopleGroup = {
    id: groupId('unassigned', '', ''),
    kind: 'unassigned',
    unitId: '',
    unitName: '',
    membershipId: '',
    label: GROUP_UNASSIGNED_LABEL,
    email: null,
    isCoordination: false,
    people: sortByPersonName(unassigned),
  }

  // Seção fixa no topo (oculta quando vazia); unidades em seguida.
  return unassignedGroup.people.length === 0
    ? groups
    : [unassignedGroup, ...groups]
}

export interface GroupFilters extends PeopleFilters {
  responsible: PeopleResponsibleFilter
}

/**
 * Filtro da estrutura por responsável (client-side, sobre dados JÁ escopados).
 * Aplica o MESMO filtro de busca/status da lista e, além disso, seleciona o
 * nível do responsável: coordenação / líderes / sem responsável.
 *
 * Regras de permanência (aprovadas pelo design):
 *  - coordenação e lideranças SEM filtro de busca/status ativo ficam sempre
 *    presentes — lideranças vazias exibem "Nenhuma pessoa vinculada" para que
 *    todo líder permanente do escopo continue encontrável;
 *  - com busca/status ativos, nós vazios colapsam (a busca comunica "nada
 *    casa" em vez de pintar a estrutura inteira de vazia);
 *  - o nó "Sem responsável" só existe enquanto tiver pessoas que casem.
 * NUNCA decide autorização.
 */
export function filterPeopleGroups(
  groups: PeopleGroup[],
  { query, status, responsible }: GroupFilters,
): PeopleGroup[] {
  const byResponsible = (group: PeopleGroup): boolean =>
    responsible === 'all' ||
    (responsible === 'coordination' && group.kind === 'coordination') ||
    (responsible === 'leaders' && group.kind === 'leader') ||
    (responsible === 'unassigned' && group.kind === 'unassigned')

  const activeSearch = query.trim() !== '' || status !== 'all'

  return groups.flatMap((group) => {
    if (!byResponsible(group)) return []
    const people = filterPeopleRows(group.people, { query, status })
    if (group.kind !== 'unassigned') {
      if (activeSearch && people.length === 0) return []
      return [{ ...group, people }]
    }
    if (people.length === 0) return []
    return [{ ...group, people }]
  })
}
