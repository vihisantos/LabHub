import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { icons } from '../../../lib/icons'

interface WorkspaceActionsSheetProps {
  workspace: Workspace | null
  onClose: () => void
  onConfigure: (workspace: Workspace) => void
  onApps: (workspace: Workspace) => void
  onDuplicate: (workspace: Workspace) => void
  onMoveData: (workspace: Workspace) => void
  onDelete: (workspace: Workspace) => void
}

interface ActionItem {
  label: string
  description: string
  icon: React.ReactNode
  color: string
  danger?: boolean
  onClick: () => void
}

export function WorkspaceActionsSheet({
  workspace,
  onClose,
  onConfigure,
  onApps,
  onDuplicate,
  onMoveData,
  onDelete,
}: WorkspaceActionsSheetProps) {
  const actions: ActionItem[] = workspace
    ? [
        {
          label: 'Configurar',
          description: 'Nome, localização, planilha e cor',
          icon: <icons.nav.settings size={18} />,
          color: '#6366f1',
          onClick: () => onConfigure(workspace),
        },
        {
          label: 'Apps',
          description: 'Ativar ou desativar apps deste workspace',
          icon: <icons.ui.sliders size={18} />,
          color: '#8b5cf6',
          onClick: () => onApps(workspace),
        },
        {
          label: 'Duplicar',
          description: 'Copiar a configuração para um novo workspace',
          icon: <icons.ui.copy size={18} />,
          color: '#06b6d4',
          onClick: () => onDuplicate(workspace),
        },
        {
          label: 'Mover dados',
          description: 'Transferir estoque/chamados para outro workspace',
          icon: <icons.ui.hardDrive size={18} />,
          color: '#a855f7',
          onClick: () => onMoveData(workspace),
        },
        {
          label: 'Excluir workspace',
          description: 'Backup automático por 2 dias',
          icon: <icons.ui.trash size={18} />,
          color: '#ef4444',
          danger: true,
          onClick: () => onDelete(workspace),
        },
      ]
    : []

  return (
    <AnimatePresence>
      {workspace && (
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
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: (workspace.color || '#6366f1') + '18',
                    color: workspace.color || '#6366f1',
                  }}
                >
                  <icons.ui.home size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">{workspace.name}</p>
                  {workspace.location && (
                    <p className="text-[10px] text-fg-dim">{workspace.location}</p>
                  )}
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

            <div className="space-y-1">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-input"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: action.color + '18', color: action.color }}
                  >
                    {action.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-semibold ${action.danger ? 'text-red-500' : 'text-fg'}`}
                    >
                      {action.label}
                    </span>
                    <span className="block truncate text-[10px] text-fg-muted">{action.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
