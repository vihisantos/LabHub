import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminService } from '../../../core/auth/adminService'
import type { User } from '../../../core/auth/types'
import { useAuth } from '../../../core/auth/AuthContext'
import { workspaceService } from '../../../core/workspaces/service'
import type { Workspace } from '../../../core/workspaces/types'
import { useRoles } from '../../../core/permissions/usePermissions'
import { roleBadgeClass, APP_ACCESS_LABELS } from '../../../core/permissions/types'
import type { AppAccessOverride } from '../../../core/permissions/types'
import { logService } from '../../../core/logs/service'
import { appRegistry } from '../../../appRegistry'
import { ApproveUserModal } from '../components/ApproveUserModal'
import { PersonAvatar, statusStyle, formatAge } from '../components/personShared'
import { icons } from '../../../lib/icons'

const ACTION_META: Record<string, { icon: keyof typeof icons.ui; color: string; label: string }> = {
  created: { icon: 'plus', color: 'text-emerald-500 bg-emerald-500/10', label: 'Criou' },
  updated: { icon: 'edit', color: 'text-blue-500 bg-blue-500/10', label: 'Atualizou' },
  deleted: { icon: 'trash', color: 'text-red-500 bg-red-500/10', label: 'Removeu' },
  status_changed: { icon: 'dot', color: 'text-amber-500 bg-amber-500/10', label: 'Alterou status de' },
  viewed: { icon: 'dot', color: 'text-slate-500 bg-slate-500/10', label: 'Visualizou' },
  exported: { icon: 'download', color: 'text-violet-500 bg-violet-500/10', label: 'Exportou' },
}

export function UserDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user: currentUser } = useAuth()
  const { roles: roleList } = useRoles()
  const editableApps = appRegistry.filter((app) => app.id !== 'admin')

  const [users, setUsers] = useState<User[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [approvingViaModal, setApprovingViaModal] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isSuperAdmin = !!currentUser?.is_super_admin

  const load = useCallback(async () => {
    setLoading(true)
    const [u, w] = await Promise.all([
      adminService.listAllProfiles(),
      workspaceService.syncFromSupabase(),
    ])
    setUsers(u)
    setWorkspaces(w)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const person = useMemo(
    () => users.find((u) => u.id === id) ?? null,
    [users, id],
  )

  const activity = useMemo(() => {
    if (!person) return []
    return logService.getByUser(person.id).slice(0, 15)
  }, [person])

  const role = roleList.find((r) => r.id === person?.roleId)

  const scopeLabel = useMemo(() => {
    if (!person) return null
    const ids = person.workspace_ids || []
    if (ids.length === 0) return 'Sem workspace atribuído'
    const names = ids
      .map((wid) => workspaces.find((w) => w.id === wid)?.name)
      .filter(Boolean)
    return names.join(', ') || 'Workspace não encontrado'
  }, [person, workspaces])

  async function handleApprove(
    userId: string,
    roleId: string,
    appAccess: Record<string, AppAccessOverride>,
    workspaceIds: string[],
  ): Promise<boolean> {
    setSaving(true)
    const success = await adminService.approveUser(userId, {
      roleId,
      app_access: appAccess,
      workspace_ids: workspaceIds,
    })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId
        ? { ...u, status: 'active', roleId, workspace_ids: workspaceIds }
        : u))
      setFeedback({ type: 'success', message: 'Acesso concedido' })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao aprovar' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
    return success
  }

  async function handleReject() {
    if (!person) return
    setSaving(true)
    const success = await adminService.rejectUser(person.id)
    if (success) {
      setFeedback({ type: 'success', message: 'Solicitação recusada e removida' })
      setTimeout(() => navigate('/admin/requests'), 900)
    } else {
      setFeedback({ type: 'error', message: 'Erro ao recusar solicitação' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleRoleChange(userId: string, newRoleId: string) {
    setSaving(true)
    const success = await adminService.updateUserProfile(userId, { roleId: newRoleId })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, roleId: newRoleId } : u))
      setFeedback({ type: 'success', message: `Cargo alterado para ${roleList.find((r) => r.id === newRoleId)?.name ?? 'novo cargo'}` })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao atualizar cargo' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function toggleWorkspace(userId: string, workspaceId: string) {
    if (!person) return
    setSaving(true)
    const current = person.workspace_ids || []
    const has = current.includes(workspaceId)
    const newIds = has ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    const success = await adminService.updateUserWorkspaces(userId, newIds)
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, workspace_ids: newIds } : u))
      setFeedback({ type: 'success', message: has ? 'Acesso removido' : 'Acesso concedido' })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao atualizar workspaces' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleAppAccessChange(userId: string, appId: string, override: AppAccessOverride | null) {
    if (!person) return
    setSaving(true)
    const current = { ...(person.app_access || {}) }
    if (override === null) delete current[appId]
    else current[appId] = override
    const success = await adminService.updateUserProfile(userId, { app_access: current })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, app_access: current } : u))
      setFeedback({ type: 'success', message: override === null ? 'Acesso restaurado para o padrão do cargo' : 'Acesso individual atualizado' })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao atualizar acesso' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  if (!person) {
    return (
      <div className="rounded-xl bg-card p-10 text-center">
        <p className="text-sm font-medium text-fg-muted">Pessoa não encontrada.</p>
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="mt-3 text-xs font-semibold text-blue-500 hover:text-blue-400"
        >
          Voltar para Pessoas
        </button>
      </div>
    )
  }

  const st = statusStyle(person.status)
  const isPending = person.status === 'pending'
  const isAdminAbs = !!person.is_super_admin

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={18} />
        </button>
        <h1 className="text-xl font-black tracking-tight text-fg truncate">Pessoa</h1>
      </div>

      {feedback && (
        <div className={`rounded-xl p-3 text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Card da pessoa */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          <PersonAvatar user={person} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-lg font-bold text-fg">{person.name}</p>
              {isAdminAbs && (
                <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-500">
                  ADMIN
                </span>
              )}
            </div>
            <p className="truncate text-xs text-fg-muted">{person.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </span>
              {role && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass(role)}`}>
                  {role.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-4 text-[11px]">
          <div className="flex justify-between">
            <span className="text-fg-muted">Membro desde</span>
            <span className="text-fg font-medium">
              {new Date(person.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Escopo</span>
            <span className="text-fg font-medium truncate pl-4">{scopeLabel}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <icons.ui.edit size={14} />
              {expanded ? 'Concluído' : 'Editar'}
            </button>
          )}
          {isPending && (
            <button
              type="button"
              onClick={() => setApprovingViaModal(true)}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <icons.ui.userCheck size={14} />
              Aprovar
            </button>
          )}
        </div>
      </div>

      {/* Ações de aprovação p/ pendente */}
      {isPending && (
        <div className="rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <icons.ui.inbox size={16} />
            </div>
            <p className="text-xs text-fg">Esta pessoa aguarda aprovação de acesso.</p>
          </div>
          <button
            type="button"
            onClick={handleReject}
            disabled={saving}
            className="mt-3 w-full rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            Recusar solicitação
          </button>
        </div>
      )}

      {/* Acesso */}
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-xs font-semibold text-fg-muted mb-3">Acesso por aplicativo</h2>
        {isAdminAbs ? (
          <p className="rounded-lg bg-purple-500/5 px-3 py-2 text-[11px] text-purple-500">
            <icons.ui.shield size={10} className="inline mr-1" />
            Admin absoluto — acesso total a todos os workspaces e aplicativos.
          </p>
        ) : (
          <div className="space-y-2">
            {!role ? (
              <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
                Sem cargo atribuído — sem acesso a aplicativos.
              </p>
            ) : (
              editableApps.map((app) => {
                const override = person.app_access?.[app.id] ?? null
                const roleLevel = role.appAccess?.[app.id]
                const effective = override ?? roleLevel
                return (
                  <div key={app.id} className="flex items-center gap-3 rounded-xl border border-line bg-input/30 px-3 py-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${effective ? '' : 'opacity-40 grayscale'}`}
                      style={{ backgroundColor: app.color + '15', color: app.color }}
                    >
                      <app.icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg">{app.name}</p>
                      <p className="text-[10px] text-fg-muted">
                        {effective ? APP_ACCESS_LABELS[effective] : 'Sem acesso'}
                        {override && override !== roleLevel && ' · override'}
                      </p>
                    </div>
                    {expanded && isSuperAdmin && !isAdminAbs && (
                      <select
                        value={override ?? 'inherit'}
                        onChange={(e) => {
                          const v = e.target.value
                          handleAppAccessChange(person.id, app.id, v === 'inherit' ? null : (v as AppAccessOverride))
                        }}
                        disabled={saving}
                        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                      >
                        <option value="inherit">Padrão</option>
                        <option value="none">Sem</option>
                        <option value="dash">Dash</option>
                        <option value="read">Leitura</option>
                        <option value="full">Total</option>
                      </select>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Administração */}
      {!isAdminAbs && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h2 className="text-xs font-semibold text-fg-muted mb-3">Administração</h2>

          {expanded && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Cargo</p>
                <div className="flex flex-wrap gap-1.5">
                  {roleList.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleRoleChange(person.id, r.id)}
                      disabled={saving}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                        r.id === person.roleId
                          ? `${roleBadgeClass(r)} ring-1 ring-slate-500/30`
                          : 'bg-input text-fg-muted hover:text-fg'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-fg-muted mb-1.5">
                  Workspaces ({person.workspace_ids?.length ?? 0} de {workspaces.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {workspaces.length === 0 ? (
                    <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
                      Nenhum campus cadastrado.
                    </p>
                  ) : (
                    workspaces.map((ws) => {
                      const hasAccess = (person.workspace_ids || []).includes(ws.id)
                      return (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => toggleWorkspace(person.id, ws.id)}
                          disabled={saving}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
                            hasAccess
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/40'
                              : 'bg-input text-fg-muted hover:text-fg'
                          }`}
                        >
                          {hasAccess ? <><icons.ui.check size={10} className="inline mr-1" />{ws.name}</> : <><icons.ui.plus size={10} className="inline mr-1" />{ws.name}</>}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {!expanded && (
            <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
              Toque em "Editar" acima para alterar cargo e workspaces.
            </p>
          )}
        </div>
      )}

      {/* Atividade */}
      <div className="rounded-xl bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-xs font-semibold text-fg-muted">Atividade</h2>
          <button
            type="button"
            onClick={() => navigate('/admin/logs')}
            className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
          >
            Ver auditoria
          </button>
        </div>
        <div className="scrollbar-thin max-h-80 divide-y divide-line overflow-y-auto">
          {activity.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-fg-muted">Nenhuma atividade registrada.</p>
            </div>
          ) : (
            activity.map((log) => {
              const meta = ACTION_META[log.action] ?? { icon: 'dot', color: 'bg-input text-fg-muted', label: log.action }
              const Icon = icons.ui[meta.icon]
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg leading-relaxed">
                      {meta.label} <span className="font-medium text-fg">{log.entityLabel}</span>
                    </p>
                    <p className="text-[10px] text-fg-dim mt-0.5">{formatAge(log.timestamp)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {approvingViaModal && person && (
        <ApproveUserModal
          user={person}
          workspaces={workspaces}
          onClose={() => setApprovingViaModal(false)}
          onConfirm={(roleId, appAccess, workspaceIds) =>
            handleApprove(person.id, roleId, appAccess, workspaceIds)
          }
        />
      )}
    </div>
  )
}
