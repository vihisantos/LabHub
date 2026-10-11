import { icons } from '../../../lib/icons'

interface QueryErrorProps {
  title: string
  message: string
  onRetry?: () => void
}

/** Erro de consulta com ação de retry. Nunca deixa a tela em branco. */
export function QueryError({ title, message, onRetry }: QueryErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/20">
        <icons.ui.alertCircle size={24} className="text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="max-w-sm text-xs text-fg-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 flex items-center gap-1 rounded-lg bg-input px-4 py-2 text-xs font-medium text-fg-dim transition-colors hover:text-fg"
        >
          <icons.ui.refresh size={14} />
          Tentar novamente
        </button>
      )}
    </div>
  )
}
