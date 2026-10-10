import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTicketsContext } from '../contexts/TicketsContext'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_NOTE_PRESETS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  REASON_STATUS_OPTIONS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import { getPriority, getSlaInfo } from '../services/sla'
import { ticketService, errorStatus } from '../services/ticketService'
import { Stars } from '../components/Stars'
import { icons } from '../../../lib/icons'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
import { useLeadership } from '../../../core/permissions/useLeadership'
import { getWorkspaceAssignees, type WorkspaceAssignee } from '../../../core/permissions/workspaceAssigneesService'
import { useAuth } from '../../../core/auth/useAuth'
import { uploadPhotos } from '../utils/photo'
import type { Ticket, TicketPriority, TicketStatus } from '../types'
import type { TicketEvent } from '../types'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { SheetOrDialog } from '../../../responsive/SheetOrDialog'

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

/**
 * Estado da timeline. `ready` cobre o caso de lista vazia — a distinção entre
 * "carregou e não tem nada" e "não deu para carregar" é o ponto inteiro.
 */
type TimelineStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error'

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tickets, update, updateStatus, create, claim, resume, transfer } = useTicketsContext()
  const { user } = useAuth()
  // RBAC 2.0: cada operação de escrita é autorizada pela Action correspondente
  // (backend é a autoridade final — RLS/API). O dono do chamado (claimedByMe)
  // e o líder (isLeader) continuam com as regras de ownership abaixo.
  const { allowed: canEdit } = useCanAccessAction('ticket.edit')
  const { allowed: canStatus } = useCanAccessAction('ticket.status')
  const { allowed: canAssign } = useCanAccessAction('ticket.assign')
  const { allowed: canComment } = useCanAccessAction('ticket.comment')
  const { allowed: canClose } = useCanAccessAction('ticket.close')
  const { allowed: canReopen } = useCanAccessAction('ticket.reopen')
  const { allowed: canCreate } = useCanAccessAction('ticket.create')
  const { allowed: canClaimAction } = useCanAccessAction('ticket.claim')
  // Líder/assigner: quem pode atribuir/reatribuir responsável. Inclui o admin
  // absoluto e os cargos de liderança RBAC 2.0 (lider/coordinator). O backend
  // é a autoridade final (Action `ticket.assign`, RBAC ON/OFF).
  const { isLeadership } = useLeadership()
  const isLeader = user?.is_super_admin === true || isLeadership
  // Quem pode ASSUMIR para si (ticket.claim): técnico + super admin. Liderança
  // (lider/coordinator) gerencia via `ticket.assign`, não executa.
  const canClaim = user?.is_super_admin === true || !isLeadership

  // ── Resolução do chamado ──────────────────────────────────────────────────
  // A coleção local (`TicketsContext`) é a FILA OPERACIONAL. Ela resolve o
  // detalhe de quem tem `ticket.view`, mas nunca é garantie de que o chamado
  // esteja lá: o solicitante que vem de "Meus Chamados" não tem fila populada
  // (a lista pessoal vem de `listMine`, por outro caminho), e um deep link
  // também pode cair antes da primeira sincronização.
  //
  // Por isso: usa a coleção local quando ela tem o registro — sem mudar nada
  // para quem já funcionava — e, quando não tem, busca o registro pelo endpoint
  // individual `GET /api/chamados/:id`. Esse endpoint tem DUAS vias no backend:
  // `ticket.view` (operacional) ou o solicitante do próprio chamado
  // (`reportedByUserId == g.user_id`, PR #339).
  //
  // Autorização é 100% do servidor. Aqui não há `reportedByUserId`, não há
  // `mine=true`, não há comparação de identidade e não há regra de RBAC: o
  // cliente pergunta "me mostre este id" e obedece. `403` nunca vira sucesso nem
  // cai para outro registro.
  //
  // `getByIdRemote` NÃO grava na coleção da fila (#342): um chamado lido no
  // escopo pessoal ficaria visível para quem logasse depois no mesmo navegador,
  // porque a coleção não é namespaced por usuário e o `signOut` não a limpa. Por
  // isso a escrita tem dois transportes — ver `applyUpdate`.
  const localTicket = tickets.find((t) => t.id === id) ?? null
  const hasLocal = localTicket !== null
  const [remoteTicket, setRemoteTicket] = useState<Ticket | null>(null)
  const [detailError, setDetailError] = useState<{ status: number | null; message: string } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [writeError, setWriteError] = useState('')

  const ticket = localTicket ?? remoteTicket

  // Hoisted (null-safe): o dono do chamado também escolhe sucessor na
  // transferência (P3 #371), então o fetch de responsáveis e os handlers
  // precisam saber disso antes do early-return de `!ticket`.
  const claimedByMe = (ticket?.assignedToUserId ?? '') === (user?.id || '')

  /**
   * Escrita no chamado, com o transporte adequado à origem do registro.
   *
   * Não é decisão de autorização — quem pode escrever é o servidor que decide.
   * É a escolha de onde a escrita mora:
   *
   *   · `hasLocal` — o registro está na fila. Usa `update` do contexto, que
   *     atualiza a fila e sincroniza. Caminho operacional, intocado.
   *   · `!hasLocal` — o registro NÃO é da fila (escopo pessoal, ou deep link
   *     antes da primeira sincronização). Vai direto ao recurso por PATCH,
   *     porque `update` do contexto só alcança a API para registros que já
   *     estão na cache local — e, desde #342, eles não são gravados lá.
   *
   * Nos dois casos a tela reflete o que foi salvo: na fila, o contexto
   * atualiza; fora dela, a resposta do PATCH substitui o registro exibido.
   */
  async function applyUpdate(data: Partial<Ticket>): Promise<boolean> {
    if (!ticket) return false
    setWriteError('')
    try {
      if (hasLocal) {
        update(ticket.id, data)
        return true
      }
      const saved = await ticketService.patchRemote(ticket.id, data)
      setRemoteTicket(saved)
      return true
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Não foi possível salvar a alteração.')
      return false
    }
  }

  useEffect(() => {
    // Já está na fila: nada a buscar. Preserva o caminho operacional intacto.
    if (!id || hasLocal) return
    let alive = true
    setLoadingDetail(true)
    setDetailError(null)
    setRemoteTicket(null)
    ticketService
      .getByIdRemote(id)
      .then((t) => {
        if (alive) setRemoteTicket(t)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setRemoteTicket(null)
        setDetailError({
          status: errorStatus(err),
          message: err instanceof Error ? err.message : 'Não foi possível carregar o chamado.',
        })
      })
      .finally(() => {
        if (alive) setLoadingDetail(false)
      })
    return () => {
      alive = false
    }
    // `hasLocal` entra como booleano: re-dispara só quando a presença na fila
    // muda, não a cada sync da fila reescrevendo o mesmo registro.
  }, [id, hasLocal])

  const [noteInput, setNoteInput] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [comment, setComment] = useState('')
  const [commentPhotos, setCommentPhotos] = useState<string[]>([])
  const [commentError, setCommentError] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferTarget, setTransferTarget] = useState('')
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)

  // ── Modal de motivo: Em espera / Indeferir (issue #367) ───────────────────
  // Motivo predefinido OBRIGATÓRIO + observação opcional; o backend valida de
  // novo (fail-closed) e resolve o rótulo. `null` = modal fechado.
  const [reasonModal, setReasonModal] = useState<null | 'em_espera' | 'indeferido'>(null)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [reasonBusy, setReasonBusy] = useState(false)
  const [reasonError, setReasonError] = useState('')

  function openReasonModal(kind: 'em_espera' | 'indeferido') {
    setReasonModal(kind)
    setReasonCode('')
    setReasonNote('')
    setReasonError('')
  }

  async function handleReasonConfirm() {
    if (!ticket || !reasonModal || reasonBusy) return
    if (!reasonCode) {
      setReasonError('Selecione um motivo predefinido.')
      return
    }
    setReasonBusy(true)
    setReasonError('')
    const saved = await applyUpdate({
      status: reasonModal,
      reasonCode,
      reasonNote: reasonNote.trim() || undefined,
    })
    setReasonBusy(false)
    if (saved) {
      setReasonModal(null)
    }
  }

  // ── Retomada (P3 #371) ─────────────────────────────────────────────────────
  // Endpoint atômico no servidor: só `em_espera` retoma, e quem retoma vira o
  // novo responsável. `409` = outro técnico retomou antes — recarrega o registro
  // para a tela refletir a realidade em vez de afirmar um sucesso falso.
  async function handleResume() {
    if (!ticket || resuming) return
    setResuming(true)
    setResumeError('')
    try {
      await resume(ticket.id)
      if (!hasLocal) setRemoteTicket(await ticketService.getByIdRemote(ticket.id))
    } catch (err) {
      if (errorStatus(err) === 409) {
        setResumeError('Outro técnico retomou este chamado antes de você. Acompanhamento atualizado.')
        const fresh = await ticketService.getByIdRemote(ticket.id).catch(() => null)
        if (!hasLocal && fresh) setRemoteTicket(fresh)
      } else {
        setResumeError(err instanceof Error ? err.message : 'Não foi possível retomar o chamado.')
      }
    } finally {
      setResuming(false)
    }
  }

  // ── Transferência (P3 #371) ────────────────────────────────────────────────
  // Responsável atual (ou assigner) passa um atendimento ATIVO para outro
  // técnico do workspace. Guardas atômicas no servidor; `409` = o chamado mudou
  // entre a leitura e a escrita (estado e/ou responsável), então a tela
  // recarrega para mostrar o que aconteceu.
  function handleTransferOpen() {
    setTransferTarget('')
    setTransferError('')
    setTransferConfirmOpen(true)
  }

  async function handleTransferConfirm() {
    if (!ticket || transferring || !transferTarget) return
    if (transferTarget === (ticket.assignedToUserId ?? '')) return
    setTransferring(true)
    setTransferError('')
    try {
      await transfer(ticket.id, transferTarget)
      setTransferConfirmOpen(false)
      if (!hasLocal) setRemoteTicket(await ticketService.getByIdRemote(ticket.id))
    } catch (err) {
      if (errorStatus(err) === 409) {
        setTransferConfirmOpen(false)
        setTransferError('Não foi possível transferir: o chamado foi alterado por outro técnico. Recarregado.')
        const fresh = await ticketService.getByIdRemote(ticket.id).catch(() => null)
        if (!hasLocal && fresh) setRemoteTicket(fresh)
      } else {
        setTransferError(err instanceof Error ? err.message : 'Não foi possível transferir o chamado.')
      }
    } finally {
      setTransferring(false)
    }
  }

  // ── Timeline: quatro estados distintos ─────────────────────────────────────
  // Antes disto era `.catch(() => {})`: qualquer falha (403 de autorização,
  // 502 de rede, timeout) deixava `events` vazio e a tela mostrava "Nenhum
  // registro ainda" — o usuário não conseguia distinguir "não há eventos" de
  // "você não pode ver estes eventos". Agora o estado é explícito.
  //
  // O frontend NÃO decide quem é dono do chamado nem filtra por tipo: quem
  // autoriza e o que é seguro exibir é o backend. Aqui só traduzimos o
  // resultado (403 → negado, resto → erro, 200 → lista) para o usuário.
  //
  // "carregando" é DERIVADO, não guardado: o estado só é gravado quando a
  // requisição termina, e o `key` diz para qual carregamento ele vale. Assim
  // trocar de chamado ou apertar "Tentar novamente" já nasce em carregando, sem
  // `setState` síncrono dentro do efeito.
  const [timelineRetry, setTimelineRetry] = useState(0)
  const [timeline, setTimeline] = useState<{ key: string; status: Exclude<TimelineStatus, 'idle'> } | null>(null)
  const timelineKey = `${id ?? ''}:${timelineRetry}`
  const timelineStatus: TimelineStatus = !id ? 'idle'
    : timeline?.key === timelineKey ? timeline.status
    : 'loading'

  useEffect(() => {
    if (!id) return
    let alive = true
    const key = `${id}:${timelineRetry}`
    ticketService
      .getEvents(id)
      .then((evs) => {
        if (!alive) return
        setEvents(evs)
        setTimeline({ key, status: 'ready' })
      })
      .catch((err) => {
        if (!alive) return
        // 401/403 = autorização (ou sessão). Não é "sem registros": dizer isso
        // seria mentir sobre o que o servidor respondeu.
        const status = errorStatus(err)
        setTimeline({ key, status: status === 401 || status === 403 ? 'denied' : 'error' })
      })
    return () => {
      alive = false
    }
  }, [id, timelineRetry])

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

  const [assignees, setAssignees] = useState<WorkspaceAssignee[]>([])

  // Responsáveis possíveis: membros ATIVOS do workspace do chamado, direto do
  // servidor (RPC não — leitura via RLS 036/044: memberships + profiles).
  // Carregados para o líder atribuir (ticket.assign) E para a transferência
  // (P3 #371): o responsável atual escolhe o sucessor entre os técnicos ativos.
  const canTransferTargets = isLeader || claimedByMe
  useEffect(() => {
    if (!canTransferTargets || !ticket?.workspace_id) {
      setAssignees([])
      return
    }
    let alive = true
    getWorkspaceAssignees(ticket.workspace_id)
      .then((list) => {
        if (alive) setAssignees(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [canTransferTargets, ticket?.workspace_id])

  function handleAssign(userId: string, name: string) {
    if (!ticket) return
    if ((ticket.assignedToUserId ?? '') === userId && ticket.assignedTo === name) return
    void applyUpdate({ assignedTo: name, assignedToUserId: userId })
  }

  async function handleClaim() {
    if (!ticket || claiming) return
    setClaiming(true)
    setClaimError('')
    try {
      await claim(ticket.id)
      if (!hasLocal) setRemoteTicket(await ticketService.getByIdRemote(ticket.id))
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Não foi possível assumir o chamado.')
    } finally {
      setClaiming(false)
    }
  }

  if (!ticket) {
    // Carregando pelo endpoint individual. Não é tela branca: o esqueleto ocupa
    // o mesmo espaço do card, então não há salto de layout.
    if (loadingDetail) {
      return (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando chamado">
          <div className="skeleton-shimmer h-24 w-full rounded-xl" />
          <div className="skeleton-shimmer h-32 w-full rounded-xl" />
          <div className="skeleton-shimmer h-20 w-full rounded-xl" />
        </div>
      )
    }

    // `403` (e `401`) é resposta do servidor dizendo que este chamado não é
    // seu. Não é "não encontrado" e não é erro de rede: dizer a diferença é o
    // que impede que acesso negado pareça sucesso — ou que o usuário conclua
    // que o chamado sumiu.
    if (detailError) {
      const status = detailError.status
      if (status === 403 || status === 401) {
        return (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <icons.ui.alertCircle size={40} className="text-amber-500" />
            <p className="mt-3 text-sm font-medium text-fg">Você não tem acesso a este chamado</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-muted">
              Só é possível abrir um chamado que você abriu ou um chamado da sua unidade.
            </p>
          </div>
        )
      }

      // `404` é o backend dizendo que o registro não existe. Sem status HTTP
      // (fetch quebrado, resposta sem JSON) é falha de comunicação — dizer
      // "não encontrado" ali seria mentir sobre o que o servidor respondeu.
      if (status === null) {
        return (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <icons.ui.alertCircle size={40} className="text-red-500" />
            <p className="mt-3 text-sm font-medium text-fg">Não foi possível carregar o chamado</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-muted">
              Verifique sua conexão e tente novamente.
            </p>
          </div>
        )
      }

      return (
        <div className="flex flex-col items-center py-12">
          <icons.ui.alertCircle size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">{detailError.message}</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center py-12">
        <icons.ui.alertCircle size={40} className="text-fg-muted" />
        <p className="mt-3 text-sm text-fg-muted">Chamado não encontrado</p>
      </div>
    )
  }

  // Issue #367 — em_espera/indeferido NÃO estão no fluxo linear do stepper:
  // `currentIndex` -1 ⇒ nextStatus null ⇒ sem botão de avanço (o backend
  // bloquearia a transição). As ações novas têm botões e modal próprios abaixo.
  const currentIndex = STATUS_FLOW.indexOf(ticket.status)
  const nextStatus =
    currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null

  const slaInfo = getSlaInfo(ticket.createdAt, ticket.priority, ticket.status, slaConfigFor(ticket))

  // `claimedByMe` foi hoisted (linha ~109) para o fetch de responsáveis na
  // transferência; aqui é só comentário de contexto.
  // Quem pode operar (comentar, mudar status, prioridade...):
  //   - o responsável do chamado;
  //   - o líder/assigner (isLeader);
  //   - qualquer usuário com a Action `ticket.edit` quando o chamado AINDA NÃO
  //     TEM responsável (mesma regra do backend `_can_operate_ticket`: sem dono,
  //     qualquer técnico do workspace pode operar/assumir).
  // Isolamento: técnico comum não opera chamado atribuído a outro.
  const unassigned = !ticket.assignedToUserId
  const canOperate = isLeader || claimedByMe || (canEdit && unassigned)
  const inOpenFlow = ticket.status === 'aberto' || ticket.status === 'a_caminho' || ticket.status === 'em_atendimento'
  // Chamado assumido por outro técnico — quem não é responsável nem líder vê só leitura.
  const lockedByOther = canEdit && !isLeader && !claimedByMe && !!ticket.assignedToUserId && inOpenFlow
  // Transferência (P3 #371): só durante atendimento ATIVO. Quem transfere é o
  // responsável atual (ownership, sem `ticket.assign` no backend) ou o
  // assigner/leader (`ticket.assign`). O servidor é a autoridade final.
  const inAttendance = ticket.status === 'a_caminho' || ticket.status === 'em_atendimento'
  const canTransfer = inAttendance && (claimedByMe || (isLeader && canAssign))

  function handleAdvanceStatus() {
    if (!nextStatus || !ticket || !canOperate) return
    if (nextStatus === 'fechado') {
      void applyUpdate({
        status: nextStatus,
        archived: true,
        closedAt: new Date().toISOString(),
        closedBy: user?.name,
      })
    } else if (hasLocal) {
      updateStatus(ticket.id, nextStatus)
    } else {
      void applyUpdate({ status: nextStatus })
    }
  }

  function handleReopen() {
    if (!ticket) return
    void applyUpdate({
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
    void applyUpdate({ priority: next })
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

      {ticket.status === 'indeferido' && ticket.reasonLabel && (
        // Issue #367 — indeferimento NUNCA é apresentado como resolvido:
        // card vermelho próprio com motivo estruturado + observação opcional.
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-600 dark:text-red-400">
              <icons.ui.close size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-red-600 dark:text-red-400">CHAMADO INDEFERIDO</p>
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{ticket.reasonLabel}</p>
              {ticket.reasonNote && <p className="mt-0.5 text-[11px] text-fg-muted">{ticket.reasonNote}</p>}
              <p className="mt-1 text-[10px] text-fg-dim">Motivo visível para o solicitante</p>
            </div>
          </div>
        </div>
      )}

      {ticket.status === 'em_espera' && ticket.reasonLabel && (
        // Issue #367 — espera é estado próprio (nem resolvido nem arquivado):
        // card próprio com motivo estruturado + observação; retomável abaixo.
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <icons.ui.clock size={16} className="mt-0.5 shrink-0 text-violet-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-violet-600 dark:text-violet-400">Em espera — {ticket.reasonLabel}</p>
              {ticket.reasonNote && <p className="mt-0.5 text-[11px] text-fg-muted">{ticket.reasonNote}</p>}
              <p className="mt-1 text-[10px] text-fg-dim">Motivo visível para o solicitante</p>
            </div>
          </div>
        </div>
      )}

      {ticket.reasonLabel && ticket.status !== 'indeferido' && ticket.status !== 'em_espera' && (
        // Motivo preservado de uma espera/indeferimento anterior (issue #367):
        // a retomada preserva o motivo — ele permanece visível como histórico.
        <div className="flex items-start gap-2 rounded-xl border border-line bg-input/60 px-4 py-3">
          <icons.ui.clock size={16} className="mt-0.5 shrink-0 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-fg-muted">Motivo do último registro: {ticket.reasonLabel}</p>
            {ticket.reasonNote && <p className="mt-0.5 text-[11px] text-fg-dim">{ticket.reasonNote}</p>}
          </div>
        </div>
      )}

      {canOperate &&
        (ticket.status === 'aberto' || ticket.status === 'a_caminho' || ticket.status === 'em_atendimento') && (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted">Mensagem para o professor</h3>
            <div className="flex flex-wrap gap-1.5">
              {TICKET_STATUS_NOTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    void applyUpdate({ statusNote: preset })
                  }}
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
                    void applyUpdate({ statusNote: noteInput.trim() })
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
                onClick={() => {
                  void applyUpdate({ statusNote: '' })
                }}
                className="mt-2 text-[11px] font-medium text-fg-dim transition-colors hover:text-red-500"
              >
                Remover mensagem
              </button>
            )}
          </div>
        )}

      {isLeader && canAssign && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-2 text-xs font-semibold text-fg-muted">Responsável</h3>
          <div className="flex gap-2">
            <select
              value={ticket.assignedToUserId ?? ''}
              onChange={(e) => {
                const userId = e.target.value
                const name = userId
                  ? (assignees.find((a) => a.userId === userId)?.name ?? '')
                  : ''
                handleAssign(userId, name)
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-amber-500 focus:outline-none"
            >
              <option value="">Sem responsável</option>
              {assignees.map((a) => (
                <option key={a.profileId} value={a.userId}>{a.name}</option>
              ))}
            </select>
          </div>
          {ticket.assignedToUserId && (
            <p className="mt-2 text-[11px] text-fg-muted">
              Atribuído a <span className="font-medium text-fg">{ticket.assignedTo}</span>
            </p>
          )}
        </div>
      )}

      {canTransfer && (
        // P3 #371 — transferência de atendimento ATIVO: o responsável atual (ou
        // assigner) passa para outro técnico ativo do mesmo workspace. A
        // confirmação fica num modal (evita troca acidental de responsável).
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-1 text-xs font-semibold text-fg-muted">Transferir atendimento</h3>
          <p className="mb-3 text-[11px] leading-relaxed text-fg-dim">
            Passa este atendimento para outro técnico ativo da sua unidade. Você pode transferir enquanto
            estiver <span className="font-medium text-fg">a caminho</span> ou em{' '}
            <span className="font-medium text-fg">atendimento</span>.
          </p>
          <button
            type="button"
            onClick={handleTransferOpen}
            disabled={transferring}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <icons.ui.userCheck size={16} />
            Transferir para outro técnico
          </button>
          {transferError && <p className="mt-2 text-[11px] text-red-500">{transferError}</p>}
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
          {canOperate && (
            <div className="mt-3 space-y-2">
              {canReopen && (
                <button
                  type="button"
                  onClick={handleReopen}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-500"
                >
                  Reabrir chamado
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  onClick={handleReopenNew}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
                >
                  <icons.ui.plus size={16} />
                  Abrir novo chamado (mesma sala/problema)
                </button>
              )}
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
            {canOperate ? (
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
                  className="mt-1 block h-36 w-full overflow-hidden rounded-xl border border-line"
                >
                  <img src={ticket.photos} alt="Foto do problema" className="h-full w-full object-cover" />
                </button>
                <p className="mt-1 text-[10px] text-fg-dim">Toque para ampliar</p>
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
        {canOperate && canComment && (
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
        {timelineStatus === 'loading' || timelineStatus === 'idle' ? (
          <p className="text-xs text-fg-dim">Carregando histórico…</p>
        ) : timelineStatus === 'denied' ? (
          <p className="text-xs text-fg-dim">
            Você não tem permissão para ver o histórico deste chamado.
          </p>
        ) : timelineStatus === 'error' ? (
          // Falha de comunicação: se oferece retry, em vez de fingir que está vazio.
          <div className="flex items-center gap-3">
            <p className="text-xs text-fg-dim">Não foi possível carregar o histórico.</p>
            <button
              type="button"
              onClick={() => setTimelineRetry((n) => n + 1)}
              className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-fg-muted transition-colors hover:bg-fg-muted/10"
            >
              Tentar novamente
            </button>
          </div>
        ) : events.length === 0 ? (
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
          {currentIndex === -1 && (
            <div className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  ticket.status === 'indeferido' ? 'bg-red-500/20 text-red-500' : 'bg-violet-500 text-white'
                }`}
              >
                {ticket.status === 'indeferido' ? <icons.ui.close size={12} /> : <icons.ui.clock size={12} />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-fg">{TICKET_STATUS_LABELS[ticket.status]}</p>
                {ticket.reasonLabel && (
                  <p className="mt-0.5 text-[10px] text-fg-dim">{ticket.reasonLabel}</p>
                )}
              </div>
            </div>
          )}
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

      {lockedByOther && (
        <div className="flex items-center gap-2 rounded-xl bg-input/60 px-4 py-3">
          <icons.ui.alertCircle size={16} className="shrink-0 text-fg-muted" />
          <p className="text-xs text-fg-muted">
            Este chamado está sendo atendido por {ticket.assignedTo}. Você não pode alterá-lo.
          </p>
        </div>
      )}

      {canClaimAction && canClaim && unassigned && inOpenFlow && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <icons.ui.userCheck size={16} />
            {claiming ? 'Assumindo...' : 'Começar Atendimento'}
          </button>
          {claimError && <p className="text-center text-[11px] text-red-500">{claimError}</p>}
        </div>
      )}

      {writeError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3">
          <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">
            {writeError}
          </p>
        </div>
      )}

      {canOperate && nextStatus && !lockedByOther && (nextStatus !== 'a_caminho' || claimedByMe) &&
        (nextStatus === 'fechado' ? canClose : canStatus) && (
        <button
          type="button"
          onClick={handleAdvanceStatus}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          {nextStatus === 'a_caminho' && 'Ir ao local'}
          {nextStatus === 'em_atendimento' && 'Iniciar Atendimento'}
          {nextStatus === 'resolvido' && 'Marcar como Resolvido'}
          {nextStatus === 'fechado' && 'Fechar Chamado'}
        </button>
      )}

      {canOperate && inOpenFlow && !lockedByOther && canStatus && (
        // Issue #367 — ações novas, separadas de Resolver e Arquivar. Ambas
        // abrem modal com motivo predefinido OBRIGATÓRIO (backend valida de
        // novo). Só estados ativos da fila: em_espera/indeferido/finalizados
        // não têm estas ações.
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openReasonModal('em_espera')}
            className="rounded-xl border border-violet-500/40 bg-surface px-4 py-3 text-sm font-semibold text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400"
          >
            Em espera
          </button>
          <button
            type="button"
            onClick={() => openReasonModal('indeferido')}
            className="rounded-xl border border-red-500/40 bg-surface px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            Indeferir
          </button>
        </div>
      )}

      {canStatus && ticket.status === 'em_espera' && (
        // P3 #371 — retomada: única saída de Em espera (→ em_atendimento).
        // Questão #367 deixava a retomada presa ao dono/leader; agora qualquer
        // técnico com a Action `ticket.status` do workspace retoma de forma
        // ATÔMICA no servidor (guarda `status=em_espera`). `409` = outro técnico
        // retomou primeiro. O motivo anterior é preservado pelo backend.
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleResume}
            disabled={resuming}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <icons.ui.userCheck size={16} />
            {resuming ? 'Retomando...' : 'Retomar atendimento'}
          </button>
          {resumeError && <p className="text-center text-[11px] text-red-500">{resumeError}</p>}
        </div>
      )}

      {reasonModal !== null && (
        <SheetOrDialog
          open={reasonModal !== null}
          onClose={() => { if (!reasonBusy) setReasonModal(null) }}
          title={reasonModal === 'indeferido' ? 'Indeferir chamado' : 'Colocar em espera'}
          role="alertdialog"
        >
          <div className="space-y-4 px-1 pb-2">
            <p className="text-xs leading-relaxed text-fg-muted">
              {reasonModal === 'indeferido'
                ? 'O chamado sai da fila ativa e fica marcado como indeferido. O solicitante verá o resultado e o motivo.'
                : 'O chamado sai da fila ativa e fica em espera. É possível retomar o atendimento depois.'}
            </p>
            <div>
              <label htmlFor="ticket-reason-code" className="mb-1.5 block text-xs font-semibold text-fg">
                Motivo <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <select
                id="ticket-reason-code"
                value={reasonCode}
                onChange={(e) => { setReasonCode(e.target.value); setReasonError('') }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecione o motivo...</option>
                {REASON_STATUS_OPTIONS[reasonModal].map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ticket-reason-note" className="mb-1.5 block text-xs font-semibold text-fg">
                Observação <span className="text-fg-dim">(opcional)</span>
              </label>
              <textarea
                id="ticket-reason-note"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Detalhe adicional para o solicitante ou para o histórico..."
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none"
              />
            </div>
            {reasonError && <p className="text-[11px] text-red-500">{reasonError}</p>}
            {writeError && <p className="text-[11px] text-red-500">{writeError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { if (!reasonBusy) setReasonModal(null) }}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-input"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReasonConfirm}
                disabled={reasonBusy || !reasonCode}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  reasonModal === 'indeferido' ? 'bg-red-500 hover:bg-red-400' : 'bg-violet-500 hover:bg-violet-400'
                }`}
              >
                {reasonBusy ? 'Salvando...' : reasonModal === 'indeferido' ? 'Indeferir' : 'Colocar em espera'}
              </button>
            </div>
          </div>
        </SheetOrDialog>
      )}

      {transferConfirmOpen && (
        <SheetOrDialog
          open={transferConfirmOpen}
          onClose={() => { if (!transferring) setTransferConfirmOpen(false) }}
          title="Transferir atendimento"
          role="alertdialog"
        >
          <div className="space-y-4 px-1 pb-2">
            <p className="text-xs leading-relaxed text-fg-muted">
              O atendimento passa para outro técnico ativo da sua unidade. Ele assume a partir do status atual do chamado.
            </p>
            <div className="rounded-xl border border-line bg-input/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-fg-dim">Responsável atual</p>
              <p className="text-sm font-medium text-fg">{ticket.assignedTo || '—'}</p>
            </div>
            <div>
              <label htmlFor="ticket-transfer-target" className="mb-1.5 block text-xs font-semibold text-fg">
                Novo responsável <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <select
                id="ticket-transfer-target"
                value={transferTarget}
                onChange={(e) => { setTransferTarget(e.target.value); setTransferError('') }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecione o técnico...</option>
                {assignees
                  .filter((a) => a.userId !== (ticket.assignedToUserId ?? ''))
                  .map((a) => (
                    <option key={a.profileId} value={a.userId}>{a.name}</option>
                  ))}
              </select>
            </div>
            {transferTarget && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-fg-dim">Novo responsável</p>
                <p className="text-sm font-medium text-fg">
                  {assignees.find((a) => a.userId === transferTarget)?.name ?? '—'}
                </p>
              </div>
            )}
            {transferError && <p className="text-[11px] text-red-500">{transferError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { if (!transferring) setTransferConfirmOpen(false) }}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-input"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTransferConfirm}
                disabled={transferring || !transferTarget}
                className="flex-1 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {transferring ? 'Transferindo...' : 'Confirmar transferência'}
              </button>
            </div>
          </div>
        </SheetOrDialog>
      )}

      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          aria-label="Fechar foto"
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
