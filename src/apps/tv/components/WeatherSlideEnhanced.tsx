import { useState, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Cloud, CloudRain, CloudSun, Sun, CloudSnow,
  CloudLightning, CloudDrizzle, Wind, Thermometer, Droplets
} from 'lucide-react'

/**
 * Coordenadas de Piracicaba, SP, Brasil (Open-Meteo)
 */
const CITY = {
  name: 'Piracicaba,BR',
  label: 'Piracicaba',
  lat: -22.7253,
  lon: -47.6492
}

/**
 * Fuso do campus — o slide mostra dados de Piracicaba sempre em America/Sao_Paulo,
 * independente da configuração de fuso do Windows da TV.
 */
const TV_TIME_ZONE = 'America/Sao_Paulo'

const WEATHER_CODE_DESCRIPTIONS: Record<number, {
  description: string;
  category: 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' | 'drizzle'
}> = {
  0: { description: 'Céu claro', category: 'clear' },
  1: { description: 'Poucas nuvens', category: 'partly_cloudy' },
  2: { description: 'Parcialmente nublado', category: 'partly_cloudy' },
  3: { description: 'Nublado', category: 'cloudy' },
  45: { description: 'Nevoeiro', category: 'fog' },
  48: { description: 'Nevoeiro', category: 'fog' },
  51: { description: 'Garoa leve', category: 'drizzle' },
  53: { description: 'Garoa moderada', category: 'rain' },
  55: { description: 'Garoa intensa', category: 'rain' },
  61: { description: 'Chuva leve', category: 'rain' },
  63: { description: 'Chuva moderada', category: 'rain' },
  65: { description: 'Chuva forte', category: 'rain' },
  66: { description: 'Chuva leve gelada', category: 'rain' },
  67: { description: 'Chuva forte gelada', category: 'rain' },
  71: { description: 'Neve leve', category: 'snow' },
  73: { description: 'Neve moderada', category: 'snow' },
  75: { description: 'Neve forte', category: 'snow' },
  77: { description: 'Grãos de neve', category: 'snow' },
  80: { description: 'Pancadas de chuva', category: 'rain' },
  81: { description: 'Pancadas moderadas', category: 'rain' },
  82: { description: 'Pancadas fortes', category: 'rain' },
  85: { description: 'Granizo leve', category: 'snow' },
  86: { description: 'Granizo forte', category: 'snow' },
  95: { description: 'Temporal com trovoadas', category: 'storm' },
  96: { description: 'Temporal com granizo', category: 'storm' },
  97: { description: 'Temporal intenso', category: 'storm' },
}

interface WeatherData {
  city: string
  temp: number
  feelsLike?: number
  humidity?: number
  windSpeed: number
  windDirection: number
  description: string
  weatherCode: number
  isDay: boolean
  tempMin?: number
  tempMax?: number
  /** Momento da última leitura bem-sucedida da API. */
  updatedAt?: number
}

const CACHE_KEY = 'tv_weather_cache'
const CACHE_DURATION_MS = 10 * 60 * 1000

const CARDINALS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']

function cardinal(degrees: number): string {
  return CARDINALS[Math.round(((degrees % 360) / 45)) % 8]
}

function formatUpdatedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TV_TIME_ZONE,
  })
}

/**
 * Slide de clima/tempo (tema clean institucional), exibido periodicamente na programação.
 *
 * Layout full-bleed em três faixas (header / main / footer), o mesmo esqueleto
 * do ClockSlide: os dois slides aparecem em sequência na TV, então compartilham
 * header, rodapé e paleta para parecerem um pacote só.
 */
export function WeatherSlideEnhanced() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    // Cache primeiro: pinta o slide na hora e só depois busca dados novos.
    const cached = getFromLocalStorage()
    if (cached) {
      setWeather(cached)
      setLoading(false)
    }

    const fetchWeather = async () => {
      controller?.abort()
      controller = new AbortController()
      const timeout = setTimeout(function() { controller?.abort() }, 5000)
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}` +
          '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m' +
          '&daily=temperature_2m_min,temperature_2m_max&timezone=America%2FSao_Paulo' +
          '&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm&forecast_days=1',
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('API error')
        const data = await response.json()

        // Aceita o formato `current` (atual) e `current_weather` (legado/cache antigo).
        const current = data.current ?? data.current_weather
        const temperature = current?.temperature_2m ?? current?.temperature
        if (temperature == null) throw new Error('No weather data')

        const code: number = current.weather_code ?? current.weathercode
        const weatherData: WeatherData = {
          city: CITY.label,
          temp: Math.round(temperature),
          feelsLike: current.apparent_temperature != null
            ? Math.round(current.apparent_temperature)
            : undefined,
          humidity: current.relative_humidity_2m != null ? Math.round(current.relative_humidity_2m) : undefined,
          windSpeed: Math.round(current.wind_speed_10m ?? current.windspeed ?? 0),
          windDirection: current.wind_direction_10m ?? current.winddirection ?? 0,
          description: WEATHER_CODE_DESCRIPTIONS[code]?.description ?? 'Condição indisponível',
          weatherCode: code,
          isDay: (current.is_day ?? 1) === 1,
          tempMin: data.daily?.temperature_2m_min?.[0] != null ? Math.round(data.daily.temperature_2m_min[0]) : undefined,
          tempMax: data.daily?.temperature_2m_max?.[0] != null ? Math.round(data.daily.temperature_2m_max[0]) : undefined,
          updatedAt: Date.now(),
        }

        if (cancelled) return
        setWeather(weatherData)
        setLoading(false)
        setError(null)
        saveToLocalStorage(weatherData)
      } catch {
        if (cancelled) return
        // Offline: um cache expirado é melhor que nenhum dado climático.
        const fallback = getFromLocalStorage(Number.MAX_SAFE_INTEGER) ?? weather
        if (fallback) {
          setWeather(fallback)
          setError(null)
        } else {
          setError('Dados climáticos indisponíveis')
        }
        setLoading(false)
      } finally {
        clearTimeout(timeout)
      }
    }

    void fetchWeather()
    const timer = setInterval(() => { void fetchWeather() }, CACHE_DURATION_MS)
    return () => { cancelled = true; controller?.abort(); clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez no mount; o cache é lido dentro do efeito
  }, [])

  if (loading && !weather) {
    return (
      <SlideShell isDay={true} badge="Clima agora">
        <main style={styles.main}>
          <div style={styles.iconTile}>
            <CloudSun size={150} strokeWidth={1.25} style={styles.icon} />
          </div>
          <div style={styles.readout}>
            <span style={styles.city}>Piracicaba</span>
            <span style={styles.loadingText}>Carregando clima…</span>
          </div>
        </main>
        <SlideFooter right="Aguardando dados" />
      </SlideShell>
    )
  }

  if (!weather) {
    return (
      <SlideShell isDay={true} badge="Clima agora">
        <main style={styles.main}>
          <div style={styles.iconTile}>
            <Sun size={150} strokeWidth={1.25} style={styles.iconMuted} />
          </div>
          <div style={styles.readout}>
            <span style={styles.city}>Piracicaba</span>
            <div style={styles.tempRow}>
              <span style={styles.temp}>--°</span>
            </div>
            <span style={styles.description}>{error ?? 'Dados climáticos indisponíveis'}</span>
          </div>
        </main>
        <SlideFooter right="Sem conexão com a API" />
      </SlideShell>
    )
  }

  const MainIcon = weatherIcon(weather.weatherCode)
  const isStorm = (WEATHER_CODE_DESCRIPTIONS[weather.weatherCode]?.category ?? 'clear') === 'storm'

  return (
    <SlideShell isDay={weather.isDay} badge="Clima agora">
      <main style={styles.main}>
        <div style={styles.iconTile}>
          <MainIcon size={150} strokeWidth={1.25} style={isStorm ? styles.iconStorm : styles.icon} />
          <span style={isStorm ? styles.conditionStorm : styles.condition}>{weather.description}</span>
        </div>

        <div style={styles.readout}>
          <div style={styles.cityRow}>
            <span style={styles.city}>{weather.city}</span>
            <span style={styles.region}>SP · Brasil</span>
          </div>

          <div style={styles.tempRow}>
            <span style={styles.temp}>{weather.temp}°</span>
            <span style={styles.tempUnit}>C</span>
          </div>

          {weather.feelsLike != null && (
            <span style={styles.feelsLike}>Sensação de {weather.feelsLike}°</span>
          )}

          <div style={styles.chips}>
            {weather.tempMin != null && weather.tempMax != null && (
              <div style={styles.chip}>
                <Thermometer size={20} style={styles.chipIcon} />
                <span>{weather.tempMin}° / {weather.tempMax}°</span>
              </div>
            )}
            <div style={styles.chip}>
              <Wind size={20} style={styles.chipIcon} />
              <span>{weather.windSpeed} km/h · {cardinal(weather.windDirection)}</span>
            </div>
            {weather.humidity != null && (
              <div style={styles.chip}>
                <Droplets size={20} style={styles.chipIcon} />
                <span>{weather.humidity}%</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <SlideFooter right={weather.updatedAt ? `Atualizado às ${formatUpdatedAt(weather.updatedAt)}` : '—'} />
    </SlideShell>
  )
}

/**
 * Esqueleto compartilhado com o ClockSlide: fundo, header e faixas.
 */
function SlideShell({ isDay, badge, children }: { isDay: boolean; badge: string; children: ReactNode }) {
  return (
    <div style={{ ...styles.container, background: isDay ? DAY_BG : NIGHT_BG }}>
      <div style={styles.glowA} />
      <div style={styles.glowB} />
      <div style={styles.hairline} />

      <header style={styles.header}>
        <div style={styles.badge}>
          <CloudSun size={20} strokeWidth={2.2} />
          <span>{badge}</span>
        </div>
        <div style={styles.brandRow}>
          <span style={styles.brandMark} />
          <span style={styles.brand}>LabHub TV</span>
        </div>
      </header>

      {children}
    </div>
  )
}

function SlideFooter({ right }: { right: string }) {
  return (
    <>
      <div style={styles.divider} />
      <footer style={styles.footer}>
        <span>Piracicaba · SP</span>
        <span>{right}</span>
      </footer>
    </>
  )
}

const DAY_BG = 'linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #eef2f7 100%)'
const NIGHT_BG = 'linear-gradient(135deg, #eef2f8 0%, #e7ecf6 45%, #dfe6f2 100%)'

function weatherIcon(weatherCode: number) {
  if (weatherCode >= 95) return CloudLightning
  if (weatherCode >= 80) return CloudRain
  if (weatherCode >= 71) return CloudSnow
  if (weatherCode >= 61) return CloudRain
  if (weatherCode >= 51) return CloudDrizzle
  if (weatherCode === 45 || weatherCode === 48) return Cloud
  if (weatherCode === 0) return Sun
  if (weatherCode <= 3) return CloudSun
  return Cloud
}

function saveToLocalStorage(data: WeatherData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
  } catch { /* cache é opcional */ }
}

function getFromLocalStorage(maxAgeMs: number = CACHE_DURATION_MS): WeatherData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp < maxAgeMs) {
        return parsed.data as WeatherData
      }
    }
  } catch { /* cache corrompido: ignora */ }
  return null
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.75rem, 4vh, 3rem) clamp(2rem, 5vw, 4.5rem)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  },
  glowA: {
    position: 'absolute',
    width: '44rem',
    height: '44rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(14, 116, 144, 0.14) 0%, transparent 70%)',
    top: '-18rem',
    left: '-12rem',
    pointerEvents: 'none',
  },
  glowB: {
    position: 'absolute',
    width: '38rem',
    height: '38rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(13, 148, 136, 0.12) 0%, transparent 70%)',
    bottom: '-14rem',
    right: '-10rem',
    pointerEvents: 'none',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: 4,
    background: 'linear-gradient(90deg, #0e7490 0%, #0d9488 45%, #1e40af 75%, transparent 100%)',
    opacity: 0.85,
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    zIndex: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.5rem 1.05rem',
    borderRadius: 9999,
    background: 'rgba(14, 116, 144, 0.10)',
    border: '1px solid rgba(14, 116, 144, 0.18)',
    color: '#155e75',
    fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  brandRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  brandMark: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    background: 'linear-gradient(135deg, #0d9488, #1e40af)',
  },
  brand: {
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  main: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(2rem, 5vw, 4.5rem)',
    minHeight: 0,
    zIndex: 1,
  },
  iconTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: 'clamp(210px, 22vw, 300px)',
    height: 'clamp(210px, 22vw, 300px)',
    borderRadius: 'clamp(28px, 3vw, 40px)',
    background: 'rgba(255, 255, 255, 0.72)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    boxShadow: '0 22px 55px rgba(15, 23, 42, 0.09)',
  },
  icon: {
    color: '#0f766e',
    filter: 'drop-shadow(0 10px 22px rgba(13, 148, 136, 0.22))',
  },
  iconStorm: {
    color: '#1d4ed8',
    filter: 'drop-shadow(0 10px 22px rgba(29, 78, 216, 0.25))',
  },
  iconMuted: {
    color: '#cbd5e1',
  },
  condition: {
    fontSize: 'clamp(1.05rem, 1.5vw, 1.45rem)',
    fontWeight: 600,
    color: '#475569',
    textAlign: 'center',
    padding: '0 1rem',
    textTransform: 'capitalize',
  },
  conditionStorm: {
    fontSize: 'clamp(1.05rem, 1.5vw, 1.45rem)',
    fontWeight: 700,
    color: '#1d4ed8',
    textAlign: 'center',
    padding: '0 1rem',
    textTransform: 'capitalize',
  },
  readout: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 'clamp(0.35rem, 1vh, 0.7rem)',
    minWidth: 0,
  },
  cityRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  city: {
    fontSize: 'clamp(1.7rem, 2.8vw, 2.6rem)',
    fontWeight: 700,
    color: '#1e293b',
    letterSpacing: '-0.01em',
  },
  region: {
    fontSize: 'clamp(0.95rem, 1.2vw, 1.2rem)',
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tempRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.25rem',
  },
  temp: {
    fontSize: 'clamp(5rem, 11vw, 10rem)',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 0.9,
    color: '#0f172a',
    letterSpacing: '-0.05em',
    textShadow: '0 18px 45px rgba(15, 23, 42, 0.12)',
  },
  tempUnit: {
    fontSize: 'clamp(1.6rem, 3vw, 2.75rem)',
    fontWeight: 700,
    color: '#64748b',
    marginTop: 'clamp(0.4rem, 2vw, 1.2rem)',
  },
  feelsLike: {
    fontSize: 'clamp(1rem, 1.3vw, 1.25rem)',
    fontWeight: 500,
    color: '#64748b',
  },
  description: {
    fontSize: 'clamp(1.1rem, 1.6vw, 1.5rem)',
    color: '#475569',
    fontWeight: 500,
    textTransform: 'capitalize',
  },
  loadingText: {
    fontSize: 'clamp(1.2rem, 1.8vw, 1.6rem)',
    color: '#64748b',
    fontWeight: 500,
  },
  chips: {
    display: 'flex',
    gap: '0.65rem',
    flexWrap: 'wrap',
    marginTop: 'clamp(0.35rem, 1.2vh, 0.8rem)',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.55rem 1rem',
    borderRadius: 9999,
    background: 'rgba(255, 255, 255, 0.85)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    color: '#334155',
    fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
    fontWeight: 600,
  },
  chipIcon: {
    color: '#0f766e',
  },
  divider: {
    position: 'relative',
    height: 1,
    width: '100%',
    background: 'rgba(15, 23, 42, 0.08)',
    marginBottom: 'clamp(0.75rem, 1.6vh, 1.25rem)',
    zIndex: 1,
  },
  footer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    color: '#94a3b8',
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    zIndex: 1,
  },
}
