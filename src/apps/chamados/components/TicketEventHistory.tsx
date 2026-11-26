import { icons } from '../../../lib/icons'
import type { TicketEvent, TicketEventType } from '../types'

const labels: Record<TicketEventType, string> = {
  status: 'Alteração de status',
  comentario: 'Comentário',
  foto: 'Foto',
  prioridade: 'Alteração de prioridade',
  atribuicao: 'Atribuição',
}

function eventTime(value: string) {
  if (!value || !value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return { iso: date.toISOString(), text: date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) }
}

/** Render the received event sequence without reordering or inventing metadata. */
export function TicketEventHistory({ events, onPhotoClick }: {
  events: TicketEvent[]
  onPhotoClick: (url: string) => void
}) {
  return (
    <ol aria-label="Eventos do histórico" className="space-y-0">
      {events.map((ev, index) => {
        const author = ev.author?.trim()
        // Only an explicitly recorded system author is shown as a system event.
        const system = author?.toLowerCase() === 'sistema'
        const time = eventTime(ev.createdAt)
        const Icon = ev.type === 'status' ? icons.ui.clock : icons.ui.user
        return (
          <li key={ev.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3 top-7 w-px bg-line" />}
            <span aria-hidden="true" className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${system ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-fg-muted/10 text-fg-muted'}`}>
              <Icon size={12} />
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface/50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-fg">{labels[ev.type] ?? 'Evento'}</p>
                {time ? <time dateTime={time.iso} className="text-[11px] tabular-nums text-fg-muted">{time.text}</time>
                  : <span className="text-[11px] text-fg-muted">Data e horário não informados</span>}
              </div>
              <p className="mt-1 break-words text-[11px] text-fg-muted">
                {system ? 'Evento do sistema' : author ? 'Responsável' : 'Autor não informado'}
                {author && <span className="ml-1 font-medium text-fg">{author}</span>}
              </p>
              {ev.content && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-fg">{ev.content}</p>}
              {ev.reasonLabel && <p className="mt-1 break-words text-xs text-fg-muted">Motivo: {ev.reasonLabel}</p>}
              {ev.photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {ev.photos.map((url, i) => (
                    <button key={`${ev.id}-${i}`} type="button" onClick={() => onPhotoClick(url)}
                      className="h-16 w-16 overflow-hidden rounded-lg border border-line">
                      <img src={url} alt={`Foto do evento ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
