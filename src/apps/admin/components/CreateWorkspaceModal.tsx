import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { icons } from '../../../lib/icons'

interface CreateWorkspaceModalProps {
  open: boolean
  onClose: () => void
}

export function CreateWorkspaceModal({ open, onClose }: CreateWorkspaceModalProps) {
  const { create } = useWorkspaces()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setError('')
    setSubmitting(true)

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    try {
      await create({
        name: name.trim(),
        slug,
        location: location.trim(),
        spreadsheet_url: spreadsheetUrl.trim(),
      })
      setName('')
      setLocation('')
      setSpreadsheetUrl('')
      onClose()
    } catch {
      setError('Erro ao criar workspace')
    }
    setSubmitting(false)
  }

  return (
    <AnimatePresence>
      {open && (
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
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <icons.ui.home size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Novo Workspace</h2>
                  <p className="text-xs text-fg-muted">Crie um novo espaço de trabalho</p>
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Anhembi Piracicaba"
                  required
                  autoFocus
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
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Link da Planilha</label>
                <input
                  type="url"
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  placeholder="https://anhembi.sharepoint.com/...planilha.xlsx"
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

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
                  {submitting ? 'Criando...' : 'Criar Workspace'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
