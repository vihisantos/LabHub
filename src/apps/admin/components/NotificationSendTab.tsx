import { useEffect, useState } from 'react'
import { useNotifications } from '../../../core/notifications/useNotifications'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { appRegistry } from '../../../appRegistry'
import type {
  NotificationType,
  NotificationSeverity,
  NotificationAudience,
} from '../../../core/notifications/types'
import type { User } from '../../../core/auth/types'
import { useRoles } from '../../../core/permissions/usePermissions'
import { adminService } from '../../../core/auth/adminService'
import { icons } from '../../../lib/icons'

const MODULES = appRegistry.filter((app) => app.id !== 'admin')

const TYPES: { value: NotificationType; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'ticket', label: 'Chamado' },
  { value: 'asset', label: 'Equipamento' },
  { value: 'maintenance', label: 'Manutenção' },
  { value: 'approval', label: 'Aprovação' },
  { value: 'sync', label: 'Sincronização' },
]

const SEVERITIES: { value: NotificationSeverity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Aviso' },
  { value: 'critical', label: 'Crítico' },
]

type Destination = 'app' | 'role' | 'user'

export function NotificationSendTab() {
  const { create } = useNotifications()
  const { workspaces } = useWorkspace()
  const { roles } = useRoles()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [moduleId, setModuleId] = useState(MODULES[0]?.id ?? 'system')
  const [severity, setSeverity] = useState<NotificationSeverity>('info')
  const [type, setType] = useState<NotificationType>('system')
  const [destination, setDestination] = useState<Destination>('app')
  const [targetRole, setTargetRole] = useState<string>('')
  const [targetUser, setTargetUser] = useState('')
  const [workspaceScope, setWorkspaceScope] = useState('all')
  const [profiles, setProfiles] = useState<User[]>([])
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let active = true
    adminService.listAllProfiles().then((users) => {
      if (active) setProfiles(users.filter((u) => u.status === 'active'))
    })
    return () => {
      active = false
    }
  }, [])

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !(destination === 'user' && !targetUser)

  async function handleSend() {
    if (!canSend || sending) return
    setSending(true)
    setFeedback(null)

    const workspaceId = workspaceScope === 'all' ? undefined : workspaceScope
    let audience: NotificationAudience | undefined
    let role: string | undefined
    let userId: string | undefined

    if (destination === 'role') {
      audience = 'role'
      role = targetRole || roles.find((r) => r.isDefault)?.id
    } else if (destination === 'user') {
      audience = 'user'
      userId = targetUser
    }

    try {
      create({
        title: title.trim(),
        body: body.trim(),
        type,
        severity,
        module: moduleId,
        audience,
        targetRole: role,
        targetUserId: userId,
        workspace_id: workspaceId,
      })

      // Push para o mesmo segmento (o backend filtra por módulo/workspace/cargo)
      // Mesma base da API usada pelos demais apps; vazio = mesmo domínio (Vercel)
      const pushBase = (import.meta.env.VITE_RESERVALAB_API_URL as string) || ''
      if (pushBase) {
        fetch(`${pushBase}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            url: '/',
            module: moduleId,
            workspace_id: workspaceId,
            role,
            userId,
          }),
        }).catch(() => {})
      }

      setFeedback({ ok: true, text: 'Notificação enviada (in-app + push).' })
      setTitle('')
      setBody('')
    } catch {
      setFeedback({ ok: false, text: 'Erro ao enviar a notificação.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="text-sm font-bold text-fg">Enviar notificação</h3>
        <p className="mt-0.5 text-[11px] text-fg-muted">
          Cria no sino (in-app) e dispara push para o segmento escolhido.
        </p>
      </div>

      <div className="space-y-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Título</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Manutenção agendada no LAB01"
            className="w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Mensagem</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Detalhes da notificação..."
            className="w-full resize-none rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Aplicativo</p>
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
            >
              {MODULES.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Severidade</p>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as NotificationSeverity)}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Tipo</p>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NotificationType)}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Workspace</p>
            <select
              value={workspaceScope}
              onChange={(e) => setWorkspaceScope(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
            >
              <option value="all">Todos os workspaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Destino</p>
          <div className="flex gap-1.5">
            {(
              [
                { value: 'app', label: 'Quem tem acesso ao app' },
                { value: 'role', label: 'Cargo' },
                { value: 'user', label: 'Usuário específico' },
              ] as { value: Destination; label: string }[]
            ).map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDestination(d.value)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  destination === d.value
                    ? 'bg-indigo-500/15 text-indigo-500 ring-1 ring-indigo-500/30'
                    : 'bg-input text-fg-muted hover:text-fg'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {destination === 'role' && (
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setTargetRole(r.id)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                  (targetRole || roles.find((x) => x.isDefault)?.id) === r.id
                    ? 'bg-indigo-500/15 text-indigo-500 ring-1 ring-indigo-500/30'
                    : 'bg-input text-fg-muted hover:text-fg'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {destination === 'user' && (
          <select
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
          >
            <option value="">Selecione o usuário...</option>
            {profiles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        )}

        {feedback && (
          <p className={`text-[11px] ${feedback.ok ? 'text-emerald-500' : 'text-red-500'}`}>
            {feedback.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || sending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <icons.ui.upload size={14} />
          {sending ? 'Enviando...' : 'Enviar notificação'}
        </button>
      </div>
    </div>
  )
}
