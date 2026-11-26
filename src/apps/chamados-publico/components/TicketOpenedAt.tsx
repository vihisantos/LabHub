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
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
      <icons.ui.calendar size={20} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Data e horário de abertura</p>
        {valid && date ? (
          <time dateTime={date.toISOString()} className={`mt-1 block font-bold tabular-nums text-fg ${prominent ? 'text-lg' : 'text-base'}`}>
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
