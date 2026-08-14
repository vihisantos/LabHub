import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { icons } from '../../../lib/icons'

interface ConfirmDeleteModalProps {
  workspace: Workspace | null
  deleting: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeleteModal({ workspace, deleting, error, onClose, onConfirm }: ConfirmDeleteModalProps) {
  return (
    <AnimatePresence>
      {workspace && (
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
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <icons.ui.alertTriangle size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-fg">Excluir workspace?</h2>
                <p className="text-xs text-fg-muted">Essa ação não pode ser desfeita</p>
              </div>
            </div>

            <div className="mb-5 space-y-2.5 rounded-xl border border-line bg-surface p-4 text-xs text-fg-muted">
              <p>
                Você está excluindo <span className="font-semibold text-fg">{workspace.name}</span>. Todos os
                dados vinculados a este ambiente serão removidos.
              </p>
              <div className="flex items-start gap-2">
                <icons.ui.shield size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                <p>
                  Um <span className="font-semibold text-emerald-500">backup automático</span> será mantido por{' '}
                  <span className="font-semibold text-fg">2 dias</span> e depois o banco se limpa sozinho.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <icons.ui.hardDrive size={14} className="mt-0.5 shrink-0 text-blue-500" />
                <p>
                  A exclusão ficará registrada em <span className="font-semibold text-fg">auditoria</span> com o
                  seu nome.
                </p>
              </div>
            </div>

            {error && <p className="mb-4 text-xs text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
