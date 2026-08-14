import { useRef } from 'react'
import { motion } from 'framer-motion'
import type { Workspace } from '../../../core/workspaces/types'
import { icons } from '../../../lib/icons'

function useLongPress(callback: () => void, ms = 550) {
  const timerRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const start = () => {
    firedRef.current = false
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      callback()
    }, ms)
  }
  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return {
    shouldIgnoreClick: () => {
      if (firedRef.current) {
        firedRef.current = false
        return true
      }
      return false
    },
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        clear()
        callback()
      },
    },
  }
}

interface WorkspaceStats {
  chamados: number
  estoque: number
}

interface WorkspaceCardProps {
  workspace: Workspace
  color: { bg: string; text: string; gradient: string }
  index: number
  canManage: boolean
  stats?: WorkspaceStats
  onSelect: () => void
  onManage: () => void
}

export function WorkspaceCard({ workspace, color, index, canManage, stats, onSelect, onManage }: WorkspaceCardProps) {
  const longPress = useLongPress(() => {
    if (canManage) onManage()
  })

  const wsColor = workspace.color || color.text

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.06, duration: 0.4 }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        if (longPress.shouldIgnoreClick()) return
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (longPress.shouldIgnoreClick()) return
          onSelect()
        }
      }}
      {...longPress.handlers}
      className="group relative flex min-h-[150px] cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-card p-6 transition-all hover:border-blue-500/20 hover:shadow-md"
    >
      {canManage && (
        <button
          type="button"
          aria-label="Opções do workspace"
          onClick={(e) => {
            e.stopPropagation()
            onManage()
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-fg-dim opacity-0 transition-all hover:bg-input hover:text-fg focus:opacity-100 group-hover:opacity-100"
        >
          <icons.ui.moreHorizontal size={16} />
        </button>
      )}

      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: wsColor + '18', color: wsColor }}
      >
        <icons.ui.home size={24} />
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-fg">{workspace.name}</p>
        {workspace.location && <p className="mt-0.5 text-[10px] text-fg-dim">{workspace.location}</p>}
      </div>

      {stats && (stats.chamados > 0 || stats.estoque > 0) && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {stats.chamados > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-500">
              <icons.ui.alertCircle size={9} />
              {stats.chamados}
            </span>
          )}
          {stats.estoque > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-500">
              <icons.ui.package size={9} />
              {stats.estoque}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
        Entrar
        <icons.ui.chevronRight size={10} />
      </div>
    </motion.div>
  )
}
