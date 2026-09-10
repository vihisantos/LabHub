import { useEffect, useMemo, useState } from 'react'
import { useWorkspaceLogs } from '../../core/logs/useServerLogs'
import { icons } from '../../lib/icons'
import type { ServerAuditLog } from '../../core/logs/serverAuditService'
import { workspaceService } from '../../core/workspaces/service'

const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'created', label: 'Criações' },
  { value: 'updated', label: 'Edições' },
  { value: 'deleted', label: 'Exclusões' },
  { value: 'claim', label: 'Assunções' },
  { value: 'commented', label: 'Comentários' },
  { value: 'membership_added', label: 'Membros' },
  { value: 'role_changed', label: 'Cargos' },
]

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
    created: 'Criou',
    updated: 'Editou',
    deleted: 'Excluiu',
    claim: 'Assumiu',
    commented: 'Comentou em',
    membership_added: 'Adicionou',
    membership_removed: 'Removeu',
    membership_changed: 'Alterou acesso de',
    role_changed: 'Mudou cargo de',
    status_changed: 'Atualizou status de',
    super_admin_toggled: 'Alterou super admin de',
    app_access_changed: 'Alterou acesso de',
    viewed: 'Visualizou',
    exported: 'Exportou',
  }

  const entityLabels: Record<string, string> = {
    ticket: 'Chamado',
    asset: 'Ativo',
    room: 'Sala',
    user: 'Usuário',
  }

  const hasMeta = log.meta && Object.keys(log.meta).length > 0

  return (
    <div className="flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-input">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-fg-muted">
        {actionIcons[log.action] || <icons.ui.dot size={12} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-medium">{log.actor_name || 'Sistema'}</span>
          {' '}<span className="text-fg-muted">{actionLabels[log.action] || log.action}</span>{' '}
          <span className="font-medium">{entityLabels[log.entity] || log.entity}</span>
          {' '}<span className="text-fg-muted">{log.entity_label}</span>
        </p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[10px] text-fg-dim">
            {new Date(log.timestamp).toLocaleString('pt-BR')}
          </span>
          <span className="rounded-md bg-input px-1.5 py-0.5 text-[9px] font-medium text-fg-muted">
            {log.entity}
          </span>
        </div>
        {hasMeta && (
          <pre
            className="mt-2 rounded-lg bg-input p-2 text-[10px] text-fg-dim overflow-x-auto"
            data-testid="log-meta"
          >
            {JSON.stringify(log.meta, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export function LogsPage() {
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const { logs, loading, reload } = useWorkspaceLogs(workspaceId || null)
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await workspaceService.syncFromSupabase()
      if (!mounted) return
      setWorkspaces(workspaceService.getAll().map((w) => ({ id: w.id, name: w.name })))
    })()
    return () => {
      mounted = false
    }
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !log.actor_name.toLowerCase().includes(q) &&
          !log.entity_label.toLowerCase().includes(q) &&
          !log.entity.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [logs, actionFilter, search])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-fg">Logs de Auditoria</h1>
              <p className="text-sm text-fg-muted">{filteredLogs.length} registro{filteredLogs.length !== 1 ? 's' : ''}</p>
            </div>
            <span
              className="shrink-0 rounded-lg bg-input px-3 py-2 text-[10px] font-medium text-fg-muted"
              title="Registro append-only no servidor, imutável por design (LGPD)."
            >
              Imutável
            </span>
          </div>
        </header>

        <div className="mb-4 space-y-3">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            aria-label="Workspace"
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Workspace ativo</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <div className="relative">
            <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuário, entidade..."
              className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    ? 'bg-blue-500 text-white'
                    : 'bg-card text-fg-dim border border-line hover:text-fg'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-input"
          >
            <icons.ui.refresh size={12} /> Atualizar
          </button>
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
          <div className="scrollbar-thin max-h-[65dvh] space-y-2 overflow-y-auto pr-1">
            {filteredLogs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}