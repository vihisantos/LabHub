import type { AppNotification } from '../../../core/notifications/types'
import { notificationService } from '../../../core/notifications/service'
import { workspaceStore } from '../../../core/workspaces/store'
import { ticketService } from './ticketService'
import { getCol } from '../../../lib/db'
import { slaConfigService } from './slaConfigService'
import { getSlaState } from './sla'
import type { Ticket } from '../types'

const LOCAL_IDS_KEY = 'labhub_chamados_local_ticket_ids'
const MUTED_KEY = 'labhub_chamados_alerts_muted'

/* Ids de chamados abertos diretamente pelo app do TI (não geram alerta). */
function getLocalIds(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(LOCAL_IDS_KEY) || '[]'))
  } catch {
    return new Set<string>()
  }
}

function saveLocalIds(ids: Set<string>) {
  localStorage.setItem(LOCAL_IDS_KEY, JSON.stringify([...ids]))
}

/** Registra um chamado criado localmente para não gerar auto-notificação. */
export function markLocalTicket(id: string): void {
  const ids = getLocalIds()
  ids.add(id)
  saveLocalIds(ids)
}

function isLocallyCreated(id: string): boolean {
  return getLocalIds().has(id)
}

/** Atalho de URL único por chamado — usado como dedupe de notificação. */
function ticketUrl(ticketId: string): string {
  return `/chamados/tickets/${ticketId}`
}

function isRecent(iso: string, maxMinutes = 5): boolean {
  const diff = Date.now() - new Date(iso).getTime()
  return diff >= 0 && diff <= maxMinutes * 60 * 1000
}

/** Guard em memória: evita reprocessar o mesmo lote em instâncias simultâneas. */
const seenInSession = new Set<string>()

/**
 * Cria notificações in-app para chamados novos/abertos ainda não notificados.
 * Idempotente: cada chamado gera no máximo uma notificação (dedupe por actionUrl).
 * Retorna apenas as notificações criadas nesta execução.
 */
export function syncNewTicketAlerts(): AppNotification[] {
  const created: AppNotification[] = []

  const existing = new Set(
    notificationService
      .getAll()
      .filter((n) => n.module === 'chamados' && n.actionUrl?.startsWith('/chamados/tickets/'))
      .map((n) => n.actionUrl),
  )

  const tickets = ticketService
    .getAll()
    .filter((t) => t.status !== 'resolvido' && t.status !== 'fechado')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

  for (const t of tickets) {
    const url = ticketUrl(t.id)
    if (existing.has(url) || seenInSession.has(url)) continue
    if (isLocallyCreated(t.id)) continue

    const notification = notificationService.create({
      title: `Novo chamado #${t.ticketNumber}`,
      body: [t.roomName, t.problemCategory, t.assetName].filter(Boolean).join(' · '),
      type: 'ticket',
      severity: 'warning',
      module: 'chamados',
      actionUrl: url,
      audience: 'workspace',
      workspace_id: t.workspace_id ?? workspaceStore.activeWorkspaceId ?? undefined,
    })

    existing.add(url)
    seenInSession.add(url)
    created.push(notification)
  }

  return created
}

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function isAlertsMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setAlertsMuted(muted: boolean): void {
  localStorage.setItem(MUTED_KEY, String(muted))
}

/** Toque curto de dois tons — avisa o TI sem poluir. */
export function playNewTicketSound(): void {
  if (isAlertsMuted()) return
  try {
    const ctx = getAudioCtx()
    const now = ctx.currentTime
    const notes = [880, 1174.66]
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = notes[i]
      const t = now + i * 0.12
      gain.gain.setValueAtTime(0.09, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.start(t)
      osc.stop(t + 0.25)
    }
  } catch {
    // Áudio indisponível
  }
}

/** Notificação nativa do navegador (só quando concedido e página em segundo plano). */
export function showBrowserAlert(ticketId: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!document.hidden) return
    const url = ticketUrl(ticketId)
    const notification = new Notification('Novo chamado', {
      body: 'Um chamado foi aberto — toque para ver',
      tag: url,
      icon: '/icon-192.png',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      window.location.assign(url)
    }
  } catch {
    // Notificação nativa indisponível
  }
}

/** Dispara os alertas (som + OS) para chamados recentes recém-criados. */
export function alertForNewTickets(created: AppNotification[]): void {
  for (const n of created) {
    const id = n.actionUrl?.split('/').pop()
    if (!id) continue
    const ticket = ticketService.getById(id)
    if (!ticket || !isRecent(ticket.createdAt)) continue
    playNewTicketSound()
    showBrowserAlert(id)
  }
}

/** actionUrl qualificado por estado de SLA — identificador lógico do evento
 *  reutilizado pelo dedupe existente (uma notificação por estado por chamado). */
function slaActionUrl(ticketId: string, state: 'near' | 'overdue'): string {
  return `/chamados/tickets/${ticketId}?sla=${state}`
}

/**
 * actionUrls de chamados já notificados, lidos do cache BRUTO de notificações
 * (todas as unidades, sem o filtro do workspace ativo).
 *
 * Necessário porque a varredura de tickets (`syncSlaAlerts`) é multinidade:
 * montar o dedupe com `notificationService.getAll()` (que filtra pelo
 * workspace ativo) faria cada poll recriar notificações de tickets de outras
 * unidades — o bug R1 (crescimento ilimitado). O cache de `notifications` é a
 * visão do próprio usuário após RLS/API (nada fora do escopo chega até aqui),
 * então este conjunto representa exatamente o que o usuário possui.
 */
function chamadoActionUrls(): Set<string> {
  const urls = new Set<string>()
  for (const n of getCol<AppNotification>('notifications')) {
    if (n.module !== 'chamados') continue
    if (!n.actionUrl?.startsWith('/chamados/tickets/')) continue
    urls.add(n.actionUrl)
  }
  return urls
}

/**
 * Fase 2.2.2/2.2.3: alertas in-app de SLA (near/overdue) — irmã de syncNewTicketAlerts,
 * mesmo ciclo de execução e mesmo dedupe (por actionUrl COMPLETO). A regra de SLA é
 * EXCLUSIVAMENTE a do motor `sla.ts` (`getSlaState`): ok/null não geram alerta.
 * Lê o cache bruto de `chamados` (multiunidade já autorizada pelo backend, sem
 * filtro do workspace ativo) e o `workspace_id` vem SEMPRE do ticket — nunca do
 * workspaceStore.activeWorkspaceId (cenário multiunidade). O dedupe também lê o
 * cache BRUTO de notificações (Fase 2.2.3): sem isso, a combinação "scan
 * multinidade + dedupe do workspace ativo" criaria uma notificação nova a cada
 * polling para chamados fora da unidade ativa (R1). O dedupe persistente já
 * cobre a mesma aba/sessão (o cache reflete a criação imediatamente), então não
 * há `seenInSession` específico de SLA — duplicação cross-tab/cross-device fica
 * para a fase de lifecycle das notificações. Sem áudio/browser notification
 * nesta versão: o mute de exibição (notificationAppliesTo) e o de áudio seguem
 * a semântica atual — nenhuma configuração paralela. Sem limpeza automática:
 * notificações de estados anteriores permanecem (limitação conhecida).
 */
export function syncSlaAlerts(): AppNotification[] {
  const created: AppNotification[] = []
  const configs = slaConfigService.getHoursForTickets()
  const existing = chamadoActionUrls()

  for (const t of getCol<Ticket>('chamados')) {
    if (!t.workspace_id) continue
    const state = getSlaState(t.createdAt, t.priority, t.status, configs[t.workspace_id])
    if (state !== 'near' && state !== 'overdue') continue
    const url = slaActionUrl(t.id, state)
    if (existing.has(url)) continue
    const notification = notificationService.create({
      title: state === 'overdue' ? 'SLA vencido' : 'SLA próximo do vencimento',
      body:
        state === 'overdue'
          ? `O chamado #${t.ticketNumber ?? '?'} ultrapassou o prazo de atendimento.`
          : `O chamado #${t.ticketNumber ?? '?'} está próximo do prazo de atendimento.`,
      type: 'ticket',
      severity: state === 'overdue' ? 'critical' : 'warning',
      module: 'chamados',
      actionUrl: url,
      audience: 'workspace',
      workspace_id: t.workspace_id,
    })
    existing.add(url)
    created.push(notification)
  }

  return created
}
