import type { AppNotification } from '../../../core/notifications/types'
import { notificationService } from '../../../core/notifications/service'
import { workspaceStore } from '../../../core/workspaces/store'
import { ticketService } from './ticketService'

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
