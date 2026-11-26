import { icons } from '../../../lib/icons'

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** All current campuses are in São Paulo. Use their local time consistently. */
export function TicketOpenedAt({ createdAt, elapsed, prominent = false }: {
  createdAt?: string
  elapsed?: string
  prominent?: boolean
}) {
  const date = createdAt ? new Date(createdAt) : null
  const valid = date !== null && Number.isFinite(date.getTime())
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          <icons.ui.clock size={14} className="shrink-0" aria-hidden="true" />
          Data e horário de abertura
        </p>
        {valid && date ? (
          <time dateTime={date.toISOString()} className={`mt-1 block font-semibold tabular-nums text-fg ${prominent ? 'text-base' : 'text-sm'}`}>
            {dateFormat.format(date)} às {timeFormat.format(date)}
          </time>
        ) : (
          <p className="mt-1 text-sm text-fg-muted">Horário ainda não disponível</p>
        )}
        {elapsed && valid && <p className="mt-1 text-xs font-medium text-fg-muted">Aberto há {elapsed}</p>}
      </div>
    </div>
  )
}
