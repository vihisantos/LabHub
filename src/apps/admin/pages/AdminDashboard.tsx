import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/auth/AuthContext'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { useLogs } from '../../../core/logs/useLogs'
import { useNotifications } from '../../../core/notifications/useNotifications'
import { useUsers } from '../../../core/users/useUsers'
import { adminService } from '../../../core/auth/adminService'
import { icons } from '../../../lib/icons'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Criou',
  updated: 'Atualizou',
  deleted: 'Removeu',
  status_changed: 'Alterou status de',
  viewed: 'Visualizou',
  exported: 'Exportou',
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  created: { bg: 'bg-emerald-500/10', fg: 'text-emerald-500' },
  updated: { bg: 'bg-blue-500/10', fg: 'text-blue-500' },
  deleted: { bg: 'bg-red-500/10', fg: 'text-red-500' },
  status_changed: { bg: 'bg-amber-500/10', fg: 'text-amber-500' },
  viewed: { bg: 'bg-slate-500/10', fg: 'text-slate-500' },
  exported: { bg: 'bg-violet-500/10', fg: 'text-violet-500' },
}

const ACTION_ICONS: Record<string, keyof typeof icons.ui> = {
  created: 'plus',
  updated: 'edit',
  deleted: 'trash',
  status_changed: 'dot',
  viewed: 'dot',
  exported: 'download',
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const { logs } = useLogs()
  const { unreadCount } = useNotifications()
  const { users } = useUsers()

  const [pendingUsers, setPendingUsers] = useState<number | null>(null)
  const [pendingLoading, setPendingLoading] = useState(true)

  const fetchPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const pending = await adminService.listPendingProfiles()
      setPendingUsers(pending.length)
    } catch {
      setPendingUsers(null)
    } finally {
      setPendingLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const recentLogs = useMemo(() => logs.slice(0, 10), [logs])
  const totalUsers = users.length
  const totalLogs = logs.length
  const hasAttention = pendingUsers !== null && pendingUsers > 0

  const userName = user?.name?.split(' ')[0] || ''

  return (
    <div className="space-y-5">

      {/* ── HERO / HEADER ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-fg">
          {getGreeting()}{userName ? `, ${userName}` : ''}
        </h1>
        {workspace && (
          <>
            <p className="text-sm font-semibold text-fg">
              {workspace.name}
            </p>
            {workspace.location && (
              <p className="text-[11px] text-fg-muted flex items-center gap-1.5">
                <icons.ui.mapPin size={10} />
                {workspace.location}
              </p>
            )}
          </>
        )}
        <p className="text-[11px] text-fg-dim pt-1">
          Administração do Workspace
        </p>
      </div>

      {/* ── BLOCO DE ATENÇÃO ── */}
      <div className={`rounded-xl p-4 shadow-[var(--shadow-card)] transition-colors ${
        hasAttention
          ? 'bg-amber-500/10 ring-1 ring-amber-500/20'
          : 'bg-card'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            hasAttention ? 'bg-amber-500/15 text-amber-500' : 'bg-input text-fg-muted'
          }`}>
            {hasAttention
              ? <icons.ui.alertCircle size={18} />
              : <icons.ui.circleCheck size={18} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">
              Precisa da sua atenção
            </p>
            {pendingLoading ? (
              <div className="mt-2 h-4 w-48 animate-pulse rounded bg-input" />
            ) : hasAttention ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {pendingUsers} solicitação{pendingUsers !== 1 ? 'ões' : ''} aguardando aprovação
              </p>
            ) : (
              <p className="text-xs text-fg-muted mt-1">
                Tudo em dia por aqui
              </p>
            )}
          </div>
        </div>
        {hasAttention && (
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mt-3 w-full rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            Revisar solicitações
          </button>
        )}
      </div>

      {/* ── RESUMO ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-fg">{totalUsers}</p>
              <p className="text-[10px] text-fg-muted">Usuários</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <icons.ui.user size={18} />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xl font-bold ${pendingUsers !== null && pendingUsers > 0 ? 'text-amber-500' : 'text-fg'}`}>
                {pendingLoading ? '—' : pendingUsers ?? '—'}
              </p>
              <p className="text-[10px] text-fg-muted">Pendentes</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <icons.ui.inbox size={18} />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-fg">{totalLogs}</p>
              <p className="text-[10px] text-fg-muted">Atividade</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <icons.ui.fileBarChart size={18} />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xl font-bold ${unreadCount > 0 ? 'text-blue-500' : 'text-fg'}`}>
                {unreadCount}
              </p>
              <p className="text-[10px] text-fg-muted">Alertas</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <icons.ui.bellRing size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* ── ATIVIDADE RECENTE ── */}
      <div className="rounded-xl bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-xs font-semibold text-fg-muted">Atividade Recente</h3>
          <button
            type="button"
            onClick={() => navigate('/admin/logs')}
            className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
          >
            Ver toda atividade
          </button>
        </div>
        <div className="scrollbar-thin max-h-96 divide-y divide-line overflow-y-auto">
          {recentLogs.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-input text-fg-muted empty-state-icon">
                <icons.ui.fileBarChart size={18} />
              </div>
              <p className="text-xs text-fg-muted">Nenhuma atividade registrada</p>
            </div>
          ) : (
            recentLogs.map((log) => {
              const colors = ACTION_COLORS[log.action] ?? { bg: 'bg-input', fg: 'text-fg-muted' }
              const iconName = ACTION_ICONS[log.action] ?? 'dot'
              const IconComp = icons.ui[iconName]

              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.fg}`}>
                    <IconComp size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg leading-relaxed">
                      <span className="font-semibold">{log.userName}</span>
                      <span className="text-fg-muted"> {getActionLabel(log.action)} </span>
                      <span className="font-medium text-fg">{log.entityLabel}</span>
                    </p>
                    <p className="text-[10px] text-fg-dim mt-0.5">
                      {formatAge(log.timestamp)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── AÇÕES RÁPIDAS ── */}
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="text-xs font-semibold text-fg-muted mb-3">Ações Rápidas</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-3 rounded-xl bg-input p-3 text-left transition-colors hover:bg-card-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <icons.ui.user size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">Usuários</p>
              <p className="text-[10px] text-fg-muted">Gerenciar</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-3 rounded-xl bg-input p-3 text-left transition-colors hover:bg-card-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <icons.ui.inbox size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">Solicitações</p>
              <p className="text-[10px] text-fg-muted">Pendentes</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/roles')}
            className="flex items-center gap-3 rounded-xl bg-input p-3 text-left transition-colors hover:bg-card-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <icons.ui.sliders size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">Permissões</p>
              <p className="text-[10px] text-fg-muted">Cargos e acesso</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/notifications')}
            className="flex items-center gap-3 rounded-xl bg-input p-3 text-left transition-colors hover:bg-card-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <icons.ui.bellRing size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">Notificações</p>
              <p className="text-[10px] text-fg-muted">Configurar</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
