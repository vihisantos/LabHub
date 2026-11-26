import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ticketService } from '../../chamados/services/ticketService'
import { publicTicketService, toTicket } from '../../chamados/services/publicTicketService'
import { Stars } from '../../chamados/components/Stars'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../../chamados/types'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useAuth } from '../../../core/auth/useAuth'
import type { Ticket, TicketStatus } from '../../chamados/types'
import { CampusHero } from '../components/CampusBackdrop'
import { FeedbackSheet } from '../components/FeedbackSheet'
import { campusArtworkLabel, readTicketCampus } from '../utils/campusArtwork'
import { rememberRecentTicket, trackingPath } from '../utils/recentTickets'
import { TicketOpenedAt } from '../components/TicketOpenedAt'
import './TicketSuccess.css'

const STATUS_MESSAGES: Record<TicketStatus, string> = {
  aberto: 'Aguardando técnico',
  a_caminho: 'Técnico a caminho',
  em_atendimento: 'Atendendo agora',
  em_espera: 'Em espera',
  resolvido: 'Chamado resolvido',
  indeferido: 'Chamado indeferido',
  fechado: 'Chamado concluído',
}

const STATUS_HERO = {
  aberto: { title: 'Chamado enviado!', description: 'Seu chamado foi registrado. Ele está aguardando atendimento da equipe.', Icon: icons.ui.checkCircle, color: 'bg-emerald-500/15 text-emerald-500' },
  a_caminho: { title: 'Técnico a caminho!', description: 'A equipe de TI está a caminho para atender você.', Icon: icons.ui.mapPin, color: 'bg-orange-500/15 text-orange-400' },
  em_atendimento: { title: 'Estamos cuidando disso!', description: 'Seu chamado está em atendimento.', Icon: icons.nav.parts, color: 'bg-blue-500/15 text-blue-400' },
  em_espera: { title: 'Atendimento em espera', description: 'Acompanhe as atualizações da equipe por aqui.', Icon: icons.ui.clock, color: 'bg-violet-500/15 text-violet-400' },
  resolvido: { title: 'Problema resolvido!', description: 'A equipe marcou seu chamado como resolvido.', Icon: icons.ui.checkCircle, color: 'bg-emerald-500/15 text-emerald-500' },
  fechado: { title: 'Chamado concluído!', description: 'O atendimento foi encerrado.', Icon: icons.ui.checkCircle, color: 'bg-emerald-500/15 text-emerald-500' },
  indeferido: { title: 'CHAMADO INDEFERIDO', description: 'Este chamado não será atendido pela equipe de TI.', Icon: icons.ui.close, color: 'bg-red-500/15 text-red-500' },
} satisfies Record<TicketStatus, { title: string; description: string; Icon: typeof icons.ui.checkCircle; color: string }>

const POLL_INTERVAL_MS = 15000
const FEEDBACK_PROMPT_DELAY_MS = 480

function statusMessage(ticket: Ticket): string {
  return (ticket.statusNote || STATUS_MESSAGES[ticket.status] || '').trim()
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* ── Push helpers isolados do fluxo crítico ─────────────────── */

function isNotificationAvailable(): boolean {
  try {
    return typeof Notification !== 'undefined'
  } catch {
    return false
  }
}

function isPushSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      isNotificationAvailable()
    )
  } catch {
    return false
  }
}

function safeGetNotificationPermission(): NotificationPermission | 'unavailable' {
  if (!isNotificationAvailable()) return 'unavailable'
  try {
    return Notification.permission
  } catch {
    return 'unavailable'
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage indisponível — silencioso
  }
}

function showStatusNotification(ticket: Ticket): void {
  if (!isNotificationAvailable()) return
  try {
    if (Notification.permission !== 'granted') return
    if (document.hidden === undefined) return
    if (!document.hidden) return
    const message = statusMessage(ticket)
    const notification = new Notification(`Chamado #${ticket.ticketNumber || '?'}`, {
      body: `Status: ${TICKET_STATUS_LABELS[ticket.status]}${message ? ` — ${message}` : ''}`,
      tag: `chamado-${ticket.id}-status`,
      icon: '/icon-192.png',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Notificação nativa indisponível
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/* ── Componente ─────────────────────────────────────────────── */

export function TicketSuccess() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  // Logado: já recebe a evolução do chamado pela inscrição de app — não precisa
  // da inscrição anônima por-chamado (botão "notificações deste chamado" só p/ anônimo).
  const isLoggedIn = !!user
  const [ticket, setTicket] = useState<Ticket | null>(() =>
    ticketId ? (ticketService.getById(ticketId) ?? null) : null,
  )
  // Tracking token: credencial do professor (acesso ao próprio chamado).
  // Lido da URL e do localStorage; removido da URL imediatamente (replaceState).
  const [trackingToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    // Links de compartilhamento usam fragmento: a credencial não vai ao servidor.
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const urlToken = fragment.get('token') || params.get('token')
    const stored = urlToken || safeLocalStorageGet(`chamado_token_${ticketId ?? ''}`)
    if (urlToken && ticketId) {
      safeLocalStorageSet(`chamado_token_${ticketId}`, urlToken)
    }
    if (urlToken) {
      window.history.replaceState({}, '', `/chamados-publico/success/${ticketId ?? ''}`)
    }
    return stored || ''
  })
  const [offline, setOffline] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [pushState, setPushState] = useState<'off' | 'on' | 'denied' | 'loading'>('off')
  const [linkCopied, setLinkCopied] = useState(false)
  const [linkCopyError, setLinkCopyError] = useState(false)
  const [codeVisible, setCodeVisible] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [codeCopyError, setCodeCopyError] = useState(false)
  const lastStatusRef = useRef(ticket?.status)

  const [showRatingModal, setShowRatingModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratingDone, setRatingDone] = useState(false)
  const [ratingError, setRatingError] = useState('')
  const hasShownRatingRef = useRef(false)
  const [feedbackConfirmed, setFeedbackConfirmed] = useState(false)
  const feedbackEligible = feedbackConfirmed && !!trackingToken && !notFound && !!ticket &&
    (ticket.status === 'resolvido' || ticket.status === 'fechado') && !ticket.feedbackRating && !ratingDone

  // One automatic prompt per visit, after the token-scoped API confirms the
  // current ticket. A reload/remount asks again if feedback is still missing.
  useEffect(() => {
    if (!feedbackEligible || showRatingModal || hasShownRatingRef.current) return
    const timer = window.setTimeout(() => {
      hasShownRatingRef.current = true
      setShowRatingModal(true)
    }, FEEDBACK_PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [feedbackEligible, showRatingModal])

  useEffect(() => {
    if (!feedbackEligible && !ratingDone && showRatingModal && !ratingSubmitting) {
      setShowRatingModal(false)
    }
  }, [feedbackEligible, ratingDone, showRatingModal, ratingSubmitting])

  useEffect(() => {
    if (!ratingDone) return
    const timer = window.setTimeout(() => setShowRatingModal(false), 1500)
    return () => window.clearTimeout(timer)
  }, [ratingDone])

  function openFeedback() {
    hasShownRatingRef.current = true
    setShowRatingModal(true)
  }

  function closeFeedback() {
    if (!ratingSubmitting) setShowRatingModal(false)
  }

  /* Inicialização do push state — isolada do fluxo crítico */
  useEffect(() => {
    const id = ticket?.id
    if (!id) return
    if (!isPushSupported()) return

    const stored = safeLocalStorageGet(`labhub_chamado_push_${id}`) === '1'
    const perm = safeGetNotificationPermission()
    if (perm === 'unavailable') return

    if (stored) {
      setPushState(perm === 'granted' ? 'on' : 'off')
    } else if (perm === 'denied') {
      setPushState('denied')
    }
  }, [ticket?.id])

  const activatePush = async () => {
    if (!ticket) return
    if (!isPushSupported()) return
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushState('denied')
        return
      }
      setPushState('loading')
      const registration = await navigator.serviceWorker.ready
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushState('off')
        return
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as string,
      })
      if (!trackingToken) {
        // Sem tracking token não há endpoint de inscrição anônimo.
        setPushState('off')
        return
      }
      // Endpoint público com escopo no chamado (token do professor).
      await publicTicketService.subscribe(
        trackingToken,
        subscription.toJSON() as unknown as Record<string, unknown>,
      )
      safeLocalStorageSet(`labhub_chamado_push_${ticket.id}`, '1')
      setPushState('on')
    } catch {
      setPushState('off')
    }
  }

  async function handleSubmitRating() {
    if (!ticket || !feedbackEligible || rating < 1 || ratingSubmitting) return
    setRatingSubmitting(true)
    setRatingError('')
    try {
      if (!trackingToken) {
        setRatingError('Código de acompanhamento necessário para avaliar.')
        setRatingSubmitting(false)
        return
      }
      const pub = await publicTicketService.submitFeedback(trackingToken, rating, ratingComment.trim())
      setTicket(toTicket(pub))
      rememberRecentTicket(pub, trackingToken)
      setRatingDone(true)
      setRatingSubmitting(false)
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.')
      setRatingSubmitting(false)
    }
  }

  useEffect(() => {
    if (!ticketId || ticketId === 'undefined') return
    let alive = true
    async function poll() {
      if (!trackingToken) return
      try {
        const fresh = toTicket(await publicTicketService.getByToken(trackingToken))
        if (!alive) return
        setTicket(fresh)
        rememberRecentTicket(fresh, trackingToken)
        setFeedbackConfirmed(true)
        setOffline(false)
        setNotFound(false)
        if (lastStatusRef.current && lastStatusRef.current !== fresh.status) {
          showStatusNotification(fresh)
        }
        lastStatusRef.current = fresh.status
      } catch (err) {
        if (!alive) return
        setOffline(true)
        if (err instanceof Error && err.message.toLowerCase().includes('não encontrado')) {
          setNotFound(true)
        }
      }
    }
    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [trackingToken, ticketId])

  useRealtimeSubscription<{ id: string; status: string; statusNote: string; updatedAt: string }>(
    'chamados_tickets',
    '*',
    (payload) => {
      if ((payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') && payload.new.id === ticketId) {
        const updated = payload.new as unknown as Ticket
        setTicket((prev) => (prev ? { ...prev, ...updated } : prev))
        setOffline(false)
        setNotFound(false)
        if (lastStatusRef.current && lastStatusRef.current !== updated.status) {
          showStatusNotification(updated)
        }
        lastStatusRef.current = updated.status
      }
    },
    { channelName: `chamados:public:${ticketId ?? 'none'}`, enabled: !!ticketId },
  )

  if (!ticket || notFound) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">
          {notFound ? 'Chamado não encontrado' : 'Carregando seu chamado...'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/chamados-publico')}
          className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  const statusMsg = statusMessage(ticket)
  const concluded = ticket.status === 'resolvido' || ticket.status === 'fechado'
  const campus = readTicketCampus(ticket.id)
  const campusName = campusArtworkLabel(campus)
  const hero = STATUS_HERO[ticket.status] ?? STATUS_HERO.aberto
  const StatusIcon = hero.Icon
  const declined = ticket.status === 'indeferido'
  const technician = ticket.assignedTo?.trim()
  const heroTitle = technician && ticket.status === 'a_caminho'
    ? `Técnico ${technician} está a caminho!`
    : hero.title
  const heroDescription = technician && ticket.status === 'em_atendimento'
    ? `Técnico ${technician} está atendendo seu chamado.`
    : hero.description
  const elapsedMinutes = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)
  const elapsed = Number.isFinite(elapsedMinutes) && elapsedMinutes >= 0
    ? elapsedMinutes < 1 ? 'menos de 1 min' : elapsedMinutes < 60 ? `${elapsedMinutes} min` : `${Math.floor(elapsedMinutes / 60)} h ${elapsedMinutes % 60} min`
    : undefined
  const steps = [
    { label: 'Registro', current: ticket.status === 'aberto' },
    { label: 'Deslocamento', current: ticket.status === 'a_caminho' },
    { label: 'Atendimento', current: ticket.status === 'em_atendimento' },
    { label: 'Conclusão', current: concluded },
  ]

  async function handleCopyLink() {
    if (!trackingToken || !ticket) return
    const url = new URL(trackingPath(ticket.id, trackingToken), window.location.origin)
    try {
      await navigator.clipboard.writeText(url.toString())
      setLinkCopied(true)
      setLinkCopyError(false)
    } catch {
      setLinkCopyError(true)
    }
  }

  async function handleCopyCode() {
    if (!trackingToken) return
    try {
      await navigator.clipboard.writeText(trackingToken)
      setCodeCopied(true)
      setCodeCopyError(false)
    } catch {
      setCodeVisible(true)
      setCodeCopyError(true)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-5 pb-8">
      <CampusHero campus={campus} variant="success" className="-mx-5 self-stretch">
        <div aria-live="polite" aria-atomic="true">
          <div key={ticket.status} className="ticket-status-hero">
            <div className={`ticket-status-icon mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${hero.color}`}>
              <StatusIcon size={40} aria-hidden="true" />
            </div>
            <div className="ticket-status-copy">
              <h1 className={`campus-hero__title text-2xl font-bold ${declined ? 'campus-hero__title--error text-red-600 dark:text-red-400' : 'text-fg'}`}>{heroTitle}</h1>
              <p className="campus-hero__subtitle mt-2 text-sm text-fg-muted">{heroDescription}</p>
            </div>
          </div>
        </div>
        {campusName && (
          <p className="campus-hero__subtitle mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-fg-muted">
            <icons.ui.mapPin size={14} aria-hidden="true" />
            {campusName}
          </p>
        )}
      </CampusHero>

      <div className="mt-4 w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="text-3xl font-bold text-emerald-500">#{ticket.ticketNumber || '?'}</span>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Sala</span>
            <span className="font-medium text-fg">{ticket.roomName}</span>
          </div>
          {ticket.assetName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Equipamento</span>
              <span className="font-medium text-fg">{ticket.assetName}</span>
            </div>
          )}
          {ticket.problemArea && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Área</span>
              <span className="font-medium text-fg">
                {ticket.problemArea === 'administrativa' ? 'Área Administrativa' : 'Área Acadêmica'}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Problema</span>
            <span className="font-medium text-fg">{ticket.problemCategory}</span>
          </div>
          {ticket.problemDescription?.trim() && (
            <div className="space-y-1 border-t border-line pt-3">
              <p className="text-xs font-medium text-fg-muted">Descrição do problema</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{ticket.problemDescription}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-fg-muted">Status ao vivo</h2>
          <span className="flex items-center gap-1.5 text-[10px] text-fg-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                offline ? 'bg-red-500' : 'bg-emerald-500 motion-safe:animate-pulse'
              }`}
            />
            {offline ? 'Sem conexão — tenta de novo automaticamente' : 'Atualiza automaticamente'}
          </span>
        </div>

        {!declined && (
          <ol aria-label="Etapas possíveis do atendimento" className="mt-4 grid grid-cols-4 gap-1">
            {steps.map((step, index) => (
              <li key={step.label} aria-current={step.current ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center">
                {index > 0 && <span aria-hidden="true" className="absolute right-1/2 top-3 h-px w-full bg-line" />}
                <span className={`ticket-status-step relative z-10 flex h-6 w-6 items-center justify-center rounded-full border ${step.current ? 'ticket-status-step--current' : ''} ${step.current || index === 0 ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line bg-card text-fg-muted'}`}>
                  {index === 0 ? <icons.ui.check size={13} aria-hidden="true" /> : <span className="text-[10px]">{index + 1}</span>}
                </span>
                <span className={`text-[10px] leading-tight ${step.current ? 'font-semibold text-fg' : 'text-fg-muted'}`}>{step.label}</span>
              </li>
            ))}
          </ol>
        )}

        <div key={ticket.status} className="ticket-status-details mt-3">
          {ticket.status === 'indeferido' || ticket.status === 'em_espera' ? (
            // Motivo estruturado e observação de espera/indeferimento.
            <div className="space-y-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}
              >
                {TICKET_STATUS_LABELS[ticket.status]}
              </span>
              {ticket.reasonLabel && (
                <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${declined ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'}`}>
                  Motivo: {ticket.reasonLabel}
                </p>
              )}
              {ticket.reasonNote && <p className="text-xs text-fg-muted">{ticket.reasonNote}</p>}
              {!ticket.reasonLabel && !ticket.reasonNote && statusMsg && <p className="text-sm font-medium text-fg">{statusMsg}</p>}
            </div>
          ) : (
            <>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}
              >
                {TICKET_STATUS_LABELS[ticket.status]}
              </span>
              {statusMsg && <p className="mt-2 text-sm font-medium text-fg">{statusMsg}</p>}
            </>
          )}
        </div>

        {technician && !declined && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
            <icons.ui.user size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="text-fg-muted">Técnico responsável</span>
            <span className="ml-auto break-words text-right font-medium text-fg">{technician}</span>
          </div>
        )}
        <TicketOpenedAt createdAt={ticket.createdAt} elapsed={!concluded && !declined ? elapsed : undefined} prominent />
        <p className="mt-2 text-[11px] text-fg-muted">
          {concluded
            ? 'Seu chamado foi concluído. Obrigado!'
            : declined ? 'Consulte o motivo informado pela equipe.' : 'Pode fechar esta página — o andamento fica registrado. Volte quando quiser para ver o status.'}
          {ticket.updatedAt && (
            <span className="ml-1 text-fg-muted">Atualizado às {formatTime(ticket.updatedAt)}.</span>
          )}
        </p>
      </div>

      {isPushSupported() && !concluded && !declined && !isLoggedIn && (
        <div className="mt-3 w-full max-w-sm rounded-2xl border border-line bg-card px-4 py-3">
          {pushState === 'on' ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <icons.ui.circleCheck size={16} />
              Notificações de status ativas — avisamos quando o técnico atualizar.
            </div>
          ) : (
            <>
              <p className="text-xs text-fg-muted">
                {pushState === 'denied'
                  ? 'Notificações bloqueadas no navegador. Libere o acesso para receber avisos do status.'
                  : 'Receba um aviso quando o status mudar, mesmo com o app fechado.'}
              </p>
              <button
                type="button"
                onClick={activatePush}
                disabled={pushState === 'loading'}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <icons.ui.bellRing size={14} />
                {pushState === 'loading' ? 'Ativando...' : 'Receber notificação deste chamado'}
              </button>
            </>
          )}
        </div>
      )}

      {trackingToken && (
        <section className="mt-3 w-full max-w-sm rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-semibold text-fg">Acesso ao chamado</h2>
          <p className="mt-1 text-xs text-fg-muted">Guarde o código ou link para consultar em outro dispositivo.</p>
          <div className="mt-3 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-fg-muted">Código de acompanhamento</span>
              <button type="button" onClick={() => setCodeVisible(value => !value)} className="shrink-0 text-[11px] font-medium text-fg" aria-expanded={codeVisible}>{codeVisible ? 'Ocultar' : 'Mostrar'}</button>
            </div>
            <p className="mt-1 select-all break-all font-mono text-xs text-fg">{codeVisible ? trackingToken : '••••••••••••' + trackingToken.slice(-6)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={handleCopyCode} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-2.5 text-xs font-medium text-fg hover:bg-input"><icons.ui.copy size={14} />{codeCopied ? 'Código copiado!' : 'Copiar código'}</button>
            <button type="button" onClick={handleCopyLink} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-2.5 text-xs font-medium text-fg hover:bg-input"><icons.ui.link size={14} />{linkCopied ? 'Link copiado!' : 'Copiar link'}</button>
          </div>
          <p className="mt-2 text-[11px] text-fg-muted" role="status">{codeCopyError ? 'Não foi possível copiar. Selecione o código exibido.' : linkCopyError ? 'Não foi possível copiar o link.' : 'Acesso privado: compartilhe apenas com pessoas de confiança.'}</p>
        </section>
      )}

      {feedbackEligible && (
        <button
          type="button"
          onClick={openFeedback}
          className="mt-3 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium text-fg transition-colors hover:bg-input"
        >
          <icons.ui.star size={18} className="text-amber-500" />
          Avaliar atendimento
        </button>
      )}

      <button
        type="button"
        onClick={() => navigate('/chamados-publico')}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input hover:text-fg"
      >
        <icons.ui.plus size={18} />
        Abrir outro chamado
      </button>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico/track')}
        className="mt-3 text-xs text-fg-muted underline-offset-4 hover:underline"
      >
        Consultar outros chamados
      </button>

      <FeedbackSheet open={showRatingModal && (feedbackEligible || ratingDone)} onClose={closeFeedback}>
          <div className="px-6 pb-4 pt-2">
            {ratingDone ? (
              <div className="ticket-status-copy flex flex-col items-center py-6" role="status">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                  <icons.ui.checkCircle size={28} className="text-emerald-500" />
                </div>
                <p className="text-lg font-semibold text-fg">Obrigado!</p>
                <p className="mt-1 text-xs text-fg-muted">Sua avaliação foi registrada.</p>
              </div>
            ) : (
              <>
                <div className="mb-1 text-center">
                  <h2 className="text-lg font-bold text-fg">Como foi o atendimento?</h2>
                  <p className="mt-0.5 text-xs text-fg-muted">Chamado #{ticket.ticketNumber || '?'}</p>
                </div>

                <div className="mt-4 flex justify-center">
                  <Stars value={rating} onChange={setRating} size={32} disabled={ratingSubmitting} />
                </div>
                <p className="mt-1 text-center text-[11px] text-fg-dim">
                  {rating === 0
                    ? 'Toque nas estrelas'
                    : rating <= 2
                      ? 'Péssimo / Ruim'
                      : rating === 3
                        ? 'Regular'
                        : rating === 4
                          ? 'Bom'
                          : 'Excelente'}
                </p>

                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  aria-label="Comentário (opcional)"
                  disabled={ratingSubmitting}
                  placeholder="Comentário (opcional)"
                  rows={2}
                  maxLength={500}
                  className="mt-4 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none"
                />

                {ratingError && (
                  <p className="mt-2 text-center text-[11px] text-red-500">{ratingError}</p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={closeFeedback}
                    disabled={ratingSubmitting}
                    className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-input"
                  >
                    Agora não
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitRating}
                    disabled={rating < 1 || ratingSubmitting}
                    className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ratingSubmitting ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
      </FeedbackSheet>
    </div>
  )
}

