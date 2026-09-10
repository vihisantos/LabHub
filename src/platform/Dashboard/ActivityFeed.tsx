import { useMyLogs } from '../../core/logs/useServerLogs'
import { icons } from '../../lib/icons'
import type { ServerAuditLog } from '../../core/logs/serverAuditService'

function LogItem({ log }: { log: ServerAuditLog }) {
  const actionIcons: Record<string, React.ReactNode> = {
    created: <icons.ui.plus size={12} />,
    updated: <icons.ui.edit size={12} />,
    deleted: <icons.ui.trash size={12} />,
    claim: <icons.ui.userCheck size={12} />,
    commented: <icons.ui.messageSquareWarning size={12} />,
    membership_added: <icons.ui.userCheck size={12} />,
    membership_removed: <icons.ui.close size={12} />,
    membership_changed: <icons.ui.sliders size={12} />,
    role_changed: <icons.ui.shield size={12} />,
    status_changed: <icons.ui.refresh size={12} />,
    super_admin_toggled: <icons.ui.shield size={12} />,
    app_access_changed: <icons.ui.alertCircle size={12} />,
    viewed: <icons.ui.search size={12} />,
    exported: <icons.ui.download size={12} />,
  }

  const actionLabels: Record<string, string> = {
    created: 'criou',
    updated: 'editou',
    deleted: 'excluiu',
    claim: 'assumiu',
    commented: 'comentou em',
    membership_added: 'adicionou',
    membership_removed: 'removeu',
    membership_changed: 'alterou o acesso de',
    role_changed: 'mudou o cargo de',
    status_changed: 'atualizou status de',
    super_admin_toggled: 'alterou super admin de',
    app_access_changed: 'alterou o acesso de',
    viewed: 'visualizou',
    exported: 'exportou',
  }

  const entityLabels: Record<string, string> = {
    ticket: 'chamado',
    asset: 'ativo',
    room: 'sala',
    user: 'usuário',
  }

  return (
    <div className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-input">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-input text-fg-muted">
        {actionIcons[log.action] || <icons.ui.dot size={12} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-fg">
          <span className="font-medium">{log.actor_name || 'Sistema'}</span>
          {' '}{actionLabels[log.action] || log.action}{' '}
          <span className="font-medium">{entityLabels[log.entity] || log.entity}</span>
          {' '}<span className="text-fg-muted">{log.entity_label}</span>
        </p>
        <p className="mt-0.5 text-[10px] text-fg-dim">
          {new Date(log.timestamp).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}

export function ActivityFeed({ limit = 10 }: { limit?: number }) {
  const { logs, loading } = useMyLogs()

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-input" />
          <div className="h-10 rounded bg-input" />
          <div className="h-10 rounded bg-input" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-xs font-semibold text-fg-muted">Atividade Recente</h3>
        <span className="text-[10px] text-fg-dim">{logs.length} registros</span>
      </div>
      <div className="scrollbar-thin max-h-80 divide-y divide-line overflow-y-auto">
        {logs.length === 0 ? (
          <div className="py-8 text-center">
            <icons.ui.inbox size={32} className="mx-auto text-fg-muted" />
            <p className="mt-2 text-xs text-fg-muted">Nenhuma atividade registrada</p>
          </div>
        ) : (
          logs.slice(0, limit).map((log) => (
            <LogItem key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  )
}