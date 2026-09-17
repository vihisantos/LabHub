import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { permissionService } from '../../core/permissions/service'
import {
  approveCoordinatorMembership,
  getCoordinatorAssignableRoles,
  getCoordinatorRequests,
  getLastCoordinatorServiceError,
  rejectCoordinatorMembership,
  removeCoordinatorMembership,
  setCoordinatorManager,
  setCoordinatorRole,
  suspendCoordinatorMembership,
  type CoordinatorAssignableRole,
  type CoordinatorRequest,
  type CoordinatorRoleOption,
  type CoordinatedLeader,
  type CoordinatedUnit,
} from '../../core/permissions/coordinatorService'
import type { Membership, TeamMember, TeamMemberProfile } from '../../core/permissions/membership'
import { icons } from '../../lib/icons'

function initials(name: string): string {
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
function roleLabelFor(
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
export function managerOptionsForMember(unit: CoordinatedUnit, member: TeamMember): ManagerOption[] {
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

interface AssignManagerSheetProps {
  target: { member: TeamMember; currentManagerLabel: string; unit: CoordinatedUnit } | null
  selected: string | null
  busy: boolean
  error: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  onClose: () => void
}

function AssignManagerSheet({
  target,
  selected,
  busy,
  error,
  onSelect,
  onConfirm,
  onClose,
}: AssignManagerSheetProps) {
  const options = target ? managerOptionsForMember(target.unit, target.member) : []
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={busy ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Vincular membro a gestor"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                <icons.ui.userCheck size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-fg">Vincular membro a gestor</h2>
                <p className="truncate text-xs text-fg-muted">
                  {target.member.profile?.name ?? 'Membro'} • sob {target.currentManagerLabel}
                </p>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2">
              {options.map((option) => (
                <label
                  key={option.membershipId}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/5"
                >
                  <input
                    type="radio"
                    name="manager-option"
                    value={option.membershipId}
                    checked={selected === option.membershipId}
                    onChange={() => onSelect(option.membershipId)}
                    disabled={busy}
                    className="h-4 w-4 accent-violet-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-fg">{option.label}</span>
                    <span className="block truncate text-[10px] text-fg-muted">{option.note}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="mb-4 text-xs text-red-500">{error}</p>}
            <p className="mb-4 text-[10px] leading-relaxed text-fg-muted">
              A criação de memberships continua restrita ao administrador. O Postgres valida este
              vínculo.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy || selected === null}
                className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
              >
                {busy ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface ManageMemberSheetProps {
  target: { member: TeamMember; unitName: string } | null
  roles: CoordinatorRoleOption[]
  rolesLoading: boolean
  rolesError: string | null
  selected: CoordinatorAssignableRole | null
  currentRoleLabel: string
  busy: boolean
  error: string | null
  onSelect: (slug: CoordinatorAssignableRole) => void
  onSave: () => void
  onRequestSuspend: () => void
  onRequestRemove: () => void
  onClose: () => void
}

function ManageMemberSheet({
  target,
  roles,
  rolesLoading,
  rolesError,
  selected,
  currentRoleLabel,
  busy,
  error,
  onSelect,
  onSave,
  onRequestSuspend,
  onRequestRemove,
  onClose,
}: ManageMemberSheetProps) {
  const name = target?.member.profile?.name ?? 'Membro sem perfil'
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={busy ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Gerenciar membro"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                <icons.ui.sliders size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-fg">Gerenciar membro</h2>
                <p className="truncate text-xs text-fg-muted">
                  {name} • {target.unitName} • cargo atual: {currentRoleLabel}
                </p>
              </div>
            </div>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              Cargo na unidade
            </p>
            {rolesLoading ? (
              <p className="mb-4 text-xs text-fg-muted">Carregando cargos...</p>
            ) : roles.length === 0 ? (
              <p className="mb-4 text-xs text-red-500">
                {rolesError ?? 'Nenhum cargo atribuível disponível.'}
              </p>
            ) : (
              <div className="mb-4 flex flex-col gap-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/5"
                  >
                    <input
                      type="radio"
                      name="role-option"
                      value={role.slug}
                      checked={selected === role.slug}
                      onChange={() => onSelect(role.slug)}
                      disabled={busy}
                      className="h-4 w-4 accent-violet-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                      {role.name}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {error && <p className="mb-4 text-xs text-red-500">{error}</p>}

            <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-500">
                Status da membership
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onRequestSuspend}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                >
                  Suspender
                </button>
                <button
                  type="button"
                  onClick={onRequestRemove}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                >
                  Remover da unidade
                </button>
              </div>
            </div>

            <p className="mb-4 text-[10px] leading-relaxed text-fg-muted">
              O Postgres é a autoridade: valida o escopo, os cargos permitidos (nunca adm ou
              coordinator) e as transições de status. Suspender/remover retira o membro do seu
              escopo; a restauração não está disponível nesta tela.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || selected === null || roles.length === 0}
                className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
              >
                {busy ? 'Salvando...' : 'Salvar cargo'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface ConfirmActionSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

function ConfirmActionSheet({
  open,
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmActionSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={busy ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
                <icons.ui.alertTriangle size={18} />
              </div>
              <h2 className="text-base font-bold text-fg">{title}</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-fg-muted">{message}</p>
            {error && <p className="mb-4 text-xs text-red-500">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
              >
                {busy ? 'Processando...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface LeaderBlockProps {
  leader: CoordinatedLeader
  rolesById: Map<string, CoordinatorRoleOption>
  disabled: boolean
  onAssign: (member: TeamMember) => void
  onUnassign: (member: TeamMember) => void
  onManage: (member: TeamMember) => void
}

function LeaderBlock({
  leader,
  rolesById,
  disabled,
  onAssign,
  onUnassign,
  onManage,
}: LeaderBlockProps) {
  const name = leader.profile?.name ?? 'Membro sem perfil'
  const leadershipMember: TeamMember = { membership: leader.leadership, profile: leader.profile }
  return (
    <div key={leader.leadership.id} className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-fg">{name}</p>
          {leader.profile && (
            <p className="truncate text-[10px] text-fg-muted">{leader.profile.email}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
          {roleLabelFor(leader.leadership, leader.profile, rolesById)}
        </span>
        <button
          type="button"
          title="Gerenciar membro"
          aria-label={`Gerenciar ${name}`}
          disabled={disabled}
          onClick={() => onManage(leadershipMember)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
        >
          <icons.ui.sliders size={13} />
        </button>
      </div>

      {leader.members.length > 0 ? (
        <ul className="mt-2 ml-5 flex flex-col gap-1.5 border-l border-line pl-3">
          {leader.members.map((member) => {
            const memberName = member.profile?.name ?? 'Membro sem perfil'
            return (
              <li key={member.membership.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg-muted/10 text-[9px] font-bold text-fg-muted">
                  {initials(memberName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-fg">{memberName}</span>
                <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[9px] font-semibold text-fg-dim">
                  {roleLabelFor(member.membership, member.profile, rolesById)}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Vincular a gestor"
                    aria-label={`Vincular ${memberName} a gestor`}
                    disabled={disabled}
                    onClick={() => onAssign(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
                  >
                    <icons.ui.plusCircle size={13} />
                  </button>
                  <button
                    type="button"
                    title="Gerenciar membro"
                    aria-label={`Gerenciar ${memberName}`}
                    disabled={disabled}
                    onClick={() => onManage(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
                  >
                    <icons.ui.sliders size={13} />
                  </button>
                  <button
                    type="button"
                    title="Remover da equipe"
                    aria-label={`Remover ${memberName} da equipe`}
                    disabled={disabled}
                    onClick={() => onUnassign(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                  >
                    <icons.ui.minus size={13} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 ml-5 text-[10px] text-fg-muted">Sem equipe direta ainda.</p>
      )}
    </div>
  )
}

interface PendingRequestsProps {
  requests: CoordinatorRequest[]
  loading: boolean
  failed: boolean
  pending: string | null
  onRetry: () => void
  onApprove: (request: CoordinatorRequest) => void
  onReject: (request: CoordinatorRequest) => void
}

function PendingRequests({
  requests,
  loading,
  failed,
  pending,
  onRetry,
  onApprove,
  onReject,
}: PendingRequestsProps) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Solicitações pendentes
      </p>
      {loading ? (
        <p className="mt-2 inline-flex items-center gap-2 text-[10px] text-fg-muted">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Carregando solicitações...
        </p>
      ) : failed ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[10px] leading-relaxed text-red-500">
            Não foi possível carregar as solicitações desta unidade.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
          >
            Tentar novamente
          </button>
        </div>
      ) : requests.length === 0 ? (
        <p className="mt-2 text-[10px] text-fg-muted">Nenhuma solicitação pendente.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {requests.map((request) => {
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
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  Pendente
                </span>
                <button
                  type="button"
                  onClick={() => onApprove(request)}
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
                  onClick={() => onReject(request)}
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
    </div>
  )
}

interface AssignTarget {
  member: TeamMember
  currentManagerLabel: string
  unit: CoordinatedUnit
}

type ConfirmTarget =
  | { kind: 'suspend'; member: TeamMember }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'reject'; request: CoordinatorRequest }

const CONFIRM_COPY: Record<
  ConfirmTarget['kind'],
  { title: string; message: string; confirmLabel: string }
> = {
  suspend: {
    title: 'Suspender membro?',
    message:
      'O membro perde o acesso à unidade e sai das equipes às quais está vinculado. A restauração não está disponível nesta tela.',
    confirmLabel: 'Suspender',
  },
  remove: {
    title: 'Remover da unidade?',
    message:
      'A membership será marcada como removida e o membro perde o acesso à unidade. O perfil e o usuário permanecem; a ação fica auditada.',
    confirmLabel: 'Remover',
  },
  reject: {
    title: 'Rejeitar solicitação?',
    message:
      'A solicitação pendente será rejeitada e removida. O perfil e o usuário permanecem; a ação fica auditada.',
    confirmLabel: 'Rejeitar',
  },
}

/**
 * RBAC 2.0 (Fases 8.2 + 10): ÁREA DO COORDENADOR com GESTÃO REAL.
 *
 * O escopo continua vindo do servidor (RPCs 047 fail-closed por auth.uid()):
 * unidades → lideranças → equipes. A escrita usa os RPCs escopados
 * (`coordinator_set_manager`, `_approve_/_reject_/_suspend_/_remove_membership`
 * e `_set_role`, 047/065) — a UI NÃO decide autorização: envia apenas ids e
 * reage ao erro com honestidade. Cargos oferecidos = tec/vis/est/opv/lider
 * (nunca adm/coordinator); o Postgres revalida tudo.
 *
 * Leituras não-ativas: os RPCs 047 retornam SOMENTE memberships ativas, então
 * memberships suspensas/removidas saem naturalmente do escopo — por isso não há
 * ação de restaurar nesta fase (o escopo não as enxerga).
 */
export function CoordinatorHome() {
  const navigate = useNavigate()
  const { units, loading, failed, refresh } = useCoordinator()

  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [requestsByUnit, setRequestsByUnit] = useState<Record<string, CoordinatorRequest[]>>({})
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsFailed, setRequestsFailed] = useState(false)

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

  const unitsKey = units.map((u) => u.unitId).join('|')

  const loadRequests = useCallback(async () => {
    const currentUnits = unitsKey ? unitsKey.split('|') : []
    if (currentUnits.length === 0) {
      setRequestsByUnit({})
      setRequestsFailed(false)
      setRequestsLoading(false)
      return
    }
    setRequestsLoading(true)
    setRequestsFailed(false)
    const next: Record<string, CoordinatorRequest[]> = {}
    let anyFailed = false
    for (const unitId of currentUnits) {
      const rows = await getCoordinatorRequests(unitId)
      if (getLastCoordinatorServiceError() !== null) {
        anyFailed = true
        break
      }
      next[unitId] = rows
    }
    setRequestsByUnit(next)
    setRequestsFailed(anyFailed)
    setRequestsLoading(false)
  }, [unitsKey])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const leaderCount = units.reduce((acc, u) => acc + u.leaders.length, 0)
  const memberCount = units.reduce(
    (acc, u) => acc + u.leaders.reduce((a, l) => a + l.members.length, 0),
    0,
  )

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
      } else {
        setConfirmError(getLastCoordinatorServiceError() ?? 'Não foi possível remover o membro.')
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
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              title="Voltar ao início"
            >
              <icons.ui.back size={20} />
            </button>
            <span className="rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              Coordenação
            </span>
          </div>
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-fg">Área do Coordenador</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Gestão entre as unidades sob sua coordenação — dados reais do seu escopo.
            </p>
          </div>
        </header>

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

            <div className="mb-6 flex flex-col gap-3">
              {units.map((unit) => {
                const unitRequests = requestsByUnit[unit.unitId] ?? []
                return (
                  <section key={unit.unitId} className="rounded-2xl border border-line bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-fg">Unidade: {unit.unitName}</p>
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

                    <PendingRequests
                      requests={unitRequests}
                      loading={requestsLoading}
                      failed={requestsFailed}
                      pending={pending}
                      onRetry={() => void loadRequests()}
                      onApprove={(request) => void approveRequest(request)}
                      onReject={(request) => openConfirm({ kind: 'reject', request })}
                    />

                    {unit.leaders.length === 0 ? (
                      <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
                        Nenhuma liderança subordinada nesta unidade ainda.
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
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
                      </div>
                    )}

                    {unitRequests.length > 0 && (
                      <p className="mt-2 text-[10px] leading-relaxed text-fg-muted">
                        Aprovar ativa a membership na unidade; o vínculo a uma equipe é ajustado
                        depois pelo gestor da unidade.
                      </p>
                    )}
                  </section>
                )
              })}
            </div>

            <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
              <p className="text-[10px] leading-relaxed text-fg-muted">
                Nesta tela você aprova/rejeita solicitações, ajusta cargo (nunca adm ou
                coordinator) e o status das memberships da unidade, além de vincular membros a um
                gestor. A criação de memberships segue restrita ao administrador; o Postgres valida
                cada operação.
              </p>
            </div>
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
      </div>
    </div>
  )
}
