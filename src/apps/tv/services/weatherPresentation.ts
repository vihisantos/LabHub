/**
 * Apresentação do Weather Slide 2.0 — puro, sem React e sem rede.
 *
 * Fonte dos códigos: Open-Meteo WMO weather interpretation codes.
 * Os vídeos correspondem aos nomes da pasta `Clima/` do Drive; condições sem
 * vídeo na pasta (neve/precipitação congelante) usam apenas o ícone Meteocons
 * sobre o fundo neutro.
 */

export const WEATHER_VIDEO_KEYS = [
  'ensolarado',
  'parcialmente-nublado',
  'nublado',
  'neblina',
  'garoa',
  'chuva',
  'chuva-forte',
  'tempestade',
  'ensolarado-noite',
  'parcialmente-nublado-noite',
  'nublado-noite',
  'neblina-noite',
  'garoa-noite',
  'chuva-noite',
  'chuva-forte-noite',
  'tempestade-noite',
] as const

export type WeatherVideoKey = (typeof WEATHER_VIDEO_KEYS)[number]

/** LocalMediaFile de localProgramming (import só de tipo, sem efeito colateral). */
export interface WeatherMediaFile {
  name: string
  path: string
  relativePath?: string | null
  fileType?: 'video' | 'image'
  file_type?: string
}

/** Reconhece `ensolarado.mp4`, `CHUVA-FORTE-NOITE.MP4`, etc. */
export function weatherVideoKeyFromName(name: string): WeatherVideoKey | null {
  const stem = name.replace(/\.[^.]+$/, '').trim().toLowerCase()
  return WEATHER_VIDEO_KEYS.find((key) => key === stem) ?? null
}

/**
 * Seleciona os vídeos da pasta `Clima/` sem misturá-los com a fila acadêmica.
 * Sempre relido quando o slide é exibido: inclusões, trocas e remoções no Drive
 * passam a valer no próximo slide, sem cache de caminhos.
 */
export function discoverWeatherVideos(files: WeatherMediaFile[]): Partial<Record<WeatherVideoKey, string>> {
  const videos: Partial<Record<WeatherVideoKey, string>> = {}
  for (const file of files) {
    const type = file.fileType ?? file.file_type
    if (type && type !== 'video') continue
    const location = (file.relativePath || file.path).replace(/\\/g, '/').toLowerCase()
    if (!location.split('/').some((part) => part === 'clima')) continue
    const key = weatherVideoKeyFromName(file.name ?? '')
    if (key) videos[key] = file.path
  }
  return videos
}

export type WeatherCategory =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy_rain'
  | 'snow'
  | 'sleet'
  | 'storm'

interface CodeInfo {
  description: string
  category: WeatherCategory
}

/** Descrições em pt-BR usadas no slide (as mesmas do modelo anterior). */
export const WEATHER_CODE_DESCRIPTIONS: Record<number, CodeInfo> = {
  0: { description: 'Céu claro', category: 'clear' },
  1: { description: 'Poucas nuvens', category: 'clear' },
  2: { description: 'Parcialmente nublado', category: 'partly_cloudy' },
  3: { description: 'Nublado', category: 'cloudy' },
  45: { description: 'Nevoeiro', category: 'fog' },
  48: { description: 'Nevoeiro', category: 'fog' },
  51: { description: 'Garoa leve', category: 'drizzle' },
  53: { description: 'Garoa moderada', category: 'drizzle' },
  55: { description: 'Garoa intensa', category: 'drizzle' },
  56: { description: 'Garoa congelante', category: 'sleet' },
  57: { description: 'Garoa congelante intensa', category: 'sleet' },
  61: { description: 'Chuva leve', category: 'rain' },
  63: { description: 'Chuva moderada', category: 'rain' },
  65: { description: 'Chuva forte', category: 'heavy_rain' },
  66: { description: 'Chuva congelante leve', category: 'sleet' },
  67: { description: 'Chuva congelante forte', category: 'sleet' },
  71: { description: 'Neve leve', category: 'snow' },
  73: { description: 'Neve moderada', category: 'snow' },
  75: { description: 'Neve forte', category: 'snow' },
  77: { description: 'Grãos de neve', category: 'snow' },
  80: { description: 'Pancadas de chuva', category: 'rain' },
  81: { description: 'Pancadas moderadas', category: 'rain' },
  82: { description: 'Pancadas fortes', category: 'heavy_rain' },
  85: { description: 'Granizo leve', category: 'snow' },
  86: { description: 'Granizo forte', category: 'snow' },
  95: { description: 'Temporal com trovoadas', category: 'storm' },
  96: { description: 'Temporal com granizo', category: 'storm' },
  99: { description: 'Temporal com granizo forte', category: 'storm' },
}

export interface WeatherVisual {
  description: string
  category: WeatherCategory
  /** Nome do arquivo em `public/meteocons` (MIT — Bas Milius). */
  icon: string
  /** Chave do vídeo em `Clima/`; null quando a condição não tem vídeo previsto. */
  videoKey: WeatherVideoKey | null
}

/**
 * Mapeia weather_code + is_day para vídeo local e ícone animado.
 * `isDay === false` seleciona sempre a variante `-noite` quando existir.
 */
export function weatherVisual(code: number, isDay: boolean): WeatherVisual {
  const info = WEATHER_CODE_DESCRIPTIONS[code] ?? {
    description: 'Condição indisponível',
    category: 'cloudy' as const,
  }
  const suffix = isDay ? '' : '-noite'

  let key: WeatherVideoKey | null = null
  switch (info.category) {
    case 'clear':
      key = `ensolarado${suffix}` as WeatherVideoKey
      break
    case 'partly_cloudy':
      key = `parcialmente-nublado${suffix}` as WeatherVideoKey
      break
    case 'cloudy':
      key = `nublado${suffix}` as WeatherVideoKey
      break
    case 'fog':
      key = `neblina${suffix}` as WeatherVideoKey
      break
    case 'drizzle':
      key = `garoa${suffix}` as WeatherVideoKey
      break
    case 'rain':
      key = `chuva${suffix}` as WeatherVideoKey
      break
    case 'heavy_rain':
      key = `chuva-forte${suffix}` as WeatherVideoKey
      break
    case 'storm':
      key = `tempestade${suffix}` as WeatherVideoKey
      break
    // Neve e precipitação congelante não têm vídeo na pasta Clima/:
    // o slide usa o ícone Meteocons sobre o fundo neutro.
    default:
      key = null
  }

  const icons: Record<WeatherCategory, string> = {
    clear: isDay ? 'clear-day.svg' : 'clear-night.svg',
    partly_cloudy: isDay ? 'partly-cloudy-day.svg' : 'partly-cloudy-night.svg',
    cloudy: 'cloudy.svg',
    fog: isDay ? 'fog-day.svg' : 'fog-night.svg',
    drizzle: 'drizzle.svg',
    rain: 'rain.svg',
    heavy_rain: 'extreme-rain.svg',
    snow: 'snow.svg',
    sleet: 'sleet.svg',
    storm: isDay ? 'thunderstorms-day.svg' : 'thunderstorms-night.svg',
  }

  return { description: info.description, category: info.category, icon: icons[info.category], videoKey: key }
}
