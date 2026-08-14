import { useEffect, useState } from 'react'
import { workspaceBackupService, type WorkspaceAuditLog, type WorkspaceBackup } from '../../../core/workspaces/backupService'
import { useAuth } from '../../../core/auth/AuthContext'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { icons } from '../../../lib/icons'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function BackupsPage() {
  const { user } = useAuth()
  const { reload } = useWorkspaces()
  const [backups, setBackups] = useState<WorkspaceBackup[]>([])
  const [logs, setLogs] = useState<WorkspaceAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    await workspaceBackupService.pruneExpired()
    const [b, l] = await Promise.all([
      workspaceBackupService.listBackups(),
      workspaceBackupService.listAuditLogs(),
    ])
    setBackups(b)
    setLogs(l)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRestore(id: string) {
    const backup = backups.find((b) => b.id === id)
    if (!backup) return
    if (!window.confirm(`Restaurar o workspace "${backup.workspace_name}" a partir do backup?`)) return

    setRestoringId(id)
    setError('')
    try {
      await workspaceBackupService.restoreBackup(id, {
        id: user?.id || 'unknown',
        name: user?.name || user?.id || 'desconhecido',
      })
      await reload()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao restaurar workspace')
    }
    setRestoringId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-fg">Backups e auditoria</h2>
        <p className="text-xs text-fg-muted">
          Workspaces excluídos ficam com backup por 2 dias e depois são limpos automaticamente.
        </p>
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}

      {/* Backups */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold text-fg-muted">Backups disponíveis</p>
        {loading ? (
          <p className="px-1 text-xs text-fg-dim">Carregando...</p>
        ) : backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-dim">
            Nenhum backup ativo no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <icons.ui.hardDrive size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{b.workspace_name}</p>
                  <p className="text-[11px] text-fg-muted">
                    Excluído por <span className="font-medium text-fg">{b.deleted_by_name || 'desconhecido'}</span> em {formatDate(b.created_at)}
                  </p>
                  <p className="text-[10px] text-fg-dim">Expira em {formatDate(b.expires_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(b.id)}
                  disabled={restoringId === b.id}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50"
                >
                  {restoringId === b.id ? (
                    'Restaurando...'
                  ) : (
                    <>
                      <icons.ui.copy size={12} />
                      Restaurar
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auditoria */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold text-fg-muted">Histórico de auditoria</p>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-dim">
            Nenhuma ação registrada ainda.
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)]">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    l.action === 'delete' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                  }`}
                >
                  {l.action === 'delete' ? <icons.ui.trash size={14} /> : <icons.ui.check size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-fg">
                    {l.action === 'delete' ? 'Exclusão' : 'Restauração'}{' '}
                    {l.workspace_name && (
                      <span className="font-semibold">· {l.workspace_name}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {l.actor_name || 'desconhecido'} · {formatDate(l.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
