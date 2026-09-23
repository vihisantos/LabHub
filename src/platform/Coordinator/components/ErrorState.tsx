import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

interface ErrorStateProps {
  message: string
  /**
   * Retry opcional — só aparece quando o fluxo atual já possui retry. A
   * chamada é repassada intacta; nada de ação nova aqui.
   */
  onRetry?: () => void
  className?: string
}

/**
 * Estado de erro integrado ao painel (PR visual).
 *
 * Apresentação somente: ícone + mensagem + botão de retry opcional. Preserva a
 * mensagem honesta recebida do chamador e o rótulo "Tentar novamente" quando há
 * retry; nunca inventa ação nem altera a lógica de tratamento de erro.
 */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3.5 py-3',
        className,
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
        <icons.ui.alertTriangle size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  )
}