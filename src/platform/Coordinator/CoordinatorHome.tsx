import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { useCoordinatorPeopleData } from '../../core/permissions/useCoordinatorPeopleData'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { Tabs, TabsContent } from '../../lib/components/ui/tabs'
import {
  approveCoordinatorMembership,
  getCoordinatorAssignableRoles,
  getLastCoordinatorServiceError,
  rejectCoordinatorMembership,
  removeCoordinatorMembership,
  restoreCoordinatorMembership,
  setCoordinatorManager,
  setCoordinatorRole,
  suspendCoordinatorMembership,
  type CoordinatorAssignableRole,
  type CoordinatorInactiveMember,
  type CoordinatorRequest,
  type CoordinatorRoleOption,
  type CoordinatedLeader,
  type CoordinatedUnit,
} from '../../core/permissions/coordinatorService'
import type { TeamMember } from '../../core/permissions/membership'
import type { Ticket } from '../../apps/chamados/types'
import { analyzeTickets } from '../../apps/chamados/services/ticketStats'
import { getCol, onCollectionChange } from '../../lib/db'
import { slaConfigService } from '../../apps/chamados/services/slaConfigService'
import {
  analyzeSlaByWorkspace,
  isTicketOpen,
  type SlaWorkspaceSummary,
} from '../../apps/chamados/services/sla'
import { icons } from '../../lib/icons'
import { cn } from '../../lib/components/ui/utils'
import { PageContainer, ResponsiveGrid, useBreakpoint } from '../../responsive'
import { initials, roleLabelFor, summarizePeopleCounts } from './coordinatorHelpers'
import { isCoordinatorTabId, type CoordinatorTabId } from './coordinatorTabs'
import { AssignManagerSheet } from './components/AssignManagerSheet'
import { ConfirmActionSheet } from './components/ConfirmActionSheet'
import { CoordinatorHeader } from './components/CoordinatorHeader'
import { CoordinatorPanel } from './components/CoordinatorPanel'
import { CoordinatorTabs } from './components/CoordinatorTabs'
import { CoordinatorRecentTickets } from './components/CoordinatorRecentTickets'
import { CoordinatorSlaPanel } from './components/CoordinatorSlaPanel'
import { CoordinatorTicketsPanel } from './components/CoordinatorTicketsPanel'
import { InactiveMembers } from './components/InactiveMembers'
import { LeaderBlock } from './components/LeaderBlock'
import { ManageMemberSheet } from './components/ManageMemberSheet'
import { UnitOverview } from './components/UnitOverview'
import { CoordinatorAuditTab } from './tabs/CoordinatorAuditTab'
import { CoordinatorEcosystemTab } from './tabs/CoordinatorEcosystemTab'
import { CoordinatorPeopleTab } from './tabs/CoordinatorPeopleTab'
import { CoordinatorReportsTab } from './tabs/CoordinatorReportsTab'
import { CoordinatorReservaLabTab } from './tabs/CoordinatorReservaLabTab'
import { CoordinatorTicketsTab } from './tabs/CoordinatorTicketsTab'

interface AssignTarget {
  member: TeamMember
  currentManagerLabel: string
  unit: CoordinatedUnit
}

type ConfirmTarget =
  | { kind: 'suspend'; member: TeamMember }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'reject'; request: CoordinatorRequest }
  | { kind: 'restore'; member: CoordinatorInactiveMember }

const CONFIRM_COPY: Record<
  ConfirmTarget['kind'],
  { title: string; message: string; confirmLabel: string }
> = {
  suspend: {
    title: 'Suspender membro?',
    message:
      'O membro perde o acesso à unidade e sai das equipes às quais está vinculado. Ele poderá ser reativado depois em "Membros inativos".',
    confirmLabel: 'Suspender',
  },
  remove: {
    title: 'Remover da unidade?',
    message:
      'A membership será marcada como removida e o membro perde o acesso à unidade. O perfil e o usuário permanecem; a ação fica auditada e a restauração não é possível.',
    confirmLabel: 'Remover',
  },
  reject: {
    title: 'Rejeitar solicitação?',
    message:
      'A solicitação pendente será rejeitada e removida. O perfil e o usuário permanecem; a ação fica auditada.',
    confirmLabel: 'Rejeitar',
  },
  restore: {
    title: 'Restaurar membro?',
    message:
      'A membership volta a ficar ativa nesta unidade. O cargo é preservado e o vínculo com um gestor NÃO é recriado automaticamente.',
    confirmLabel: 'Restaurar',
  },
}

/**
 * Fase 1 responsiva — ÁREA DO COORDENADOR com GESTÃO REAL (RBAC 2.0, Fases
 * 8.2 + 9 + 10).
 *
 * O escopo continua vindo do servidor (RPCs 047 fail-closed por auth.uid()):
 * unidades → lideranças → equipes. A escrita usa os RPCs escopados
 * (`coordinator_set_manager`, `_approve_/_reject_/_suspend_/_remove_membership`
 * e `_set_role`, 047/065) — a UI NÃO decide autorização: envia apenas ids e
 * reage ao erro com honestidade. Cargos oferecidos = tec/vis/est/opv/lider
 * (nunca adm/coordinator); o Postgres revalida tudo.
 *
 * Responsividade (camada `src/responsive`): o shell compõe blocos colocados
 * (`CoordinatorHeader`, `PendingRequests`, `InactiveMembers`, `LeaderBlock`) e
 * sheets (`AssignManagerSheet`, `ManageMemberSheet`, `ConfirmActionSheet`) com
 * enquadramento por faixa (BottomSheet mobile / Dialog desktop/wide).
 * - compact: coluna única (comportamento de antes);
 * - tablet/desktop/wide: unidades em grade auto-ajustável (ResponsiveGrid);
 * - desktop/wide: painel lateral de apoio ao lado da grade (useBreakpoint).
 *
 * Fase 2 (refinamento): grade de unidades com coluna limitada (maxWidth, evita
 * "cards excessivamente largos" no wide) e overflow-safe em faixa estreita
 * (min(_, 100%), sem scroll horizontal no compact); painel lateral sticky com
 * resumo do escopo (conta exclusivamente dados já carregados).
 *
 * Fonte de dados única no shell? O escopo vive no `useCoordinator`; as leituras
 * de solicitações/inativos/cargos continuam por unidade (fetch por seção) — a
 * consolidação em um único serviço composto é melhoria futura documentada (não
 * alterar o contrato de dados nesta fase).
 *
 * PR C — Central por abas (Visão Geral | Pessoal | Chamados | ReservaLab |
 * Relatórios | Auditoria | Ecossistema). O shell mantém as leituras/sheets e
 * recompõe o conteúdo por abas (faixa em `components/CoordinatorTabs`); a aba
 * ativa vive na URL (`?tab=`) com fallback seguro para a Visão Geral. A Visão
 * Geral CONSUME DIRETAMENTE os painéis da PR B/#250 (KPIs, recentes, SLA e
 * pendências) e a grade de unidades/side rail que a Central já exibia — nada é
 * reimplementado. Abas de fase futura (ReservaLab/Relatórios/Auditoria) são
 * informativas — nada é buscado; o Ecossistema lista apps do `appRegistry` com
 * disponibilidade por unidade (`disabled_apps`) e navega para a rota existente.
 * Nenhum ciclo de dados novo (sem useTickets/poll/realtime).
 */
export function CoordinatorHome() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { units, loading, failed, refresh } = useCoordinator()
  const { workspace, workspaces, setWorkspace } = useWorkspace()
  const { isDesktop, isWide } = useBreakpoint()
  const wideLayout = isDesktop || isWide

  /**
   * PR C — navegação por abas. A aba ativa vive na URL (`?tab=...`): refresh
   * preserva a aba, voltar/avançar é previsível e `/coordenador` (sem query)
   * abre sempre a Visão Geral. Tab inexistente cai no fallback seguro.
   */
  const rawTab = searchParams.get('tab')
  const activeTab: CoordinatorTabId = rawTab && isCoordinatorTabId(rawTab) ? rawTab : 'overview'
  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const unitsKey = units.map((u) => u.unitId).join('|')

  const {
    requestsByUnit,
    requestsLoading,
    requestsFailed,
    loadRequests,
    inactiveByUnit,
    inactiveLoading,
    inactiveFailed,
    loadInactive,
    overviewByUnit,
    overviewLoading,
    overviewFailed,
    loadOverview,
  } = useCoordinatorPeopleData(unitsKey)

  const [roles, setRoles] = useState<CoordinatorRoleOption[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)

  const [sheetTarget, setSheetTarget] = useState<AssignTarget | null>(null)
  const [sheetManager, setSheetManager] = useState<string | null>(null)
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const [manageTarget, setManageTarget] = useState<{ member: TeamMember; unitName: string } | null>(
    null,
  )
  const [manageRole, setManageRole] = useState<CoordinatorAssignableRole | null>(null)
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)

  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])


  /**
   * Fase 2.2.1 — SLA por unidade (services/sla.ts é a única fonte de verdade).
   * 1 leitura do cache bruto de `chamados` (multiunidade, já autorizado pelo
   * backend por membership) + 1 leitura de config → agrupamento por
   * `workspace_id` → cálculo por unidade. A exibição é limitada às unidades do
   * escopo (`useCoordinator`) — o resto do cache não aparece.
   *
   * Invalidação passiva, sem duplicar ciclo: o Central NÃO monta `useTickets`
   * (poll 15s + realtime + pullRemote + alertas) nem cria poll/subscription/
   * store próprio. Ele apenas assina a gravação do cache bruto via
   * `onCollectionChange('chamados')` (emitido pelo `setCol` já existente) e
   * recomputa o SLA na renderização seguinte, sempre lendo `getCol('chamados')`
   * multiunidade — nunca o estado workspace-filtrado.
   */
  const [, bumpTickets] = useState(0)
  useEffect(() => onCollectionChange('chamados', () => bumpTickets((v) => v + 1)), [bumpTickets])

  const slaByWorkspace: Record<string, SlaWorkspaceSummary> = analyzeSlaByWorkspace(
    getCol<Ticket>('chamados'),
    slaConfigService.getHoursForTickets(),
  )

  /**
   * Visão geral (PR B): KPIs/recentes/SLA globais são lidos do MESMO cache
   * bruto autorizado (`getCol('chamados')`, multiunidade) restringido ao escopo
   * do coordenador — nunca o estado workspace-filtrado e nunca um segundo
   * `useTickets`. Tudo recomputa na renderização disparada pelo sinal passivo
   * (`onCollectionChange`) da PR A.
   */
  const scopeUnitIds = useMemo(() => new Set(units.map((u) => u.unitId)), [units])
  const scopeTickets = getCol<Ticket>('chamados').filter(
    (t) => t.workspace_id && scopeUnitIds.has(t.workspace_id),
  )
  const isArchivedTicket = (t: Ticket) => t.archived === true || t.status === 'fechado'
  const openScopeTickets = scopeTickets.filter(
    (t) => !isArchivedTicket(t) && isTicketOpen(t.status),
  )

  const slaAgg = units.reduce(
    (acc, u) => {
      const summary = slaByWorkspace[u.unitId]
      if (!summary) return acc
      acc.total += summary.total
      acc.within += summary.within
      acc.near += summary.near
      acc.overdue += summary.overdue
      return acc
    },
    { total: 0, within: 0, near: 0, overdue: 0 },
  )
  const slaRateLabel =
    slaAgg.total > 0 ? `${Math.round((slaAgg.within / slaAgg.total) * 100)}%` : '—'

  const activeKpis = {
    abertos: openScopeTickets.filter((t) => t.status === 'aberto').length,
    emAtendimento: openScopeTickets.filter(
      (t) => t.status === 'a_caminho' || t.status === 'em_atendimento',
    ).length,
    semResponsavel: scopeTickets.filter((t) => !isArchivedTicket(t) && !t.assignedToUserId).length,
    dentro: slaAgg.within,
    proximos: slaAgg.near,
    vencidos: slaAgg.overdue,
  }

  const recentTickets = scopeTickets
    .filter((t) => !isArchivedTicket(t))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  /** C5 — stats operacionais do escopo via helper puro (C1), mesmos números do shell. */
  const ticketStats = analyzeTickets(scopeTickets)

  const unitNameOf = (workspaceId?: string) =>
    units.find((u) => u.unitId === workspaceId)?.unitName ?? 'Unidade fora do escopo'

  const allRequests = units.flatMap((u) =>
    (requestsByUnit[u.unitId] ?? []).map((request) => ({ ...request, unitName: u.unitName })),
  )



  /**
   * "Abrir chamados": reaproveita o app de chamados EXISTENTE no contexto da
   * unidade (mecanismo do WorkspaceGate/WorkspaceContext — troca o workspace
   * ativo e navega para `/chamados`). Recebe opcionalmente o sufixo de query
   * (`?status=aberto`, `?unassigned=1`, ...) que apenas INICIALIZA os filtros
   * existentes do TicketList — sem segunda fonte de estado. Nenhum fluxo de
   * chamados é duplicado aqui. Sem o workspace no contexto (unidade fora do
   * `workspaces` visível), devolve null (a UI não mostra a ação).
   */
  const openChamadosFor = (unitId: string): ((query?: string) => void) | null => {
    const target = workspaces.find((w) => w.id === unitId)
    if (!target) return null
    return (query?: string) => {
      setWorkspace(target, { persist: false })
      navigate(query ? `/chamados${query}` : '/chamados')
    }
  }

  /**
   * Chamado recente: abre o detail EXISTENTE (`/chamados/tickets/:id`) no
   * contexto da unidade do chamado. Se o chamado já pertence ao workspace
   * ativo, evita a troca desnecessária.
   */
  const openTicketFor = (unitId: string): ((ticketId: string) => void) | null => {
    const target = workspaces.find((w) => w.id === unitId)
    if (!target) return null
    return (ticketId: string) => {
      if (workspace?.id !== unitId) {
        setWorkspace(target, { persist: false })
      }
      navigate(`/chamados/tickets/${ticketId}`)
    }
  }

  /**
   * Navegação global da visão geral: só existe quando o escopo tem UMA unidade
   * (senão um card global não saberia em qual workspace abrir o app). Em escopo
   * multiunidade os KPIs ficam somente-leitura e o detalhe por unidade vive nos
   * cards de "Equipe & Unidades" abaixo.
   */
  const scopeChamados = units.length === 1 ? openChamadosFor(units[0].unitId) : null

  /**
   * C5 — chamado recente da visão geral: mesmo comportamento por ticket do shell
   * (callback contextual por unidade). Sem nenhum recente acionável (workspace
   * fora do contexto), o callback fica ausente e o componente renderiza itens
   * estáticos (fail-safe).
   */
  const scopeOpenRecentTicket = (ticketId: string) => {
    const ticket = recentTickets.find((t) => t.id === ticketId)
    if (!ticket?.workspace_id) return
    openTicketFor(ticket.workspace_id)?.(ticketId)
  }
  const recentOpenTicket = recentTickets.some(
    (t) => t.workspace_id && openTicketFor(t.workspace_id) !== null,
  )
    ? scopeOpenRecentTicket
    : undefined

  /**
   * PR C — "Abrir módulo do Ecossistema": navega para a rota EXISTENTE do app
   * no contexto da unidade (mesmo mecanismo do `openChamadosFor`). Não concede
   * permissão; o próprio app revalida o acesso ao abrir.
   */
  const openAppFor = (unitId: string, path: string): (() => void) | null => {
    const target = workspaces.find((w) => w.id === unitId)
    if (!target) return null
    return () => {
      if (workspace?.id !== unitId) setWorkspace(target, { persist: false })
      navigate(path)
    }
  }

  const { leaderCount, memberCount, pendingCount, suspendedCount, removedCount } =
    summarizePeopleCounts(units, requestsByUnit, inactiveByUnit)

  const openAssignSheet = (unit: CoordinatedUnit, leader: CoordinatedLeader, member: TeamMember) => {
    setSheetTarget({
      member,
      currentManagerLabel: leader.profile?.name ?? 'Liderança',
      unit,
    })
    setSheetManager(null)
    setSheetError(null)
    setActionError(null)
  }

  const confirmAssign = async () => {
    if (!sheetTarget || sheetManager === null) return
    setSheetBusy(true)
    setSheetError(null)
    setPending(`assign-${sheetTarget.member.membership.id}`)
    const ok = await setCoordinatorManager(sheetTarget.member.membership.id, sheetManager)
    if (ok) {
      setSheetTarget(null)
      setSheetManager(null)
      await refresh({ silent: true })
    } else {
      setSheetError(
        getLastCoordinatorServiceError() ?? 'Não foi possível vincular o membro a este gestor.',
      )
    }
    setSheetBusy(false)
    setPending(null)
  }

  const confirmUnassign = async (member: TeamMember) => {
    setPending(`assign-${member.membership.id}`)
    setActionError(null)
    const ok = await setCoordinatorManager(member.membership.id, null)
    if (ok) {
      await refresh({ silent: true })
    } else {
      setActionError(
        getLastCoordinatorServiceError() ?? 'Não foi possível remover o membro da equipe.',
      )
    }
    setPending(null)
  }

  const openManageSheet = async (member: TeamMember, unitName: string) => {
    setManageTarget({ member, unitName })
    setManageError(null)
    setManageRole(null)
    setActionError(null)

    let options = roles
    if (options.length === 0) {
      setRolesLoading(true)
      setRolesError(null)
      options = await getCoordinatorAssignableRoles()
      if (options.length === 0) {
        setRolesError(
          getLastCoordinatorServiceError() ?? 'Não foi possível carregar os cargos disponíveis.',
        )
      }
      setRoles(options)
      setRolesLoading(false)
    }

    const current = options.find((role) => role.id === member.membership.role_id)
    setManageRole(current?.slug ?? null)
  }

  const closeManageSheet = () => {
    if (manageBusy) return
    setManageTarget(null)
    setManageRole(null)
    setManageError(null)
  }

  const saveManageRole = async () => {
    if (!manageTarget || manageRole === null) return
    const membershipId = manageTarget.member.membership.id
    const current = roles.find((role) => role.id === manageTarget.member.membership.role_id)
    if (current?.slug === manageRole) {
      closeManageSheet()
      return
    }
    setManageBusy(true)
    setManageError(null)
    setPending(`role-${membershipId}`)
    const ok = await setCoordinatorRole(membershipId, manageRole)
    if (ok) {
      setManageTarget(null)
      setManageRole(null)
      await refresh({ silent: true })
    } else {
      setManageError(getLastCoordinatorServiceError() ?? 'Não foi possível alterar o cargo.')
    }
    setManageBusy(false)
    setPending(null)
  }

  const approveRequest = async (request: CoordinatorRequest) => {
    const membershipId = request.membership.id
    setPending(`approve-${membershipId}`)
    setActionError(null)
    const ok = await approveCoordinatorMembership(membershipId)
    if (ok) {
      await refresh({ silent: true })
      await loadRequests()
    } else {
      setActionError(
        getLastCoordinatorServiceError() ?? 'Não foi possível aprovar a solicitação.',
      )
    }
    setPending(null)
  }

  const openConfirm = (target: ConfirmTarget) => {
    setConfirmTarget(target)
    setConfirmError(null)
  }

  const runConfirm = async () => {
    if (!confirmTarget) return
    setConfirmBusy(true)
    setConfirmError(null)
    if (confirmTarget.kind === 'suspend') {
      const membershipId = confirmTarget.member.membership.id
      setPending(`suspend-${membershipId}`)
      const ok = await suspendCoordinatorMembership(membershipId)
      if (ok) {
        setConfirmTarget(null)
        setManageTarget(null)
        await refresh({ silent: true })
        await loadInactive()
      } else {
        setConfirmError(
          getLastCoordinatorServiceError() ?? 'Não foi possível suspender o membro.',
        )
      }
      setPending(null)
    } else if (confirmTarget.kind === 'remove') {
      const membershipId = confirmTarget.member.membership.id
      setPending(`remove-${membershipId}`)
      const ok = await removeCoordinatorMembership(membershipId)
      if (ok) {
        setConfirmTarget(null)
        setManageTarget(null)
        await refresh({ silent: true })
        await loadInactive()
      } else {
        setConfirmError(getLastCoordinatorServiceError() ?? 'Não foi possível remover o membro.')
      }
      setPending(null)
    } else if (confirmTarget.kind === 'restore') {
      const membershipId = confirmTarget.member.membership.id
      setPending(`restore-${membershipId}`)
      const ok = await restoreCoordinatorMembership(membershipId)
      if (ok) {
        setConfirmTarget(null)
        await refresh({ silent: true })
        await loadInactive()
      } else {
        setConfirmError(getLastCoordinatorServiceError() ?? 'Não foi possível restaurar o membro.')
      }
      setPending(null)
    } else {
      const membershipId = confirmTarget.request.membership.id
      setPending(`reject-${membershipId}`)
      const ok = await rejectCoordinatorMembership(membershipId)
      if (ok) {
        setConfirmTarget(null)
        await refresh({ silent: true })
        await loadRequests()
      } else {
        setConfirmError(
          getLastCoordinatorServiceError() ?? 'Não foi possível rejeitar a solicitação.',
        )
      }
      setPending(null)
    }
    setConfirmBusy(false)
  }

  const confirmCopy = confirmTarget ? CONFIRM_COPY[confirmTarget.kind] : null

  const unitsPanel = (
    <ResponsiveGrid minWidth={380} maxWidth={560} data-testid="coordinator-units-grid" gap={12}>
      {units.map((unit) => {
        const unitRequests = requestsByUnit[unit.unitId] ?? []
        return (
          <section key={unit.unitId} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-fg">
                Unidade: {unit.unitName}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {unitRequests.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    {unitRequests.length} pendente{unitRequests.length !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                  {unit.leaders.length} liderança{unit.leaders.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <UnitOverview
              overview={overviewByUnit[unit.unitId] ?? null}
              loading={overviewLoading}
              failed={overviewFailed}
              onRetry={() => void loadOverview()}
              sla={slaByWorkspace[unit.unitId] ?? null}
              onOpenChamados={openChamadosFor(unit.unitId)}
              onOpenTicket={openTicketFor(unit.unitId)}
            />

            <InactiveMembers
              members={inactiveByUnit[unit.unitId] ?? []}
              loading={inactiveLoading}
              failed={inactiveFailed}
              pending={pending}
              onRetry={() => void loadInactive()}
              onRequestRestore={(member) => openConfirm({ kind: 'restore', member })}
            />

            {unit.leaders.length === 0 ? (
              <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
                Nenhuma liderança subordinada nesta unidade ainda.
              </p>
            ) : (
              <ResponsiveGrid minWidth={256} gap={12} className="mt-3">
                {unit.leaders.map((leader) => (
                  <LeaderBlock
                    key={leader.leadership.id}
                    leader={leader}
                    rolesById={rolesById}
                    disabled={pending !== null}
                    onAssign={(member) => openAssignSheet(unit, leader, member)}
                    onUnassign={(member) => void confirmUnassign(member)}
                    onManage={(member) => void openManageSheet(member, unit.unitName)}
                  />
                ))}
              </ResponsiveGrid>
            )}
          </section>
        )
      })}
    </ResponsiveGrid>
  )

  const infoPanel = (
    <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
      <p className="text-[10px] leading-relaxed text-fg-muted">
        Nesta tela você aprova/rejeita solicitações, ajusta cargo (nunca adm ou coordinator) e o
        status das memberships da unidade, além de vincular membros a um gestor. A criação de
        memberships segue restrita ao administrador; o Postgres valida cada operação.
      </p>
    </div>
  )

  const scopeRail = (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Resumo do escopo
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        <li className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.clock size={13} className="shrink-0" />
            Solicitações pendentes
          </span>
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {pendingCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.alertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
            Suspensos
          </span>
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {suspendedCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.close size={13} className="shrink-0 text-red-500" />
            Removidos
          </span>
          <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
            {removedCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.shield size={13} className="shrink-0" />
            Lideranças diretas
          </span>
          <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[10px] font-semibold text-fg-dim">
            {leaderCount}
          </span>
        </li>
      </ul>
    </div>
  )

  const overviewPanels = (
    <>
      <CoordinatorTicketsPanel
        stats={ticketStats}
        sla={{ within: slaAgg.within, near: slaAgg.near, overdue: slaAgg.overdue }}
        onOpenChamados={scopeChamados ?? undefined}
      />

      <ResponsiveGrid minWidth={400} gap={12} className="mb-6">
        <CoordinatorRecentTickets
          tickets={recentTickets}
          resolveUnitName={unitNameOf}
          onOpenTicket={recentOpenTicket}
        />

        <CoordinatorSlaPanel
          within={slaAgg.within}
          near={slaAgg.near}
          overdue={slaAgg.overdue}
          rateLabel={slaRateLabel}
          onOpenChamados={scopeChamados ?? undefined}
        />
      </ResponsiveGrid>

      <CoordinatorPanel
        title="Solicitações / Pendências"
        description={
          pendingCount > 0
            ? 'Aprovar ativa a membership na unidade; o vínculo a uma equipe é ajustado depois pelo gestor da unidade.'
            : undefined
        }
        className="mb-6"
        data-testid="overview-requests"
      >
        {requestsLoading ? (
          <p className="inline-flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
            Carregando solicitações...
          </p>
        ) : requestsFailed ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[10px] leading-relaxed text-red-500">
              Não foi possível carregar as solicitações.
            </p>
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
            >
              Tentar novamente
            </button>
          </div>
        ) : allRequests.length === 0 ? (
          <p className="text-[10px] text-fg-muted">Nenhuma solicitação pendente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {allRequests.map((request) => {
              const name = request.profile?.name ?? 'Membro sem perfil'
              const approveKey = `approve-${request.membership.id}`
              const rejectKey = `reject-${request.membership.id}`
              return (
                <li key={request.membership.id} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-fg">{name}</span>
                    {request.profile && (
                      <span className="block truncate text-[10px] text-fg-muted">
                        {request.profile.email}
                      </span>
                    )}
                  </span>
                  <span className="hidden shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim sm:inline">
                    {request.unitName}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                    Pendente
                  </span>
                  <button
                    type="button"
                    onClick={() => void approveRequest(request)}
                    disabled={pending !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 dark:text-emerald-400"
                  >
                    {pending === approveKey ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : (
                      <icons.ui.check size={11} />
                    )}
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => openConfirm({ kind: 'reject', request })}
                    disabled={pending !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-40"
                  >
                    {pending === rejectKey ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : (
                      <icons.ui.close size={11} />
                    )}
                    Rejeitar
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CoordinatorPanel>
    </>
  )

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <PageContainer className="pt-8 pb-8">
        <CoordinatorHeader onBack={() => navigate('/')} />

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-xs text-fg-muted">Carregando seu escopo de coordenação...</p>
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <p className="text-sm font-semibold text-fg">Não foi possível carregar seu escopo</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Algo deu errado ao buscar as unidades sob sua coordenação. Tente novamente em
              instantes.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
            >
              Tentar novamente
            </button>
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
              <icons.ui.shield size={30} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-fg">
              Você ainda não tem unidades de coordenação atribuídas
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Sua coordenação é definida por unidade (membership ativa de coordenação), não
              globalmente. Peça ao administrador para atribuir as unidades ao seu perfil.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.home size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{units.length}</p>
                  <p className="text-[10px] text-fg-muted">
                    unidade{units.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.shield size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{leaderCount}</p>
                  <p className="text-[10px] text-fg-muted">
                    liderança{leaderCount !== 1 ? 's' : ''} direta{leaderCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.userCheck size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{memberCount}</p>
                  <p className="text-[10px] text-fg-muted">
                    membro{memberCount !== 1 ? 's' : ''} nas equipes
                  </p>
                </div>
              </div>
            </div>

            {actionError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <icons.ui.alertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                <p className="flex-1 text-[11px] leading-relaxed text-red-500">{actionError}</p>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => setActionError(null)}
                  className="shrink-0 text-red-500/70 transition-colors hover:text-red-500"
                >
                  <icons.ui.close size={13} />
                </button>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
              <CoordinatorTabs className="mb-4" />

              <TabsContent value="overview">
                {overviewPanels}

                {wideLayout ? (
                  <div className="mb-6 flex items-start gap-3">
                    <div className="min-w-0 flex-1">{unitsPanel}</div>
                    <aside
                      data-testid="coordinator-side-info"
                      className="sticky top-4 flex w-72 shrink-0 flex-col gap-3"
                    >
                      {scopeRail}
                      {infoPanel}
                    </aside>
                  </div>
                ) : (
                  <div className={cn('mb-6 flex flex-col gap-3')}>
                    {unitsPanel}
                    {infoPanel}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="people">
                <CoordinatorPeopleTab
                  units={units}
                  requestsByUnit={requestsByUnit}
                  requestsLoading={requestsLoading}
                  requestsFailed={requestsFailed}
                  onRetryRequests={() => void loadRequests()}
                  inactiveByUnit={inactiveByUnit}
                  inactiveLoading={inactiveLoading}
                  inactiveFailed={inactiveFailed}
                  onRetryInactive={() => void loadInactive()}
                  pending={pending}
                  rolesById={rolesById}
                  onAssignMember={openAssignSheet}
                  onUnassign={(member) => void confirmUnassign(member)}
                  onManage={(member, unitName) => void openManageSheet(member, unitName)}
                  onApproveRequest={(request) => void approveRequest(request)}
                  onRejectRequest={(request) => openConfirm({ kind: 'reject', request })}
                  onRestore={(member) => openConfirm({ kind: 'restore', member })}
                  pendingCount={pendingCount}
                  suspendedCount={suspendedCount}
                  removedCount={removedCount}
                  leaderCount={leaderCount}
                  memberCount={memberCount}
                />
              </TabsContent>

              <TabsContent value="tickets">
                <CoordinatorTicketsTab
                  units={units}
                  activeKpis={activeKpis}
                  recentTickets={recentTickets}
                  unitNameOf={unitNameOf}
                  openChamadosFor={openChamadosFor}
                  openTicketFor={openTicketFor}
                />
              </TabsContent>

              <TabsContent value="reservalab">
                <CoordinatorReservaLabTab />
              </TabsContent>

              <TabsContent value="reports">
                <CoordinatorReportsTab />
              </TabsContent>

              <TabsContent value="audit">
                <CoordinatorAuditTab />
              </TabsContent>

              <TabsContent value="ecosystem">
                <CoordinatorEcosystemTab
                  units={units}
                  workspaces={workspaces}
                  onOpenApp={openAppFor}
                />
              </TabsContent>
            </Tabs>
          </>
        )}

        <AssignManagerSheet
          target={sheetTarget}
          selected={sheetManager}
          busy={sheetBusy}
          error={sheetError}
          onSelect={setSheetManager}
          onConfirm={() => void confirmAssign()}
          onClose={() => {
            if (!sheetBusy) {
              setSheetTarget(null)
              setSheetManager(null)
              setSheetError(null)
            }
          }}
        />

        <ManageMemberSheet
          target={manageTarget}
          roles={roles}
          rolesLoading={rolesLoading}
          rolesError={rolesError}
          selected={manageRole}
          currentRoleLabel={
            manageTarget
              ? roleLabelFor(manageTarget.member.membership, manageTarget.member.profile, rolesById)
              : '—'
          }
          busy={manageBusy}
          error={manageError}
          onSelect={setManageRole}
          onSave={() => void saveManageRole()}
          onRequestSuspend={() =>
            manageTarget && openConfirm({ kind: 'suspend', member: manageTarget.member })
          }
          onRequestRemove={() =>
            manageTarget && openConfirm({ kind: 'remove', member: manageTarget.member })
          }
          onClose={closeManageSheet}
        />

        <ConfirmActionSheet
          open={confirmTarget !== null}
          title={confirmCopy?.title ?? ''}
          message={confirmCopy?.message ?? ''}
          confirmLabel={confirmCopy?.confirmLabel ?? 'Confirmar'}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => void runConfirm()}
          onClose={() => {
            if (!confirmBusy) {
              setConfirmTarget(null)
              setConfirmError(null)
            }
          }}
        />

        <footer className="mt-6 text-center">
          <p className="text-[10px] text-fg-dim">
            Área de liderança — disponível apenas para o cargo Coordenador Multiunidades.
          </p>
        </footer>
      </PageContainer>
    </div>
  )
}