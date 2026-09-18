import { icons } from '../../../lib/icons'
import { SheetOrDialog } from '../../../responsive'

interface ConfirmActionSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirmação destrutiva (suspender, remover, rejeitar, restaurar). Preserva a
 * semântica ARIA de `alertdialog` nas DUAS faixas via `role` do SheetOrDialog:
 * - compact/tablet → BottomSheet com conteúdo `role="alertdialog"`;
 * - desktop/wide → Dialog (Radix) com `role="alertdialog"`.
 * O servidor continua a autoridade; a confirmação forte evita ações acidentais.
 */
export function ConfirmActionSheet({
  open,
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmActionSheetProps) {
  return (
    <SheetOrDialog
      open={open}
      onClose={onClose}
      title={title}
      role="alertdialog"
      className="max-w-sm"
    >
      <div className="flex flex-col gap-2 px-5 pb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
            <icons.ui.alertTriangle size={18} />
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">{message}</p>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
          >
            {busy ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </SheetOrDialog>
  )
}