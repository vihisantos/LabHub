import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { icons } from '../../../lib/icons'

interface DuplicateWorkspaceModalProps {
  workspace: Workspace | null
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function DuplicateWorkspaceModal({ workspace, open, onClose, onCreated }: DuplicateWorkspaceModalProps) {
  const { create } = useWorkspaces()
  const [name, setName] = useState('')
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
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                <icons.ui.copy size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-fg">Duplicar workspace</h2>
                <p className="text-xs text-fg-muted">
                  Copia a configuração de <span className="font-medium text-fg">{workspace.name}</span>
                </p>
              </div>
            </div>

            <div className="mb-4 space-y-2 rounded-xl border border-line bg-surface p-4 text-xs text-fg-muted">
              <p className="flex items-center gap-2">
                <icons.ui.check size={14} className="text-emerald-500" />
                Link da planilha (ReservaLab)
              </p>
              <p className="flex items-center gap-2">
                <icons.ui.check size={14} className="text-emerald-500" />
                Quantidade de labs
              </p>
              <p className="flex items-center gap-2">
                <icons.ui.check size={14} className="text-emerald-500" />
                Localização
              </p>
              <p className="flex items-center gap-2">
                <icons.ui.check size={14} className="text-emerald-500" />
                Cor e apps ativados/desativados
              </p>
              <p className="flex items-center gap-2 text-fg-dim">
                <icons.ui.hardDrive size={14} />
                Os dados (salas, chamados, estoque) <span className="font-semibold text-fg-muted">não</span> são copiados
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!name.trim()) { setError('Nome é obrigatório'); return }
                setError('')
                setSubmitting(true)
                const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                try {
                  await create({
                    name: name.trim(),
                    slug,
                    location: workspace.location,
                    spreadsheet_url: workspace.spreadsheet_url,
                    lab_count: workspace.lab_count ?? 2,
                    color: workspace.color || '',
                    disabled_apps: workspace.disabled_apps ?? [],
                  })
                  setName('')
                  onClose()
                  onCreated?.()
                } catch {
                  setError('Erro ao duplicar workspace')
                }
                setSubmitting(false)
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Novo nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Ex: ${workspace.name} (Filial)`}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                />
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
                  className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50"
                >
                  {submitting ? 'Duplicando...' : 'Duplicar'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
