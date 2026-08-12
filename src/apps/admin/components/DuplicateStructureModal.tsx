import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { duplicateWorkspaceStructure } from '../../../core/workspaces/duplicateStructure'
import type { Workspace } from '../../../core/workspaces/types'
import { icons } from '../../../lib/icons'

interface DuplicateStructureModalProps {
  open: boolean
  target: Workspace | null
  workspaces: Workspace[]
  onClose: () => void
}

interface Result {
  rooms: number
  problemTemplates: number
  checklistTemplates: number
}

export function DuplicateStructureModal({ open, target, workspaces, onClose }: DuplicateStructureModalProps) {
  const [sourceId, setSourceId] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [confirming, setConfirming] = useState(false)

  function reset() {
    setSourceId('')
    setResult(null)
    setConfirming(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const sources = target ? workspaces.filter((w) => w.id !== target.id) : []

  function handleDuplicate() {
    if (!target || !sourceId) return
    setConfirming(true)
    const res = duplicateWorkspaceStructure(sourceId, target.id)
    setResult(res)
    setConfirming(false)
  }

  const total = result
    ? result.rooms + result.problemTemplates + result.checklistTemplates
    : 0

  return (
    <AnimatePresence>
      {open && target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={handleClose}
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <icons.ui.copy size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Duplicar Modelo</h2>
                  <p className="text-xs text-fg-muted">Copiar estrutura para {target.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.close size={16} />
              </button>
            </div>

            {!result ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Origem do modelo</label>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">Selecione um workspace...</option>
                    {sources.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl bg-input/50 p-4 text-xs text-fg-muted">
                  <p className="mb-1 font-semibold text-fg">O que será copiado</p>
                  <p>• Salas (chamados)</p>
                  <p>• Categorias de problema por tipo de equipamento</p>
                  <p>• Templates de checklist</p>
                  <p className="mt-2">Itens já existentes no destino com o mesmo nome são ignorados.</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={!sourceId || confirming}
                    className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {confirming ? 'Copiando...' : 'Duplicar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-input/50 p-4">
                  <p className="text-sm font-semibold text-fg">{total} itens copiados</p>
                  <div className="mt-2 space-y-1 text-xs text-fg-muted">
                    <p>• Salas: {result.rooms}</p>
                    <p>• Categorias de problema: {result.problemTemplates}</p>
                    <p>• Templates de checklist: {result.checklistTemplates}</p>
                  </div>
                  {total === 0 && (
                    <p className="mt-2 text-xs text-fg-dim">
                      Nenhum item novo — o destino já tinha tudo ou a origem não tem estrutura vinculada.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400"
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
