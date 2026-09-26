import { useEffect, useMemo, useState } from 'react'
import type { User } from '../../../core/auth/types'
import type { Workspace } from '../../../core/workspaces/types'
import type { Role } from '../../../core/permissions/types'
import type { Membership } from '../../../core/permissions/membership'
import { SLUG_TO_ROLE_ID, assignableRoleIds, LEADERSHIP_SLUGS } from '../../../core/permissions/membership'
import { adminService } from '../../../core/auth/adminService'
import { membershipService } from '../../../core/memberships/service'
import { icons } from '../../../lib/icons'

/**
 * Configuração de acesso PÓS-APROVAÇÃO (PR #284) — por unidade, sem propagação
 * global de cargo.
 *
 * - Conta pending: só informa (aprovar antes de configurar). Defesa em
 *   profundidade: o servidor (RPC 072) também rejeita membership p/ pending.
 * - Conta active: cards por unidade (cargo + responsável + remover) e
 *   [+ Adicionar unidade]. Cada membership tem seu próprio cargo
 *   (Unidade A → Técnico, Unidade B → Líder).
 * - `managed_by` nunca é tocado pelo upsert de cargo (preservado); escrita
 *   dedicada via admin_set_manager (guarda estrutural no trigger 045).
 * - Auditoria automática via trigger trg_app_audit_memberships (054/065).
 */

interface AccessConfigurationSectionProps {
  person: User
  /** Todos os perfis (com memberships) — nomes dos responsáveis e candidatos. */
  people: User[]
  workspaces: Workspace[]
  roles: Role[]
  /** Recarrega as memberships da pessoa após cada mutação. */
  onChanged: () => Promise<void>
}

export function AccessConfigurationSection({
  person,
  people,
  workspaces,
  roles,
  onChanged,
}: AccessConfigurationSectionProps) {
  const [roleInfo, setRoleInfo] = useState<Map<string, { slug: string; name: string }>>(new Map())
  const [rolesLoading, setRolesLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addWorkspaceId, setAddWorkspaceId] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const activeMemberships = useMemo(
    () => (person.memberships ?? []).filter((m) => m.status === 'active'),
    [person.memberships],
  )

  const assignableRoles = useMemo(
    () => roles.filter((r) => assignableRoleIds([r.id]).length > 0),
    [roles],
  )

  const addableWorkspaces = useMemo(
    () => workspaces.filter((w) => !activeMemberships.some((m) => m.workspace_id === w.id)),
    [workspaces, activeMemberships],
  )

  // Todas as memberships (qualquer pessoa) — candidatos a responsável e nomes.
  const allMemberships = useMemo(
    () => people.flatMap((u) => (u.memberships ?? []).map((m) => ({ membership: m, owner: u }))),
    [people],
  )

  // Nomes/cargos das memberships (uma query para a página inteira).
  useEffect(() => {
    let cancelled = false
    setRolesLoading(true)
    const ids = allMemberships.map(({ membership }) => membership.role_id)
    membershipService
      .resolveRoleInfo(ids)
      .then((map) => {
        if (!cancelled) setRoleInfo(map)
      })
      .catch(() => {
        if (!cancelled) setRoleInfo(new Map())
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [allMemberships])

  function roleNameOf(membership: Membership): string {
    return roleInfo.get(membership.role_id)?.name ?? (rolesLoading ? '…' : 'Cargo desconhecido')
  }

  function roleIdOf(membership: Membership): string {
    const slug = roleInfo.get(membership.role_id)?.slug
    return (slug && SLUG_TO_ROLE_ID[slug]) ?? ''
  }

  function workspaceName(workspaceId: string): string {
    return workspaces.find((w) => w.id === workspaceId)?.name ?? 'Unidade'
  }

  function managerLabel(membership: Membership): string {
    if (!membership.managed_by) return 'Sem responsável'
    const found = allMemberships.find(({ membership: m }) => m.id === membership.managed_by)
    if (!found) return 'Responsável removido'
    return `${found.owner.name} · ${roleNameOf(found.membership)}`
  }

  function candidatesFor(membership: Membership): { membership: Membership; ownerName: string }[] {
    // Só cargos de liderança podem gerenciar (trigger 045+046 — a UI oferece,
    // o servidor decide). O próprio membro nunca é candidato.
    return allMemberships
      .filter(
        ({ membership: m }) =>
          m.workspace_id === membership.workspace_id && m.status === 'active' && m.id !== membership.id,
      )
      .filter(({ membership: m }) => {
        const slug = roleInfo.get(m.role_id)?.slug
        return !!slug && (LEADERSHIP_SLUGS as readonly string[]).includes(slug)
      })
      .map(({ membership: m, owner }) => ({ membership: m, ownerName: owner.name }))
  }

  function notify(type: 'success' | 'error', message: string) {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 3000)
  }

  async function runAction(key: string, fn: () => Promise<unknown>, okMessage: string, errMessage: string) {
    setBusy(key)
    try {
      const result = await fn()
      if (result === null || result === false) {
        notify('error', errMessage)
      } else {
        await onChanged()
        notify('success', okMessage)
      }
    } catch {
      notify('error', errMessage)
    } finally {
      setBusy(null)
    }
  }

  async function handleRoleChange(membership: Membership, newRoleId: string) {
    if (!newRoleId || newRoleId === roleIdOf(membership)) return
    await runAction(
      `role:${membership.id}`,
      () => adminService.setMembership(person.id, membership.workspace_id, newRoleId),
      'Cargo atualizado',
      'Erro ao atualizar cargo',
    )
  }

  async function handleRemove(membership: Membership) {
    const wsName = workspaceName(membership.workspace_id)
    if (!window.confirm(`Remover o acesso de ${person.name} à unidade "${wsName}"?`)) return
    await runAction(
      `remove:${membership.id}`,
      () => adminService.removeMembership(person.id, membership.workspace_id),
      'Acesso removido',
      'Erro ao remover acesso',
    )
  }

  async function handleManager(membership: Membership, managerMembershipId: string) {
    const next = managerMembershipId === '' ? null : managerMembershipId
    const current = membership.managed_by ?? null
    if (next === current) return
    await runAction(
      `manager:${membership.id}`,
      () => adminService.setMembershipManager(person.id, membership.workspace_id, next),
      'Responsável atualizado',
      'Erro ao atualizar responsável',
    )
  }

  function openAdd() {
    const defaultRole = roles.find((r) => r.isDefault && assignableRoleIds([r.id]).length > 0)
      ?? assignableRoles[0]
    setAddWorkspaceId(addableWorkspaces[0]?.id ?? '')
    setAddRoleId(defaultRole?.id ?? '')
    setAddOpen(true)
  }

  async function handleAdd() {
    if (!addWorkspaceId || !addRoleId) return
    await runAction(
      'add',
      () => adminService.setMembership(person.id, addWorkspaceId, addRoleId),
      'Unidade adicionada',
      'Erro ao adicionar unidade',
    )
    setAddOpen(false)
  }

  // Defesa em profundidade: sem conta ativa, sem controles (o servidor
  // também rejeita — RPC 072 exige profiles.status = 'active').
  if (person.status !== 'active') {
    return (
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-xs font-semibold text-fg-muted mb-2">Configuração de acesso</h2>
        <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
          Aprove a conta antes de configurar unidades e permissões.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <h2 className="text-xs font-semibold text-fg-muted mb-3">Configuração de acesso</h2>

      {feedback && (
        <div className={`mb-3 rounded-xl p-3 text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {feedback.message}
        </div>
      )}

      {activeMemberships.length === 0 && !addOpen && (
        <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
          Nenhuma unidade configurada ainda.
        </p>
      )}

      <div className="space-y-2">
        {activeMemberships.map((m) => {
          const currentRoleId = roleIdOf(m)
          const currentRoleName = roleNameOf(m)
          const candidates = candidatesFor(m)
          return (
            <div key={m.id} className="rounded-xl border border-line bg-input/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-fg">{workspaceName(m.workspace_id)}</p>
                <button
                  type="button"
                  onClick={() => handleRemove(m)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-fg-dim transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                >
                  {busy === `remove:${m.id}` ? 'Removendo…' : 'Remover'}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-fg-muted">Cargo</span>
                  <select
                    aria-label={`Cargo em ${workspaceName(m.workspace_id)}`}
                    value={currentRoleId}
                    onChange={(e) => handleRoleChange(m, e.target.value)}
                    disabled={busy !== null}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                  >
                    {currentRoleId === '' && (
                      <option value="" disabled>
                        {currentRoleName}
                      </option>
                    )}
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-fg-muted">Responsável</span>
                  <select
                    aria-label={`Responsável em ${workspaceName(m.workspace_id)}`}
                    value={m.managed_by ?? ''}
                    onChange={(e) => handleManager(m, e.target.value)}
                    disabled={busy !== null}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                    title={managerLabel(m)}
                  >
                    <option value="">Sem responsável</option>
                    {candidates.map(({ membership: c, ownerName }) => (
                      <option key={c.id} value={c.id}>
                        {ownerName} · {roleNameOf(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )
        })}
      </div>

      {addOpen ? (
        <div className="mt-2 space-y-2 rounded-xl border border-line bg-input/30 px-3 py-2.5">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-fg-muted">Unidade</span>
            <select
              value={addWorkspaceId}
              onChange={(e) => setAddWorkspaceId(e.target.value)}
              disabled={busy !== null}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
            >
              {addableWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-fg-muted">Cargo na unidade</span>
            <select
              value={addRoleId}
              onChange={(e) => setAddRoleId(e.target.value)}
              disabled={busy !== null}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
            >
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              disabled={busy !== null}
              className="flex-1 rounded-lg bg-input py-2 text-[11px] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy !== null || !addWorkspaceId || !addRoleId}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'add' ? 'Adicionando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          disabled={busy !== null || addableWorkspaces.length === 0 || assignableRoles.length === 0}
          title={
            addableWorkspaces.length === 0
              ? 'Todas as unidades já configuradas'
              : assignableRoles.length === 0
                ? 'Nenhum cargo atribuível'
                : undefined
          }
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-transparent px-3 py-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-emerald-500/40 hover:text-emerald-500 disabled:opacity-50"
        >
          <icons.ui.plus size={14} />
          Adicionar unidade
        </button>
      )}
    </div>
  )
}
