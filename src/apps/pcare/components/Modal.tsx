import { useEffect, useRef, type ReactNode } from 'react'
import { icons } from '../../../lib/icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const CloseIcon = icons.ui.close

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center animate-[fade-in-up_0.2s_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl outline-none sm:rounded-2xl animate-[fade-in-up_0.25s_ease-out]" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="modal-title" className="text-lg font-semibold text-fg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-input hover:text-fg"
            aria-label="Fechar"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'warning'
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', variant = 'danger' }: ConfirmDialogProps) {
  const btnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-amber-600 hover:bg-amber-700'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-sm text-fg-dim">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-line px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-input"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { onConfirm(); onClose() }}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-fg transition-colors ${btnClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
