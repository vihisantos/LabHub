import { useEffect, useMemo, useRef, useState } from 'react'
import { icons } from '../../../lib/icons'
import { ticketSubject } from '../utils/myTickets'
import { ticketService, errorStatus } from '../services/ticketService'
import { Stars } from './Stars'
import {
  canRemindFeedback,
  clearFeedbackReminder,
  recordFeedbackReminder,
} from '../utils/pendingFeedback'
import type { Ticket } from '../types'

interface FeedbackReminderProps {
  /** Chamados concluídos e ainda sem nota, já no escopo pessoal do servidor. */
  pending: Ticket[]
  /** Identidade autenticada — escopo da memória local do lembrete. */
  userId?: string | null
  /** Chamado logo após uma avaliação confirmada pelo servidor (p/ recarregar). */
  onRated?: () => void
}

/**
 * Aviso discreto e NÃO bloqueante de avaliação (issue #370).
 *
 * Recebe a lista de pendências da área pessoal e mostra, no máximo, os chamados
 * que ainda podem ser lembrados (ver `pendingFeedback.ts`). A lista é compacta:
 * um item por chamado, sem vários alertas.
 *
 * A avaliação acontece AQUI, pelo endpoint autenticado (`ticketService.submitFeedback`):
 * o solicitante avalia o próprio chamado mesmo em outro dispositivo, sem depender
 * do tracking token guardado neste navegador. A nota é enviada por `Stars`; só
 * depois da CONFIRMAÇÃO do servidor o item sai da lista e o `onRated` recarrega.
 * Falha mantém o formulário aberto para nova tentativa, sem afirmar sucesso.
 */
export function FeedbackReminder({ pending, userId, onRated }: FeedbackReminderProps) {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [flash, setFlash] = useState('')
  const recorded = useRef<Set<string>>(new Set())

  useEffect(() => {
    const stillPending = new Set(pending.map((ticket) => ticket.id))
    const fresh = pending.filter(
      (ticket) => ticket.id && canRemindFeedback(ticket.id, userId) && !recorded.current.has(ticket.id),
    )
    for (const ticket of fresh) {
      recorded.current.add(ticket.id)
      recordFeedbackReminder(ticket.id, userId)
    }
    setVisible((prev) => {
      // Descarta o que o servidor já não considera pendente (ex.: avaliado em
      // outro dispositivo e recarregado aqui) antes de anexar os novos.
      const pruned = prev.filter((ticket) => stillPending.has(ticket.id))
      const known = new Set(pruned.map((ticket) => ticket.id))
      return [...pruned, ...fresh.filter((ticket) => !known.has(ticket.id))]
    })
  }, [pending, userId])

  const selected = useMemo(
    () => visible.find((ticket) => ticket.id === selectedId) || null,
    [visible, selectedId],
  )

  function dropTicket(ticketId: string) {
    clearFeedbackReminder(ticketId, userId)
    setVisible((prev) => prev.filter((ticket) => ticket.id !== ticketId))
    setSelectedId(null)
    setRating(0)
    setComment('')
    setErrorMsg('')
  }

  function openEvaluation(ticket: Ticket) {
    setSelectedId(ticket.id)
    setRating(0)
    setComment('')
    setErrorMsg('')
    setFlash('')
  }

  async function submit() {
    if (!selected || rating < 1 || submitting) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      await ticketService.submitFeedback(selected.id, rating, comment)
      dropTicket(selected.id)
      setFlash('Obrigado! Sua avaliação foi registrada.')
      onRated?.()
    } catch (err) {
      if (errorStatus(err) === 409) {
        // O servidor confirma que já havia avaliação — não é falha de rede:
        // encerra a pendência sem deixar o formulário preso.
        dropTicket(selected.id)
        setFlash('Este chamado já estava avaliado.')
        onRated?.()
      } else {
        setErrorMsg(
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível enviar a avaliação. Tente novamente.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (dismissed || visible.length === 0) return null

  const single = visible.length === 1

  return (
    <section
      aria-label="Avaliações pendentes"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
          <icons.ui.star size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">
            {single ? 'Como foi o atendimento?' : 'Como foram esses atendimentos?'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
            {single
              ? 'Um chamado concluído ainda não foi avaliado.'
              : `${visible.length} chamados concluídos ainda não foram avaliados.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dispensar lembrete de avaliação"
          title="Agora não"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-input hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <icons.ui.close size={14} />
        </button>
      </div>

      {flash && (
        <p role="status" className="mt-2.5 text-[12px] font-medium text-emerald-600">
          {flash}
        </p>
      )}

      {selected ? (
        <div className="mt-2.5 rounded-lg border border-line bg-card p-3">
          <p className="truncate text-[13px] font-medium text-fg">{ticketSubject(selected)}</p>
          {selected.roomName && (
            <p className="truncate text-[11px] text-fg-muted">{selected.roomName}</p>
          )}

          <div className="mt-2.5">
            <Stars value={rating} onChange={setRating} size={26} disabled={submitting} />
          </div>

          <label className="mt-2.5 block">
            <span className="sr-only">Comentário da avaliação (opcional)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário (opcional)"
              maxLength={500}
              rows={2}
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-line bg-input px-2.5 py-2 text-[12px] text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-60"
            />
          </label>

          {errorMsg && (
            <p role="alert" className="mt-2 text-[11px] leading-relaxed text-red-500">
              {errorMsg}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null)
                setErrorMsg('')
              }}
              disabled={submitting}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-input hover:text-fg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={rating < 1 || submitting}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <icons.ui.star size={12} />
              {submitting ? 'Enviando...' : 'Enviar avaliação'}
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {visible.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => openEvaluation(ticket)}
                className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {ticketSubject(ticket)}
                  </span>
                  {ticket.roomName && (
                    <span className="block truncate text-[11px] text-fg-muted">
                      {ticket.roomName}
                    </span>
                  )}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <icons.ui.star size={12} />
                  Avaliar
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
