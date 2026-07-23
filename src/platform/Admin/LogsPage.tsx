import { useState } from 'react'
import { useLogs } from '../../core/logs/useLogs'
import { icons } from '../../lib/icons'
import type { AuditLog, LogAction } from '../../core/logs/types'

const ACTION_FILTERS: { value: LogAction | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'created', label: 'Criações' },
  { value: 'updated', label: 'Edições' },
  { value: 'deleted', label: 'Exclusões' },
  { value: 'status_changed', label: 'Mudanças de Status' },
]

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
    created: 'Criou',
    updated: 'Editou',
    deleted: 'Excluiu',
    status_changed: 'Atualizou status',
    viewed: 'Visualizou',
    exported: 'Exportou',
  }

  const entityLabels: Record<string, string> = {
    ticket: 'Chamado',
    asset: 'Ativo',
    room: 'Sala',
    user: 'Usuário',
  }

  return (
    <div className="flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-input">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-fg-muted">
        {actionIcons[log.action] || <icons.ui.dot size={12} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-medium">{log.userName}</span>
          {' '}<span className="text-fg-muted">{actionLabels[log.action] || log.action}</span>{' '}
          <span className="font-medium">{entityLabels[log.entity] || log.entity}</span>
          {' '}<span className="text-fg-muted">{log.entityLabel}</span>
        </p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[10px] text-fg-dim">
            {new Date(log.timestamp).toLocaleString('pt-BR')}
          </span>
          <span className="rounded-md bg-input px-1.5 py-0.5 text-[9px] font-medium text-fg-muted">
            {log.entity}
          </span>
        </div>
        {log.details && (
          <pre className="mt-2 rounded-lg bg-input p-2 text-[10px] text-fg-dim overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export function LogsPage() {
  const { logs, loading, clearAll } = useLogs()
  const [actionFilter, setActionFilter] = useState<LogAction | ''>('')
  const [search, setSearch] = useState('')

  const filteredLogs = logs.filter((log) => {
    if (actionFilter && log.action !== actionFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !log.userName.toLowerCase().includes(q) &&
        !log.entityLabel.toLowerCase().includes(q) &&
        !log.entity.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">Logs de Auditoria</h1>
              <p className="text-sm text-fg-muted">{logs.length} registro{logs.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg bg-card px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-input"
            >
              Limpar
            </button>
          </div>
        </header>

        <div className="mb-4 space-y-3">
          <div className="relative">
            <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuário, entidade..."
              className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {ACTION_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActionFilter(filter.value)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  actionFilter === filter.value
                    ? 'bg-emerald-500 text-white'
                    : 'bg-card text-fg-dim border border-line hover:text-fg'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl bg-card p-4">
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-xl bg-input" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-input" />
                    <div className="h-3 w-1/2 rounded bg-input" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <icons.ui.inbox size={48} className="text-fg-muted" />
            <p className="mt-4 text-sm text-fg-muted">
              {logs.length === 0 ? 'Nenhum log registrado' : 'Nenhum resultado encontrado'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
