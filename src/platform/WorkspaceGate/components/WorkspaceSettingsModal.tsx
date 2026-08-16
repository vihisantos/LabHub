import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { icons } from '../../../lib/icons'

export const WORKSPACE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
]

interface WorkspaceSettingsModalProps {
  workspace: Workspace | null
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function WorkspaceSettingsModal({ workspace, open, onClose, onSaved }: WorkspaceSettingsModalProps) {
  const { update } = useWorkspaces()
  const [name, setName] = useState(workspace?.name ?? '')
  const [location, setLocation] = useState(workspace?.location ?? '')
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(workspace?.spreadsheet_url ?? '')
  const [labCount, setLabCount] = useState(workspace?.lab_count ?? 2)
  const [color, setColor] = useState(workspace?.color ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <icons.nav.settings size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Configurar workspace</h2>
                  <p className="text-xs text-fg-muted">{workspace.name}</p>
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

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!name.trim()) { setError('Nome é obrigatório'); return }
                setError('')
                setSubmitting(true)
                try {
                  await update(workspace.id, {
                    name: name.trim(),
                    location: location.trim(),
                    spreadsheet_url: spreadsheetUrl.trim(),
                    lab_count: labCount,
                    color,
                  })
                  onClose()
                  onSaved?.()
                } catch {
                  setError('Erro ao salvar configuração')
                }
                setSubmitting(false)
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Anhembi Piracicaba"
                  required
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Localização</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Piracicaba, SP"
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Link da Planilha (ReservaLab)</label>
                <input
                  type="url"
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  placeholder="https://anhembi.sharepoint.com/.../planilha.xlsx"
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Quantidade de labs (ReservaLab)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={labCount}
                  onChange={(e) => setLabCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Cor do workspace</label>
                <div className="flex flex-wrap gap-2">
                  {WORKSPACE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: c }}
                      aria-label={`Cor ${c}`}
                    >
                      {color === c && <icons.ui.check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
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
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
