export interface ReportPeriod {
  from: string
  to: string
}

export interface TechnicianReportRow {
  name: string
  open: number
  resolved: number
  total: number
  avgResolutionHours: number | null
  rating: number | null
  ratingCount: number
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
  avgResolutionHours: number | null
  feedback: { count: number; average: number | null }
}

export type ReportPeriodDays = 7 | 30 | 90 | 0
