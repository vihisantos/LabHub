import { useLogs } from '../../core/logs/useLogs'
import { icons } from '../../lib/icons'
import type { AuditLog } from '../../core/logs/types'

function LogItem({ log }: { log: AuditLog }) {
  const actionIcons: Record<string, React.ReactNode> = {
    created: <icons.ui.plus size={12} />,
    updated: <icons.ui.edit size={12} />,
    deleted: <icons.ui.trash size={12} />,
    status_changed: <icons.ui.refresh size={12} />,
    viewed: <icons.ui.search size={12} />,
    exported: <icons.ui.download size={12} />,
  }

  const actionLabels: Record<string, string> = {
    created: 'criou',
    updated: 'editou',
    deleted: 'excluiu',
    status_changed: 'atualizou status de',
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
          <span className="font-medium">{log.userName}</span>
          {' '}{actionLabels[log.action] || log.action}{' '}
          <span className="font-medium">{entityLabels[log.entity] || log.entity}</span>
          {' '}<span className="text-fg-muted">{log.entityLabel}</span>
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
  const { logs, loading } = useLogs()

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
      <div className="divide-y divide-line">
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
