import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { APPS_CONFIGURABLE } from '../../../core/workspaces/apps'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

interface WorkspaceAppsModalProps {
  workspace: Workspace | null
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function WorkspaceAppsModal({ workspace, open, onClose, onSaved }: WorkspaceAppsModalProps) {
  const { update } = useWorkspaces()
  const [disabled, setDisabled] = useState<Set<string>>(
    () => new Set(workspace?.disabled_apps ?? []),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const apps = appRegistry.filter((app) => APPS_CONFIGURABLE.includes(app.id))

  function toggle(appId: string) {
    setDisabled((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
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
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <icons.ui.sliders size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Apps do workspace</h2>
                  <p className="text-xs text-fg-muted">
                    Quais apps fazem parte de <span className="font-medium text-fg">{workspace.name}</span>
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

            <div className="space-y-2">
              {apps.map((app) => {
                const isOff = disabled.has(app.id)
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => toggle(app.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-input"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: app.color + '18', color: app.color }}
                    >
                      <app.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{app.name}</span>
                      <span className="block truncate text-[10px] text-fg-muted">{app.description}</span>
                    </span>
                    <span
                      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                        isOff ? 'bg-line' : 'bg-emerald-500'
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          isOff ? 'translate-x-0' : 'translate-x-5'
                        }`}
                      />
                    </span>
                  </button>
                )
              })}
              <p className="px-1 pt-1 text-[10px] text-fg-dim">
                Apps desativados somem do launcher e bloqueiam o acesso neste workspace. Admin e Dashboard ficam sempre ligados.
              </p>
            </div>

            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  setError('')
                  try {
                    await update(workspace.id, { disabled_apps: [...disabled] })
                    onClose()
                    onSaved?.()
                  } catch {
                    setError('Erro ao salvar apps')
                  }
                  setSubmitting(false)
                }}
                className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
