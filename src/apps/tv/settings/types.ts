/**
 * Configuração por workspace da TV Corporativa (workspace_app_settings.app_id='tv').
 * Fase 1 da fonte: link anônimo de SharePoint/OneDrive — credenciais Microsoft
 * nunca ficam no frontend.
 */

export interface TvEventSourceConfig {
  /** Fonte externa desligada por default; URL vazia é válida neste estado. */
  enabled: boolean
  type: 'sharepoint_excel'
  url: string
  /** Aba opcional do workbook; ausente = primeira aba. */
  sheetName?: string
  /** Mapeamento opcional canonical→coluna da planilha. */
  fieldMap?: Record<string, string>
}

export interface TvPeriodConfig {
  semester?: string
  endDate?: string
}

export interface TvDisplayConfig {
  refreshIntervalSeconds: number
  weatherCities?: string[]
  tickerLabel?: string
}

export interface TvAppSettings {
  eventSource: TvEventSourceConfig
  period: TvPeriodConfig
  display: TvDisplayConfig
  /** ISO timestamp da última gravação de settings. */
  syncedAt?: string
}

/** Preview devolvido por POST /api/tv/source/fetch. */
export interface TvSourcePreview {
  ok: boolean
  freshness: 'fresh' | 'stale'
  events: Array<{
    externalId: string
    title: string
    date: string
    endDate?: string
    description?: string
    location?: string
    category?: string
    origin: 'sharepoint_excel'
  }>
  validCount: number
  ignoredCount: number
  syncedAt: string
  source: 'sharepoint_excel'
  warning?: string
}
