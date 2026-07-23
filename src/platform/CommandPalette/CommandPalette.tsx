import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '../../core/search/useSearch'
import { icons } from '../../lib/icons'

const MODULE_ICONS: Record<string, string> = {
  pcare: 'monitor',
  stock: 'package',
  chamados: 'alertCircle',
  tv: 'tv',
  reservalab: 'flaskConical',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { query, results, search, clear } = useSearch()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      clear()
    }
  }, [open, clear])

  const handleSelect = useCallback((url: string) => {
    setOpen(false)
    clear()
    navigate(url)
  }, [navigate, clear])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card shadow-2xl border border-line overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <icons.ui.search size={18} className="text-fg-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar salas, ativos, chamados..."
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-dim focus:outline-none"
          />
          <kbd className="rounded-md bg-input px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {query && results.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-fg-muted">Nenhum resultado para "{query}"</p>
            </div>
          )}

          {!query && (
            <div className="py-8 text-center">
              <p className="text-xs text-fg-dim">Digite para buscar em todos os módulos</p>
            </div>
          )}

          {results.map((result) => {
            const iconName = MODULE_ICONS[result.module] || 'inbox'
            const IconComponent = icons.ui[iconName as keyof typeof icons.ui] || icons.ui.inbox

            return (
              <button
                key={result.id}
                type="button"
                onClick={() => handleSelect(result.actionUrl)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-input"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: result.moduleColor + '15', color: result.moduleColor }}
                >
                  <IconComponent size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">{result.title}</p>
                  <p className="text-[11px] text-fg-muted truncate">{result.subtitle}</p>
                </div>
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium"
                  style={{ backgroundColor: result.moduleColor + '15', color: result.moduleColor }}
                >
                  {result.module}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
