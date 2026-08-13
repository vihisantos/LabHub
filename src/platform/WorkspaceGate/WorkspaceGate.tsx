import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Workspace } from '../../core/workspaces/types'
import { CreateWorkspaceModal } from '../../core/workspaces/components/CreateWorkspaceModal'
import { icons } from '../../lib/icons'

const WS_COLORS = [
  { bg: 'bg-indigo-500/10', text: 'text-indigo-500', gradient: 'from-indigo-500 to-purple-500' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500', gradient: 'from-emerald-500 to-teal-500' },
  { bg: 'bg-amber-500/10', text: 'text-amber-500', gradient: 'from-amber-500 to-orange-500' },
  { bg: 'bg-rose-500/10', text: 'text-rose-500', gradient: 'from-rose-500 to-pink-500' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-500', gradient: 'from-cyan-500 to-blue-500' },
  { bg: 'bg-violet-500/10', text: 'text-violet-500', gradient: 'from-violet-500 to-purple-500' },
]

interface WorkspaceGateProps {
  workspaces: Workspace[]
  onSelect: (workspace: Workspace, persist: boolean) => void
  canCreate?: boolean
  onCreated?: () => void
}

export function WorkspaceGate({ workspaces, onSelect, canCreate = false, onCreated }: WorkspaceGateProps) {
  const [persist, setPersist] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 py-12"
    >
      <div className="w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">
            <icons.ui.home size={12} />
            Ambiente
          </div>
          <h1 className="text-3xl font-black tracking-tight text-fg md:text-4xl">
            Escolha seu <span className="bg-gradient-to-r from-blue-500 to-sky-500 bg-clip-text text-transparent">workspace</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-fg-muted">
            Você tem acesso a mais de um ambiente. Selecione para continuar.
          </p>
        </motion.div>

        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => setPersist(!persist)}
          className={`mx-auto mb-8 flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-medium transition-all ${
            persist
              ? 'bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400'
              : 'border border-line bg-card text-fg-muted hover:text-fg'
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
              persist ? 'border-blue-500 bg-blue-500' : 'border-fg-muted'
            }`}
          >
            {persist && <icons.ui.check size={10} className="text-white" />}
          </span>
          Manter preferência — entrar direto neste ambiente nos próximos logins
        </motion.button>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {workspaces.map((ws, i) => {
            const color = WS_COLORS[i % WS_COLORS.length]
            return (
              <motion.button
                key={ws.id}
                type="button"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.4 }}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(ws, persist)}
                className="relative flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-card p-6 transition-all hover:border-blue-500/20 hover:shadow-md"
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color.bg} ${color.text}`}>
                  <icons.ui.home size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-fg">{ws.name}</p>
                  {ws.location && (
                    <p className="mt-0.5 text-[10px] text-fg-dim">{ws.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                  Entrar
                  <icons.ui.chevronRight size={10} />
                </div>
              </motion.button>
            )
          })}

          {canCreate && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + workspaces.length * 0.06, duration: 0.4 }}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreate(true)}
              className="flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-transparent p-6 transition-all hover:border-blue-500/30 hover:bg-blue-500/5"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
                <icons.ui.plus size={24} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-fg-muted">Nova escola</p>
                <p className="mt-0.5 text-[10px] text-fg-dim">Criar workspace</p>
              </div>
            </motion.button>
          )}
        </div>
      </div>

      <CreateWorkspaceModal
        open={showCreate}
        onClose={() => { setShowCreate(false); onCreated?.() }}
      />
    </motion.div>
  )
}
