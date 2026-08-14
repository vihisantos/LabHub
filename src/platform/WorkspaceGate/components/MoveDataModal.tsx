import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { stockService } from '../../../apps/stock/services/stockService'
import { ticketService } from '../../../apps/chamados/services/ticketService'
import { icons } from '../../../lib/icons'

interface MovableItem {
  id: string
  workspace_id?: string
}

interface MoveTarget {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  count: (workspaceId: string) => number
  update: (id: string, targetId: string) => void
}

const MOVE_TARGETS: MoveTarget[] = [
  {
    id: 'stock',
    label: 'Estoque',
    icon: <icons.ui.package size={16} />,
    color: '#10b981',
    count: (workspaceId) =>
      (stockService.getAll() as MovableItem[]).filter((i) => i.workspace_id === workspaceId).length,
    update: (id, targetId) => stockService.update(id, { workspace_id: targetId }),
  },
  {
    id: 'chamados',
    label: 'Chamados',
    icon: <icons.ui.alertCircle size={16} />,
    color: '#f59e0b',
    count: (workspaceId) =>
      (ticketService.getAll() as MovableItem[]).filter((t) => t.workspace_id === workspaceId).length,
    update: (id, targetId) => ticketService.update(id, { workspace_id: targetId }),
  },
]

interface MoveDataModalProps {
  workspace: Workspace | null
  open: boolean
  onClose: () => void
}

export function MoveDataModal({ workspace, open, onClose }: MoveDataModalProps) {
  const { workspaces } = useWorkspaces()
  const [targetId, setTargetId] = useState('')
  const [typeId, setTypeId] = useState('stock')
  const [moved, setMoved] = useState<number | null>(null)
  const [error, setError] = useState('')

  const targets = useMemo(() => MOVE_TARGETS, [])

  const type = targets.find((t) => t.id === typeId) ?? targets[0]
  const total = workspace ? type.count(workspace.id) : 0
  const availableTargets = workspaces.filter((w) => w.id !== workspace?.id)

  function reset() {
    setTargetId('')
    setMoved(null)
    setError('')
  }

  return (
    <AnimatePresence>
      {open && workspace && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onAnimationStart={reset}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                  <icons.ui.hardDrive size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Mover dados</h2>
                  <p className="text-xs text-fg-muted">
                    De <span className="font-medium text-fg">{workspace.name}</span> para outro workspace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.close size={16} />
              </button>
            </div>

            {moved === null ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Tipo de dado</label>
                  <div className="grid grid-cols-2 gap-2">
                    {targets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTypeId(t.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                          typeId === t.id
                            ? 'border-violet-500/40 bg-violet-500/10 text-fg'
                            : 'border-line bg-surface text-fg-muted'
                        }`}
                      >
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ backgroundColor: t.color + '18', color: t.color }}
                        >
                          {t.icon}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-xs font-semibold">{t.label}</span>
                          <span className="block text-[10px]">{t.count(workspace.id)} itens</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Mover para</label>
                  {availableTargets.length === 0 ? (
                    <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs text-fg-dim">
                      Crie outro workspace antes de mover dados.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {availableTargets.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setTargetId(w.id)}
                          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            targetId === w.id
                              ? 'border-violet-500/40 bg-violet-500/10'
                              : 'border-line bg-surface hover:bg-input'
                          }`}
                        >
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: (w.color || '#6366f1') + '18',
                              color: w.color || '#6366f1',
                            }}
                          >
                            <icons.ui.home size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-fg">{w.name}</span>
                            {w.location && <span className="block text-[10px] text-fg-muted">{w.location}</span>}
                          </span>
                          {targetId === w.id && <icons.ui.check size={16} className="text-violet-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!targetId || total === 0}
                    onClick={async () => {
                      setError('')
                      const items = (type.id === 'stock'
                        ? stockService.getAll()
                        : ticketService.getAll()) as MovableItem[]
                      const toMove = items.filter((i) => i.workspace_id === workspace.id)
                      try {
                        toMove.forEach((item) => type.update(item.id, targetId))
                        setMoved(toMove.length)
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Erro ao mover dados')
                      }
                    }}
                    className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
                  >
                    Mover {total > 0 ? `${total} itens` : ''}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                  <icons.ui.check size={28} className="mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm font-bold text-fg">{moved} itens movidos</p>
                  <p className="text-xs text-fg-muted">A sincronização enviará as mudanças.</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400"
                >
                  Concluir
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
