import { TICKET_STATUS_LABELS, type TicketStatus } from '../../chamados/types'
import { campusArtworkKey, campusArtworkLabel, readTicketCampus, rememberTicketCampus } from './campusArtwork'

const TOKEN_PREFIX = 'chamado_token_'
const META_PREFIX = 'labhub:recent-ticket:'

export interface RecentTicket {
  id: string
  ticketNumber?: number
  roomName?: string
  problemCategory?: string
  campusName?: string
  status?: TicketStatus
  feedbackRating?: number | null
  createdAt?: string
  savedAt?: string
}

function readMeta(id: string): RecentTicket {
  try {
    const data = JSON.parse(localStorage.getItem(META_PREFIX + id) || '{}')
    return {
      id,
      ticketNumber: typeof data.ticketNumber === 'number' ? data.ticketNumber : undefined,
      roomName: typeof data.roomName === 'string' ? data.roomName : undefined,
      problemCategory: typeof data.problemCategory === 'string' ? data.problemCategory : undefined,
      campusName: campusArtworkLabel(campusArtworkKey(typeof data.campusName === 'string' ? data.campusName : undefined)),
      status: Object.prototype.hasOwnProperty.call(TICKET_STATUS_LABELS, data.status) ? data.status : undefined,
      feedbackRating: typeof data.feedbackRating === 'number' ? data.feedbackRating : null,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : undefined,
    }
  } catch { return { id } }
}

/** Store only a minimal local summary, using the existing token key. */
export function rememberRecentTicket(ticket: RecentTicket, token: string, campusName?: string) {
  if (!ticket.id || !token) return
  try {
    const previous = readMeta(ticket.id)
    const summary: RecentTicket = {
      id: ticket.id, ticketNumber: ticket.ticketNumber, roomName: ticket.roomName,
      problemCategory: ticket.problemCategory,
      campusName: campusArtworkLabel(campusArtworkKey(campusName)) || campusArtworkLabel(readTicketCampus(ticket.id)) || previous.campusName,
      status: ticket.status, feedbackRating: ticket.feedbackRating ?? null,
      createdAt: ticket.createdAt, savedAt: new Date().toISOString(),
    }
    localStorage.setItem(TOKEN_PREFIX + ticket.id, token)
    localStorage.setItem(META_PREFIX + ticket.id, JSON.stringify(summary))
  } catch { /* Optional persistence. */ }
}

export function recentTickets(): RecentTicket[] {
  try {
    const rows: RecentTicket[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(TOKEN_PREFIX) || key === TOKEN_PREFIX + 'track') continue
      const id = key.slice(TOKEN_PREFIX.length)
      if (id && localStorage.getItem(key)) rows.push(readMeta(id))
    }
    return rows.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
  } catch { return [] }
}

export function recentToken(id: string): string {
  try { return localStorage.getItem(TOKEN_PREFIX + id) || '' } catch { return '' }
}

export function forgetRecentTicket(id: string) {
  try {
    const token = recentToken(id)
    if (token && localStorage.getItem(TOKEN_PREFIX + 'track') === token) localStorage.removeItem(TOKEN_PREFIX + 'track')
    localStorage.removeItem(TOKEN_PREFIX + id)
    localStorage.removeItem(META_PREFIX + id)
    rememberTicketCampus(id, undefined)
  } catch { /* Optional persistence. */ }
}

/** Accept local tracking routes only, never fetch a pasted arbitrary URL. */
export function parseTrackingInput(raw: string): string {
  const input = raw.trim().replace(/^["']|["']$/g, '')
  if (!input) return ''
  if (/^https?:\/\//i.test(input) || input.startsWith('/')) {
    const url = new URL(input, window.location.origin)
    if (url.origin !== window.location.origin || !/^\/chamados-publico\/(?:track\/?|success\/[^/]+\/?|feedback\/[^/]+\/?)$/.test(url.pathname)) {
      throw new Error('Cole um link de acompanhamento deste LabHub.')
    }
    const token = new URLSearchParams(url.hash.slice(1)).get('token') || url.searchParams.get('token')
    if (!token) throw new Error('Este link não contém o código. Copie o link privado na tela do chamado.')
    return token
  }
  if (!/^[A-Za-z0-9_-]+$/.test(input) || /^\d+$/.test(input)) {
    throw new Error('Use o código privado de acompanhamento, não o número do chamado.')
  }
  return input
}

export function trackingPath(id: string, token: string): string {
  return '/chamados-publico/success/' + encodeURIComponent(id) + '#' + new URLSearchParams({ token }).toString()
}

export function restoreRecentCampus(row: RecentTicket) {
  const campus = campusArtworkKey(row.campusName)
  if (campus) rememberTicketCampus(row.id, campus)
}
