export interface LaboratorioReserva {
  horario: string
  responsavel: string
  observacao: string
  reserva_feita_por: string
  alunos: number
  labs: string[]
  lab: string
  data: string
  horario_inicio?: string
  horario_fim?: string
}

export interface TabletReserva {
  /** uuid (Supabase) */
  id: string
  sala: string
  quantidade_tablets: number
  professor: string
  horario_inicio: string
  horario_fim: string
  finalidade: string
  reservado_por: string
  status: string
  workspace_id?: string
}

export interface ReservasAPIResponse {
  lab1_reservas: LaboratorioReserva[]
  lab2_reservas: LaboratorioReserva[]
  /** Reservas do dia agrupadas por lab normalizado (LAB01, LAB02, ... LAB0N) */
  lab_reservas?: Record<string, LaboratorioReserva[]>
  /** Labs normalizados em ordem numérica */
  labs?: string[]
  /** Quantidade de labs configurada no workspace */
  lab_count?: number
  reservas_semana: LaboratorioReserva[]
  /** Timestamp (epoch segundos) do último cache da planilha no servidor */
  cache_info?: { timestamp?: number }
  /** Origem da planilha: planilha própria do campus, fallback global ou nenhuma */
  spreadsheet?: 'workspace' | 'fallback' | 'missing'
}

export interface HealthResponse {
  status: string
}

export interface TransformedReservation {
  /** Chave estável derivada do conteúdo (lab + horário + responsável) */
  id: string
  time: string
  period: string
  subject: string
  professor: string
  reservaFeitaPor: string
  isLive: boolean
  isEmBreve: boolean
  isEnded: boolean
  combined: boolean
  alunos: number
  /** Raw date from API (DD/MM/YYYY) */
  data?: string
  /** Parsed start time in minutes from midnight */
  horario_inicio?: number | null
  /** Parsed end time in minutes from midnight */
  horario_fim?: number | null
}

export interface WeekDayData {
  date: string
  dayName: string
  reservations: Array<{
    tipo?: string
    lab: string
    time: string
    subject: string
    professor: string
    reservaFeitaPor: string
    observacao: string
  }>
}

export interface ParsedHorario {
  inicio: number | null
  fim: number | null
}
