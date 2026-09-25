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
import { PageContainer, useBreakpoint } from '../../responsive'
import { roleLabelFor, summarizePeopleCounts } from './coordinatorHelpers'
import { isCoordinatorTabId, type CoordinatorTabId } from './coordinatorTabs'
import { AssignManagerSheet } from './components/AssignManagerSheet'
import { ConfirmActionSheet } from './components/ConfirmActionSheet'
import { CoordinatorHeader } from './components/CoordinatorHeader'
import { CoordinatorTabs } from './components/CoordinatorTabs'
import { CoordinatorUnitContext } from './components/CoordinatorUnitContext'
import { EmptyState } from './components/EmptyState'
import { ManageMemberSheet } from './components/ManageMemberSheet'
import { SkeletonMetric, SkeletonRow } from './components/Skeletons'
import { CoordinatorAuditTab } from './tabs/CoordinatorAuditTab'
import { CoordinatorApprovalsTab } from './tabs/CoordinatorApprovalsTab'
import { CoordinatorEcosystemTab } from './tabs/CoordinatorEcosystemTab'
import { CoordinatorOverviewTab } from './tabs/CoordinatorOverviewTab'
import { CoordinatorPeopleTab } from './tabs/CoordinatorPeopleTab'
import { CoordinatorReportsTab } from './tabs/CoordinatorReportsTab'
import { CoordinatorReservaLabTab } from './tabs/CoordinatorReservaLabTab'
import { CoordinatorTeamsTab } from './tabs/CoordinatorTeamsTab'
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
 * (`CoordinatorHeader`, `InactiveMembers`, `LeaderBlock`) e
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
 * reimplementado. ReservaLab (PR E) consolida, em LEITURA, reservas de labs
 * (planilha) e tablets (Supabase) por unidade do escopo — sem escrita; as abas
 * de fase futura (Relatórios/Auditoria) continuam informativas — nada é
 * buscado; o Ecossistema lista apps do `appRegistry` com disponibilidade por
 * unidade (`disabled_apps`) e navega para a rota existente.
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

  /**
   * PR C (C1/C3) — contexto de EXIBIÇÃO por unidade (`?unit=`), local à Central.
   * NÃO muda workspace global, cargo ou autorização; não dispara RPC (a leitura
   * por unidade já acontece para o escopo inteiro em `useCoordinatorPeopleData`,
   * keyed em `units`). Valor inválido/fora do escopo cai no fail-closed
   * ("Todas as unidades"), mesmo padrão do `?tab=`.
   */
  const rawUnit = searchParams.get('unit')
  const activeUnitId = rawUnit && units.some((u) => u.unitId === rawUnit) ? rawUnit : null
  const visibleUnits = useMemo(
    () => (activeUnitId ? units.filter((u) => u.unitId === activeUnitId) : units),
    [units, activeUnitId],
  )
  const handleUnitChange = (unitId: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (unitId) {
      next.set('unit', unitId)
    } else {
      next.delete('unit')
    }
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

  const slaConfigs = slaConfigService.getHoursForTickets()
  const slaByWorkspace: Record<string, SlaWorkspaceSummary> = analyzeSlaByWorkspace(
    getCol<Ticket>('chamados'),
    slaConfigs,
  )

  /**
   * Visão geral (PR B): KPIs/recentes/SLA globais são lidos do MESMO cache
   * bruto autorizado (`getCol('chamados')`, multiunidade) restringido ao escopo
   * do coordenador — nunca o estado workspace-filtrado e nunca um segundo
   * `useTickets`. Tudo recomputa na renderização disparada pelo sinal passivo
   * (`onCollectionChange`) da PR A.
   */
  const scopeUnitIds = useMemo(() => new Set(visibleUnits.map((u) => u.unitId)), [visibleUnits])
  const scopeTickets = getCol<Ticket>('chamados').filter(
    (t) => t.workspace_id && scopeUnitIds.has(t.workspace_id),
  )
  const isArchivedTicket = (t: Ticket) => t.archived === true || t.status === 'fechado'
  const openScopeTickets = scopeTickets.filter(
    (t) => !isArchivedTicket(t) && isTicketOpen(t.status),
  )

  const slaAgg = visibleUnits.reduce(
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
  const scopeChamados =
    visibleUnits.length === 1 ? openChamadosFor(visibleUnits[0].unitId) : null

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
    summarizePeopleCounts(visibleUnits, requestsByUnit, inactiveByUnit)

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

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <PageContainer className="pt-8 pb-8">
        <CoordinatorHeader onBack={() => navigate('/')} />

        {loading ? (
          <div className="flex flex-col gap-4" role="status" aria-live="polite">
            <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)] sm:grid-cols-3">
              <SkeletonMetric />
              <SkeletonMetric />
              <SkeletonMetric />
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card px-4 py-4 shadow-[var(--shadow-card)]">
              <SkeletonRow />
              <SkeletonRow />
            </div>
            <p className="text-center text-xs text-fg-muted">
              Carregando seu escopo de coordenação...
            </p>
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
              <icons.ui.alertTriangle size={24} />
            </span>
            <p className="mt-4 text-sm font-semibold text-fg">
              Não foi possível carregar seu escopo
            </p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Algo deu errado ao buscar as unidades sob sua coordenação. Tente novamente em
              instantes.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              Tentar novamente
            </button>
          </div>
        ) : units.length === 0 ? (
          <EmptyState
            icon={<icons.ui.shield size={22} className="text-fg-muted" />}
            title="Você ainda não tem unidades de coordenação atribuídas"
            description="Sua coordenação é definida por unidade (membership ativa de coordenação), não globalmente. Peça ao administrador para atribuir as unidades ao seu perfil."
          />
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card py-1 shadow-[var(--shadow-card)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-center gap-3.5 px-5 py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fg-muted/10 text-fg-muted">
                  <icons.ui.home size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-none tracking-tight text-fg tabular-nums">
                    {visibleUnits.length}
                  </p>
                  <p className="mt-1.5 truncate text-[11px] font-medium text-fg-muted">
                    unidade{visibleUnits.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3.5 px-5 py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <icons.ui.shield size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold leading-none tracking-tight text-fg tabular-nums">
                    {leaderCount}
                  </p>
                  <p className="mt-1.5 truncate text-[11px] font-medium text-fg-muted">
                    liderança{leaderCount !== 1 ? 's' : ''} direta{leaderCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3.5 px-5 py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fg-muted/10 text-fg-muted">
                  <icons.ui.userCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold leading-none tracking-tight text-fg tabular-nums">
                    {memberCount}
                  </p>
                  <p className="mt-1.5 truncate text-[11px] font-medium text-fg-muted">
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

            {units.length > 1 && (
              <div className="mb-4">
                <CoordinatorUnitContext
                  units={units}
                  activeUnitId={activeUnitId}
                  onSelect={handleUnitChange}
                />
              </div>
            )}

            <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
              <CoordinatorTabs className="mb-4" activeTab={activeTab} />

              <TabsContent value="overview">
                <CoordinatorOverviewTab
                  wideLayout={wideLayout}
                  units={visibleUnits}
                  ticketStats={ticketStats}
                  slaAgg={slaAgg}
                  slaRateLabel={slaRateLabel}
                  scopeChamados={scopeChamados}
                  recentTickets={recentTickets}
                  unitNameOf={unitNameOf}
                  recentOpenTicket={recentOpenTicket}
                  requestsByUnit={requestsByUnit}
                  requestsLoading={requestsLoading}
                  requestsFailed={requestsFailed}
                  onOpenApprovals={() => handleTabChange('approvals')}
                  inactiveByUnit={inactiveByUnit}
                  inactiveLoading={inactiveLoading}
                  inactiveFailed={inactiveFailed}
                  onRetryInactive={() => void loadInactive()}
                  overviewByUnit={overviewByUnit}
                  overviewLoading={overviewLoading}
                  overviewFailed={overviewFailed}
                  onRetryOverview={() => void loadOverview()}
                  slaByWorkspace={slaByWorkspace}
                  onOpenChamados={openChamadosFor}
                  onOpenTicket={openTicketFor}
                  pending={pending}
                  rolesById={rolesById}
                  pendingCount={pendingCount}
                  suspendedCount={suspendedCount}
                  removedCount={removedCount}
                  leaderCount={leaderCount}
                  onAssignMember={openAssignSheet}
                  onUnassign={(member) => void confirmUnassign(member)}
                  onManage={(member, unitName) => void openManageSheet(member, unitName)}
                  onRequestRestore={(member) => openConfirm({ kind: 'restore', member })}
                />
              </TabsContent>

              <TabsContent value="approvals">
                <CoordinatorApprovalsTab
                  units={visibleUnits}
                  requestsByUnit={requestsByUnit}
                  requestsLoading={requestsLoading}
                  requestsFailed={requestsFailed}
                  onRetryRequests={() => void loadRequests()}
                  onApproveRequest={(request) => void approveRequest(request)}
                  onRejectRequest={(request) => openConfirm({ kind: 'reject', request })}
                  pending={pending}
                  rolesById={rolesById}
                />
              </TabsContent>

              <TabsContent value="people">
                <CoordinatorPeopleTab
                  units={visibleUnits}
                  requestsByUnit={requestsByUnit}
                  requestsLoading={requestsLoading}
                  requestsFailed={requestsFailed}
                  onRetryRequests={() => void loadRequests()}
                  inactiveByUnit={inactiveByUnit}
                  inactiveLoading={inactiveLoading}
                  inactiveFailed={inactiveFailed}
                  onRetryInactive={() => void loadInactive()}
                  rolesById={rolesById}
                />
              </TabsContent>

              <TabsContent value="teams">
                <CoordinatorTeamsTab
                  units={visibleUnits}
                  scopeTickets={scopeTickets}
                  slaConfigs={slaConfigs}
                  rolesById={rolesById}
                  openChamadosFor={openChamadosFor}
                />
              </TabsContent>

              <TabsContent value="tickets">
                <CoordinatorTicketsTab
                  units={visibleUnits}
                  activeKpis={activeKpis}
                  recentTickets={recentTickets}
                  scopeTickets={scopeTickets}
                  slaConfigs={slaConfigs}
                  unitNameOf={unitNameOf}
                  openChamadosFor={openChamadosFor}
                  openTicketFor={openTicketFor}
                />
              </TabsContent>

              <TabsContent value="reservalab">
                <CoordinatorReservaLabTab
                  units={visibleUnits}
                  workspaces={workspaces}
                />
              </TabsContent>

              <TabsContent value="reports">
                <CoordinatorReportsTab units={visibleUnits} workspaces={workspaces} />
              </TabsContent>

              <TabsContent value="audit">
                <CoordinatorAuditTab />
              </TabsContent>

              <TabsContent value="ecosystem">
                <CoordinatorEcosystemTab
                  units={visibleUnits}
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