import type { TicketPriority } from './ticket'

export interface ReportPeriod {
  from: string
  to: string
}

export interface ReportTicket {
  id: string
  ticketNumber: number
  status: string
  priority?: TicketPriority
  category: string
  area: string
  roomName: string
  technician: string
  createdAt: string
  resolvedAt: string | null
  rating: number | null
  comment: string
  feedbackAt?: string | null
  resolutionMinutes: number | null
  serviceMinutes: number | null
  timeToAssignedMinutes: number | null
  workspaceId?: string | null
}

export interface TechnicianReportRow {
  name: string
  open: number
  resolved: number
  total: number
  avgResolutionHours: number | null
  avgResolutionMinutes?: number | null
  rating: number | null
  ratingCount: number
  reviews: { rating: number; comment: string; ticketNumber: number | null; feedbackAt?: string | null }[]
  avgServiceMinutes?: number | null
  avgTimeToAssignedMinutes?: number | null
}

export interface ChamadosReport {
  total: number
  period: ReportPeriod
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byCategory: Record<string, number>
  byArea: Record<string, number>
  byRoom: [string, number][]
  byTechnician: TechnicianReportRow[]
  tickets?: ReportTicket[]
  byMonth?: { month: string; created: number; resolved: number }[]
  avgResolutionHours: number | null
  avgResolutionMinutes?: number | null
  avgServiceMinutes?: number | null
  avgTimeToAssignedMinutes?: number | null
  feedback: { count: number; average: number | null; byRating?: Record<string, number> }
}

export type ReportPeriodDays = 7 | 30 | 90 | 0 | 'semester' | 'previous-semester'
