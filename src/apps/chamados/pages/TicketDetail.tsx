import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_NOTE_PRESETS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import { getPriority, getSlaInfo } from '../services/sla'
import { ticketService } from '../services/ticketService'
import { Stars } from '../components/Stars'
import { icons } from '../../../lib/icons'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useAuth } from '../../../core/auth/useAuth'
import { userService } from '../../../core/users/service'
import { uploadPhotos } from '../utils/photo'
import type { Ticket, TicketPriority, TicketStatus } from '../types'
import type { TicketEvent } from '../types'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'

const STATUS_FLOW: TicketStatus[] = ['aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado']

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function slaConfigFor(ticket: Ticket) {
  return slaConfigService.getHoursForTickets()[ticket.workspace_id ?? ''] ?? null
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tickets, update, updateStatus, create } = useTickets()
  const { isFullAccess } = useAppAccess()
  const { user } = useAuth()
  const canWrite = isFullAccess('chamados')
  const ticket = tickets.find((t) => t.id === id)
  const [noteInput, setNoteInput] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [comment, setComment] = useState('')
  const [commentPhotos, setCommentPhotos] = useState<string[]>([])
  const [commentError, setCommentError] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    ticketService
      .getEvents(id)
      .then((evs) => {
        if (alive) setEvents(evs)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  // ── Realtime: novos comentários de outros técnicos aparecem na hora ──
  type TicketEventRow = {
    id: string
    ticket_id: string
    type: string
    content: string
    author: string
    photo_urls: string
    createdAt: string
  }
  useRealtimeSubscription<TicketEventRow>(
    'ticket_events',
    'INSERT',
    (payload) => {
      const row = payload.new as TicketEventRow
      if (!row || row.ticket_id !== id) return
      const ev: TicketEvent = {
        id: row.id,
        ticket_id: row.ticket_id,
        type: row.type as TicketEvent['type'],
        content: row.content,
        author: row.author,
        photos: (() => { try { return JSON.parse(row.photo_urls || '[]') } catch { return [] } })(),
        createdAt: row.createdAt,
      }
      setEvents((prev) => {
        if (prev.some((e) => e.id === ev.id)) return prev
        return [ev, ...prev]
      })
    },
    { channelName: `chamados:events:${id ?? 'none'}`, enabled: !!id },
  )

  const assignees = userService.getAll()

  function handleAssign(userId: string, name: string) {
    if (!ticket) return
    if ((ticket.assignedToUserId ?? '') === userId && ticket.assignedTo === name) return
    update(ticket.id, { assignedTo: name, assignedToUserId: userId })
  }

  function handleAssignToMe() {
    if (!ticket || !user) return
    const profile = userService.getByUserId(user.id)
    handleAssign(user.id, profile?.displayName || user.name)
  }

  const history = useMemo(() => {
    if (!ticket) return []
    return tickets
      .filter((t) => t.assetId === ticket.assetId && t.assetSource === ticket.assetSource && t.id !== ticket.id)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  }, [ticket, tickets])

  if (!ticket) {
    return (
      <div className="flex flex-col items-center py-12">
        <icons.ui.alertCircle size={40} className="text-fg-muted" />
        <p className="mt-3 text-sm text-fg-muted">Chamado não encontrado</p>
      </div>
    )
  }

  const currentIndex = STATUS_FLOW.indexOf(ticket.status)
  const nextStatus = currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null

  const slaInfo = getSlaInfo(ticket.createdAt, ticket.priority, ticket.status, slaConfigFor(ticket))

  const claimedByMe = (ticket.assignedToUserId || '') === (user?.id || '')
  const claimedByOther =
    !!ticket.assignedTo && !claimedByMe && (ticket.status === 'a_caminho' || ticket.status === 'em_atendimento')

  function handleAdvanceStatus() {
    if (!nextStatus || !ticket) return
    if (nextStatus === 'a_caminho') {
      const profile = userService.getByUserId(user?.id || '')
      update(ticket.id, { status: nextStatus, assignedTo: profile?.displayName || user?.name, assignedToUserId: user?.id })
    } else if (nextStatus === 'fechado') {
      update(ticket.id, {
        status: nextStatus,
        archived: true,
        closedAt: new Date().toISOString(),
        closedBy: user?.name,
      })
    } else {
      updateStatus(ticket.id, nextStatus)
    }
  }

  function handleReopen() {
    if (!ticket) return
    update(ticket.id, {
      status: 'aberto',
      archived: false,
      closedAt: null,
      closedBy: '',
    })
  }

  // Reabrir com novo número: cria um chamado novo com a mesma sala,
  // equipamento e problema do fechado — sem reabrir o original.
  async function handleReopenNew() {
    if (!ticket) return
    try {
      const created = await create({
        workspace_id: ticket.workspace_id,
        roomId: ticket.roomId,
        roomName: ticket.roomName,
        assetId: ticket.assetId,
        assetSource: ticket.assetSource,
        assetName: ticket.assetName,
        assetPatrimony: ticket.assetPatrimony,
        problemCategory: ticket.problemCategory,
        problemArea: ticket.problemArea,
        problemDescription: ticket.problemDescription,
        status: 'aberto',
        reportedBy: ticket.reportedBy,
        reportedByEmail: ticket.reportedByEmail,
        assignedTo: '',
      })
      navigate(`/chamados/tickets/${created.id}`)
    } catch {
      // Falha silenciosa: o toast/estado de erro fica no card original.
    }
  }

  function handlePriority(next: TicketPriority) {
    if (!ticket || next === getPriority(ticket.priority)) return
    update(ticket.id, { priority: next })
  }

  async function handleCommentPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0 || commentPhotos.length >= 2) return
    setUploading(true)
    setCommentError('')
    try {
      const urls = await uploadPhotos(files, 2 - commentPhotos.length)
      setCommentPhotos((prev) => [...prev, ...urls].slice(0, 2))
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Não foi possível anexar a foto.')
    } finally {
      setUploading(false)
    }
  }

  async function handleAddComment() {
    if (!ticket || (!comment.trim() && commentPhotos.length === 0) || sending) return
    setSending(true)
    setCommentError('')
    try {
      const ev = await ticketService.addEvent(ticket.id, {
        content: comment.trim(),
        author: user?.name || 'Sistema',
        photos: commentPhotos,
      })
      setEvents((prev) => [ev, ...prev])
      setComment('')
      setCommentPhotos([])
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Não foi possível enviar o comentário.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {slaInfo?.state === 'overdue' && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <icons.ui.alertTriangle size={16} className="shrink-0 text-red-500" />
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {slaInfo.label} — prazo foi {formatDate(slaInfo.deadline.toISOString())}
          </p>
        </div>
      )}

      {ticket.status === 'a_caminho' && ticket.assignedTo && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <icons.ui.mapPin size={16} className="shrink-0 text-orange-500" />
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
            {claimedByMe ? 'Você está a caminho do local' : `${ticket.assignedTo} está a caminho`}
          </p>
        </div>
      )}

      {ticket.statusNote && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <icons.ui.messageSquareWarning size={16} className="mt-0.5 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{ticket.statusNote}</p>
            <p className="mt-0.5 text-[10px] text-fg-dim">Mensagem visível para o professor</p>
          </div>
        </div>
      )}

      {canWrite &&
        (ticket.status === 'aberto' || ticket.status === 'a_caminho' || ticket.status === 'em_atendimento') && (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted">Mensagem para o professor</h3>
            <div className="flex flex-wrap gap-1.5">
              {TICKET_STATUS_NOTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => update(ticket.id, { statusNote: preset })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    ticket.statusNote === preset
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-line bg-surface text-fg-muted hover:border-blue-500 hover:text-blue-500'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Mensagem personalizada..."
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (noteInput.trim()) {
                    update(ticket.id, { statusNote: noteInput.trim() })
                    setNoteInput('')
                  }
                }}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-400"
              >
                Definir
              </button>
            </div>
            {ticket.statusNote && (
              <button
                type="button"
                onClick={() => update(ticket.id, { statusNote: '' })}
                className="mt-2 text-[11px] font-medium text-fg-dim transition-colors hover:text-red-500"
              >
                Remover mensagem
              </button>
            )}
          </div>
        )}

      {canWrite && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-2 text-xs font-semibold text-fg-muted">Atribuição</h3>
          <div className="flex gap-2">
            <select
              value={ticket.assignedToUserId ?? ''}
              onChange={(e) => {
                const userId = e.target.value
                const name = userId
                  ? (assignees.find((a) => a.userId === userId)?.displayName ?? '')
                  : ''
                handleAssign(userId, name)
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-amber-500 focus:outline-none"
            >
              <option value="">Sem responsável</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.userId}>{a.displayName}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssignToMe}
              className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-400"
            >
              Pegar para mim
            </button>
          </div>
        </div>
      )}

      {ticket.status === 'fechado' && (
        <div className="rounded-xl border border-line bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <icons.ui.folder size={16} className="shrink-0 text-fg-muted" />
            <p className="text-xs font-medium text-fg-muted">
              Chamado arquivado{ticket.closedAt ? ` em ${formatDate(ticket.closedAt)}` : ''}
              {ticket.closedBy ? ` por ${ticket.closedBy}` : ''}
            </p>
          </div>
          {canWrite && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={handleReopen}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-500"
              >
                Reabrir chamado
              </button>
              <button
                type="button"
                onClick={handleReopenNew}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
              >
                <icons.ui.plus size={16} />
                Abrir novo chamado (mesma sala/problema)
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`rounded-xl bg-card p-5 shadow-[var(--shadow-card)] ${slaInfo?.state === 'overdue' ? 'ring-1 ring-red-500/50' : ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-2xl font-bold text-amber-500">#{ticket.ticketNumber}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
        </div>

        <div className="mb-4 space-y-3 rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg-muted">Prioridade</span>
            {canWrite ? (
              <div className="flex gap-1">
                {TICKET_PRIORITIES.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => handlePriority(priority)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      getPriority(ticket.priority) === priority
                        ? TICKET_PRIORITY_COLORS[priority]
                        : 'text-fg-dim hover:text-fg'
                    }`}
                  >
                    {TICKET_PRIORITY_LABELS[priority]}
                  </button>
                ))}
              </div>
            ) : (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TICKET_PRIORITY_COLORS[getPriority(ticket.priority)]}`}>
                {TICKET_PRIORITY_LABELS[getPriority(ticket.priority)]}
              </span>
            )}
          </div>
          {slaInfo && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted">Prazo de atendimento</span>
              <span className="text-xs font-semibold text-fg">{formatDate(slaInfo.deadline.toISOString())}</span>
            </div>
          )}
          {slaInfo && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted">SLA</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  slaInfo.state === 'overdue'
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : slaInfo.state === 'near'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {slaInfo.state === 'overdue' ? `Em atraso · ${slaInfo.label}` : slaInfo.label}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-start gap-3">
            <icons.ui.home size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Sala</p>
              <p className="text-sm font-medium text-fg">{ticket.roomName}</p>
            </div>
          </div>
          {ticket.assetName && (
            <div className="flex items-start gap-3">
              <icons.nav.pcs size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Equipamento</p>
                <p className="text-sm font-medium text-fg">{ticket.assetName}</p>
                {ticket.assetPatrimony && (
                  <p className="text-[11px] text-fg-dim">Patrimônio: {ticket.assetPatrimony}</p>
                )}
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <icons.ui.alertCircle size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Problema</p>
              <p className="text-sm font-medium text-fg">{ticket.problemCategory}</p>
              {ticket.problemArea && (
                <p className="text-[11px] text-fg-dim">
                  {ticket.problemArea === 'administrativa' ? 'Área Administrativa' : 'Área Acadêmica'}
                </p>
              )}
            </div>
          </div>
          {ticket.problemDescription && (
            <div className="flex items-start gap-3">
              <icons.ui.fileBarChart size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Descrição</p>
                <p className="text-sm text-fg">{ticket.problemDescription}</p>
              </div>
            </div>
          )}
          {ticket.photos && (
            <div className="flex items-start gap-3">
              <icons.ui.camera size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Foto do problema</p>
                <button
                  type="button"
                  onClick={() => setLightbox(ticket.photos ?? null)}
                  className="mt-1 block h-24 w-24 overflow-hidden rounded-xl border border-line"
                >
                  <img src={ticket.photos} alt="Foto do problema" className="h-full w-full object-cover" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <icons.ui.user size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Reportado por</p>
              <p className="text-sm font-medium text-fg">{ticket.reportedBy}</p>
              {ticket.reportedByEmail && (
                <p className="text-[11px] text-fg-dim">{ticket.reportedByEmail}</p>
              )}
            </div>
          </div>
          {ticket.assignedTo && (
            <div className="flex items-start gap-3">
              <icons.ui.userCheck size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Responsável</p>
                <p className="text-sm font-medium text-fg">{ticket.assignedTo}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {ticket.feedbackRating && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Feedback do professor</h3>
          <div className="flex items-center justify-between">
            <Stars value={ticket.feedbackRating} disabled size={18} />
            {ticket.feedbackAt && (
              <span className="text-[10px] text-fg-dim">{formatDate(ticket.feedbackAt)}</span>
            )}
          </div>
          {ticket.feedbackComment && (
            <p className="mt-2 text-sm text-fg">{ticket.feedbackComment}</p>
          )}
        </div>
      )}

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Histórico</h3>
        {canWrite && (
          <div className="mb-4 rounded-xl border border-line bg-surface p-3">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário interno sobre o atendimento..."
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none"
            />
            {commentPhotos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {commentPhotos.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setCommentPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="group relative h-14 w-14 overflow-hidden rounded-lg border border-line"
                  >
                    <img src={url} alt={`Anexo ${i + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <icons.ui.close size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {commentError && <p className="mt-2 text-[11px] text-red-500">{commentError}</p>}
            <div className="mt-2 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg">
                <icons.ui.paperclip size={14} />
                {commentPhotos.length === 0 ? 'Anexar foto (máx 2)' : `Fotos: ${commentPhotos.length}/2`}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleCommentPhoto}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleAddComment}
                disabled={(!comment.trim() && commentPhotos.length === 0) || sending || uploading}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? '...' : 'Comentar'}
              </button>
            </div>
          </div>
        )}
        {events.length === 0 ? (
          <p className="text-xs text-fg-dim">Nenhum registro ainda</p>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    ev.type === 'status'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'bg-fg-muted/10 text-fg-muted'
                  }`}
                >
                  {ev.type === 'status' ? <icons.ui.clock size={12} /> : <icons.ui.user size={12} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold text-fg">{ev.author}</p>
                    <span className="shrink-0 text-[10px] text-fg-dim">{formatDate(ev.createdAt)}</span>
                  </div>
                  {ev.content && <p className="mt-0.5 text-xs text-fg-muted">{ev.content}</p>}
                  {ev.photos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {ev.photos.map((url, i) => (
                        <button
                          key={`${ev.id}-${i}`}
                          type="button"
                          onClick={() => setLightbox(url)}
                          className="h-16 w-16 overflow-hidden rounded-lg border border-line"
                        >
                          <img src={url} alt={`Foto do evento ${i + 1}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Timeline</h3>
        <div className="space-y-3">
          {STATUS_FLOW.map((status, i) => {
            const isPast = i <= currentIndex
            const isCurrent = i === currentIndex
            return (
              <div key={status} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCurrent ? 'bg-amber-500 text-white' : isPast ? 'bg-emerald-500/20 text-emerald-500' : 'bg-input text-fg-muted'
                }`}>
                  {isPast ? <icons.ui.check size={12} /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-medium ${isCurrent ? 'text-fg' : isPast ? 'text-fg-muted' : 'text-fg-dim'}`}>
                    {TICKET_STATUS_LABELS[status]}
                  </p>
                </div>
                {isCurrent && ticket.resolvedAt && status === 'resolvido' && (
                  <span className="text-[10px] text-fg-dim">{formatDate(ticket.resolvedAt)}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canWrite && claimedByOther && (
        <div className="flex items-center gap-2 rounded-xl bg-input/60 px-4 py-3">
          <icons.ui.userCheck size={16} className="shrink-0 text-fg-muted" />
          <p className="text-xs text-fg-muted">{ticket.assignedTo} já está atendendo este chamado</p>
        </div>
      )}

      {canWrite && nextStatus && !claimedByOther && (
        <button
          type="button"
          onClick={handleAdvanceStatus}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          {nextStatus === 'a_caminho' && 'Assumir chamado'}
          {nextStatus === 'em_atendimento' && 'Iniciar Atendimento'}
          {nextStatus === 'resolvido' && 'Marcar como Resolvido'}
          {nextStatus === 'fechado' && 'Fechar Chamado'}
        </button>
      )}

      {history.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Histórico deste equipamento</h3>
          <div className="space-y-2">
            {history.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">#{t.ticketNumber} — {t.problemCategory}</span>
                <span className="text-[10px] text-fg-dim">
                  {(() => { const d = new Date(t.createdAt); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') })()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <img
            src={lightbox}
            alt="Foto do problema"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
          <span className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
            <icons.ui.close size={18} />
          </span>
        </button>
      )}
    </div>
  )
}
