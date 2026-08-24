import type { AppSettingsDefinition } from '../../../core/appSettings/types'
import type { TvAppSettings } from './types'

export const TV_REFRESH_MIN = 60
export const TV_REFRESH_MAX = 3600
const TV_URL_MAX = 2048
const TV_SHEET_MAX = 100
const TV_SEMESTER_MAX = 20
const TV_END_DATE_MAX = 10
const TV_CITY_MAX = 80
const TV_CITIES_MAX = 10
const TV_TICKER_MAX = 200

/** Defaults seguros — nada de valores específicos de um campus como global. */
export const tvDefaultSettings: TvAppSettings = {
  eventSource: {
    enabled: false,
    type: 'sharepoint_excel',
    url: '',
  },
  period: {},
  display: {
    refreshIntervalSeconds: 300,
  },
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * HTTPS only; vazia permitida quando enabled=false. Bloqueia javascript:/data:/file:/ftp:
 * (qualquer não-HTTPS cai fora) e limita tamanho.
 */
function validateSourceUrl(url: unknown, enabled: boolean): string {
  if (url === undefined || url === null || url === '') {
    if (enabled) throw new Error('URL da fonte é obrigatória quando a fonte está ativa')
    return ''
  }
  if (typeof url !== 'string') throw new Error('URL inválida')
  const trimmed = url.trim()
  if (trimmed.length > TV_URL_MAX) throw new Error('URL excede o tamanho máximo')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('URL inválida')
  }
  if (parsed.protocol !== 'https:') throw new Error('A fonte deve usar HTTPS')
  return trimmed
}

/** Ajusta refresh para inteiro dentro dos limites seguros (usado pela UI). */
export function clampRefreshInterval(value: number): number {
  if (!Number.isFinite(value)) return tvDefaultSettings.display.refreshIntervalSeconds
  return Math.min(TV_REFRESH_MAX, Math.max(TV_REFRESH_MIN, Math.round(value)))
}

function validateRefresh(value: unknown): number {
  if (value === undefined || value === null) return tvDefaultSettings.display.refreshIntervalSeconds
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('refreshIntervalSeconds deve ser inteiro')
  }
  if (value < TV_REFRESH_MIN || value > TV_REFRESH_MAX) {
    throw new Error(`refreshIntervalSeconds deve estar entre ${TV_REFRESH_MIN} e ${TV_REFRESH_MAX}`)
  }
  return value
}

function validateOptionalString(value: unknown, maxLen: number, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${label} inválido`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > maxLen) throw new Error(`${label} excede ${maxLen} caracteres`)
  return trimmed
}

/**
 * Validação estrita do objeto já mesclado com defaults. Lança em qualquer
 * campo inaceitável (o serviço cai nos defaults e registra o erro).
 */
export function validateTvSettings(value: unknown): TvAppSettings {
  if (!isPlainObject(value)) throw new Error('Configuração da TV deve ser um objeto')

  const source = value.eventSource
  if (!isPlainObject(source)) throw new Error('eventSource é obrigatório')
  if (source.type !== 'sharepoint_excel') throw new Error('Tipo de fonte não suportado nesta fase')
  if (typeof source.enabled !== 'boolean') throw new Error('enabled deve ser booleano')
  const url = validateSourceUrl(source.url, source.enabled)

  let fieldMap: Record<string, string> | undefined
  if (source.fieldMap !== undefined && source.fieldMap !== null) {
    if (!isPlainObject(source.fieldMap)) throw new Error('fieldMap inválido')
    const entries = Object.entries(source.fieldMap).filter(
      ([, v]) => typeof v === 'string' && v.trim() !== '',
    )
    if (entries.length > 6) throw new Error('fieldMap aceita no máximo 6 campos')
    fieldMap = Object.fromEntries(entries.map(([k, v]) => [k, String(v).slice(0, TV_SHEET_MAX)]))
  }

  const periodSrc = value.period === undefined || value.period === null ? {} : value.period
  if (!isPlainObject(periodSrc)) throw new Error('period inválido')

  const displaySrc = value.display === undefined || value.display === null ? {} : value.display
  if (!isPlainObject(displaySrc)) throw new Error('display inválido')

  let weatherCities: string[] | undefined
  if (displaySrc.weatherCities !== undefined && displaySrc.weatherCities !== null) {
    if (!Array.isArray(displaySrc.weatherCities)) throw new Error('weatherCities deve ser uma lista')
    if (displaySrc.weatherCities.length > TV_CITIES_MAX) {
      throw new Error(`Máximo de ${TV_CITIES_MAX} cidades`)
    }
    weatherCities = displaySrc.weatherCities.map((c) => validateOptionalString(c, TV_CITY_MAX, 'Cidade'))
      .filter((c): c is string => Boolean(c))
  }

  const sheetName = validateOptionalString(source.sheetName, TV_SHEET_MAX, 'Nome da aba')
  const semester = validateOptionalString(periodSrc.semester, TV_SEMESTER_MAX, 'Semestre')
  const endDate = validateOptionalString(periodSrc.endDate, TV_END_DATE_MAX, 'Data final')
  const tickerLabel = validateOptionalString(displaySrc.tickerLabel, TV_TICKER_MAX, 'Ticker')

  const settings: TvAppSettings = {
    eventSource: {
      enabled: source.enabled,
      type: 'sharepoint_excel',
      url,
      ...(sheetName ? { sheetName } : {}),
      ...(fieldMap ? { fieldMap } : {}),
    },
    period: {
      ...(semester ? { semester } : {}),
      ...(endDate ? { endDate } : {}),
    },
    display: {
      refreshIntervalSeconds: validateRefresh(displaySrc.refreshIntervalSeconds),
      ...(weatherCities && weatherCities.length ? { weatherCities } : {}),
      ...(tickerLabel ? { tickerLabel } : {}),
    },
  }

  if (typeof value.syncedAt === 'string' && value.syncedAt) settings.syncedAt = value.syncedAt
  return settings
}

export const tvSettingsDefinition: AppSettingsDefinition<TvAppSettings> = {
  defaultSettings: tvDefaultSettings,
  validateSettings: validateTvSettings,
}
