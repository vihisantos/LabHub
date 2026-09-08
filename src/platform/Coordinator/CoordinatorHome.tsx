import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { permissionService } from '../../core/permissions/service'
import {
  getLastCoordinatorServiceError,
  setCoordinatorManager,
  type CoordinatedLeader,
  type CoordinatedUnit,
} from '../../core/permissions/coordinatorService'
import type { TeamMember, TeamMemberProfile } from '../../core/permissions/membership'
import { icons } from '../../lib/icons'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function roleLabel(profile: TeamMemberProfile | null | undefined): string {
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
              A criação de memberships e a alteração de cargos continuam restritas ao administrador.
              O Postgres valida este vínculo.
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

interface LeaderBlockProps {
  leader: CoordinatedLeader
  disabled: boolean
  onAssign: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
}

function LeaderBlock({ leader, disabled, onAssign, onRemove }: LeaderBlockProps) {
  const name = leader.profile?.name ?? 'Membro sem perfil'
  return (
    <div
      key={leader.leadership.id}
      className="rounded-xl border border-line bg-surface px-3 py-2.5"
    >
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
          {roleLabel(leader.profile)}
        </span>
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
                  {roleLabel(member.profile)}
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
                    title="Remover da equipe"
                    aria-label={`Remover ${memberName} da equipe`}
                    disabled={disabled}
                    onClick={() => onRemove(member)}
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

interface AssignTarget {
  member: TeamMember
  currentManagerLabel: string
  unit: CoordinatedUnit
}

/**
 * RBAC 2.0 (Fase 8.2): ÁREA DO COORDENADOR com GESTÃO REAL da relação de
 * gestão.
 *
 * O escopo continua vindo do servidor (RPCs 047 fail-closed por auth.uid()):
 * unidades → lideranças → equipes. A escrita usa `coordinator_set_manager`
 * (SECURITY DEFINER, autorização explícita) re-parentando `managed_by` — a UI
 * NÃO decide autorização e não tem regra própria: apenas oferece como gestor o
 * mesmo conjunto que o RPC aceita (coordenação da unidade OU liderança já
 * subordinada direta), deixa o Postgres (RPC 047 + guard 046) validar e mostra
 * o erro com honestidade quando ele negar.
 *
 * Sem criação de memberships e sem alteração de cargos: só `managed_by`.
 */
export function CoordinatorHome() {
  const navigate = useNavigate()
  const { units, loading, failed, refresh } = useCoordinator()

  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sheetTarget, setSheetTarget] = useState<AssignTarget | null>(null)
  const [sheetManager, setSheetManager] = useState<string | null>(null)
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

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
      await refresh()
    } else {
      setSheetError(
        getLastCoordinatorServiceError() ?? 'Não foi possível vincular o membro a este gestor.',
      )
    }
    setSheetBusy(false)
    setPending(null)
  }

  const confirmRemove = async (member: TeamMember) => {
    setPending(`remove-${member.membership.id}`)
    setActionError(null)
    const ok = await setCoordinatorManager(member.membership.id, null)
    if (ok) {
      await refresh()
    } else {
      setActionError(
        getLastCoordinatorServiceError() ?? 'Não foi possível remover o membro da equipe.',
      )
    }
    setPending(null)
  }

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
              {units.map((unit) => (
                <section
                  key={unit.unitId}
                  className="rounded-2xl border border-line bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-fg">Unidade: {unit.unitName}</p>
                    <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                      {unit.leaders.length} liderança{unit.leaders.length !== 1 ? 's' : ''}
                    </span>
                  </div>

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
                          disabled={pending !== null}
                          onAssign={(member) => openAssignSheet(unit, leader, member)}
                          onRemove={(member) => void confirmRemove(member)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>

            <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
              <p className="text-[10px] leading-relaxed text-fg-muted">
                Nesta tela você vincula membros a um gestor da unidade (ou direto à coordenação) e
                remove membros da equipe. A criação de memberships e a alteração de cargos seguem
                restritas ao administrador; o Postgres valida cada vínculo.
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

        <footer className="mt-6 text-center">
          <p className="text-[10px] text-fg-dim">
            Área de liderança — disponível apenas para o cargo Coordenador Multiunidades.
          </p>
        </footer>
      </div>
    </div>
  )
}