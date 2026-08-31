import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminService } from '../../../core/auth/adminService'
import type { User } from '../../../core/auth/types'
import { useAuth } from '../../../core/auth/AuthContext'
import { workspaceService } from '../../../core/workspaces/service'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import type { Workspace } from '../../../core/workspaces/types'
import { useRoles } from '../../../core/permissions/usePermissions'
import { roleBadgeClass } from '../../../core/permissions/types'
import { ApproveUserModal } from '../components/ApproveUserModal'
import { PersonAvatar, statusStyle } from '../components/personShared'
import { icons } from '../../../lib/icons'

type Filter = 'all' | 'active' | 'pending' | 'admin'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'admin', label: 'Admin' },
]

export function UsersPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const isSuperAdmin = !!currentUser?.is_super_admin
  const [users, setUsers] = useState<User[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [approvingUser, setApprovingUser] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const { roles: roleList } = useRoles()
  const { workspace } = useWorkspace()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [u, w] = await Promise.all([
      adminService.listAllProfiles(),
      workspaceService.syncFromSupabase(),
    ])
    setUsers(u)
    setWorkspaces(w)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Polling: mantém a lista atualizada (aprovações e cargos de outros admins)
  useEffect(() => {
    const refresh = () => {
      if (!saving) load(true)
    }
    const id = window.setInterval(refresh, 10000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, saving])

  // Deep link ?pending=<id> abre o modal de aprovação
  useEffect(() => {
    const pendingId = searchParams.get('pending')
    if (!pendingId || !isSuperAdmin) return
    const target = users.find((u) => u.id === pendingId && u.status === 'pending')
    if (target) {
      setApprovingUser(target)
      setSearchParams({}, { replace: true })
    }
  }, [users, searchParams, setSearchParams, isSuperAdmin])

  const pendingUsers = users.filter((u) => u.status === 'pending')
  const activeUsers = users.filter((u) => u.status !== 'pending')

  // Escopo por workspace: ativos só do workspace atual. Admin absoluto e
  // usuários sem workspace atribuído aparecem sempre.
  const workspaceId = workspace?.id ?? null
  const scopedActiveUsers = useMemo(
    () => activeUsers.filter((u) => {
      if (!workspaceId) return true
      if (u.is_super_admin) return true
      const ids = u.workspace_ids || []
      return ids.length === 0 || ids.includes(workspaceId)
    }),
    [activeUsers, workspaceId],
  )

  const visiblePeople = useMemo(() => {
    const all = [...scopedActiveUsers, ...pendingUsers]
    const scoped = all.filter((u) => {
      if (filter === 'pending') return u.status === 'pending'
      if (filter === 'admin') return !!u.is_super_admin
      if (filter === 'active') return u.status !== 'pending'
      return true
    })
    if (!search) return scoped
    const q = search.toLowerCase()
    return scoped.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )
  }, [scopedActiveUsers, pendingUsers, filter, search])

  async function handleApprove(
    userId: string,
    roleId: string,
    appAccess: Record<string, never>,
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
      setApprovingUser(null)
      setFeedback({ type: 'success', message: `Usuário aprovado como ${roleList.find((r) => r.id === roleId)?.name ?? 'cargo'}` })
    } else {
      setFeedback({ type: 'error', message: 'Erro ao aprovar usuário' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
    return success
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
      <div>
        <h1 className="text-2xl font-black tracking-tight text-fg">Pessoas</h1>
        <p className="text-[11px] text-fg-muted mt-1">
          {scopedActiveUsers.length} pessoa{scopedActiveUsers.length !== 1 ? 's' : ''}
          {workspace ? ` em ${workspace.name}` : ' no sistema'}
          {pendingUsers.length > 0 && ` · ${pendingUsers.length} pendente${pendingUsers.length !== 1 ? 's' : ''}`}
        </p>
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

      {isSuperAdmin && pendingUsers.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/admin/requests')}
          className="w-full rounded-xl bg-amber-500/10 p-4 text-left ring-1 ring-amber-500/20 transition-colors hover:bg-amber-500/15"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <icons.ui.inbox size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Solicitações de acesso</p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {pendingUsers.length} aguardando revisão
              </p>
            </div>
            <icons.ui.chevronRight size={16} className="text-fg-muted" />
          </div>
        </button>
      )}

      {/* Busca + filtros */}
      <div className="space-y-2.5">
        <div className="relative">
          <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? 'bg-fg text-surface'
                  : 'bg-card text-fg-muted hover:text-fg'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de pessoas */}
      {visiblePeople.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-input text-fg-muted empty-state-icon">
            <icons.ui.user size={22} />
          </div>
          <p className="text-sm font-medium text-fg-muted">
            {search ? 'Nenhuma pessoa encontrada' : 'Nenhuma pessoa aqui ainda'}
          </p>
          {search && (
            <p className="mt-1 text-[11px] text-fg-dim">Ajuste a busca ou os filtros.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visiblePeople.map((u) => {
            const st = statusStyle(u.status)
            const role = roleList.find((r) => r.id === u.roleId)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => navigate(`/admin/users/${u.id}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-input"
              >
                <PersonAvatar user={u} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-fg">{u.name}</p>
                    {u.is_super_admin && (
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-500">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-fg-muted">{u.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${st.chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    {role && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${roleBadgeClass(role)}`}>
                        {role.name}
                      </span>
                    )}
                  </div>
                </div>
                <icons.ui.chevronRight size={16} className="shrink-0 text-fg-dim" />
              </button>
            )
          })}
        </div>
      )}

      {approvingUser && (
        <ApproveUserModal
          user={approvingUser}
          workspaces={workspaces}
          onClose={() => setApprovingUser(null)}
          onConfirm={(role, appAccess, workspaceIds) =>
            handleApprove(approvingUser.id, role, appAccess, workspaceIds)
          }
        />
      )}
    </div>
  )
}
