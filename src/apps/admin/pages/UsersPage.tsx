import { useState, useEffect, useCallback } from 'react'
import { adminService } from '../../../core/auth/adminService'
import type { User, UserRole, Accent, ThemeVariant } from '../../../core/auth/types'
import { ROLE_LABELS, ROLE_COLORS } from '../../../core/auth/types'
import { workspaceService } from '../../../core/workspaces/service'
import type { Workspace } from '../../../core/workspaces/types'
import { themeStore } from '../../../core/theme/store'
import { useRoles } from '../../../core/permissions/usePermissions'
import { APP_ACCESS_LABELS } from '../../../core/permissions/types'
import type { AppAccessOverride } from '../../../core/permissions/types'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'
import { uploadToCloudinary } from '../../../lib/cloudinary'

const ROLES: UserRole[] = ['admin', 'technician', 'viewer']

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { value: 'cyan', label: 'Ciano', color: '#06b6d4' },
  { value: 'blue', label: 'Azul', color: '#3b82f6' },
  { value: 'purple', label: 'Roxo', color: '#a855f7' },
]

const THEMES: { value: ThemeVariant; label: string }[] = [
  { value: 'dark', label: 'Escuro' },
  { value: 'dim', label: 'Sutil' },
  { value: 'light', label: 'Claro' },
]

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null)
  const { roles: roleList } = useRoles()
  const editableApps = appRegistry.filter((app) => app.id !== 'admin')

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

  const pendingUsers = users.filter((u) => u.status === 'pending')
  const activeUsers = users.filter((u) => u.status !== 'pending')

  const filteredUsers = activeUsers.filter((u) => {
    const matchesSearch = !search
      || u.name.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  async function handleApprove(userId: string) {
    setSaving(true)
    const success = await adminService.approveUser(userId)
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: 'active' } : u))
      setFeedback({ type: 'success', message: 'Usuário aprovado!' })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao aprovar usuário' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleReject(userId: string) {
    setSaving(true)
    const success = await adminService.rejectUser(userId)
    if (success) {
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      setFeedback({ type: 'success', message: 'Usuário rejeitado e removido' })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao rejeitar usuário' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleAvatarUpload(userId: string, file: File) {
    setUploadingAvatar(userId)
    try {
      const url = await uploadToCloudinary(file, 'avatars')
      const success = await adminService.updateUserProfile(userId, { avatar: url })
      if (success) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, avatar: url } : u))
        setFeedback({ type: 'success', message: 'Avatar atualizado!' })
      }
    } catch (err) {
      console.error('Erro ao upload avatar:', err)
      setFeedback({ type: 'error', message: 'Erro ao fazer upload da foto' })
    }
    setUploadingAvatar(null)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    setSaving(true)
    const success = await adminService.updateUserProfile(userId, { role: newRole })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
      setFeedback({ type: 'success', message: `Role alterada para ${ROLE_LABELS[newRole]}` })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao atualizar role' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleAccentChange(userId: string, accent: Accent) {
    const success = await adminService.updateUserProfile(userId, { accent })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, accent } : u))
    }
  }

  async function handleThemeChange(userId: string, theme_variant: ThemeVariant) {
    const success = await adminService.updateUserProfile(userId, { theme_variant })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, theme_variant } : u))
    }
  }

  async function toggleWorkspace(userId: string, workspaceId: string) {
    setSaving(true)
    const user = users.find((u) => u.id === userId)
    if (!user) return
    const current = user.workspace_ids || []
    const has = current.includes(workspaceId)
    const newIds = has
      ? current.filter((id) => id !== workspaceId)
      : [...current, workspaceId]
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

  function previewAccent(accent: Accent) {
    themeStore.previewAccent(accent)
  }

  async function handleAppAccessChange(userId: string, appId: string, override: AppAccessOverride | null) {
    setSaving(true)
    const user = users.find((u) => u.id === userId)
    if (!user) {
      setSaving(false)
      return
    }
    const current = { ...(user.app_access || {}) }
    if (override === null) {
      delete current[appId]
    } else {
      current[appId] = override
    }
    const success = await adminService.updateUserProfile(userId, { app_access: current })
    if (success) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, app_access: current } : u))
      setFeedback({
        type: 'success',
        message: override === null ? 'Acesso restaurado para o padrão do cargo' : 'Acesso individual atualizado',
      })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao atualizar acesso' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  const userCounts = {
    total: users.length,
    pending: pendingUsers.length,
    admin: users.filter((u) => u.role === 'admin').length,
    technician: users.filter((u) => u.role === 'technician').length,
    viewer: users.filter((u) => u.role === 'viewer').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Usuários</h2>
        <p className="mt-1 text-sm text-fg-muted">{userCounts.total} usuário{userCounts.total !== 1 ? 's' : ''} no sistema</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] text-center">
          <p className="text-lg font-bold text-fg">{userCounts.total}</p>
          <p className="text-[10px] text-fg-muted">Total</p>
        </div>
        {userCounts.pending > 0 && (
          <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] text-center ring-1 ring-amber-500/30">
            <p className="text-lg font-bold text-amber-500">{userCounts.pending}</p>
            <p className="text-[10px] text-amber-500/70">Pendentes</p>
          </div>
        )}
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] text-center">
          <p className="text-lg font-bold text-fg">{userCounts.admin}</p>
          <p className="text-[10px] text-fg-muted">Admins</p>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] text-center">
          <p className="text-lg font-bold text-fg">{userCounts.technician}</p>
          <p className="text-[10px] text-fg-muted">Técnicos</p>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] text-center">
          <p className="text-lg font-bold text-fg">{userCounts.viewer}</p>
          <p className="text-[10px] text-fg-muted">Visualizadores</p>
        </div>
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

      {/* Pending Users Section */}
      {pendingUsers.length > 0 && (
        <div className="rounded-xl bg-card shadow-[var(--shadow-card)] overflow-hidden">
          <div className="border-b border-line px-4 py-3 flex items-center gap-2">
            <icons.ui.inbox size={14} className="text-amber-500" />
            <h3 className="text-xs font-semibold text-fg-muted">
              Aprovações Pendentes ({pendingUsers.length})
            </h3>
          </div>
          <div className="divide-y divide-line">
            {pendingUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <icons.ui.user size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{u.name}</p>
                  <p className="text-[11px] text-fg-muted">{u.email}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApprove(u.id)}
                    disabled={saving}
                    className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(u.id)}
                    disabled={saving}
                    className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full rounded-xl border border-line bg-surface pl-9 pr-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-slate-500 focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-slate-500 focus:outline-none"
        >
          <option value="all">Todos</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl bg-card p-8 text-center">
            <p className="text-sm text-fg-muted">Nenhum usuário encontrado</p>
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isOpen = editingUser === u.id
            const accentColor = ACCENTS.find((a) => a.value === u.accent)?.color || '#10b981'
            const userWsNames = (u.workspace_ids || [])
              .map((id) => workspaces.find((w) => w.id === id))
              .filter(Boolean) as Workspace[]
            const isAdminUser = u.role === 'admin'

            return (
              <div key={u.id} className="rounded-xl bg-card shadow-[var(--shadow-card)] overflow-hidden transition-all">
                <div className="flex items-center gap-3 p-4">
                  {/* Avatar */}
                  <div className="relative group">
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: accentColor + '15', color: accentColor }}
                      >
                        <icons.ui.user size={18} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) handleAvatarUpload(u.id, file)
                        }
                        input.click()
                      }}
                      disabled={uploadingAvatar === u.id}
                      className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Alterar foto"
                    >
                      {uploadingAvatar === u.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <icons.ui.camera size={14} className="text-white" />
                      )}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-fg truncate">{u.name}</p>
                      {isAdminUser && (
                        <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-500">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-fg-muted truncate">{u.email}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingUser(isOpen ? null : u.id)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80 ${ROLE_COLORS[u.role]}`}
                  >
                    {ROLE_LABELS[u.role]}
                    <icons.ui.chevronDown size={10} className="ml-1 inline" />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-line px-4 py-3 space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Role</p>
                      <div className="flex gap-1.5">
                        {ROLES.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => handleRoleChange(u.id, role)}
                            disabled={saving || role === u.role}
                            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                              role === u.role
                                ? `${ROLE_COLORS[role]} ring-1 ring-slate-500/30`
                                : 'bg-input text-fg-muted hover:text-fg'
                            } disabled:opacity-50`}
                          >
                            {saving && role !== u.role ? '...' : ROLE_LABELS[role]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Cor do app</p>
                      <div className="flex gap-2">
                        {ACCENTS.map((a) => (
                          <button
                            key={a.value}
                            type="button"
                            onClick={() => handleAccentChange(u.id, a.value)}
                            onMouseEnter={() => previewAccent(a.value)}
                            onMouseLeave={() => themeStore.resetAccent()}
                            disabled={saving}
                            className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                              u.accent === a.value
                                ? 'ring-2 ring-offset-1 ring-offset-card'
                                : 'opacity-60 hover:opacity-100'
                            } disabled:opacity-50`}
                            style={{ backgroundColor: a.color + '15', color: a.color }}
                            title={a.label}
                          >
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color }} />
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Tema</p>
                      <div className="flex gap-1.5">
                        {THEMES.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => handleThemeChange(u.id, t.value)}
                            disabled={saving}
                            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                              u.theme_variant === t.value
                                ? 'bg-slate-500/20 text-fg ring-1 ring-slate-500/30'
                                : 'bg-input text-fg-muted hover:text-fg'
                            } disabled:opacity-50`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Workspace section - only show for non-admin users */}
                    {!isAdminUser && (
                      <div>
                        <p className="text-[10px] font-semibold text-fg-muted mb-1.5">
                          Workspaces ({userWsNames.length} de {workspaces.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {workspaces.map((ws) => {
                            const hasAccess = (u.workspace_ids || []).includes(ws.id)
                            return (
                              <button
                                key={ws.id}
                                type="button"
                                onClick={() => toggleWorkspace(u.id, ws.id)}
                                disabled={saving}
                                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                                  hasAccess
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                                    : 'bg-input text-fg-muted hover:text-fg'
                                } disabled:opacity-50`}
                              >
                                {hasAccess ? (
                                  <><icons.ui.check size={10} className="inline mr-1" />{ws.name}</>
                                ) : (
                                  <><icons.ui.plus size={10} className="inline mr-1" />{ws.name}</>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Per-app access override - only for non-admin users */}
                    {!isAdminUser && (
                      <div>
                        <p className="text-[10px] font-semibold text-fg-muted mb-1.5">
                          Acesso por aplicativo (sobrescreve o cargo)
                        </p>
                        <div className="space-y-1.5">
                          {editableApps.map((app) => {
                            const current = u.app_access?.[app.id] ?? null
                            const roleForUser = roleList.find((r) => r.key === u.role)
                            const roleLevel = roleForUser?.appAccess?.[app.id]
                            return (
                              <div key={app.id} className="flex items-center gap-3 rounded-lg border border-line px-2.5 py-2">
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${current === 'none' ? 'opacity-40 grayscale' : ''}`}
                                  style={{ backgroundColor: app.color + '15', color: app.color }}
                                >
                                  <app.icon size={15} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-fg">{app.name}</p>
                                  <p className="text-[10px] text-fg-dim">
                                    Cargo: {roleLevel ? APP_ACCESS_LABELS[roleLevel] : 'Sem acesso'}
                                  </p>
                                </div>
                                <select
                                  value={current ?? 'inherit'}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    handleAppAccessChange(u.id, app.id, v === 'inherit' ? null : (v as AppAccessOverride))
                                  }}
                                  disabled={saving}
                                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                                >
                                  <option value="inherit">Padrão do cargo</option>
                                  <option value="none">Sem acesso</option>
                                  <option value="dash">Dashboard</option>
                                  <option value="read">Só leitura</option>
                                  <option value="full">Acesso total</option>
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {isAdminUser && (
                      <div className="rounded-lg bg-purple-500/5 px-3 py-2">
                        <p className="text-[10px] font-medium text-purple-500">
                          <icons.ui.shield size={10} className="inline mr-1" />
                          Administrador — acesso total a todos os workspaces e dados
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
