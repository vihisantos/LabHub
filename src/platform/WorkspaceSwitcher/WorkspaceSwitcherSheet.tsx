import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../core/workspaces/types'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { icons } from '../../lib/icons'

interface WorkspaceSwitcherSheetProps {
  open: boolean
  workspaces: Workspace[]
  onClose: () => void
}

export function WorkspaceSwitcherSheet({ open, workspaces, onClose }: WorkspaceSwitcherSheetProps) {
  const { workspace, setWorkspace } = useWorkspace()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-full max-w-md rounded-t-2xl bg-card p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <icons.ui.home size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">Trocar workspace</p>
                  <p className="text-[10px] text-fg-dim">Escolha o ambiente para continuar</p>
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

            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {workspaces.map((ws) => {
                const isActive = workspace?.id === ws.id
                const wsColor = ws.color || '#6366f1'
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      if (!isActive) setWorkspace(ws)
                      onClose()
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'border-blue-500/40 bg-blue-500/10' : 'border-line bg-surface hover:bg-input'
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: wsColor + '18', color: wsColor }}
                    >
                      <icons.ui.home size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{ws.name}</span>
                      {ws.location && <span className="block text-[10px] text-fg-muted">{ws.location}</span>}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] font-semibold text-blue-500">Atual</span>
                    ) : (
                      <icons.ui.chevronRight size={14} className="text-fg-muted" />
                    )}
                  </button>
                )
              })}
              {workspaces.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-fg-dim">Nenhum workspace disponível.</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
