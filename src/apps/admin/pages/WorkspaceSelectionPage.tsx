import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import type { Workspace } from '../../../core/workspaces/types'
import { useAuth } from '../../../core/auth/AuthContext'
import { CreateWorkspaceModal } from '../../../core/workspaces/components/CreateWorkspaceModal'
import { icons } from '../../../lib/icons'

const WS_COLORS = [
  { bg: 'bg-indigo-500/10', text: 'text-indigo-500', gradient: 'from-indigo-500 to-purple-500' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500', gradient: 'from-emerald-500 to-teal-500' },
  { bg: 'bg-amber-500/10', text: 'text-amber-500', gradient: 'from-amber-500 to-orange-500' },
  { bg: 'bg-rose-500/10', text: 'text-rose-500', gradient: 'from-rose-500 to-pink-500' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-500', gradient: 'from-cyan-500 to-blue-500' },
  { bg: 'bg-violet-500/10', text: 'text-violet-500', gradient: 'from-violet-500 to-purple-500' },
]

interface WorkspaceSelectionPageProps {
  onSelect: () => void
}

export function WorkspaceSelectionPage({ onSelect }: WorkspaceSelectionPageProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspace, assignedWorkspaces, loading, setWorkspace, reload } = useWorkspace()
  const [showCreate, setShowCreate] = useState(false)

  function handleSelect(ws: Workspace) {
    setWorkspace(ws)
    onSelect()
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Carregando workspaces...</p>
        </div>
      </div>
    )
  }

  const workspaces = assignedWorkspaces
  const canCreate = !!user?.is_super_admin

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 py-12"
      >
        <div className="w-full max-w-4xl">
          {/* Back button */}
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate('/')}
            className="mb-6 flex items-center gap-2 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <icons.ui.back size={14} />
            Voltar ao início
          </motion.button>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-500">
              <icons.ui.shield size={12} />
              Administrador
            </div>
            <h1 className="text-4xl font-black tracking-tight text-fg md:text-5xl">
              Bem-vindo ao<span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent"> Admin</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-fg-muted">
              Selecione um workspace para gerenciar
            </p>
          </motion.div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {workspaces.map((ws, i) => {
              const color = WS_COLORS[i % WS_COLORS.length]
              const isSelected = ws.id === workspace?.id
              return (
                <motion.button
                  key={ws.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(ws)}
                  className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border p-6 transition-all min-h-[160px] ${
                    isSelected
                      ? 'border-indigo-500/40 bg-indigo-500/5 shadow-lg shadow-indigo-500/10'
                      : 'border-line bg-card hover:border-indigo-500/20 hover:shadow-md'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white"
                    >
                      <icons.ui.check size={12} />
                    </motion.div>
                  )}
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color.bg} ${color.text}`}>
                    <icons.ui.home size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-fg">{ws.name}</p>
                    {ws.location && (
                      <p className="mt-0.5 text-[10px] text-fg-dim">{ws.location}</p>
                    )}
                  </div>
                </motion.button>
              )
            })}

            {/* Create card — only for the absolute admin */}
            {canCreate && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: workspaces.length * 0.06 + 0.1, duration: 0.4 }}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowCreate(true)}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-transparent p-6 transition-all min-h-[160px] hover:border-indigo-500/30 hover:bg-indigo-500/5"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
                  <icons.ui.plus size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-fg-muted">Novo Workspace</p>
                  <p className="mt-0.5 text-[10px] text-fg-dim">Criar espaço</p>
                </div>
              </motion.button>
            )}
          </div>

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-12 text-center text-[10px] text-fg-dim"
          >
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} disponíve{workspaces.length !== 1 ? 'is' : 'l'}
          </motion.p>
        </div>
      </motion.div>

      <CreateWorkspaceModal
        open={showCreate}
        onClose={() => { setShowCreate(false); reload() }}
      />
    </>
  )
}
