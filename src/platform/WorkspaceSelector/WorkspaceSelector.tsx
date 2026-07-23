import { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { icons } from '../../lib/icons'

export function WorkspaceSelector() {
  const { workspace, workspaces, setWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!workspace) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-input"
      >
        <icons.ui.home size={14} className="text-fg-muted" />
        <span className="max-w-[120px] truncate">{workspace.name}</span>
        <icons.ui.chevronDown size={12} className="text-fg-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl bg-card border border-line shadow-2xl overflow-hidden z-50">
          <div className="border-b border-line px-4 py-3">
            <p className="text-xs font-semibold text-fg-muted">Trocar Workspace</p>
          </div>

          <div className="max-h-60 overflow-y-auto p-2">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => { setWorkspace(ws); setOpen(false) }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  ws.id === workspace.id ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-input text-fg'
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  ws.id === workspace.id ? 'bg-amber-500/15' : 'bg-input'
                }`}>
                  <icons.ui.home size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{ws.name}</p>
                  <p className="text-[10px] text-fg-dim">{ws.location}</p>
                </div>
                {ws.id === workspace.id && (
                  <icons.ui.check size={14} className="shrink-0 text-amber-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
