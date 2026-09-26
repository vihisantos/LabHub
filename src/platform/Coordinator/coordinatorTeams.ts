import type { Ticket } from '../../apps/chamados/types'
import { getPriority, getSlaState, isTicketOpen } from '../../apps/chamados/services/sla'
import { ticketService } from '../../apps/chamados/services/ticketService'
import type {
  CoordinatedLeader,
  CoordinatedUnit,
  CoordinatorRoleOption,
} from '../../core/permissions/coordinatorService'
import type { TeamMember } from '../../core/permissions/membership'
import { roleLabelFor } from './coordinatorHelpers'
import type { ScopeSlaConfigs } from './coordinatorTickets'

/**
 * Helpers puros da aba EQUIPES da Central do Coordenador (V1).
 *
 * Mesmo princípio de todos os helpers do Coordenador (PR 276/277/278): nenhum
 * deles decide autorização — recebem SOMENTE o conjunto que a camada superior
 * já escopou (`units` do `useCoordinator` + `scopeTickets` derivado do cache
 * bruto autorizado no `CoordinatorHome`) e PROJETAM a visão organizacional +
 * operacional das equipes. Nenhuma consulta nova, nenhuma RPC nova, nenhuma
 * migration.
 *
 * A equipe NÃO é uma entidade: é a relação `memberships.managed_by` já resolvida
 * pelo servidor (RPCs 047 — coordenador → lideranças diretas → membros de cada
 * liderança). Este módulo apenas re-agrupa esse conjunto pré-escopado em
 * unidades → equipes (liderança + membros) e calcula métricas operacionais
 * reutilizando EXCLUSIVAMENTE as fontes únicas do app de Chamados
 * (`sla.isTicketOpen`/`getSlaState`/`getPriority` e `ticketService.isArchived`).
 *
 * Regra de segurança reforçada aqui (fail-closed): tickets só participam quando
 * `workspace_id` pertence às unidades recebidas — um ticket fora do escopo nunca
 * vira métrica, mesmo que o prop venha contaminado.
 */

/** Métricas operacionais de UMA pessoa (membros e líderes usam o mesmo cálculo). */
export interface TeamMemberMetrics {
  /** Chamados abertos (não arquivados e no fluxo aberto) atribuídos a esta pessoa. */
  open: number
  /** Abertos com status `a_caminho` ou `em_atendimento`. */
  inProgress: number
  /** Abertos com prioridade `alta` ou `urgente` (via `getPriority`). */
  highPriority: number
  /** Abertos com SLA em `near` ou `overdue` (via `getSlaState` — fonte única). */
  slaRisk: number
}

/** Pessoa exibível da aba Equipes = membership + perfil + papel + métricas. */
export interface TeamMemberRow {
  member: TeamMember
  roleLabel: string
  metrics: TeamMemberMetrics
}

/** Métricas agregadas de uma EQUIPE (soma de líder + membros). */
export interface TeamMetrics {
  /** Chamados abertos da equipe inteira (líder + membros). */
  open: number
  inProgress: number
  highPriority: number
  slaRisk: number
}

/** Equipe projetada: uma liderança direta + seus membros ativos. */
export interface TeamGroup {
  /** Chave estável da UI (unidade + membership da liderança). */
  id: string
  unitId: string
  unitName: string
  /** Liderança que EXERCE a equipe (membership com cargo de liderança). */
  leader: TeamMemberRow
  /** Membros ativos geridos diretamente pela liderança (ordem alfabética pt-BR). */
  members: TeamMemberRow[]
  /** Quantos membros (não inclui o líder). */
  memberCount: number
  /** Métricas da equipe inteira. */
  metrics: TeamMetrics
}

/** Pessoa cuja relação de liderança NÃO pôde ser resolvida (ou NULL). */
export interface UnassignedTeamMemberRow extends TeamMemberRow {
  unitId: string
  unitName: string
}

/** Projeção completa da aba Equipes (read-only, zero consultas). */
export interface TeamsProjection {
  teams: TeamGroup[]
  /** Membros sem responsável resolvível (seção "Sem responsável"). */
  unassigned: UnassignedTeamMemberRow[]
  /** Totais da faixa superior da aba. */
  summary: {
    /** Número de equipes projetadas. */
    teamCount: number
    /** Pessoas na estrutura (líderes + membros). */
    personCount: number
    /** Chamados abertos total do escopo projetado. */
    openCount: number
  }
}

function emptyMemberMetrics(): TeamMemberMetrics {
  return { open: 0, inProgress: 0, highPriority: 0, slaRisk: 0 }
}

function sumMetrics(a: TeamMemberMetrics, b: TeamMemberMetrics): TeamMemberMetrics {
  return {
    open: a.open + b.open,
    inProgress: a.inProgress + b.inProgress,
    highPriority: a.highPriority + b.highPriority,
    slaRisk: a.slaRisk + b.slaRisk,
  }
}

function memberName(member: TeamMember): string {
  return member.profile?.name ?? 'Perfil não disponível'
}

function sortByPersonName<T extends TeamMemberRow>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    (memberName(a.member) ?? '').localeCompare(memberName(b.member) ?? '', 'pt-BR') ||
    (a.member.profile?.email ?? '').localeCompare(b.member.profile?.email ?? ''),
  )
}

function composeRow(member: TeamMember, rolesById: Map<string, CoordinatorRoleOption>): TeamMemberRow {
  return {
    member,
    roleLabel: roleLabelFor(member.membership, member.profile, rolesById),
    metrics: emptyMemberMetrics(),
  }
}

/**
 * Projeta as equipes do escopo conforme o modelo organizacional reutilizado do
 * Pessoal (RPC 047): coordenação → lideranças diretas → membros de cada
 * liderança. Cada membro ativo é roteado pela MESMA regra de resolução de
 * `managed_by` usada no diretório:
 *  - `managed_by` = id de uma liderança DO escopo da própria unidade → equipe
 *    daquela liderança;
 *  - `managed_by` = NULL ou apontando para algo FORA do escopo → seção
 *    "Sem responsável" (honesto: não inferimos líder, não movemos o membro).
 *
 * Métricas: cada `assignedToUserId === membership.profile_id` casa com o membro
 * (líderes também participam — o líder que atende conta nos chamados da equipe).
 * Deduplication por `membership.id`: uma membership nunca fecha em duas equipes.
 * Ordena líderes e membros por nome (locale pt-BR) e nunca muta as entradas.
 */
export function composeTeams(
  units: CoordinatedUnit[],
  scopeTickets: Ticket[],
  slaConfigs: ScopeSlaConfigs,
  rolesById: Map<string, CoordinatorRoleOption>,
): TeamsProjection {
  const scopeUnitIds = new Set(units.map((u) => u.unitId))
  const inScopeTickets = scopeTickets.filter(
    (t) => t.workspace_id != null && scopeUnitIds.has(t.workspace_id),
  )
  const ticketsByUnit = new Map<string, Ticket[]>()
  for (const unit of units) {
    ticketsByUnit.set(unit.unitId, inScopeTickets.filter((t) => t.workspace_id === unit.unitId))
  }

  const teams: TeamGroup[] = []
  const unassigned: UnassignedTeamMemberRow[] = []
  const seen = new Set<string>()

  for (const unit of units) {
    // Índice de lideranças do escopo desta unidade (mesmo conjunto do RPC 047).
    const leaderIndex = new Map<string, CoordinatedLeader>()
    for (const leader of unit.leaders) leaderIndex.set(leader.leadership.id, leader)

    const unitTickets = ticketsByUnit.get(unit.unitId) ?? []
    const slaConfig = slaConfigs[unit.unitId]

    const leaderRows = unit.leaders.map((leader) => () => {
      const row: TeamMemberRow = {
        ...composeRow({ membership: leader.leadership, profile: leader.profile }, rolesById),
      }
      for (const ticket of unitTickets) {
        if (ticket.assignedToUserId !== leader.leadership.profile_id) continue
        row.metrics = applyTicketToMetrics(row.metrics, ticket, slaConfig)
      }
      return row
    })

    const unitTeams: TeamGroup[] = []
    for (let i = 0; i < unit.leaders.length; i++) {
      const leader = unit.leaders[i]
      if (seen.has(leader.leadership.id)) continue
      seen.add(leader.leadership.id)

      const row = leaderRows[i]()
      const members: TeamMemberRow[] = []
      for (const member of leader.members) {
        if (seen.has(member.membership.id)) continue
        seen.add(member.membership.id)

        const targetLeader = leaderIndex.get(member.membership.managed_by ?? '')
        if (!targetLeader) {
          // managed_by NULL ou fora do escopo → "Sem responsável" (não inferir).
          const unassignedRow: UnassignedTeamMemberRow = {
            ...composeRow(member, rolesById),
            unitId: unit.unitId,
            unitName: unit.unitName,
          }
          for (const ticket of unitTickets) {
            if (ticket.assignedToUserId !== member.membership.profile_id) continue
            unassignedRow.metrics = applyTicketToMetrics(unassignedRow.metrics, ticket, slaConfig)
          }
          unassigned.push(unassignedRow)
          continue
        }

        const memberRow: TeamMemberRow = { ...composeRow(member, rolesById) }
        for (const ticket of unitTickets) {
          if (ticket.assignedToUserId !== member.membership.profile_id) continue
          memberRow.metrics = applyTicketToMetrics(memberRow.metrics, ticket, slaConfig)
        }
        members.push(memberRow)
      }

      unitTeams.push({
        id: `team:${unit.unitId}:${leader.leadership.id}`,
        unitId: unit.unitId,
        unitName: unit.unitName,
        leader: row,
        members: sortByPersonName(members),
        memberCount: members.length,
        metrics: sumMetrics(row.metrics, members.reduce(
          (acc, m) => sumMetrics(acc, m.metrics),
          emptyMemberMetrics(),
        )),
      })
    }

    teams.push(...unitTeams)
  }

  const sortedTeams = teams.sort((a, b) =>
    (a.leader.member.profile?.name ?? '—').localeCompare(
      b.leader.member.profile?.name ?? '—',
      'pt-BR',
    ),
  )

  const sortedUnassigned = sortByPersonName(unassigned)
  const personCount =
    sortedTeams.reduce((acc, t) => acc + 1 + t.members.length, 0) + sortedUnassigned.length
  const openCount =
    sortedTeams.reduce((acc, t) => acc + t.metrics.open, 0) +
    sortedUnassigned.reduce((acc, u) => acc + u.metrics.open, 0)

  return {
    teams: sortedTeams,
    unassigned: sortedUnassigned,
    summary: {
      teamCount: sortedTeams.length,
      personCount,
      openCount,
    },
  }
}

function applyTicketToMetrics(
  metrics: TeamMemberMetrics,
  ticket: Ticket,
  slaConfig: Record<string, number> | undefined,
): TeamMemberMetrics {
  if (ticketService.isArchived(ticket)) return metrics
  if (!isTicketOpen(ticket.status)) return metrics

  const next = { ...metrics }
  next.open += 1
  if (ticket.status === 'a_caminho' || ticket.status === 'em_atendimento') next.inProgress += 1
  const priority = getPriority(ticket.priority)
  if (priority === 'alta' || priority === 'urgente') next.highPriority += 1
  const state = getSlaState(ticket.createdAt, ticket.priority, ticket.status, slaConfig)
  if (state === 'near' || state === 'overdue') next.slaRisk += 1
  return next
}